import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Bell, BellOff, Check, Plus, Repeat, Trash2 } from 'lucide-react'
import {
  type ReminderJob,
  SNOOZE_CHOICES,
  markHandled,
  onReminderAction,
  onReminderFired,
  onReminderInapp,
  readMuted,
  readReminderDefaults,
  resolveOccurrence,
  saveMuted,
  snoozeReminder,
  stopReminder,
  syncReminders,
} from './reminder'
import {
  type RepeatKind,
  type ScheduleItem,
  REPEATS,
  REPEAT_LABEL,
  TAGS,
  TAG_MAP,
  dueTime,
  nextOccurrence,
  readSchedule,
  saveSchedule,
} from './schedule'
import { ScheduleEditor } from './ScheduleEditor'
import { appTimeZone, subscribeTimeZone, today, weekRange } from './time'

type ViewKey = 'today' | 'week' | 'all'

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
  overdue: '已逾期',
  edit: '编辑日程',
  muteOn: '提醒已开启，点击静音',
  muteOff: '提醒已静音，点击开启',
  stop: '停止提醒',
  snooze: '稍后',
  minutes: (value: number) => `${value} 分`,
  complete: '完成',
  moreBanners: (value: number) => `还有 ${value} 条提醒`,
}

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'today', label: text.today },
  { key: 'week', label: text.week },
  { key: 'all', label: text.all },
]

/** Banners beyond this stay collapsed so the list keeps its room. */
const MAX_BANNERS = 2

// Completing a repeating item rolls it to the next occurrence instead of
// finishing it for good; one-off items just flip.
function advanceItem(item: ScheduleItem): ScheduleItem {
  if (item.repeat && item.repeat !== 'none' && !item.done) {
    return { ...item, date: nextOccurrence(item.date, item.repeat) }
  }
  return { ...item, done: !item.done }
}

export function SchedulePanel() {
  const [items, setItems] = useState<ScheduleItem[]>(readSchedule)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDate, setDraftDate] = useState(today)
  const [draftTime, setDraftTime] = useState('09:00')
  const [draftRepeat, setDraftRepeat] = useState<RepeatKind>('none')
  const [draftTag, setDraftTag] = useState('')
  const [view, setView] = useState<ViewKey>('today')
  const [tagFilter, setTagFilter] = useState('all')
  const [muted, setMuted] = useState(readMuted)
  const [banners, setBanners] = useState<ReminderJob[]>([])
  const [snoozeFor, setSnoozeFor] = useState<string | null>(null)
  const [editing, setEditing] = useState<ScheduleItem | null>(null)
  const zone = useSyncExternalStore(subscribeTimeZone, appTimeZone)

  useEffect(() => {
    saveSchedule(items)
  }, [items])

  // The backend owns the clock, so every change to the plan is pushed over.
  // A zone change matters too: it moves every trigger point.
  useEffect(() => {
    void syncReminders(items)
  }, [items, muted, zone])

  useEffect(
    () =>
      onReminderInapp((job) => {
        setBanners((current) => [...current.filter((entry) => entry.id !== job.id), job])
      }),
    [],
  )

  // Recording every ring is what stops a relaunch from replaying reminders the
  // user already saw.
  useEffect(() => onReminderFired(({ id }) => markHandled(id)), [])

  useEffect(
    () =>
      onReminderAction((action) => {
        if (action.type !== 'done') return
        setItems((current) =>
          current.map((item) => (item.id === action.itemId ? advanceItem(item) : item)),
        )
      }),
    [],
  )

  const orderedItems = useMemo(() => {
    const { start, end } = weekRange()
    const todayDate = today()
    return [...items]
      .filter((item) => {
        if (tagFilter !== 'all' && item.tag !== tagFilter) return false
        if (view === 'today') return item.date <= todayDate
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
        reminder: readReminderDefaults(),
      },
    ])
    setDraftTitle('')
  }

  function toggleItem(id: string) {
    setItems((current) => current.map((item) => (item.id === id ? advanceItem(item) : item)))
  }

  function deleteItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id))
    setEditing(null)
  }

  function saveItem(next: ScheduleItem) {
    setItems((current) => current.map((item) => (item.id === next.id ? next : item)))
    setEditing(null)
  }

  function toggleMute() {
    setMuted((current) => {
      const next = !current
      saveMuted(next)
      return next
    })
  }

  function dismissBanner(id: string) {
    setBanners((current) => current.filter((entry) => entry.id !== id))
    setSnoozeFor((current) => (current === id ? null : current))
  }

  function stopBanner(id: string) {
    resolveOccurrence(id)
    void stopReminder(id)
    dismissBanner(id)
  }

  function snoozeBanner(id: string, minutes: number) {
    void snoozeReminder(id, minutes)
    dismissBanner(id)
  }

  function completeBanner(job: ReminderJob) {
    resolveOccurrence(job.id)
    void stopReminder(job.id)
    toggleItem(job.itemId)
    dismissBanner(job.id)
  }

  const now = Date.now()
  const visibleBanners = banners.slice(-MAX_BANNERS)
  const collapsedBanners = banners.length - visibleBanners.length

  return (
    <>
      {visibleBanners.length > 0 && (
        <div className="banner-stack" data-no-drag>
          {visibleBanners.map((job) => (
            <div className="reminder-banner" key={job.id}>
              <div className="banner-head">
                <Bell size={13} aria-hidden="true" />
                <strong>{job.title}</strong>
              </div>
              <p className="banner-meta">
                <span>{job.timeLabel}</span>
                {job.overdueMinutes > 0 && (
                  <span className="item-overdue">
                    {text.overdue} {job.overdueMinutes} 分钟
                  </span>
                )}
              </p>
              <div className="banner-actions">
                <button
                  type="button"
                  className="reminder-button primary"
                  onClick={() => stopBanner(job.id)}
                >
                  {text.stop}
                </button>
                <div className="reminder-snooze">
                  <button
                    type="button"
                    className="reminder-button"
                    onClick={() =>
                      setSnoozeFor((current) => (current === job.id ? null : job.id))
                    }
                  >
                    {text.snooze}
                  </button>
                  {snoozeFor === job.id && (
                    <div className="reminder-snooze-menu">
                      {SNOOZE_CHOICES.map((minutes) => (
                        <button
                          key={minutes}
                          type="button"
                          onClick={() => snoozeBanner(job.id, minutes)}
                        >
                          {text.minutes(minutes)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="reminder-button"
                  onClick={() => completeBanner(job)}
                >
                  {text.complete}
                </button>
              </div>
            </div>
          ))}
          {collapsedBanners > 0 && (
            <div className="banner-more">{text.moreBanners(collapsedBanners)}</div>
          )}
        </div>
      )}

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
        <button
          type="button"
          className={muted ? 'icon-button' : 'icon-button active'}
          onClick={toggleMute}
          title={muted ? text.muteOff : text.muteOn}
        >
          {muted ? <BellOff size={14} aria-hidden="true" /> : <Bell size={14} aria-hidden="true" />}
        </button>
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
              {/* A <button> may not wrap headings, so this is a div with the
                  button role — which nonDragSelector already excludes from drags. */}
              <div
                className="item-body"
                role="button"
                tabIndex={0}
                title={text.edit}
                onClick={() => setEditing(item)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') setEditing(item)
                }}
              >
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

      {editing && (
        <ScheduleEditor
          item={editing}
          onSave={saveItem}
          onDelete={deleteItem}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

export default SchedulePanel
