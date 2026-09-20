// Month-grid data for the calendar view.
//
// Everything a cell shows comes from `lunar-javascript`, which the clock widget
// already depends on — lunar dates, solar terms, festivals and the official
// Chinese holiday/make-up-workday table are all in there, so a month view needs
// no new dependency and no network.
//
// The grid is fixed at six rows. A month that fits in five would otherwise
// change height as you page through it, and the panel below would jump.

import { HolidayUtil, Solar } from 'lunar-javascript'
import { addDays, weekdayOf } from './time'
import { locale, showsLunar } from './locales'

export type DayBadge = 'rest' | 'work'

export type DayCell = {
  ymd: string
  day: number
  inMonth: boolean
  weekend: boolean
  /** Lunar day, the lunar month on its first day, or a solar term / festival. */
  sub: string
  /** True when `sub` is a term or festival rather than a plain lunar day. */
  accent: boolean
  /** Official day off, or a Saturday that was turned into a workday. */
  badge: DayBadge | null
  /** Full festival name, for the cell's tooltip. */
  title: string
}

const ROWS = 6
const COLUMNS = 7

/** Noon keeps the conversion clear of any midnight edge in the local zone. */
function solarOf(ymd: string) {
  return Solar.fromDate(new Date(`${ymd}T12:00:00`))
}

function describe(ymd: string): Pick<DayCell, 'sub' | 'accent' | 'title'> {
  // Chinese only, on purpose: lunar-javascript speaks Chinese, and the terms
  // and festivals it reports belong to the Chinese calendar. See ClockPanel.
  if (!showsLunar()) return { sub: '', accent: false, title: '' }

  const solar = solarOf(ymd)
  const lunar = solar.getLunar()

  // Solar terms win over everything: they are the reason people look at a lunar
  // calendar at all, and there are only 24 of them a year.
  const term = lunar.getJieQi()
  const festivals = [...solar.getFestivals(), ...lunar.getFestivals()]
  const marker = term || festivals[0]
  if (marker) {
    return { sub: marker.slice(0, 3), accent: true, title: festivals.join(' · ') || marker }
  }

  const day = lunar.getDayInChinese()
  // The first of a lunar month names the month instead of repeating "初一".
  const sub = day === '初一' ? `${lunar.getMonthInChinese()}月` : day
  return { sub, accent: false, title: `农历${lunar.getMonthInChinese()}月${day}` }
}

function badgeOf(ymd: string): DayBadge | null {
  const holiday = HolidayUtil.getHoliday(ymd)
  if (!holiday) return null
  return holiday.isWork() ? 'work' : 'rest'
}

/** 42 cells starting on the Sunday of the week the 1st falls in. */
export function monthGrid(month: string): DayCell[] {
  const first = `${month}-01`
  const start = addDays(first, -weekdayOf(first))

  return Array.from({ length: ROWS * COLUMNS }, (_, index) => {
    const ymd = addDays(start, index)
    const weekday = weekdayOf(ymd)
    return {
      ymd,
      day: Number(ymd.slice(8, 10)),
      inMonth: ymd.slice(0, 7) === month,
      weekend: weekday === 0 || weekday === 6,
      badge: badgeOf(ymd),
      ...describe(ymd),
    }
  })
}

export function monthLabel(month: string) {
  return `${Number(month.slice(0, 4))} 年 ${Number(month.slice(5, 7))} 月`
}

/** Read per call rather than held: the heads are translated. */
export function weekdayHeads() {
  return locale().calendar.weekdayHeads
}
