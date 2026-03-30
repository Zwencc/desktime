import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Bell, BellOff, Pause, Play, RotateCcw, Timer } from 'lucide-react'
import { HolidayUtil, Solar } from 'lunar-javascript'
import { type NoticeJob, syncNotices } from './reminder'
import {
  appTimeZone,
  formatClock,
  formatDate,
  subscribeTimeZone,
  timeZoneLabel,
  zonedEpoch,
  zonedHourMinute,
  zonedYmd,
} from './time'

const text = {
  lunarPrefix: '农历',
  pomodoroDone: '🍅 番茄钟完成',
  pomodoroDoneBody: '专注时间到，休息一下吧',
  hourlyChime: '整点报时',
  hourlyBody: (hour: number) => `现在是${timeZoneLabel()} ${hour} 点整`,
  hourlyOn: '整点报时：开',
  hourlyOff: '整点报时：关',
  startFocus: '开始专注',
  pauseFocus: '暂停',
  resetFocus: '重置番茄钟',
}

const HOURLY_CHIME_KEY = 'desktime.hourlyChime'
const POMODORO_MS = 25 * 60 * 1000
const POMODORO_JOB = 'pomodoro'

/**
 * How far ahead the chime is queued. The backend holds the whole run, so the
 * clock can be throttled — or the window hidden — for the better part of a day
 * without missing an hour.
 */
const HOURLY_LOOKAHEAD = 24

function pad(value: number) {
  return String(value).padStart(2, '0')
}

// Hour boundaries are computed in the app zone rather than by stepping UTC,
// because not every zone sits on a whole hour (India is +05:30, Nepal +05:45).
function hourlyNotices(): NoticeJob[] {
  const now = Date.now()
  const notices: NoticeJob[] = []

  for (let step = 1; step <= HOURLY_LOOKAHEAD; step += 1) {
    const probe = new Date(now + step * 3600000)
    const { hour } = zonedHourMinute(probe)
    const triggerAt = zonedEpoch(zonedYmd(probe), `${pad(hour)}:00`)
    if (Number.isNaN(triggerAt) || triggerAt <= now) continue

    notices.push({
      id: `hourly-${triggerAt}`,
      triggerAt,
      title: text.hourlyChime,
      body: text.hourlyBody(hour),
    })
  }

  return notices
}

function formatDuration(ms: number) {
  const total = Math.ceil(ms / 1000)
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

type LunarInfo = { date: string; tags: string[] }

function computeLunar(ymd: string): LunarInfo {
  const solar = Solar.fromDate(new Date(`${ymd}T12:00:00`))
  const lunar = solar.getLunar()
  const date = `${text.lunarPrefix}${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`
  const tags = [...solar.getFestivals(), ...lunar.getFestivals()]
  const jieqi = lunar.getJieQi()
  if (jieqi) tags.push(jieqi)
  const holiday = HolidayUtil.getHoliday(ymd)
  if (holiday && !holiday.isWork()) tags.push(holiday.getName())
  return { date, tags }
}

export function ClockPanel() {
  const [now, setNow] = useState(() => new Date())
  const [remaining, setRemaining] = useState(POMODORO_MS)
  const [running, setRunning] = useState(false)
  const [hourlyChime, setHourlyChime] = useState(
    () => localStorage.getItem(HOURLY_CHIME_KEY) === 'true',
  )
  const endRef = useRef(0)
  // Re-render (and drop the memoised lunar date) when the time zone setting changes.
  const zone = useSyncExternalStore(subscribeTimeZone, appTimeZone)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  // The countdown display still ticks here, but the completion notification no
  // longer does: the backend owns that so it fires even when this window is
  // hidden. One second is enough for a mm:ss readout.
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => {
      const left = Math.max(0, endRef.current - Date.now())
      setRemaining(left)
      if (left === 0) setRunning(false)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [running])

  const currentHour = zonedHourMinute(now).hour

  // Both timed notifications this widget owns go over as one plan — the backend
  // replaces the whole notice list on each sync. Re-running once an hour tops the
  // queue back up to a full day of lookahead.
  useEffect(() => {
    const notices = hourlyChime ? hourlyNotices() : []
    if (running) {
      notices.push({
        id: POMODORO_JOB,
        triggerAt: endRef.current,
        title: text.pomodoroDone,
        body: text.pomodoroDoneBody,
      })
    }

    void syncNotices(notices)
  }, [hourlyChime, running, zone, currentHour])

  const ymd = zonedYmd(now)
  const lunar = useMemo(() => computeLunar(ymd), [ymd])

  function togglePomodoro() {
    if (running) {
      setRunning(false)
      return
    }
    const base = remaining > 0 ? remaining : POMODORO_MS
    if (remaining <= 0) setRemaining(POMODORO_MS)
    endRef.current = Date.now() + base
    setRunning(true)
  }

  function resetPomodoro() {
    setRunning(false)
    setRemaining(POMODORO_MS)
  }

  function toggleHourly() {
    setHourlyChime((current) => {
      const next = !current
      localStorage.setItem(HOURLY_CHIME_KEY, String(next))
      return next
    })
  }

  return (
    <>
      <div className="time">{formatClock(now)}</div>
      <div className="date">{formatDate(now)}</div>
      <div className="lunar-line">
        <span className="lunar-date">{lunar.date}</span>
        {lunar.tags.slice(0, 2).map((tag) => (
          <span className="lunar-tag" key={tag}>
            {tag}
          </span>
        ))}
      </div>
      <div className="pomodoro-row" data-no-drag>
        <Timer size={15} aria-hidden="true" />
        <span className="pomodoro-time">{formatDuration(remaining)}</span>
        <button
          className="icon-button"
          type="button"
          onClick={togglePomodoro}
          title={running ? text.pauseFocus : text.startFocus}
        >
          {running ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
        </button>
        <button className="icon-button" type="button" onClick={resetPomodoro} title={text.resetFocus}>
          <RotateCcw size={13} aria-hidden="true" />
        </button>
        <button
          className={hourlyChime ? 'icon-button active' : 'icon-button'}
          type="button"
          onClick={toggleHourly}
          title={hourlyChime ? text.hourlyOn : text.hourlyOff}
        >
          {hourlyChime ? <Bell size={14} aria-hidden="true" /> : <BellOff size={14} aria-hidden="true" />}
        </button>
      </div>
    </>
  )
}

export default ClockPanel
