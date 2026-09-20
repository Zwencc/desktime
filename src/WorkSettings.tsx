// Work schedule and salary structure, in the settings window.
//
// One model covers every shape of week the brief asked for — five days, six
// days, alternating Saturdays, three days, half-day Saturdays — because each day
// is configured on its own and `biweekly` mode simply supplies a second week.
// There is no separate "single rest day" option to keep in step with the rest.

import { useState, useSyncExternalStore } from 'react'
import { Plus, X } from 'lucide-react'
import { MonthCalendar } from './MonthCalendar'
import {
  type DayPlan,
  type DeductItem,
  type EarningsConfig,
  type IncomeCycle,
  type IncomeItem,
  baseHourlyRate,
  formatHours,
  formatMoney,
  monthlyDisposable,
  newId,
  readWork,
  standardMonthMinutes,
  subscribeWork,
  updateWork,
  workSnapshot,
} from './work'
import { today } from './time'
import { locale, useLocale } from './locales'


/** Sunday first, matching `Date.getUTCDay()`. Read per call: the names are
 *  translated, and a module constant would freeze the first language seen. */
function weekdays() {
  return locale().calendar.weekdays
}

function cycles(): { value: IncomeCycle; label: string }[] {
  const text = locale().workSettings
  return [
    { value: 'monthly', label: text.monthly },
    { value: 'weekly', label: text.weekly2 },
    { value: 'yearly', label: text.yearly },
    { value: 'once', label: text.once },
  ]
}

export function WorkSettings() {
  const strings = useLocale()
  const text = strings.workSettings
  useSyncExternalStore(subscribeWork, workSnapshot)
  const work = readWork()
  const { schedule, salary, earnings } = work
  const ymd = today()
  const month = Number(ymd.slice(5, 7))
  const [pickingAnchor, setPickingAnchor] = useState(false)
  const [anchorMonth, setAnchorMonth] = useState(
    () => (schedule.anchorDate || ymd).slice(0, 7),
  )

  function setDay(week: 'weekA' | 'weekB', index: number, patch: Partial<DayPlan>) {
    const days = schedule[week].map((day, entry) => (entry === index ? { ...day, ...patch } : day))
    updateWork({ schedule: { ...schedule, [week]: days } })
  }

  function setIncomes(incomes: IncomeItem[]) {
    updateWork({ salary: { ...salary, incomes } })
  }

  function setDeducts(deducts: DeductItem[]) {
    updateWork({ salary: { ...salary, deducts } })
  }

  function renderWeek(week: 'weekA' | 'weekB') {
    return (
      <div className="work-week">
        {schedule[week].map((day, index) => (
          <div className="work-day" key={weekdays()[index]}>
            <label className="work-day-name">
              <input
                type="checkbox"
                checked={day.work}
                onChange={(event) => setDay(week, index, { work: event.target.checked })}
              />
              <span>{weekdays()[index]}</span>
            </label>
            <input
              type="time"
              value={day.start}
              disabled={!day.work}
              onChange={(event) => setDay(week, index, { start: event.target.value })}
            />
            <span className="work-dash">–</span>
            <input
              type="time"
              value={day.end}
              disabled={!day.work}
              onChange={(event) => setDay(week, index, { end: event.target.value })}
            />
            <small>{text.breakLabel}</small>
            <input
              type="number"
              className="work-break"
              min={0}
              max={240}
              value={day.breakMinutes}
              disabled={!day.work}
              onChange={(event) =>
                setDay(week, index, {
                  breakMinutes: Math.min(240, Math.max(0, Number(event.target.value) || 0)),
                })
              }
            />
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      <section className="settings-section">
        <h2>{text.schedule}</h2>
        <div className="field-row">
          <span>{text.mode}</span>
          <label>
            <input
              type="radio"
              name="workMode"
              checked={schedule.mode === 'weekly'}
              onChange={() => updateWork({ schedule: { ...schedule, mode: 'weekly' } })}
            />
            <span>{text.weekly}</span>
          </label>
          <label>
            <input
              type="radio"
              name="workMode"
              checked={schedule.mode === 'biweekly'}
              onChange={() => updateWork({ schedule: { ...schedule, mode: 'biweekly' } })}
            />
            <span>{text.biweekly}</span>
          </label>
        </div>

        {schedule.mode === 'biweekly' && (
          <>
            <div className="field-row">
              <span>{text.anchor}</span>
              <strong className="anchor-value">{schedule.anchorDate || text.anchorEmpty}</strong>
              <button
                type="button"
                className="reminder-button"
                onClick={() => setPickingAnchor((current) => !current)}
              >
                {pickingAnchor ? text.anchorDone : text.anchorPick}
              </button>
            </div>
            <p className="settings-hint">{text.anchorHint}</p>
            {/* The same grid the schedule widget shows, so "point at a week" is
                a real calendar rather than a date field. */}
            {pickingAnchor && (
              <MonthCalendar
                month={anchorMonth}
                selected={schedule.anchorDate}
                onSelect={(day) =>
                  updateWork({ schedule: { ...schedule, anchorDate: day } })
                }
                onMonth={setAnchorMonth}
              />
            )}
            <div className="settings-subhead">{text.weekA}</div>
          </>
        )}
        {renderWeek('weekA')}

        {schedule.mode === 'biweekly' && (
          <>
            <div className="settings-subhead">{text.weekB}</div>
            {renderWeek('weekB')}
          </>
        )}

        <label className="field-row">
          <input
            type="checkbox"
            checked={schedule.overtimePaid}
            onChange={(event) =>
              updateWork({ schedule: { ...schedule, overtimePaid: event.target.checked } })
            }
          />
          <span>{text.overtimePaid}</span>
        </label>
        {schedule.overtimePaid && (
          <label className="field-row">
            <span>{text.overtimeRate}</span>
            <input
              type="number"
              min={1}
              max={5}
              step={0.5}
              value={schedule.overtimeRate}
              onChange={(event) =>
                updateWork({
                  schedule: {
                    ...schedule,
                    overtimeRate: Math.min(5, Math.max(1, Number(event.target.value) || 1)),
                  },
                })
              }
            />
          </label>
        )}
      </section>

      <section className="settings-section">
        <h2>{text.salary}</h2>
        <p className="settings-hint">{text.lossHint}</p>

        <div className="settings-subhead">{text.incomes}</div>
        {salary.incomes.map((item) => (
          <div className="money-row" key={item.id}>
            <input
              type="text"
              placeholder={text.namePlaceholder}
              value={item.name}
              onChange={(event) =>
                setIncomes(
                  salary.incomes.map((entry) =>
                    entry.id === item.id ? { ...entry, name: event.target.value } : entry,
                  ),
                )
              }
            />
            <input
              type="number"
              className="money-amount"
              min={0}
              value={item.amount}
              onChange={(event) =>
                setIncomes(
                  salary.incomes.map((entry) =>
                    entry.id === item.id
                      ? { ...entry, amount: Math.max(0, Number(event.target.value) || 0) }
                      : entry,
                  ),
                )
              }
            />
            <select
              value={item.cycle}
              onChange={(event) =>
                setIncomes(
                  salary.incomes.map((entry) =>
                    entry.id === item.id
                      ? { ...entry, cycle: event.target.value as IncomeCycle }
                      : entry,
                  ),
                )
              }
            >
              {cycles().map((cycle) => (
                <option key={cycle.value} value={cycle.value}>
                  {cycle.label}
                </option>
              ))}
            </select>
            {item.cycle === 'once' && (
              <select
                title={text.payMonth}
                value={item.month ?? 12}
                onChange={(event) =>
                  setIncomes(
                    salary.incomes.map((entry) =>
                      entry.id === item.id ? { ...entry, month: Number(event.target.value) } : entry,
                    ),
                  )
                }
              >
                {Array.from({ length: 12 }, (_, index) => index + 1).map((entry) => (
                  <option key={entry} value={entry}>
                    {entry} 月
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              className="icon-button"
              title={strings.common.delete}
              onClick={() => setIncomes(salary.incomes.filter((entry) => entry.id !== item.id))}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="reminder-button"
          onClick={() =>
            setIncomes([
              ...salary.incomes,
              { id: newId(), name: '', amount: 0, cycle: 'monthly', month: 12 },
            ])
          }
        >
          <Plus size={13} aria-hidden="true" /> {text.addIncome}
        </button>

        <div className="settings-subhead">{text.deducts}</div>
        {salary.deducts.map((item) => (
          <div className="money-row" key={item.id}>
            <input
              type="text"
              placeholder={text.namePlaceholder}
              value={item.name}
              onChange={(event) =>
                setDeducts(
                  salary.deducts.map((entry) =>
                    entry.id === item.id ? { ...entry, name: event.target.value } : entry,
                  ),
                )
              }
            />
            <select
              value={item.kind}
              onChange={(event) =>
                setDeducts(
                  salary.deducts.map((entry) =>
                    entry.id === item.id
                      ? { ...entry, kind: event.target.value as DeductItem['kind'] }
                      : entry,
                  ),
                )
              }
            >
              <option value="fixed">{text.fixed}</option>
              <option value="percent">{text.percent}</option>
            </select>
            <input
              type="number"
              className="money-amount"
              min={0}
              value={item.value}
              onChange={(event) =>
                setDeducts(
                  salary.deducts.map((entry) =>
                    entry.id === item.id
                      ? { ...entry, value: Math.max(0, Number(event.target.value) || 0) }
                      : entry,
                  ),
                )
              }
            />
            <button
              type="button"
              className="icon-button"
              title={strings.common.delete}
              onClick={() => setDeducts(salary.deducts.filter((entry) => entry.id !== item.id))}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="reminder-button"
          onClick={() =>
            setDeducts([...salary.deducts, { id: newId(), name: '', kind: 'percent', value: 0 }])
          }
        >
          <Plus size={13} aria-hidden="true" /> {text.addDeduct}
        </button>

        <p className="settings-hint">{text.salaryHint}</p>
        <div className="settings-subhead">{text.summary}</div>
        <div className="metric-grid">
          <span>{text.disposable}</span>
          <strong>{formatMoney(monthlyDisposable(salary, month), salary.currency, false)}</strong>
          <span>{text.standard}</span>
          <strong>{formatHours(standardMonthMinutes(schedule, ymd))}</strong>
          <span>{text.baseRate}</span>
          <strong>{formatMoney(baseHourlyRate(work, ymd), salary.currency)}</strong>
        </div>
      </section>

      <section className="settings-section">
        <h2>{text.counter}</h2>
        <p className="settings-hint">{text.counterHint}</p>

        <div className="field-row">
          <span>{text.cycle}</span>
          <select
            value={earnings.cycle}
            onChange={(event) =>
              updateWork({
                earnings: {
                  ...earnings,
                  cycle: event.target.value as EarningsConfig['cycle'],
                  // The start means a different thing in each cycle, so it goes
                  // back to that cycle's own default rather than carrying over.
                  cycleStart: event.target.value === 'week' ? '1' : '1',
                },
              })
            }
          >
            <option value="month">{text.cycleMonth}</option>
            <option value="week">{text.cycleWeek}</option>
            <option value="day">{text.cycleDay}</option>
          </select>
        </div>

        {earnings.cycle === 'month' && (
          <label className="field-row">
            <span>{text.cycleStart}</span>
            <input
              type="number"
              min={1}
              max={28}
              value={Number(earnings.cycleStart) || 1}
              onChange={(event) =>
                updateWork({
                  earnings: {
                    ...earnings,
                    cycleStart: String(Math.min(28, Math.max(1, Number(event.target.value) || 1))),
                  },
                })
              }
            />
            <small>{text.dayOfMonth}</small>
          </label>
        )}

        {earnings.cycle === 'week' && (
          <div className="field-row">
            <span>{text.cycleStart}</span>
            <select
              value={earnings.cycleStart}
              onChange={(event) =>
                updateWork({ earnings: { ...earnings, cycleStart: event.target.value } })
              }
            >
              {weekdays().map((label, index) => (
                <option key={label} value={String(index)}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field-row">
          <span>{text.unit}</span>
          <select
            value={earnings.displayUnit}
            onChange={(event) =>
              updateWork({
                earnings: {
                  ...earnings,
                  displayUnit: event.target.value as EarningsConfig['displayUnit'],
                },
              })
            }
          >
            <option value="month">{text.unitMonth}</option>
            <option value="day">{text.unitDay}</option>
            <option value="hour">{text.unitHour}</option>
            <option value="minute">{text.unitMinute}</option>
          </select>
        </div>

        <label className="field-row">
          <input
            type="checkbox"
            checked={earnings.showCents}
            onChange={(event) =>
              updateWork({ earnings: { ...earnings, showCents: event.target.checked } })
            }
          />
          <span>{text.showCents}</span>
        </label>
      </section>
    </>
  )
}

export default WorkSettings
