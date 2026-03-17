import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, Check, Plus, Repeat, Trash2 } from 'lucide-react'
import { notify } from './notify'

type RepeatKind = 'none' | 'daily' | 'weekly' | 'weekday'

type ScheduleItem = {
  id: string
  title: string
  date: string
  time: string
  done: boolean
  repeat?: RepeatKind
  tag?: string
}

type ViewKey = 'today' | 'week' | 'all'

const SCHEDULE_KEY = 'desktime.schedule'

const text = {
  newSchedule: '新日程',
  add: '添加',
  done: '标记完成',
  undone: '标记未完成',
  delete: '删除',
  today: '今日',
  week: '本周',
  all: '全部',
  allTags: '全部',
  empty: '暂无日程',
  remindTitle: '日程提醒',
  overdue: '已逾期',
}

const TAGS: { key: string; label: string; color: string }[] = [
  { key: 'work', label: '工作', color: '#2563eb' },
  { key: 'life', label: '生活', color: '#16a34a' },
  { key: 'important', label: '重要', color: '#dc2626' },
  { key: 'study', label: '学习', color: '#7c3aed' },
]

const TAG_MAP = new Map(TAGS.map((tag) => [tag.key, tag]))

const REPEATS: { key: RepeatKind; label: string }[] = [
  { key: 'none', label: '不重复' },
  { key: 'daily', label: '每天' },
  { key: 'weekly', label: '每周' },
  { key: 'weekday', label: '工作日' },
]

const REPEAT_LABEL = new Map(REPEATS.map((repeat) => [repeat.key, repeat.label]))

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'today', label: text.today },
  { key: 'week', label: text.week },
  { key: 'all', label: text.all },
]

function localYmd(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function todayYmd() {
  return localYmd(new Date())
}

function weekRange() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const mondayOffset = (today.getDay() + 6) % 7
  const monday = new Date(today)
  monday.setDate(today.getDate() - mondayOffset)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { start: localYmd(monday), end: localYmd(sunday) }
}

function dueTime(item: ScheduleItem) {
  return new Date(`${item.date}T${item.time || '00:00'}:00`).getTime()
}

function occurrenceKey(item: ScheduleItem) {
  return `${item.id}|${item.date}|${item.time}`
}

function nextOccurrence(dateStr: string, repeat: RepeatKind) {
  const date = new Date(`${dateStr}T00:00:00`)
  if (repeat === 'daily') {
    date.setDate(date.getDate() + 1)
  } else if (repeat === 'weekly') {
    date.setDate(date.getDate() + 7)
  } else if (repeat === 'weekday') {
    do {
      date.setDate(date.getDate() + 1)
    } while (date.getDay() === 0 || date.getDay() === 6)
  }
  return localYmd(date)
}

function readSchedule(): ScheduleItem[] {
  try {
    const value = localStorage.getItem(SCHEDULE_KEY)
    if (!value) return defaultItems
    return JSON.parse(value) as ScheduleItem[]
  } catch {
    return defaultItems
  }
}

const defaultItems: ScheduleItem[] = [
  {
    id: 'daily-review',
    title: '整理今天的重点',
    date: todayYmd(),
    time: '18:00',
    done: false,
    repeat: 'weekday',
    tag: 'work',
  },
]

export function SchedulePanel() {
  const [items, setItems] = useState<ScheduleItem[]>(readSchedule)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDate, setDraftDate] = useState(todayYmd)
  const [draftTime, setDraftTime] = useState('09:00')
  const [draftRepeat, setDraftRepeat] = useState<RepeatKind>('none')
  const [draftTag, setDraftTag] = useState('')
  const [view, setView] = useState<ViewKey>('today')
  const [tagFilter, setTagFilter] = useState('all')
  const notifiedRef = useRef<Set<string>>(new Set())
  const seededRef = useRef(false)

  useEffect(() => {
    localStorage.setItem(SCHEDULE_KEY, JSON.stringify(items))
  }, [items])

  // Fire desktop notifications when an item's due time passes. Already-overdue
  // items are seeded on mount so launching the app does not replay old reminders.
  useEffect(() => {
    const notified = notifiedRef.current
    function check() {
      const now = Date.now()
      items.forEach((item) => {
        if (item.done) return
        if (dueTime(item) > now) return
        const key = occurrenceKey(item)
        if (notified.has(key)) return
        notified.add(key)
        if (seededRef.current) void notify(text.remindTitle, `${item.title}（${item.time}）`)
      })
      seededRef.current = true
    }
    check()
    const timer = window.setInterval(check, 15000)
    return () => window.clearInterval(timer)
  }, [items])

  const orderedItems = useMemo(() => {
    const { start, end } = weekRange()
    const today = todayYmd()
    return [...items]
      .filter((item) => {
        if (tagFilter !== 'all' && item.tag !== tagFilter) return false
        if (view === 'today') return item.date <= today
        if (view === 'week') return item.date >= start && item.date <= end
        return true
      })
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
  }, [items, view, tagFilter])

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
        repeat: draftRepeat,
        tag: draftTag || undefined,
      },
    ])
    setDraftTitle('')
  }

  function toggleItem(id: string) {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item
        if (item.repeat && item.repeat !== 'none' && !item.done) {
          // Repeating items roll forward to their next occurrence instead of completing.
          return { ...item, date: nextOccurrence(item.date, item.repeat) }
        }
        return { ...item, done: !item.done }
      }),
    )
  }

  function deleteItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id))
  }

  const now = Date.now()

  return (
    <>
      <div className="schedule-controls" data-no-drag>
        <div className="view-tabs">
          {VIEWS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className={view === entry.key ? 'view-tab active' : 'view-tab'}
              onClick={() => setView(entry.key)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div className="tag-filter">
          <button
            type="button"
            className={tagFilter === 'all' ? 'tag-dot all active' : 'tag-dot all'}
            title={text.allTags}
            onClick={() => setTagFilter('all')}
          />
          {TAGS.map((tag) => (
            <button
              key={tag.key}
              type="button"
              className={tagFilter === tag.key ? 'tag-dot active' : 'tag-dot'}
              style={{ background: tag.color }}
              title={tag.label}
              onClick={() => setTagFilter((current) => (current === tag.key ? 'all' : tag.key))}
            />
          ))}
        </div>
      </div>

      <div className="schedule-form" data-no-drag>
        <div className="form-row">
          <input
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') addItem()
            }}
            placeholder={text.newSchedule}
          />
          <button type="button" className="add-button" onClick={addItem} title={text.add}>
            <Plus size={17} aria-hidden="true" />
          </button>
        </div>
        <div className="form-row">
          <input type="time" value={draftTime} onChange={(event) => setDraftTime(event.target.value)} />
          <input type="date" value={draftDate} onChange={(event) => setDraftDate(event.target.value)} />
          <select
            value={draftRepeat}
            onChange={(event) => setDraftRepeat(event.target.value as RepeatKind)}
            title="重复"
          >
            {REPEATS.map((repeat) => (
              <option key={repeat.key} value={repeat.key}>
                {repeat.label}
              </option>
            ))}
          </select>
          <select value={draftTag} onChange={(event) => setDraftTag(event.target.value)} title="标签">
            <option value="">无标签</option>
            {TAGS.map((tag) => (
              <option key={tag.key} value={tag.key}>
                {tag.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="schedule-list" data-no-drag>
        {orderedItems.length === 0 && <p className="schedule-empty">{text.empty}</p>}
        {orderedItems.map((item) => {
          const tag = item.tag ? TAG_MAP.get(item.tag) : undefined
          const overdue = !item.done && dueTime(item) < now
          const classes = ['schedule-item']
          if (item.done) classes.push('done')
          if (overdue) classes.push('overdue')
          return (
            <article className={classes.join(' ')} key={item.id}>
              <button
                className="check-button"
                type="button"
                onClick={() => toggleItem(item.id)}
                title={item.done ? text.undone : text.done}
              >
                {item.done ? <Check size={14} aria-hidden="true" /> : <Bell size={13} aria-hidden="true" />}
              </button>
              {tag && (
                <span className="item-tag" style={{ background: tag.color }} title={tag.label} />
              )}
              <div>
                <h2>{item.title}</h2>
                <p>
                  {item.date} {item.time}
                  {item.repeat && item.repeat !== 'none' && (
                    <span className="item-repeat">
                      <Repeat size={11} aria-hidden="true" /> {REPEAT_LABEL.get(item.repeat)}
                    </span>
                  )}
                  {overdue && <span className="item-overdue">{text.overdue}</span>}
                </p>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => deleteItem(item.id)}
                title={text.delete}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </article>
          )
        })}
      </div>

      <div className="schedule-footer" data-no-drag>
        <span>
          {remaining > 0 ? `${remaining} 项未完成` : '全部完成 🎉'}
        </span>
      </div>
    </>
  )
}

export default SchedulePanel
