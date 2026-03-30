// Reminder model, its stored settings, and the client for the Rust scheduler.
//
// Timing itself lives in the backend (src-tauri/src/reminder) because WebView2
// throttles JS timers once a window is hidden — exactly when a reminder matters
// most. This module owns the two halves the backend deliberately does not know
// about: resolving wall-clock schedule times to epoch milliseconds in the
// configured zone, and remembering which occurrences the user already dealt
// with so a restart never replays them.

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { isTauri } from './env'
import { readSettings } from './settings'
import { zonedEpoch } from './time'

export type ReminderChannel = 'off' | 'inapp' | 'desktop' | 'toast'
export type ReminderVisual = 'static' | 'breathe' | 'blink' | 'shake'

export type Reminder = {
  channel: ReminderChannel
  leadMinutes: number
  topmost: boolean
  focus: boolean
  visual: ReminderVisual
  repeatEveryMin: number
  repeatMax: number
  autoDismissSec: number
}

/** One scheduled ring, as handed to the backend. */
export type ReminderJob = Reminder & {
  id: string
  itemId: string
  title: string
  timeLabel: string
  tag?: string
  triggerAt: number
  overdueMinutes: number
  round: number
}

/** A plain timed notification (hourly chime, pomodoro completion). */
export type NoticeJob = {
  id: string
  triggerAt: number
  title: string
  body: string
}

export type ReminderSource = {
  id: string
  title: string
  date: string
  time: string
  done: boolean
  tag?: string
  reminder?: Reminder
}

const DEFAULTS_KEY = 'desktime.reminderDefaults'
const MUTED_KEY = 'desktime.reminder.muted'
const HANDLED_KEY = 'desktime.reminder.fired'
const SNOOZED_KEY = 'desktime.reminder.snoozed'
const ACTION_KEY = 'desktime.reminderAction'

const HANDLED_TTL_MS = 48 * 60 * 60 * 1000

/**
 * How stale an occurrence may be and still pop up on launch. Anything older is
 * left to the overdue styling in the list — nobody wants yesterday's reminders
 * fighting for attention when they sit down at the machine.
 */
const OVERDUE_GRACE_MS = 24 * 60 * 60 * 1000

export const defaultReminder: Reminder = {
  channel: 'desktop',
  leadMinutes: 0,
  topmost: true,
  focus: false,
  visual: 'breathe',
  repeatEveryMin: 5,
  repeatMax: 3,
  autoDismissSec: 0,
}

/** Items saved before reminders existed keep their old behaviour: one toast. */
export const legacyReminder: Reminder = {
  ...defaultReminder,
  channel: 'toast',
  visual: 'static',
  topmost: false,
  repeatEveryMin: 0,
  repeatMax: 0,
}

export const CHANNELS: { key: ReminderChannel; label: string }[] = [
  { key: 'off', label: '不提醒' },
  { key: 'inapp', label: '应用内提醒' },
  { key: 'desktop', label: '弹窗提醒' },
  { key: 'toast', label: '系统通知' },
]

export const VISUALS: { key: ReminderVisual; label: string }[] = [
  { key: 'static', label: '无动画' },
  { key: 'breathe', label: '边框呼吸' },
  { key: 'blink', label: '整窗闪烁' },
  { key: 'shake', label: '抖动' },
]

export const SNOOZE_CHOICES = [5, 10, 15, 30]

export const CHANNEL_LABEL = new Map(CHANNELS.map((entry) => [entry.key, entry.label]))

export function readReminderDefaults(): Reminder {
  try {
    const value = localStorage.getItem(DEFAULTS_KEY)
    if (!value) return defaultReminder
    return { ...defaultReminder, ...(JSON.parse(value) as Partial<Reminder>) }
  } catch {
    return defaultReminder
  }
}

export function saveReminderDefaults(reminder: Reminder) {
  localStorage.setItem(DEFAULTS_KEY, JSON.stringify(reminder))
}

export function readMuted() {
  return localStorage.getItem(MUTED_KEY) === 'true'
}

export function saveMuted(muted: boolean) {
  localStorage.setItem(MUTED_KEY, String(muted))
}

/**
 * Occurrences the user has already been rung for. Persisted so relaunching does
 * not replay reminders that were stopped in an earlier session; the date and
 * time are part of the key, so tomorrow's repeat still rings.
 */
function readHandled(): Record<string, number> {
  try {
    const value = localStorage.getItem(HANDLED_KEY)
    if (!value) return {}
    const parsed = JSON.parse(value) as Record<string, number>
    const cutoff = Date.now() - HANDLED_TTL_MS
    return Object.fromEntries(Object.entries(parsed).filter(([, at]) => at >= cutoff))
  } catch {
    return {}
  }
}

export function markHandled(id: string) {
  const handled = readHandled()
  handled[id] = Date.now()
  localStorage.setItem(HANDLED_KEY, JSON.stringify(handled))
}

export function clearHandled(id: string) {
  const handled = readHandled()
  delete handled[id]
  localStorage.setItem(HANDLED_KEY, JSON.stringify(handled))
}

/**
 * Snoozed occurrences and when they are due again.
 *
 * The backend plan is replaced wholesale on every sync, so a snooze that lived
 * only in the backend queue would be wiped the next time any schedule edit
 * triggered one. Keeping it here makes `buildJobs` idempotent: re-syncing
 * rebuilds the snoozed ring instead of dropping it.
 */
function readSnoozed(): Record<string, number> {
  try {
    const value = localStorage.getItem(SNOOZED_KEY)
    if (!value) return {}
    const parsed = JSON.parse(value) as Record<string, number>
    const cutoff = Date.now() - HANDLED_TTL_MS
    return Object.fromEntries(Object.entries(parsed).filter(([, at]) => at >= cutoff))
  } catch {
    return {}
  }
}

export function markSnoozed(id: string, until: number) {
  const snoozed = readSnoozed()
  snoozed[id] = until
  localStorage.setItem(SNOOZED_KEY, JSON.stringify(snoozed))
}

export function clearSnoozed(id: string) {
  const snoozed = readSnoozed()
  delete snoozed[id]
  localStorage.setItem(SNOOZED_KEY, JSON.stringify(snoozed))
}

export function occurrenceId(item: Pick<ReminderSource, 'id' | 'date' | 'time'>) {
  return `${item.id}|${item.date}|${item.time}`
}

export function reminderOf(item: ReminderSource): Reminder {
  return item.reminder ?? legacyReminder
}

/**
 * Turns the current schedule into a plan the backend can run. Times are resolved
 * here because the time-zone setting lives in the frontend; the backend only
 * ever sees epoch milliseconds.
 */
export function buildJobs(items: ReminderSource[], now = Date.now()): ReminderJob[] {
  if (readMuted()) return []

  const handled = readHandled()
  const snoozed = readSnoozed()
  const jobs: ReminderJob[] = []

  items.forEach((item) => {
    if (item.done) return

    const reminder = reminderOf(item)
    if (reminder.channel === 'off') return

    const id = occurrenceId(item)
    // A snooze outranks the "already rang" record — that is the whole point of
    // asking to be reminded again.
    const snoozedUntil = snoozed[id]
    if (!snoozedUntil && handled[id]) return

    const due = zonedEpoch(item.date, item.time)
    if (Number.isNaN(due)) return

    const triggerAt = snoozedUntil ?? due - reminder.leadMinutes * 60000
    const lateBy = now - triggerAt
    if (lateBy > OVERDUE_GRACE_MS) return

    jobs.push({
      ...reminder,
      id,
      itemId: item.id,
      title: item.title,
      timeLabel: item.time,
      tag: item.tag,
      triggerAt,
      overdueMinutes: lateBy > 0 ? Math.round(lateBy / 60000) : 0,
      round: 0,
    })
  })

  return jobs
}

export async function syncReminders(items: ReminderSource[]) {
  if (!isTauri) return

  await invoke('sync_reminders', {
    jobs: buildJobs(items),
    inappFallback: readSettings().inappFallbackToDesktop,
  })
}

export async function syncNotices(jobs: NoticeJob[]) {
  if (!isTauri) return
  await invoke('sync_notices', { jobs })
}

/** Stops one ringing reminder, or every one of them when `id` is omitted. */
export async function stopReminder(id?: string) {
  if (!isTauri) return
  await invoke('stop_reminder', { id: id ?? null })
}

export async function snoozeReminder(id: string, minutes: number) {
  markSnoozed(id, Date.now() + minutes * 60000)
  if (!isTauri) return
  await invoke('snooze_reminder', { id, minutes })
}

/** Records an occurrence as dealt with so no later sync re-creates its ring. */
export function resolveOccurrence(id: string) {
  markHandled(id)
  clearSnoozed(id)
}

// The reminder window is presentation only: completing an item has to happen in
// the schedule window that owns the list, so it travels over localStorage like
// the context menu's actions do.
export type ReminderAction = {
  type: 'done'
  itemId: string
  occurrenceId: string
  nonce: number
}

export function sendReminderAction(action: ReminderAction) {
  localStorage.setItem(ACTION_KEY, JSON.stringify(action))
}

export function onReminderAction(handler: (action: ReminderAction) => void) {
  function onStorage(event: StorageEvent) {
    if (event.key !== ACTION_KEY || !event.newValue) return
    try {
      handler(JSON.parse(event.newValue) as ReminderAction)
    } catch {
      // ignore malformed actions
    }
  }

  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}

type Unlisten = () => void

function subscribe<T>(event: string, handler: (payload: T) => void): Unlisten {
  if (!isTauri) return () => {}

  let stop: Unlisten | null = null
  let cancelled = false

  void listen<T>(event, ({ payload }) => handler(payload)).then((unlisten) => {
    if (cancelled) unlisten()
    else stop = unlisten
  })

  return () => {
    cancelled = true
    stop?.()
  }
}

/** A reminder that should pop up in the reminder window. */
export function onReminderFire(handler: (job: ReminderJob) => void) {
  return subscribe<ReminderJob>('reminder://fire', handler)
}

/** A reminder that should show as a banner inside the schedule widget. */
export function onReminderInapp(handler: (job: ReminderJob) => void) {
  return subscribe<ReminderJob>('reminder://inapp', handler)
}

/** Every ring, so the occurrence can be recorded as already handled. */
export function onReminderFired(handler: (event: { id: string; round: number }) => void) {
  return subscribe<{ id: string; round: number }>('reminder://fired', handler)
}
