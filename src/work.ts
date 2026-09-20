// Work schedule, salary structure, and the money maths built on them.
//
// Two things live here that the backend deliberately does not know about:
//
//   * **Wall-clock hours.** "09:00" only becomes an instant once a time zone is
//     applied, and the zone is a setting (see time.ts). So every epoch value the
//     activity monitor is asked about is resolved here first.
//   * **What a month is worth.** Standard monthly hours are expanded day by day
//     rather than estimated as weeks x 4.33 — with alternating-Saturday weeks and
//     28-to-31-day months, the estimate is off by enough to distort the rate.
//
// The one property that makes the rest of the feature simple: the loss rate
// (see activity.ts) divides out the salary entirely, so nothing below is needed
// for the mood engine to work. Salary only decides whether a number carries a
// currency sign next to it.

import { createStore } from './store'
import { addDays, weekdayOf, zonedEpoch } from './time'

export type DayPlan = {
  work: boolean
  /** `HH:mm`. */
  start: string
  end: string
  /** Lunch and the like; paid time is the span minus this. */
  breakMinutes: number
}

export type WorkSchedule = {
  mode: 'weekly' | 'biweekly'
  /** Length 7, index 0 = Sunday. */
  weekA: DayPlan[]
  /** Only consulted in `biweekly` mode. */
  weekB: DayPlan[]
  /** `YYYY-MM-DD`; the natural week containing it is an A week. */
  anchorDate: string
  overtimePaid: boolean
  /** Multiplier applied to paid overtime, e.g. 1.5. */
  overtimeRate: number
}

export type IncomeCycle = 'monthly' | 'weekly' | 'yearly' | 'once'

export type IncomeItem = {
  id: string
  name: string
  amount: number
  cycle: IncomeCycle
  /** 1-12; the month a `once` item is paid in. */
  month?: number
}

export type DeductItem = {
  id: string
  name: string
  kind: 'fixed' | 'percent'
  /** A percentage when `kind` is `percent`, otherwise an amount. */
  value: number
}

export type SalaryConfig = {
  incomes: IncomeItem[]
  deducts: DeductItem[]
  currency: string
}

export type EarningsConfig = {
  cycle: 'month' | 'week' | 'day'
  /** `'1'`-`'28'` for a month, `'0'`-`'6'` for a week, `'HH:mm'` for a day. */
  cycleStart: string
  displayUnit: 'month' | 'day' | 'hour' | 'minute'
  showCents: boolean
}

export type WorkConfig = {
  schedule: WorkSchedule
  salary: SalaryConfig
  earnings: EarningsConfig
}

const WORKDAY: DayPlan = { work: true, start: '09:00', end: '18:00', breakMinutes: 60 }
const RESTDAY: DayPlan = { work: false, start: '09:00', end: '18:00', breakMinutes: 60 }

/** Mon-Fri, nine to six. Index 0 is Sunday, matching `Date.getUTCDay()`. */
function fiveDayWeek(): DayPlan[] {
  return [RESTDAY, WORKDAY, WORKDAY, WORKDAY, WORKDAY, WORKDAY, RESTDAY].map((day) => ({ ...day }))
}

export const defaultWork: WorkConfig = {
  schedule: {
    mode: 'weekly',
    weekA: fiveDayWeek(),
    weekB: fiveDayWeek(),
    anchorDate: '',
    overtimePaid: false,
    overtimeRate: 1.5,
  },
  salary: { incomes: [], deducts: [], currency: '¥' },
  earnings: { cycle: 'month', cycleStart: '1', displayUnit: 'hour', showCents: true },
}

export const workStore = createStore<WorkConfig>('desktime.work', defaultWork)
export const readWork = workStore.read
export const updateWork = workStore.update
export const subscribeWork = workStore.subscribe
export const workSnapshot = workStore.snapshot
export const parseWork = workStore.parse

// ---- Schedule ------------------------------------------------------------

export function hmMinutes(hm: string) {
  const [hour, minute] = hm.split(':').map(Number)
  return (hour || 0) * 60 + (minute || 0)
}

/** Paid minutes a plan is worth, break already removed. */
export function plannedMinutes(plan: DayPlan) {
  if (!plan.work) return 0

  const start = hmMinutes(plan.start)
  // A shift ending at or before it starts runs past midnight.
  const end = hmMinutes(plan.end) <= start ? hmMinutes(plan.end) + 24 * 60 : hmMinutes(plan.end)
  return Math.max(0, end - start - plan.breakMinutes)
}

function mondayOf(ymd: string) {
  return addDays(ymd, -((weekdayOf(ymd) + 6) % 7))
}

/**
 * Which pattern a date follows. In `biweekly` mode the anchor's own week is A and
 * they alternate outwards, which is how "big and small weeks" are actually
 * described — the user points at one week rather than filling in a calendar.
 */
export function planFor(schedule: WorkSchedule, ymd: string): DayPlan {
  const weekday = weekdayOf(ymd)
  if (schedule.mode === 'weekly' || !schedule.anchorDate) return schedule.weekA[weekday]

  const span = Date.parse(`${mondayOf(ymd)}T00:00:00Z`) - Date.parse(`${mondayOf(schedule.anchorDate)}T00:00:00Z`)
  const weeks = Math.round(span / (7 * 86400000))
  // Remainder of a negative week count is negative in JS, so normalise it.
  return (((weeks % 2) + 2) % 2 === 0 ? schedule.weekA : schedule.weekB)[weekday]
}

/** Every `YYYY-MM-DD` in the natural month containing `ymd`. */
export function monthDays(ymd: string) {
  const [year, month] = ymd.split('-').map(Number)
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const prefix = ymd.slice(0, 7)
  return Array.from({ length: count }, (_, index) => `${prefix}-${String(index + 1).padStart(2, '0')}`)
}

/** Contracted minutes for the whole month, expanded day by day. */
export function standardMonthMinutes(schedule: WorkSchedule, ymd: string) {
  return monthDays(ymd).reduce((total, day) => total + plannedMinutes(planFor(schedule, day)), 0)
}

/** The day's paid window as epoch ms, resolved in the app time zone. */
export function workWindow(schedule: WorkSchedule, ymd: string) {
  const plan = planFor(schedule, ymd)
  const planned = plannedMinutes(plan)
  if (!planned) return null

  const start = zonedEpoch(ymd, plan.start)
  const overnight = hmMinutes(plan.end) <= hmMinutes(plan.start)
  const end = zonedEpoch(overnight ? addDays(ymd, 1) : ymd, plan.end)
  return { start, end, planned }
}

/**
 * How much of the day has been earned by `at`, in paid minutes. The break is
 * spread across the window rather than carved out of it: the day still pays
 * exactly `planned` minutes, and nobody has to watch the counter freeze at noon.
 */
export function earnedMinutes(schedule: WorkSchedule, ymd: string, at: number) {
  const window = workWindow(schedule, ymd)
  if (!window) return 0

  const span = window.end - window.start
  if (span <= 0) return 0

  const progress = Math.min(1, Math.max(0, (at - window.start) / span))
  return window.planned * progress
}

// ---- Salary --------------------------------------------------------------

/** Gross for a given month (1-12). Yearly and weekly items are spread; a
 *  one-off lands entirely in the month it is paid, so that month really does
 *  read as a windfall. */
export function monthlyIncome(salary: SalaryConfig, month: number) {
  return salary.incomes.reduce((total, item) => {
    switch (item.cycle) {
      case 'monthly':
        return total + item.amount
      case 'weekly':
        return total + (item.amount * 52) / 12
      case 'yearly':
        return total + item.amount / 12
      case 'once':
        return total + (item.month === month ? item.amount : 0)
    }
  }, 0)
}

/** Percentages are all taken against gross; a user who needs a different base
 *  can enter the amount directly instead. */
export function monthlyDeduction(salary: SalaryConfig, month: number) {
  const gross = monthlyIncome(salary, month)
  return salary.deducts.reduce(
    (total, item) => total + (item.kind === 'fixed' ? item.value : (gross * item.value) / 100),
    0,
  )
}

export function monthlyDisposable(salary: SalaryConfig, month: number) {
  return Math.max(0, monthlyIncome(salary, month) - monthlyDeduction(salary, month))
}

export function hasSalary(salary: SalaryConfig) {
  return salary.incomes.some((item) => item.amount > 0)
}

/** Disposable income divided by contracted hours — the number every other
 *  money figure is derived from. Zero when salary has not been configured. */
export function baseHourlyRate(work: WorkConfig, ymd: string) {
  const minutes = standardMonthMinutes(work.schedule, ymd)
  if (!minutes) return 0

  const month = Number(ymd.slice(5, 7))
  return monthlyDisposable(work.salary, month) / (minutes / 60)
}

export function formatMoney(amount: number, currency: string, cents = true) {
  return `${currency}${amount.toLocaleString('zh-CN', {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  })}`
}

export function formatHours(minutes: number) {
  return `${(minutes / 60).toFixed(1)}h`
}

export function newId() {
  return Math.random().toString(36).slice(2, 10)
}
