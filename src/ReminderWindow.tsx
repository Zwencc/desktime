// The reminder popup. Presentation only: the backend decides *when* to ring and
// shows this window itself, so a throttled WebView cannot swallow a reminder.
// Completing an item has to travel back to the schedule widget that owns the
// list, which is what the reminder action channel is for.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { AlarmClock, Check, ChevronDown, X } from 'lucide-react'
import {
  currentMonitor,
  getCurrentWindow,
  PhysicalPosition,
  PhysicalSize,
  primaryMonitor,
} from '@tauri-apps/api/window'
import {
  type ReminderJob,
  SNOOZE_CHOICES,
  onReminderFire,
  resolveOccurrence,
  sendReminderAction,
  snoozeReminder,
  stopReminder,
} from './reminder'
import { tagMapOf, tagStore, tagsOf } from './schedule'
import './App.css'
import { useLocale } from './locales'


/** Stacked cards beyond this are collapsed into a "还有 N 条" line. */
const MAX_VISIBLE = 3

/** Gap from the work-area corner, in CSS pixels. */
const EDGE_GAP = 20

let actionNonce = Date.now()

export function ReminderWindow() {
  const text = useLocale().reminderWindow
  const [jobs, setJobs] = useState<ReminderJob[]>([])
  const [snoozeFor, setSnoozeFor] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const storedTags = useSyncExternalStore(tagStore.subscribe, tagStore.snapshot)
  const tagMap = useMemo(() => tagMapOf(tagsOf(storedTags)), [storedTags])
  // Read by "stop all", which must not do its bookkeeping inside a state updater.
  const jobsRef = useRef(jobs)

  jobsRef.current = jobs

  const dismiss = useCallback((id: string) => {
    setJobs((current) => current.filter((job) => job.id !== id))
    setSnoozeFor((current) => (current === id ? null : current))
  }, [])

  const stop = useCallback(
    (id: string) => {
      resolveOccurrence(id)
      void stopReminder(id)
      dismiss(id)
    },
    [dismiss],
  )

  const stopAll = useCallback(() => {
    jobsRef.current.forEach((job) => resolveOccurrence(job.id))
    void stopReminder()
    setJobs([])
    setSnoozeFor(null)
  }, [])

  const snooze = useCallback(
    (id: string, minutes: number) => {
      void snoozeReminder(id, minutes)
      dismiss(id)
    },
    [dismiss],
  )

  const complete = useCallback(
    (job: ReminderJob) => {
      resolveOccurrence(job.id)
      void stopReminder(job.id)
      actionNonce += 1
      sendReminderAction({
        type: 'done',
        itemId: job.itemId,
        occurrenceId: job.id,
        nonce: actionNonce,
      })
      dismiss(job.id)
    },
    [dismiss],
  )

  // A repeat of a reminder already on screen replaces it, so the stack shows one
  // card per occurrence with an updated round counter.
  useEffect(
    () =>
      onReminderFire((job) => {
        setJobs((current) => [...current.filter((entry) => entry.id !== job.id), job])
      }),
    [],
  )

  useEffect(() => {
    const timers = jobs
      .filter((job) => job.autoDismissSec > 0)
      .map((job) => window.setTimeout(() => stop(job.id), job.autoDismissSec * 1000))

    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [jobs, stop])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') stopAll()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [stopAll])

  // Size to the rendered stack, then pin to the work area's bottom-right corner
  // (work area, not screen, so the card never lands under the taskbar).
  useEffect(() => {
    const appWindow = getCurrentWindow()

    if (jobs.length === 0) {
      void appWindow.hide()
      return
    }

    async function place() {
      const host = rootRef.current
      if (!host) return

      const scale = window.devicePixelRatio || 1
      const width = Math.max(1, Math.ceil(host.offsetWidth * scale))
      const height = Math.max(1, Math.ceil(host.offsetHeight * scale))
      await appWindow.setSize(new PhysicalSize(width, height))

      const monitor = (await currentMonitor()) ?? (await primaryMonitor())
      if (!monitor) return

      const gap = Math.round(EDGE_GAP * scale)
      const area = monitor.workArea
      await appWindow.setPosition(
        new PhysicalPosition(
          area.position.x + area.size.width - width - gap,
          area.position.y + area.size.height - height - gap,
        ),
      )
      await appWindow.show()
    }

    void place()
  }, [jobs])

  const visible = jobs.slice(-MAX_VISIBLE)
  const collapsed = jobs.length - visible.length
  const visual = jobs.length > 0 ? jobs[jobs.length - 1].visual : 'static'

  return (
    <div ref={rootRef} className={`reminder-root visual-${visual}`}>
      {jobs.length > 0 && (
        <div className="reminder-card">
          <div className="reminder-header">
            <AlarmClock size={15} aria-hidden="true" />
            <span>{text.title}</span>
            {jobs.length > 1 && <span className="reminder-count">{jobs.length}</span>}
            <button
              className="icon-button reminder-close"
              type="button"
              onClick={stopAll}
              title={text.stopAll}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>

          <div className="reminder-list">
            {visible.map((job) => {
              const tag = job.tag ? tagMap.get(job.tag) : undefined

              return (
                <article className="reminder-item" key={job.id}>
                  <div className="reminder-item-head">
                    {tag && (
                      <span className="tag-chip" style={{ background: tag.color }}>
                        {tag.label}
                      </span>
                    )}
                    <h2>{job.title}</h2>
                  </div>
                  <p className="reminder-meta">
                    <span>{job.timeLabel}</span>
                    {job.overdueMinutes > 0 && (
                      <span className="item-overdue">{text.overdue(job.overdueMinutes)}</span>
                    )}
                    {job.round > 0 && (
                      <span className="reminder-round">{text.round(job.round + 1)}</span>
                    )}
                  </p>
                  <div className="reminder-actions">
                    <button
                      type="button"
                      className="reminder-button primary"
                      onClick={() => stop(job.id)}
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
                        <ChevronDown size={12} aria-hidden="true" />
                      </button>
                      {snoozeFor === job.id && (
                        <div className="reminder-snooze-menu">
                          {SNOOZE_CHOICES.map((minutes) => (
                            <button
                              key={minutes}
                              type="button"
                              onClick={() => snooze(job.id, minutes)}
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
                      onClick={() => complete(job)}
                    >
                      <Check size={13} aria-hidden="true" />
                      {text.done}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>

          {collapsed > 0 && <div className="reminder-more">{text.more(collapsed)}</div>}
          {jobs.length > 1 && (
            <button type="button" className="reminder-button stop-all" onClick={stopAll}>
              {text.stopAll}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default ReminderWindow
