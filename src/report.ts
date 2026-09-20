// The day's tally and the report built from it.
//
// Two halves with different lifetimes. The **tally** is written all day long —
// which mood was on screen, how long the boss key was held down, how many tasks
// were fed — because none of it can be reconstructed after the fact. The
// **report** is built once, after the working day ends, from the tally plus the
// activity summary, and then never changes.
//
// Both live in localStorage: a report is a few hundred bytes and there are at
// most `retainDays` of them, which is nothing like the note bodies that had to
// be kept out of it.

import type { WorkMetrics } from './activity'
import type { EarningsState } from './earnings'
import { type MoodKey, moodLabel, moods } from './moo'
import { createStore } from './store'
import { addDays } from './time'
import { type WorkConfig, formatHours, formatMoney } from './work'
import { locale } from './locales'

export type DayTally = {
  /** Minutes each main state was on screen. */
  moodMinutes: Partial<Record<MoodKey, number>>
  /** Minutes spent in the disguise, which are paid minutes bought back. */
  fishingMinutes: number
  fedCount: number
}

export type DailyReport = {
  date: string
  presentMinutes: number
  effectiveMinutes: number
  slackMinutes: number
  meetingMinutes: number
  overtimeMinutes: number
  unpaidMinutes: number
  keysBackShare: number
  wasted: number
  earned: number
  fishingMinutes: number
  fishingValue: number
  fedCount: number
  moodMinutes: Partial<Record<MoodKey, number>>
  summary: string
  currency: string
}

export type ReportState = {
  tally: Record<string, DayTally>
  reports: Record<string, DailyReport>
}

const emptyTally: DayTally = { moodMinutes: {}, fishingMinutes: 0, fedCount: 0 }

const reportStore = createStore<ReportState>('desktime.reports', { tally: {}, reports: {} })
export const subscribeReports = reportStore.subscribe
export const reportsSnapshot = reportStore.snapshot

function patchTally(ymd: string, change: (tally: DayTally) => DayTally) {
  const state = reportStore.read()
  const current = state.tally[ymd] ?? emptyTally
  reportStore.update({ tally: { ...state.tally, [ymd]: change(current) } })
}

/** Called on every metrics refresh, so the mood curve is sampled, not guessed. */
export function recordMood(ymd: string, mood: MoodKey, minutes: number) {
  patchTally(ymd, (tally) => ({
    ...tally,
    moodMinutes: { ...tally.moodMinutes, [mood]: (tally.moodMinutes[mood] ?? 0) + minutes },
  }))
}

export function recordFishing(ymd: string, minutes: number) {
  patchTally(ymd, (tally) => ({ ...tally, fishingMinutes: tally.fishingMinutes + minutes }))
}

export function recordFed(ymd: string) {
  patchTally(ymd, (tally) => ({ ...tally, fedCount: tally.fedCount + 1 }))
}

export function tallyFor(ymd: string) {
  return reportStore.read().tally[ymd] ?? emptyTally
}

/** One line that says the thing the numbers add up to, worst news first. */
function summarise(report: DailyReport) {
  if (report.unpaidMinutes >= 120) {
    return `白干了 ${formatHours(report.unpaidMinutes)}，折合 ${formatMoney(report.wasted, report.currency, false)}。这笔钱没人会补给你。`
  }
  if (report.meetingMinutes >= 180 && report.effectiveMinutes < 60) {
    return `开了 ${formatHours(report.meetingMinutes)} 的会，真正干活 ${formatHours(report.effectiveMinutes)}。会议是今天最大的开销。`
  }
  if (report.presentMinutes === 0) {
    return locale().report.noActivity
  }
  if (report.slackMinutes > report.effectiveMinutes) {
    return `摸鱼 ${formatHours(report.slackMinutes)}，干活 ${formatHours(report.effectiveMinutes)}。工资照发，这一天不亏。`
  }
  if (report.overtimeMinutes === 0) {
    return `准时下班，在岗 ${formatHours(report.presentMinutes)}。这条命还是你自己的。`
  }
  return `在岗 ${formatHours(report.presentMinutes)}，加班 ${formatHours(report.overtimeMinutes)}。还行，至少没白加太多。`
}

export function buildReport(
  work: WorkConfig,
  metrics: WorkMetrics,
  earnings: EarningsState,
  ymd: string,
): DailyReport {
  const tally = tallyFor(ymd)
  const { today: summary } = metrics
  const hourly = metrics.baseRate

  const report: DailyReport = {
    date: ymd,
    presentMinutes: metrics.presentMinutes,
    effectiveMinutes: metrics.effectiveMinutes,
    slackMinutes: Math.max(0, metrics.presentMinutes - metrics.effectiveMinutes),
    meetingMinutes: metrics.meetingMinutes,
    overtimeMinutes: metrics.overtimeMinutes,
    unpaidMinutes: metrics.unpaidMinutes,
    keysBackShare: summary.keysTotal > 0 ? summary.keysBack / summary.keysTotal : 0,
    wasted: metrics.wastedToday,
    earned: earnings.earned,
    fishingMinutes: tally.fishingMinutes,
    // Paid time spent not working is the one number in here that is good news.
    fishingValue: (tally.fishingMinutes / 60) * hourly,
    fedCount: tally.fedCount,
    moodMinutes: tally.moodMinutes,
    summary: '',
    currency: work.salary.currency,
  }

  report.summary = summarise(report)
  return report
}

/** Writes a report once and drops anything past the retention window. */
export function saveReport(report: DailyReport, retainDays: number) {
  const state = reportStore.read()
  const cutoff = addDays(report.date, -Math.max(1, retainDays))
  const keep = <T,>(source: Record<string, T>) =>
    Object.fromEntries(Object.entries(source).filter(([date]) => date >= cutoff))

  reportStore.update({
    tally: keep(state.tally),
    reports: { ...keep(state.reports), [report.date]: report },
  })
}

export function reportFor(ymd: string) {
  return reportStore.read().reports[ymd] ?? null
}

/** Newest first, for the report browser's date stepper. */
export function reportDates() {
  return Object.keys(reportStore.read().reports).sort().reverse()
}

export function moodBreakdown(report: DailyReport) {
  const total = Object.values(report.moodMinutes).reduce((sum, value) => sum + (value ?? 0), 0)
  if (!total) return []

  return (Object.entries(report.moodMinutes) as [MoodKey, number][])
    .filter(([, minutes]) => minutes > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, minutes]) => ({
      key,
      emoji: moods[key].emoji,
      label: moodLabel(moods[key]),
      minutes,
      share: minutes / total,
    }))
}
