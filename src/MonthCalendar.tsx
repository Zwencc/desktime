// A month grid, used twice: as the schedule widget's calendar view, and as the
// day picker for the alternating-week anchor in settings.
//
// It owns no state. The month being shown and the day selected are both passed
// in, because the schedule widget wants them to survive a view switch and the
// settings page wants the anchor to be the stored value.

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { type DayCell, weekdayHeads, monthGrid, monthLabel } from './calendar'
import { shiftMonth, today } from './time'
import { useLocale } from './locales'


/**
 * What a day carries, as one colour and a count rather than a colour per item.
 * A 34px cell has room for the date, the lunar line and the rest/work badge —
 * so the marks get an edge and a number, not a row of dots that has to be
 * counted by eye and runs out at three.
 */
export type DayMark = {
  color: string
  count: number
}

export function MonthCalendar({
  month,
  selected,
  marks = {},
  onSelect,
  onMonth,
}: {
  /** `YYYY-MM`. */
  month: string
  selected?: string
  /** What each day carries, e.g. its schedule items. */
  marks?: Record<string, DayMark>
  onSelect: (ymd: string) => void
  onMonth: (month: string) => void
}) {
  const text = useLocale().calendar
  const todayYmd = today()
  const cells = monthGrid(month)

  function classesFor(cell: DayCell) {
    const classes = ['cal-cell']
    if (!cell.inMonth) classes.push('outside')
    if (cell.weekend) classes.push('weekend')
    if (cell.ymd === todayYmd) classes.push('today')
    if (cell.ymd === selected) classes.push('selected')
    return classes.join(' ')
  }

  return (
    <div className="calendar" data-no-drag>
      <div className="cal-head">
        <button
          className="icon-button"
          type="button"
          title={text.previous}
          onClick={() => onMonth(shiftMonth(month, -1))}
        >
          <ChevronLeft size={14} aria-hidden="true" />
        </button>
        <span className="cal-title">{monthLabel(month)}</span>
        <button
          className="icon-button"
          type="button"
          title={text.next}
          onClick={() => onMonth(shiftMonth(month, 1))}
        >
          <ChevronRight size={14} aria-hidden="true" />
        </button>
        <button
          className="reminder-button"
          type="button"
          onClick={() => {
            onMonth(todayYmd.slice(0, 7))
            onSelect(todayYmd)
          }}
        >
          {text.backToToday}
        </button>
      </div>

      <div className="cal-grid">
        {weekdayHeads().map((head: string) => (
          <span className="cal-weekday" key={head}>
            {head}
          </span>
        ))}
        {cells.map((cell) => {
          const mark = marks[cell.ymd]

          return (
            <button
              key={cell.ymd}
              type="button"
              className={classesFor(cell)}
              title={cell.title}
              onClick={() => onSelect(cell.ymd)}
            >
              <span className="cal-day">{cell.day}</span>
              <span className={cell.accent ? 'cal-sub accent' : 'cal-sub'}>{cell.sub}</span>
              {cell.badge && (
                <span className={`cal-badge ${cell.badge}`}>
                  {cell.badge === 'rest' ? text.rest : text.work}
                </span>
              )}
              {mark && <span className="cal-bar" style={{ background: mark.color }} />}
              {/* Bottom right rather than top right: the rest/work badge is
                  already in that corner and outranks a count. */}
              {mark && mark.count > 1 && <span className="cal-count">{mark.count}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default MonthCalendar
