// The real-time earnings counter.
//
// It accrues with the **scheduled** work window, not with attendance or with
// keystrokes (decision N9 / A). Pay is owed for time, so slacking still earns —
// which is the point: a counter that stopped whenever you looked away would be a
// supervisor, and this feature exists to be on the user's side.
//
// Two properties keep it cheap and correct:
//
//   * Everything is recomputed **from timestamps**, never accumulated frame by
//     frame. WebView2 throttles a hidden window's animation callbacks, and an
//     accumulator would silently under-count for exactly as long as the widget
//     was out of sight.
//   * The parts that only change once a day (the cycle's bounds, the minutes
//     already banked before today) are separated from the part that moves, so a
//     60fps redraw does not re-expand a month.

import type { WorkMetrics } from './activity'
import { addDays, shiftMonth, zonedEpoch } from './time'
import {
  type EarningsConfig,
  type WorkConfig,
  baseHourlyRate,
  earnedMinutes,
  monthlyDisposable,
  planFor,
  plannedMinutes,
  workWindow,
} from './work'
import { locale } from './locales'

export type CycleBase = {
  startYmd: string
  /** Exclusive. */
  endYmd: string
  startMs: number
  endMs: number
  /** Contracted minutes for the whole cycle. */
  expectedMinutes: number
  /** Contracted minutes for the days already finished. */
  priorMinutes: number
  workDays: number
  baseRate: number
}

export type EarningsState = {
  earned: number
  expected: number
  /** The rate as the user chose to read it (per month / day / hour / minute). */
  unitRate: number
  unitLabel: string
  /** True while the scheduled window is running, i.e. the number is moving. */
  billing: boolean
  /** True while working unpaid past the end of the day. */
  overtime: boolean
  /** Money worked for nothing, today. */
  wasted: number
  cycleProgress: number
  timeProgress: number
  /** Minutes earned per minute at the desk; > 1 means the day is paying off. */
  efficiency: number
  currency: string
  showCents: boolean
}

// Read per call rather than held in a constant: a table built at module load
// would hold whichever language was current when this file was first imported,
// and the rate line would keep showing it after a switch.
function unitLabel(unit: EarningsConfig['displayUnit']): string {
  const text = locale().earnings
  const labels: Record<EarningsConfig['displayUnit'], string> = {
    month: text.unitMonth,
    day: text.unitDay,
    hour: text.unitHour,
    minute: text.unitMinute,
  }
  return labels[unit]
}

/**
 * First and last day of the cycle `ymd` falls in. Month starts are clamped to 28
 * so "the 31st" cannot skip February entirely.
 */
export function cycleRange(config: EarningsConfig, ymd: string) {
  if (config.cycle === 'day') {
    return { startYmd: ymd, endYmd: addDays(ymd, 1) }
  }

  if (config.cycle === 'week') {
    const target = Math.min(6, Math.max(0, Number(config.cycleStart) || 1))
    const weekday = new Date(`${ymd}T00:00:00Z`).getUTCDay()
    const back = (weekday - target + 7) % 7
    const startYmd = addDays(ymd, -back)
    return { startYmd, endYmd: addDays(startYmd, 7) }
  }

  const day = Math.min(28, Math.max(1, Number(config.cycleStart) || 1))
  const suffix = `-${String(day).padStart(2, '0')}`
  const prefix = Number(ymd.slice(8, 10)) >= day ? ymd.slice(0, 7) : shiftMonth(ymd.slice(0, 7), -1)
  return { startYmd: prefix + suffix, endYmd: shiftMonth(prefix, 1) + suffix }
}

/** The slow half: everything that only moves when the day or the config does. */
export function cycleBase(work: WorkConfig, ymd: string): CycleBase {
  const { schedule } = work
  const { startYmd, endYmd } = cycleRange(work.earnings, ymd)

  let expectedMinutes = 0
  let priorMinutes = 0
  let workDays = 0

  for (let day = startYmd; day < endYmd; day = addDays(day, 1)) {
    const planned = plannedMinutes(planFor(schedule, day))
    expectedMinutes += planned
    if (planned > 0) workDays += 1
    if (day < ymd) priorMinutes += planned
  }

  return {
    startYmd,
    endYmd,
    startMs: zonedEpoch(startYmd, '00:00'),
    endMs: zonedEpoch(endYmd, '00:00'),
    expectedMinutes,
    priorMinutes,
    workDays,
    baseRate: baseHourlyRate(work, ymd),
  }
}

function unitRate(work: WorkConfig, base: CycleBase, ymd: string) {
  switch (work.earnings.displayUnit) {
    case 'month':
      return monthlyDisposable(work.salary, Number(ymd.slice(5, 7)))
    case 'day':
      return base.workDays > 0 ? ((base.expectedMinutes / 60) * base.baseRate) / base.workDays : 0
    case 'minute':
      return base.baseRate / 60
    case 'hour':
      return base.baseRate
  }
}

/** The fast half: safe to call on every animation frame. */
export function liveEarnings(
  work: WorkConfig,
  base: CycleBase,
  metrics: WorkMetrics | null,
  ymd: string,
  at: number,
): EarningsState {
  const { schedule, salary, earnings } = work
  const window = workWindow(schedule, ymd)
  const todayMinutes = earnedMinutes(schedule, ymd, at)
  const banked = base.priorMinutes + todayMinutes

  const pastEnd = window ? at - window.end : 0
  const overtime = window !== null && pastEnd > 0 && !schedule.overtimePaid

  // The backend's unpaid figure is presence-aware but only lands once a minute,
  // so it is topped up with real time while there is still input — the number
  // keeps flowing while you work and settles within a sample of you stopping.
  const working = (metrics?.today.recent.keysTotal ?? 0) > 0 || (metrics?.today.recent.mousePx ?? 0) > 0
  const unpaid = metrics
    ? metrics.unpaidMinutes + (overtime && working ? Math.max(0, (at - metrics.at) / 60000) : 0)
    : 0

  return {
    earned: (banked / 60) * base.baseRate,
    expected: (base.expectedMinutes / 60) * base.baseRate,
    unitRate: unitRate(work, base, ymd),
    unitLabel: unitLabel(earnings.displayUnit),
    billing: window !== null && at >= window.start && at < window.end,
    overtime,
    wasted: (unpaid / 60) * base.baseRate,
    cycleProgress: base.expectedMinutes > 0 ? banked / base.expectedMinutes : 0,
    timeProgress:
      base.endMs > base.startMs
        ? Math.min(1, Math.max(0, (at - base.startMs) / (base.endMs - base.startMs)))
        : 0,
    efficiency:
      metrics && metrics.presentMinutes > 0 ? todayMinutes / metrics.presentMinutes : 0,
    currency: salary.currency,
    showCents: earnings.showCents,
  }
}
