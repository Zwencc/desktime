// The single source of truth for every time value the app shows or compares.
//
// Nothing here may fall back to the system zone implicitly: the zone comes from
// settings, so a user in another timezone still sees (and gets reminded at) the
// times they configured. `Intl.DateTimeFormat` caches its `timeZone` internally,
// so every formatter is created lazily and dropped when the setting changes.

import { readSettings, subscribeSettings } from './settings'

const ZONE_LABELS: Record<string, string> = {
  'Asia/Shanghai': '北京时间',
}

const zoneListeners = new Set<() => void>()
const formatterCache = new Map<string, Intl.DateTimeFormat>()
let zoneCache: string | null = null

export function systemTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export function appTimeZone(): string {
  if (zoneCache === null) {
    const settings = readSettings()
    zoneCache = settings.timeZoneMode === 'system' ? systemTimeZone() : settings.timeZone
  }
  return zoneCache
}

subscribeSettings(() => {
  const next = readSettings()
  const zone = next.timeZoneMode === 'system' ? systemTimeZone() : next.timeZone
  if (zone === zoneCache) return

  zoneCache = zone
  formatterCache.clear()
  zoneListeners.forEach((listener) => listener())
})

/** Fires when the effective time zone changes, so views can re-render. */
export function subscribeTimeZone(listener: () => void) {
  zoneListeners.add(listener)
  return () => {
    zoneListeners.delete(listener)
  }
}

function cached(key: string, locale: string, options: Intl.DateTimeFormatOptions) {
  let formatter = formatterCache.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { timeZone: appTimeZone(), ...options })
    formatterCache.set(key, formatter)
  }
  return formatter
}

export function formatClock(date: Date) {
  return cached('clock', 'zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

export function formatDate(date: Date) {
  return cached('date', 'zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(date)
}

export function formatHm(date: Date) {
  return cached('hm', 'zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}

/** `YYYY-MM-DD` as read in the app time zone. */
export function zonedYmd(date: Date) {
  return cached('ymd', 'en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function today() {
  return zonedYmd(new Date())
}

export function zonedHourMinute(date: Date) {
  const parts = cached('parts', 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0')
  const hour = read('hour')
  return { hour: hour === 24 ? 0 : hour, minute: read('minute') }
}

// `longOffset` renders as "GMT+08:00" / "GMT-05:00" / plain "GMT" at zero.
function zoneOffsetMs(instant: number) {
  const parts = cached('offset', 'en-US', { timeZoneName: 'longOffset' }).formatToParts(
    new Date(instant),
  )
  const name = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT'
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name)
  if (!match) return 0
  return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 3600000 + Number(match[3]) * 60000)
}

/**
 * Epoch ms for a wall-clock `YYYY-MM-DD` + `HH:mm` read in the app time zone.
 *
 * A fixed offset would do for China (no DST since 1991) but not for zones that
 * shift, so the instant is probed twice: once assuming the naive value is UTC,
 * then again at the corrected guess. They differ only across a DST boundary.
 */
export function zonedEpoch(ymd: string, hm: string) {
  const naive = Date.parse(`${ymd}T${hm || '00:00'}:00Z`)
  if (Number.isNaN(naive)) return Number.NaN

  const first = zoneOffsetMs(naive)
  const guess = naive - first
  const second = zoneOffsetMs(guess)
  return second === first ? guess : naive - second
}

// Pure date math runs on a UTC anchor so it can never pick up a local-zone
// shift. `getUTCDay()` of the anchor is the weekday that `ymd` names anywhere.
function anchor(ymd: string) {
  return new Date(`${ymd}T00:00:00Z`)
}

export function addDays(ymd: string, days: number) {
  const date = anchor(ymd)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function weekdayOf(ymd: string) {
  return anchor(ymd).getUTCDay()
}

export function isWeekend(ymd: string) {
  const day = weekdayOf(ymd)
  return day === 0 || day === 6
}

export function weekRange() {
  const start = today()
  const monday = addDays(start, -((weekdayOf(start) + 6) % 7))
  return { start: monday, end: addDays(monday, 6) }
}

/** Human label for the active zone, used as the clock widget's title. */
export function timeZoneLabel() {
  if (readSettings().timeZoneMode === 'system') return '本地时间'

  const zone = appTimeZone()
  const known = ZONE_LABELS[zone]
  if (known) return known

  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: zone,
    timeZoneName: 'long',
  }).formatToParts(new Date())
  return parts.find((part) => part.type === 'timeZoneName')?.value ?? zone
}
