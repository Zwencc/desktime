// The activity monitor's client: its config, its app-classification table, and
// the three numbers the mood engine runs on.
//
// Collection itself is in src-tauri/src/activity — a hidden WebView stops
// ticking, and most of a work day happens while nobody is looking at the widget.
// What stays here is everything that depends on the time zone or on the user's
// own judgement:
//
//   * resolving "today" and "this month" into the epoch ranges the backend wants,
//   * classifying an executable name, which the user can override,
//   * L / F / I, because they need the work schedule.
//
// **The loss rate divides the salary out.** L is unpaid overtime over total
// hours, so the same number comes out whether or not any salary is configured —
// which is why the mood engine never has to ask about money.

import { invoke } from '@tauri-apps/api/core'
import { isTauri } from './env'
import { createStore } from './store'
import { addDays, today, zonedEpoch } from './time'
import {
  type WorkConfig,
  baseHourlyRate,
  monthDays,
  monthlyDisposable,
  planFor,
  plannedMinutes,
  readWork,
  standardMonthMinutes,
} from './work'
import { locale } from './locales'

export type AppCategory = 'chat' | 'dev' | 'office' | 'browser' | 'media' | 'design' | 'other'

/** Mirrors `ActivityConfig` in the backend; the field names must match. */
export type MonitorConfig = {
  enabled: boolean
  mic: boolean
  audio: boolean
  awayMinutes: number
  retainDays: number
  activeKeys: number
  activeMousePx: number
}

export type ActivityState = {
  monitor: MonitorConfig
  /** Executable name (lower case) to category, overriding the built-in table. */
  categories: Record<string, AppCategory>
}

export const defaultActivity: ActivityState = {
  monitor: {
    // Off until the user has read what gets collected. The backend defaults to
    // off too, so a frontend that never pushes a config collects nothing.
    enabled: false,
    mic: false,
    audio: true,
    awayMinutes: 5,
    retainDays: 90,
    activeKeys: 10,
    activeMousePx: 300,
  },
  categories: {},
}

const activityStore = createStore<ActivityState>('desktime.activity', defaultActivity)
export const readActivity = activityStore.read
export const updateActivity = activityStore.update
export const subscribeActivity = activityStore.subscribe
export const activitySnapshot = activityStore.snapshot

// ---- Backend bridge ------------------------------------------------------

export type RecentActivity = {
  minutes: number
  keysTotal: number
  keysCopy: number
  keysBack: number
  mousePx: number
  appSwitches: number
  distinctApps: number
  topApp: string
  mic: boolean
  cam: boolean
  audio: boolean
  fullscreen: boolean
  locked: boolean
  onBattery: boolean
  monitors: number
}

export type ActivitySummary = {
  presentMinutes: number
  effectiveMinutes: number
  meetingMinutes: number
  lockedMinutes: number
  keysTotal: number
  keysCopy: number
  keysBack: number
  mousePx: number
  appSwitches: number
  apps: { app: string; minutes: number }[]
  firstActive: number
  lastActive: number
  recent: RecentActivity
}

const emptyRecent: RecentActivity = {
  minutes: 0,
  keysTotal: 0,
  keysCopy: 0,
  keysBack: 0,
  mousePx: 0,
  appSwitches: 0,
  distinctApps: 0,
  topApp: '',
  mic: false,
  cam: false,
  audio: false,
  fullscreen: false,
  locked: false,
  onBattery: false,
  monitors: 1,
}

/** Hands the collection switches to DTCore. A full replace, like the reminder
 *  sync: the stored config is the only copy.
 *
 *  Both calls below cross a process boundary now, so both can fail with
 *  `CORE_UNAVAILABLE` when the background process is not running. Callers use
 *  `void`, so an unhandled rejection would be the only symptom; the failure is
 *  swallowed here and reported where it can be acted on — the DevTools window
 *  reads DTCore's own status. */
export async function pushMonitorConfig(config = readActivity().monitor) {
  if (!isTauri) return
  await invoke('sync_activity_config', { config }).catch(() => undefined)
}

export async function clearActivityData() {
  if (!isTauri) return
  await invoke('clear_activity').catch(() => undefined)
}

async function fetchSummaries(ranges: [number, number][], recentMinutes: number) {
  if (!isTauri || !ranges.length) return []
  return invoke<ActivitySummary[]>('activity_summaries', { ranges, recentMinutes })
}

// ---- Application classification ------------------------------------------

// Deliberately small: a few dozen names cover most desks, and anything else is
// one click to classify in settings. Matching is on the executable name only —
// window titles are never read, so this cannot tell which document is open.
const BUILT_IN: Record<string, AppCategory> = {
  // chat
  'qq.exe': 'chat',
  'qqnt.exe': 'chat',
  'wechat.exe': 'chat',
  'weixin.exe': 'chat',
  'wxwork.exe': 'chat',
  'dingtalk.exe': 'chat',
  'feishu.exe': 'chat',
  'lark.exe': 'chat',
  'slack.exe': 'chat',
  'teams.exe': 'chat',
  'ms-teams.exe': 'chat',
  'discord.exe': 'chat',
  'telegram.exe': 'chat',
  // dev
  'code.exe': 'dev',
  'cursor.exe': 'dev',
  'devenv.exe': 'dev',
  'idea64.exe': 'dev',
  'pycharm64.exe': 'dev',
  'webstorm64.exe': 'dev',
  'goland64.exe': 'dev',
  'clion64.exe': 'dev',
  'rustrover64.exe': 'dev',
  'datagrip64.exe': 'dev',
  'studio64.exe': 'dev',
  'sublime_text.exe': 'dev',
  'hbuilderx.exe': 'dev',
  'windowsterminal.exe': 'dev',
  'wezterm-gui.exe': 'dev',
  'powershell.exe': 'dev',
  'pwsh.exe': 'dev',
  'cmd.exe': 'dev',
  'navicat.exe': 'dev',
  'postman.exe': 'dev',
  // office
  'excel.exe': 'office',
  'winword.exe': 'office',
  'powerpnt.exe': 'office',
  'outlook.exe': 'office',
  'onenote.exe': 'office',
  'wps.exe': 'office',
  'et.exe': 'office',
  'wpp.exe': 'office',
  'notion.exe': 'office',
  'obsidian.exe': 'office',
  'typora.exe': 'office',
  'acrord32.exe': 'office',
  'foxitreader.exe': 'office',
  // browser
  'chrome.exe': 'browser',
  'msedge.exe': 'browser',
  'firefox.exe': 'browser',
  'brave.exe': 'browser',
  'opera.exe': 'browser',
  '360se.exe': 'browser',
  'qqbrowser.exe': 'browser',
  // media
  'cloudmusic.exe': 'media',
  'qqmusic.exe': 'media',
  'kugou.exe': 'media',
  'spotify.exe': 'media',
  'potplayermini64.exe': 'media',
  'vlc.exe': 'media',
  'bilibili.exe': 'media',
  'iqiyi.exe': 'media',
  'steam.exe': 'media',
  // design
  'photoshop.exe': 'design',
  'illustrator.exe': 'design',
  'figma.exe': 'design',
  'xd.exe': 'design',
  'blender.exe': 'design',
}

export const categoryNames: Record<AppCategory, string> = {
  chat: locale().categories.chat,
  dev: locale().categories.dev,
  office: locale().categories.office,
  browser: locale().categories.browser,
  media: locale().categories.media,
  design: locale().categories.design,
  other: locale().categories.other,
}

// Matched against the *product* name from the executable's version resource,
// which is what A7 makes available. More robust than the table above wherever
// the executable name says nothing: a JetBrains IDE nobody listed still calls
// itself "…IDE", and an app that renames its binary between versions keeps its
// product name. Checked in order, so the specific entries come first.
const PRODUCT_RULES: [string, AppCategory][] = [
  // dev
  ['visual studio', 'dev'],
  ['jetbrains', 'dev'],
  ['intellij', 'dev'],
  ['android studio', 'dev'],
  ['sublime', 'dev'],
  ['terminal', 'dev'],
  ['git', 'dev'],
  ['docker', 'dev'],
  ['sourcetree', 'dev'],
  // chat
  ['微信', 'chat'],
  ['wechat', 'chat'],
  ['企业微信', 'chat'],
  ['钉钉', 'chat'],
  ['飞书', 'chat'],
  ['腾讯qq', 'chat'],
  ['messenger', 'chat'],
  ['zoom', 'chat'],
  ['腾讯会议', 'chat'],
  // office
  ['microsoft office', 'office'],
  ['microsoft word', 'office'],
  ['microsoft excel', 'office'],
  ['wps', 'office'],
  ['acrobat', 'office'],
  ['pdf', 'office'],
  // browser
  ['browser', 'browser'],
  ['chromium', 'browser'],
  ['浏览器', 'browser'],
  // media
  ['music', 'media'],
  ['音乐', 'media'],
  ['player', 'media'],
  ['视频', 'media'],
  ['game', 'media'],
  // design
  ['adobe', 'design'],
  ['affinity', 'design'],
  ['autodesk', 'design'],
]

/**
 * The category for one executable.
 *
 * Three passes, most trustworthy first: what the user classified by hand, the
 * built-in table of executable names, then the product name — which is only
 * consulted when the first two have nothing, so a keyword can never override a
 * name that was matched exactly.
 */
export function categoryOf(
  exe: string,
  overrides: Record<string, AppCategory> = {},
  product?: string,
): AppCategory {
  const key = exe.toLowerCase()
  const known = overrides[key] ?? BUILT_IN[key]
  if (known) return known

  if (product) {
    const name = product.toLowerCase()
    const rule = PRODUCT_RULES.find(([keyword]) => name.includes(keyword))
    if (rule) return rule[1]
  }

  return 'other'
}

// ---- Real application names ----------------------------------------------

/**
 * Product names already asked for, so each executable costs one call per run.
 *
 * Safe to cache for the life of the window: an executable is always the same
 * product. A miss is cached too — as the executable name — because "the backend
 * has never seen this one in the foreground" does not change by asking again.
 */
const nameCache = new Map<string, string>()

/**
 * Turns executable names into the names people use for them, e.g. `code.exe`
 * into "Visual Studio Code".
 *
 * Reads the executable's version resource in the backend, never the window
 * title. Anything it cannot answer for comes back as the executable name, which
 * is what was being shown before.
 */
export async function resolveAppNames(exes: string[]): Promise<Record<string, string>> {
  const missing = exes.filter((exe) => !nameCache.has(exe))

  if (isTauri && missing.length > 0) {
    try {
      const resolved = await invoke<Record<string, string>>('resolve_app_names', { exes: missing })
      missing.forEach((exe) => nameCache.set(exe, resolved[exe] ?? exe))
    } catch {
      missing.forEach((exe) => nameCache.set(exe, exe))
    }
  }

  return Object.fromEntries(exes.map((exe) => [exe, nameCache.get(exe) ?? exe]))
}

// ---- The three numbers ---------------------------------------------------

export type WorkMetrics = {
  /** L: unpaid overtime as a share of all hours worked this month. */
  loss: number
  /** F: share of desk time that was not effective work. */
  slack: number
  /** I: how hard the last few minutes were being worked. */
  intensity: number
  presentMinutes: number
  effectiveMinutes: number
  meetingMinutes: number
  plannedMinutes: number
  overtimeMinutes: number
  unpaidMinutes: number
  monthUnpaidMinutes: number
  standardMonthMinutes: number
  baseRate: number
  actualRate: number
  wastedToday: number
  category: AppCategory
  today: ActivitySummary
  /** When these numbers were read, so callers can extrapolate between samples. */
  at: number
}

const emptySummary: ActivitySummary = {
  presentMinutes: 0,
  effectiveMinutes: 0,
  meetingMinutes: 0,
  lockedMinutes: 0,
  keysTotal: 0,
  keysCopy: 0,
  keysBack: 0,
  mousePx: 0,
  appSwitches: 0,
  apps: [],
  firstActive: 0,
  lastActive: 0,
  recent: emptyRecent,
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function ratio(value: number, ceiling: number) {
  return clamp01(value / ceiling)
}

export function computeMetrics(
  work: WorkConfig,
  days: string[],
  summaries: ActivitySummary[],
  ymd: string,
  overrides: Record<string, AppCategory>,
  /** The foreground app's product name, when it has been resolved. */
  topAppName?: string,
): WorkMetrics {
  const { schedule } = work
  let monthUnpaid = 0
  let todayOvertime = 0

  days.forEach((day, index) => {
    const summary = summaries[index]
    if (!summary) return

    // A rest day has no contracted minutes, so every minute at the desk is
    // overtime — which is exactly what working a Saturday means.
    const overtime = Math.max(0, summary.presentMinutes - plannedMinutes(planFor(schedule, day)))
    monthUnpaid += schedule.overtimePaid ? 0 : overtime
    if (day === ymd) todayOvertime = overtime
  })

  const summary = summaries[days.indexOf(ymd)] ?? emptySummary
  const standard = standardMonthMinutes(schedule, ymd)
  const unpaidToday = schedule.overtimePaid ? 0 : todayOvertime
  const baseRate = baseHourlyRate(work, ymd)
  const totalMinutes = standard + monthUnpaid

  const { recent } = summary
  const per = (value: number) => (recent.minutes > 0 ? value / recent.minutes : 0)

  return {
    loss: totalMinutes > 0 ? monthUnpaid / totalMinutes : 0,
    slack:
      summary.presentMinutes > 0
        ? clamp01(1 - summary.effectiveMinutes / summary.presentMinutes)
        : 0,
    intensity: clamp01(
      0.5 * ratio(per(recent.keysTotal), 120) +
        0.3 * ratio(per(recent.appSwitches), 3) +
        0.2 * ratio(per(recent.mousePx), 4000),
    ),
    presentMinutes: summary.presentMinutes,
    effectiveMinutes: summary.effectiveMinutes,
    meetingMinutes: summary.meetingMinutes,
    plannedMinutes: plannedMinutes(planFor(schedule, ymd)),
    overtimeMinutes: todayOvertime,
    unpaidMinutes: unpaidToday,
    monthUnpaidMinutes: monthUnpaid,
    standardMonthMinutes: standard,
    baseRate,
    actualRate:
      totalMinutes > 0 ? monthlyDisposable(work.salary, Number(ymd.slice(5, 7))) / (totalMinutes / 60) : 0,
    wastedToday: (unpaidToday / 60) * baseRate,
    category: categoryOf(recent.topApp, overrides, topAppName),
    today: summary,
    at: Date.now(),
  }
}

/** One round trip: this month's days so far, plus the recent-activity tail. */
export async function loadMetrics(recentMinutes = 10): Promise<WorkMetrics> {
  const ymd = today()
  const days = monthDays(ymd).filter((day) => day <= ymd)
  const ranges = days.map(
    (day) => [zonedEpoch(day, '00:00'), zonedEpoch(addDays(day, 1), '00:00')] as [number, number],
  )

  const summaries = await fetchSummaries(ranges, recentMinutes).catch(() => [])
  const topApp = summaries[days.indexOf(ymd)]?.recent.topApp ?? ''

  // Resolved so the product-name rules reach the mood engine too, not only the
  // settings list. Cached after the first look, so this is free on every later
  // call for the same application.
  const names = topApp ? await resolveAppNames([topApp]) : {}

  return computeMetrics(readWork(), days, summaries, ymd, readActivity().categories, names[topApp])
}
