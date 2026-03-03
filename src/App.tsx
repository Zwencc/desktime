import { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  CalendarDays,
  Check,
  Clock3,
  GripHorizontal,
  NotebookPen,
  Plus,
  Trash2,
} from 'lucide-react'
import './App.css'

type ScheduleItem = {
  id: string
  title: string
  date: string
  time: string
  done: boolean
}

const NOTE_KEY = 'desktime.note'
const SCHEDULE_KEY = 'desktime.schedule'

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

const defaultItems: ScheduleItem[] = [
  {
    id: 'daily-review',
    title: '整理今天的重点',
    date: new Date().toISOString().slice(0, 10),
    time: '18:00',
    done: false,
  },
]

function readSchedule() {
  try {
    const value = localStorage.getItem(SCHEDULE_KEY)
    return value ? (JSON.parse(value) as ScheduleItem[]) : defaultItems
  } catch {
    return defaultItems
  }
}

function App() {
  const [now, setNow] = useState(() => new Date())
  const [note, setNote] = useState(() => localStorage.getItem(NOTE_KEY) ?? '')
  const [items, setItems] = useState<ScheduleItem[]>(readSchedule)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDate, setDraftDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [draftTime, setDraftTime] = useState('09:00')

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    localStorage.setItem(NOTE_KEY, note)
  }, [note])

  useEffect(() => {
    localStorage.setItem(SCHEDULE_KEY, JSON.stringify(items))
  }, [items])

  const orderedItems = useMemo(
    () =>
      [...items].sort((a, b) =>
        `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`),
      ),
    [items],
  )

  const remaining = items.filter((item) => !item.done).length

  function addItem() {
    const title = draftTitle.trim()
    if (!title) return

    setItems((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        title,
        date: draftDate,
        time: draftTime,
        done: false,
      },
    ])
    setDraftTitle('')
  }

  function toggleItem(id: string) {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, done: !item.done } : item,
      ),
    )
  }

  function deleteItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id))
  }

  return (
    <main className="widget-shell">
      <header className="drag-bar" data-tauri-drag-region>
        <GripHorizontal size={18} aria-hidden="true" />
        <span>DeskTime</span>
      </header>

      <section className="clock-card" aria-label="北京时间">
        <div className="section-title">
          <Clock3 size={16} aria-hidden="true" />
          <span>北京时间</span>
        </div>
        <div className="time">{beijingClock.format(now)}</div>
        <div className="date">{beijingDate.format(now)}</div>
      </section>

      <section className="note-card" aria-label="临时记事本">
        <div className="section-title">
          <NotebookPen size={16} aria-hidden="true" />
          <span>临时记事</span>
          <button className="icon-button" type="button" onClick={() => setNote('')} title="清空">
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="随手记点什么..."
        />
      </section>

      <section className="schedule-card" aria-label="桌面日程">
        <div className="section-title">
          <CalendarDays size={16} aria-hidden="true" />
          <span>日程</span>
          <strong>{remaining}</strong>
        </div>

        <div className="schedule-form">
          <input
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') addItem()
            }}
            placeholder="新日程"
          />
          <input
            type="time"
            value={draftTime}
            onChange={(event) => setDraftTime(event.target.value)}
          />
          <input
            className="date-input"
            type="date"
            value={draftDate}
            onChange={(event) => setDraftDate(event.target.value)}
          />
          <button type="button" className="add-button" onClick={addItem} title="添加">
            <Plus size={17} aria-hidden="true" />
          </button>
        </div>

        <div className="schedule-list">
          {orderedItems.map((item) => (
            <article className={item.done ? 'schedule-item done' : 'schedule-item'} key={item.id}>
              <button
                className="check-button"
                type="button"
                onClick={() => toggleItem(item.id)}
                title={item.done ? '标记未完成' : '标记完成'}
              >
                {item.done ? <Check size={14} aria-hidden="true" /> : <Bell size={13} aria-hidden="true" />}
              </button>
              <div>
                <h2>{item.title}</h2>
                <p>
                  {item.date} {item.time}
                </p>
              </div>
              <button className="icon-button" type="button" onClick={() => deleteItem(item.id)} title="删除">
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

export default App
