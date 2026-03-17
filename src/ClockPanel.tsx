import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, BellOff, Pause, Play, RotateCcw, Timer } from 'lucide-react'
import { HolidayUtil, Solar } from 'lunar-javascript'
import { notify } from './notify'

const text = {
  lunarPrefix: '农历',
  pomodoroDone: '🍅 番茄钟完成',
  pomodoroDoneBody: '专注时间到，休息一下吧',
  hourlyChime: '整点报时',
  hourlyBody: (hour: number) => `现在是北京时间 ${hour} 点整`,
  hourlyOn: '整点报时：开',
  hourlyOff: '整点报时：关',
  startFocus: '开始专注',
  pauseFocus: '暂停',
  resetFocus: '重置番茄钟',
}

const HOURLY_CHIME_KEY = 'desktime.hourlyChime'
const POMODORO_MS = 25 * 60 * 1000

const beijingClock = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

const beijingDate = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
})

const beijingParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Shanghai',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const beijingYmd = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function beijingHourMinute(date: Date) {
  const parts = beijingParts.formatToParts(date)
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0')
  const hour = read('hour')
  return { hour: hour === 24 ? 0 : hour, minute: read('minute') }
}

function pad(value: number) {
  return String(value).padStart(2, '0')
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
  const lastChimeHourRef = useRef(beijingHourMinute(new Date()).hour)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => {
      const left = Math.max(0, endRef.current - Date.now())
      setRemaining(left)
      if (left === 0) {
        setRunning(false)
        void notify(text.pomodoroDone, text.pomodoroDoneBody)
      }
    }, 250)
    return () => window.clearInterval(timer)
  }, [running])

  useEffect(() => {
    if (!hourlyChime) return
    const { hour, minute } = beijingHourMinute(now)
    if (minute === 0 && lastChimeHourRef.current !== hour) {
      lastChimeHourRef.current = hour
      void notify(text.hourlyChime, text.hourlyBody(hour))
    }
  }, [now, hourlyChime])

  const ymd = beijingYmd.format(now)
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
      if (next) lastChimeHourRef.current = beijingHourMinute(new Date()).hour
      return next
    })
  }

  return (
    <>
      <div className="time">{beijingClock.format(now)}</div>
      <div className="date">{beijingDate.format(now)}</div>
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
