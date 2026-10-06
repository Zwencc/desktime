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
  type ScheduleItem,
  dueTime,
  nextOccurrence,
  readSchedule,
  repeatLabel,
  saveSchedule,
  tagMapOf,
  tagStore,
  tagsOf,
} from './schedule'
import { type DayMark, MonthCalendar } from './MonthCalendar'
import { ScheduleEditor } from './ScheduleEditor'
import { appTimeZone, subscribeTimeZone, today, weekRange } from './time'
import { locale, useLocale } from './locales'

type ViewKey = 'today' | 'week' | 'all' | 'month'

/** The chosen view outlives a restart; it is how the widget is being used. */
const VIEW_KEY = 'desktime.schedule.view'


/** A function, not a constant: the labels are translated, and a module-level
 *  array would freeze whichever language was current when this file was first
 *  imported. */
function views(): { key: ViewKey; label: string }[] {
  const text = locale().schedule
  return [
    { key: 'month', label: text.month },
    { key: 'today', label: text.today },
    { key: 'week', label: text.week },
    { key: 'all', label: text.all },
  ]
}

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
  const strings = useLocale()
  const text = strings.schedule
  const [items, setItems] = useState<ScheduleItem[]>(readSchedule)
  const [view, setView] = useState<ViewKey>(
    () => (localStorage.getItem(VIEW_KEY) as ViewKey | null) ?? 'month',
  )
  const [month, setMonth] = useState(() => today().slice(0, 7))
  const [selectedDay, setSelectedDay] = useState(today)
  const [tagFilter, setTagFilter] = useState('all')
  const [muted, setMuted] = useState(readMuted)
  const [banners, setBanners] = useState<ReminderJob[]>([])
  const [snoozeFor, setSnoozeFor] = useState<string | null>(null)
  const [editing, setEditing] = useState<ScheduleItem | null>(null)
  const zone = useSyncExternalStore(subscribeTimeZone, appTimeZone)
  const storedTags = useSyncExternalStore(tagStore.subscribe, tagStore.snapshot)

  const tags = useMemo(() => tagsOf(storedTags), [storedTags])
  const tagMap = useMemo(() => tagMapOf(tags), [tags])

  useEffect(() => {
    saveSchedule(items)
  }, [items])

  // A tag deleted in settings must not leave a dangling key on the items that
  // used it. Doing it here rather than in the settings window is what keeps the
  // two from fighting: this widget owns `items` and writes them on every change,
  // so an edit made anywhere else would be overwritten on the next keystroke.
  useEffect(() => {
    function dangling(item: ScheduleItem) {
      return item.tag !== undefined && !tagMap.has(item.tag)
    }

    setItems((current) =>
      current.some(dangling)
        ? current.map((item) => (dangling(item) ? { ...item, tag: undefined } : item))
        : current,
    )
    setTagFilter((current) => (current !== 'all' && !tagMap.has(current) ? 'all' : current))
  }, [tagMap])

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
        if (view === 'month') return item.date === selectedDay
        return true
      })
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
  }, [items, view, tagFilter, selectedDay])

  // One mark per day rather than one per item: the colour of the earliest undone
  // item, and how many there are in total. A month then tells you where the work
  // is without opening any of it, and without running out at three dots.
  const marks = useMemo(() => {
    const byDay: Record<string, DayMark> = {}
    items
      .filter((item) => !item.done)
      .sort((a, b) => a.time.localeCompare(b.time))
      .forEach((item) => {
        const mark = byDay[item.date]
        if (mark) {
          mark.count += 1
          return
        }

        byDay[item.date] = {
          color: (item.tag && tagMap.get(item.tag)?.color) || 'var(--accent)',
          count: 1,
        }
      })
    return byDay
  }, [items, tagMap])

  const remaining = items.filter((item) => !item.done).length

  // "New" is the editor opened on an item that is not in the list yet, which is
  // also how `saveItem` below tells the two apart — no second piece of state.
  function openNewItem() {
    setEditing({
      id: crypto.randomUUID(),
      title: '',
      date: view === 'month' ? selectedDay : today(),
      time: '09:00',
      done: false,
      repeat: 'none',
      reminder: readReminderDefaults(),
    })
  }

  function toggleItem(id: string) {
    setItems((current) => current.map((item) => (item.id === id ? advanceItem(item) : item)))
  }

  function deleteItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id))
    setEditing(null)
  }

  function saveItem(next: ScheduleItem) {
    setItems((current) =>
      current.some((item) => item.id === next.id)
        ? current.map((item) => (item.id === next.id ? next : item))
        : [...current, next],
    )
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
                          {text.minutesShort(minutes)}
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
          {views().map((entry) => (
            <button
              key={entry.key}
              type="button"
              className={view === entry.key ? 'view-tab active' : 'view-tab'}
              onClick={() => {
                setView(entry.key)
                localStorage.setItem(VIEW_KEY, entry.key)
              }}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div className="toolbar-spacer" />
        <button
          type="button"
          className={muted ? 'icon-button' : 'icon-button active'}
          onClick={toggleMute}
          title={muted ? text.muteOff : text.muteOn}
        >
          {muted ? <BellOff size={14} aria-hidden="true" /> : <Bell size={14} aria-hidden="true" />}
        </button>
        <button type="button" className="add-button" onClick={openNewItem} title={text.newSchedule}>
          <Plus size={16} aria-hidden="true" />
        </button>
        {/* Last in the row so it wraps onto a line of its own: four named pills
            already outrun the width the four dots they replaced fitted into,
            and the tag list is now something the user can add to. */}
        <div className="tag-filter">
          <button
            type="button"
            className={tagFilter === 'all' ? 'tag-pill all active' : 'tag-pill all'}
            onClick={() => setTagFilter('all')}
          >
            {text.allTags}
          </button>
          {tags.map((tag) => (
            <button
              key={tag.key}
              type="button"
              className={tagFilter === tag.key ? 'tag-pill active' : 'tag-pill'}
              // The colour is the tag's own, so it stays an inline style; what
              // it means (fill when on, outline when off) is in the stylesheet.
              style={
                tagFilter === tag.key
                  ? { background: tag.color, borderColor: tag.color }
                  : { color: tag.color, borderColor: tag.color }
              }
              onClick={() => setTagFilter((current) => (current === tag.key ? 'all' : tag.key))}
            >
              {tag.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'month' && (
        <MonthCalendar
          month={month}
          selected={selectedDay}
          marks={marks}
          onSelect={setSelectedDay}
          onMonth={setMonth}
        />
      )}

      <div className="schedule-list" data-no-drag>
        {orderedItems.length === 0 && <p className="schedule-empty">{text.empty}</p>}
        {orderedItems.map((item) => {
          const tag = item.tag ? tagMap.get(item.tag) : undefined
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
                <span className="tag-chip" style={{ background: tag.color }}>
                  {tag.label}
                </span>
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
                      <Repeat size={11} aria-hidden="true" /> {repeatLabel(item.repeat)}
                    </span>
                  )}
                  {overdue && <span className="item-overdue">{text.overdue}</span>}
                </p>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => deleteItem(item.id)}
                title={strings.common.delete}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </article>
          )
        })}
      </div>

      <div className="schedule-footer" data-no-drag>
        <span>
          {remaining > 0 ? locale().scheduleData.remaining(remaining) : locale().scheduleData.allDone}
        </span>
      </div>

      {editing && (
        <ScheduleEditor
          item={editing}
          isNew={!items.some((item) => item.id === editing.id)}
          onSave={saveItem}
          onDelete={deleteItem}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

export default SchedulePanel
