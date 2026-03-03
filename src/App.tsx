import { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  CalendarDays,
  Check,
  Clock3,
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
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'long',
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
    <main className="workspace">
      <section className="clock-panel" aria-label="北京时间">
        <div className="panel-title">
          <Clock3 size={18} aria-hidden="true" />
          <span>北京时间</span>
        </div>
        <div className="time">{beijingClock.format(now)}</div>
        <div className="date">{beijingDate.format(now)}</div>
        <p>按 Asia/Shanghai 时区计算，不跟随系统时区显示。</p>
      </section>

      <section className="note-panel" aria-label="临时记事本">
        <div className="panel-title">
          <NotebookPen size={18} aria-hidden="true" />
          <span>临时记事本</span>
        </div>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="随手记下窗口、会议、灵感或待复制的片段..."
        />
        <div className="meta-row">
          <span>{note.length} 字符</span>
          <button className="icon-button" type="button" onClick={() => setNote('')} title="清空记事本">
            <Trash2 size={17} aria-hidden="true" />
          </button>
        </div>
      </section>

      <section className="schedule-panel" aria-label="桌面日程">
        <div className="panel-title">
          <CalendarDays size={18} aria-hidden="true" />
          <span>桌面日程</span>
          <strong>{remaining} 未完成</strong>
        </div>

        <div className="schedule-form">
          <input
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') addItem()
            }}
            placeholder="添加一个日程"
          />
          <input
            type="date"
            value={draftDate}
            onChange={(event) => setDraftDate(event.target.value)}
          />
          <input
            type="time"
            value={draftTime}
            onChange={(event) => setDraftTime(event.target.value)}
          />
          <button type="button" className="add-button" onClick={addItem} title="添加日程">
            <Plus size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="schedule-list">
          {orderedItems.map((item) => (
            <article className={item.done ? 'schedule-item done' : 'schedule-item'} key={item.id}>
              <button
                className="check-button"
                type="button"
                onClick={() => toggleItem(item.id)}
                title={item.done ? '标记为未完成' : '标记为完成'}
              >
                {item.done ? <Check size={16} aria-hidden="true" /> : <Bell size={15} aria-hidden="true" />}
              </button>
              <div>
                <h2>{item.title}</h2>
                <p>
                  {item.date} {item.time}
                </p>
              </div>
              <button className="icon-button" type="button" onClick={() => deleteItem(item.id)} title="删除日程">
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

export default App
