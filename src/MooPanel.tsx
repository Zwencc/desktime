import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { BarChart3, Carrot, Clock3, Fish, PanelTop, Square } from 'lucide-react'
import {
  type WorkMetrics,
  activitySnapshot,
  loadMetrics,
  pushMonitorConfig,
  readActivity,
  subscribeActivity,
} from './activity'
import { EarningsCounter } from './EarningsCounter'
import { cycleBase, liveEarnings } from './earnings'
import { fishingSnapshot, formatElapsed, readFishing, startFishing, stopFishing, subscribeFishing } from './fishing'
import { enterIsland, restoreFloatingGeometry, setIslandHeight } from './island'
import { requestLine } from './llm'
import {
  type Mood,
  type Modifier,
  clockMood,
  evaluateMood,
  modifierLabel,
  modifiers,
  moodLabel,
  pickLine,
} from './moo'
import { revealSelf, showWidget } from './panels'
import { buildReport, recordFed, recordFishing, recordMood, saveReport } from './report'
import { ReportOverlay } from './ReportOverlay'
import { readSchedule, saveSchedule } from './schedule'
import {
  type MooShape,
  readSettings,
  settingsSnapshot,
  subscribeSettings,
  updateSettings,
} from './settings'
import {
  appTimeZone,
  formatClock,
  formatDate,
  formatHm,
  subscribeTimeZone,
  today,
  zonedEpoch,
  zonedHourMinute,
} from './time'
import { readWork, subscribeWork, workSnapshot, workWindow } from './work'
import { useLocale } from './locales'


/** Must match the .moo-island transition in App.css. */
const COLLAPSE_MS = 260

/** How long the island stays open by itself after the mood changes. */
const MOOD_PEEK_MS = 3000

/**
 * How often the metrics are re-read. The backend aggregates by the minute, so
 * anything faster only costs IPC — and the three numbers move slowly by nature.
 * The earnings counter runs on its own frame loop and does not wait for this.
 */
const METRICS_MS = 30_000

/** How long the chewing animation and its compliment stay up. */
const CHEW_MS = 2600

/** Fallback quitting time when no shift is configured for the day. */
const DEFAULT_END = '18:00'

/** Island sizes before the first measurement; all replaced within a frame. */
const ISLAND_FALLBACK = { collapsed: 40, open: 188, chrome: 32 }


function Meter({ label, value }: { label: string; value: number }) {
  const percent = Math.round(value * 100)
  return (
    <div className="moo-meter">
      <span className="moo-meter-label">{label}</span>
      <span className="moo-meter-track">
        <span className="moo-meter-fill" style={{ width: `${percent}%` }} />
      </span>
      <span className="moo-meter-value">{percent}%</span>
    </div>
  )
}

export function MooPanel() {
  const strings = useLocale()
  const text = strings.mooPanel
  const [now, setNow] = useState(() => new Date())
  const [expanded, setExpanded] = useState(false)
  const [metrics, setMetrics] = useState<WorkMetrics | null>(null)
  const [showFeed, setShowFeed] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [chewing, setChewing] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState(false)
  const [islandHeights, setIslandHeights] = useState(ISLAND_FALLBACK)
  const hovering = useRef(false)
  const islandRef = useRef<HTMLDivElement>(null)
  const capsuleRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  // Effects in the same commit still close over the pre-measurement value, so the
  // measurement is mirrored into a ref they can read.
  const heightsRef = useRef(islandHeights)
  // The zone, both moo settings, the work config, the monitor config and the
  // disguise are all stored, so re-render when any of them changes.
  useSyncExternalStore(subscribeTimeZone, appTimeZone)
  useSyncExternalStore(subscribeSettings, settingsSnapshot)
  useSyncExternalStore(subscribeWork, workSnapshot)
  useSyncExternalStore(subscribeFishing, fishingSnapshot)
  const monitorState = useSyncExternalStore(subscribeActivity, activitySnapshot)

  const { mooShape: shape } = readSettings()
  const { monitor } = readActivity()
  const work = readWork()
  const fishing = readFishing()
  const island = shape === 'island'
  const at = now.getTime()
  const ymd = today()

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  // This widget is the one window that is always mounted and always cares about
  // collection, so it is where the stored config reaches the backend — which
  // starts with collection off and cannot read localStorage itself.
  useEffect(() => {
    void pushMonitorConfig()
  }, [monitorState])

  useEffect(() => {
    let live = true
    function refresh() {
      void loadMetrics().then((next) => {
        if (live) setMetrics(next)
      })
    }

    refresh()
    const timer = window.setInterval(refresh, METRICS_MS)
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [monitorState])

  // The webview would navigate away from the app if an unclaimed file landed on
  // it — the window has Tauri's native drop target disabled so that the feed tray
  // can use HTML5 drag and drop at all (see tauri.conf.json).
  useEffect(() => {
    function block(event: DragEvent) {
      if (!event.dataTransfer?.types.includes('Files')) return
      event.preventDefault()
    }

    window.addEventListener('dragover', block)
    window.addEventListener('drop', block)
    return () => {
      window.removeEventListener('dragover', block)
      window.removeEventListener('drop', block)
    }
  }, [])

  // The mood engine needs to know where "now" sits relative to the working day;
  // that is a wall-clock question, so it is resolved here rather than in Rust.
  const shift = workWindow(work.schedule, ymd)
  const evaluated: { mood: Mood; modifier: Modifier } =
    monitor.enabled && metrics
      ? evaluateMood({
          loss: metrics.loss,
          slack: metrics.slack,
          intensity: metrics.intensity,
          pastEndMinutes: shift ? (at - shift.end) / 60000 : null,
          inWorkWindow: shift !== null && at >= shift.start && at < shift.end,
          overtimeMinutes: metrics.overtimeMinutes,
          overtimePaid: work.schedule.overtimePaid,
          category: metrics.category,
          recent: metrics.today.recent,
        })
      : // With collection off there is nothing to read but the clock, so the
        // widget only claims what the hour supports.
        { mood: clockMood(zonedHourMinute(now).hour), modifier: modifiers.none }

  const { mood, modifier } = evaluated
  const line = pickLine(mood, modifier, at)

  // The AI line, when there is one, replaces the local one until the state
  // changes again. Requested only on a change (and rate-limited beyond that in
  // llm.ts), and a failure simply leaves the local line where it is.
  const [aiLine, setAiLine] = useState<string | null>(null)
  const latest = useRef(metrics)
  latest.current = metrics
  useEffect(() => {
    setAiLine(null)
    const current = latest.current
    if (!current) return

    let live = true
    void requestLine({
      mood: moodLabel(mood),
      modifier: modifierLabel(modifier) || strings.moo.noModifier,
      loss: current.loss,
      slack: current.slack,
      intensity: current.intensity,
      presentMinutes: current.presentMinutes,
      overtimeMinutes: current.overtimeMinutes,
      meetingMinutes: current.meetingMinutes,
      hourly: current.baseRate,
      wasted: current.wastedToday,
    }).then((next) => {
      if (live && next) setAiLine(next)
    })
    return () => {
      live = false
    }
  }, [mood, modifier, strings])

  // Sampling the mood on a timer is the only way to get a curve out of it: the
  // state is derived, so it leaves no trace of its own.
  const moodKey = useRef(mood.key)
  moodKey.current = mood.key
  useEffect(() => {
    if (!monitor.enabled) return
    const timer = window.setInterval(
      () => recordMood(today(), moodKey.current, METRICS_MS / 60000),
      METRICS_MS,
    )
    return () => window.clearInterval(timer)
  }, [monitor.enabled])

  // Rebuilt on every refresh once the day is over rather than written once, so
  // the report keeps up with an evening that carries on past quitting time.
  useEffect(() => {
    if (!metrics || !monitor.enabled) return

    const endMs = shift ? shift.end : zonedEpoch(ymd, DEFAULT_END)
    if (Date.now() < endMs) return

    const state = liveEarnings(work, cycleBase(work, ymd), metrics, ymd, Date.now())
    saveReport(buildReport(work, metrics, state, ymd), monitor.retainDays)
    // `work` and `shift` are derived from stores this component already
    // subscribes to, so a metrics refresh is the only trigger that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics])

  // Every island size is measured, not declared.
  //
  // `chrome` is the part that kept going wrong: the window has to hold the card
  // *plus* whatever the shell puts around it, and that used to be a constant
  // equal to the transparent shadow margin. It was not — the bare panel still
  // carried the widget's own padding, so the card was 26px taller than the room
  // it had and `overflow: hidden` cropped the difference. Reading the card's
  // offset from the viewport instead means any box the shell grows, the window
  // grows with.
  useLayoutEffect(() => {
    const shell = islandRef.current
    const capsule = capsuleRef.current
    const body = bodyRef.current
    if (!island || !shell || !capsule || !body) return

    function measure() {
      const collapsed = capsule!.offsetHeight
      const next = {
        collapsed,
        open: collapsed + body!.scrollHeight,
        // Padding is symmetric all the way up the shell, so the top offset is
        // half of what the window needs on top of the card.
        chrome: Math.ceil(shell!.getBoundingClientRect().top) * 2,
      }

      const current = heightsRef.current
      if (
        next.collapsed === current.collapsed &&
        next.open === current.open &&
        next.chrome === current.chrome
      ) {
        return
      }
      heightsRef.current = next
      setIslandHeights(next)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(shell)
    observer.observe(capsule)
    observer.observe(body)
    return () => observer.disconnect()
  }, [island])

  // Taking the shape, and handing it back. Entering the island collapses first so
  // it never appears at the open size; leaving it puts the floating window back
  // where it was, which App does not do because the island is self-managed.
  useEffect(() => {
    if (island) {
      setExpanded(false)
      // Revealed only once the window has actually been moved and resized into
      // the strip. `App` does not do it for a self-managed widget precisely so
      // that this can wait: the measurement above finished a frame ago, but
      // `enterIsland` is a round trip to the backend, and showing the window
      // before it returns is what made the island appear half-open at every
      // launch and then correct itself.
      void enterIsland(heightsRef.current.collapsed + heightsRef.current.chrome).then(() =>
        revealSelf('moo'),
      )
      return
    }

    // Leaving the island: the window is already on screen, and `App` owns
    // visibility again the moment `selfManaged` goes false.
    void restoreFloatingGeometry()
  }, [island])

  // The window only bounds the animation; the capsule growing into the card is
  // CSS. Opening therefore fires the resize without waiting for it — the CSS
  // starts on the same frame the pointer arrives, and the extra window height is
  // transparent until the capsule reaches it. Closing waits for the CSS to
  // finish before shrinking, or the card would be clipped on its way out.
  useEffect(() => {
    if (!island) return
    if (expanded) {
      void setIslandHeight(islandHeights.open + islandHeights.chrome)
      return
    }

    const timer = window.setTimeout(
      () => void setIslandHeight(islandHeights.collapsed + islandHeights.chrome, true),
      COLLAPSE_MS,
    )
    return () => window.clearTimeout(timer)
  }, [island, expanded, islandHeights.open, islandHeights.collapsed, islandHeights.chrome])

  // A mood change is the island's reason to exist: it opens on its own to show
  // the new line, then gets out of the way — unless the pointer arrived meanwhile.
  const lastMood = useRef(mood.key)
  useEffect(() => {
    if (!island || lastMood.current === mood.key) {
      lastMood.current = mood.key
      return
    }

    lastMood.current = mood.key
    setExpanded(true)
    const timer = window.setTimeout(() => {
      if (!hovering.current) setExpanded(false)
    }, MOOD_PEEK_MS)
    return () => window.clearTimeout(timer)
  }, [island, mood.key])

  function setShape(next: MooShape) {
    updateSettings({ mooShape: next })
  }

  function leaveFishing() {
    recordFishing(ymd, stopFishing())
  }

  function feed(id: string) {
    const items = readSchedule()
    const item = items.find((entry) => entry.id === id)
    if (!item || item.done) return

    saveSchedule(items.map((entry) => (entry.id === id ? { ...entry, done: true } : entry)))
    recordFed(ymd)
    setDropTarget(false)
    setChewing(strings.moo.praise[Math.floor(Math.random() * strings.moo.praise.length)])
    window.setTimeout(() => setChewing(null), CHEW_MS)
  }

  function renderFace() {
    return (
      <span
        className={dropTarget ? 'moo-face open-wide' : chewing ? 'moo-face chewing' : 'moo-face'}
        role="img"
        aria-label={moodLabel(mood)}
        onDragOver={(event) => {
          event.preventDefault()
          setDropTarget(true)
        }}
        onDragLeave={() => setDropTarget(false)}
        onDrop={(event) => {
          event.preventDefault()
          feed(event.dataTransfer.getData('text/plain'))
        }}
      >
        {mood.emoji}
      </span>
    )
  }

  function renderButtons() {
    return (
      <>
        {/* Hands over to the clock widget rather than redrawing itself as one:
            the two are mutex peers, so showing that window hides this one. */}
        <button
          className="icon-button"
          type="button"
          onClick={() => showWidget('clock')}
          title={text.toNormal}
        >
          <Clock3 size={14} aria-hidden="true" />
        </button>
        <button
          className="icon-button"
          type="button"
          onClick={() => setShape(island ? 'float' : 'island')}
          title={island ? text.toFloat : text.toIsland}
        >
          {island ? (
            <Square size={14} aria-hidden="true" />
          ) : (
            <PanelTop size={14} aria-hidden="true" />
          )}
        </button>
      </>
    )
  }

  function renderPlayButtons() {
    return (
      <>
        <button className="icon-button" type="button" title={text.startFishing} onClick={startFishing}>
          <Fish size={14} aria-hidden="true" />
        </button>
        <button
          className="icon-button"
          type="button"
          title={text.feed}
          aria-pressed={showFeed}
          onClick={() => setShowFeed((current) => !current)}
        >
          <Carrot size={14} aria-hidden="true" />
        </button>
        <button
          className="icon-button"
          type="button"
          title={text.report}
          onClick={() => setShowReport(true)}
        >
          <BarChart3 size={14} aria-hidden="true" />
        </button>
      </>
    )
  }

  function renderMoodLabel() {
    return (
      <>
        <span className="moo-mood-label">{moodLabel(mood)}</span>
        {modifier.key !== 'none' && (
          <span className="moo-modifier">
            {modifier.emoji} {modifierLabel(modifier)}
          </span>
        )}
      </>
    )
  }

  function renderMeters() {
    if (!monitor.enabled || !metrics) {
      return <span className="moo-locked">{text.monitorLocked}</span>
    }
    return (
      <>
        <Meter label={text.loss} value={metrics.loss} />
        <Meter label={text.slack} value={metrics.slack} />
        <Meter label={text.intensity} value={metrics.intensity} />
      </>
    )
  }

  function renderFeedTray() {
    const pending = readSchedule().filter((item) => !item.done && item.date <= ymd)
    if (!pending.length) return <p className="settings-hint">{text.feedEmpty}</p>

    return (
      <div className="moo-feed" data-own-context>
        <p className="settings-hint">{text.feedHint}</p>
        <div className="moo-feed-list">
          {pending.slice(0, 8).map((item) => (
            <div
              key={item.id}
              className="moo-feed-item"
              draggable
              onDragStart={(event) => event.dataTransfer.setData('text/plain', item.id)}
            >
              <span className="moo-feed-title">{item.title}</span>
              {/* Drag is the good version; this button is the one that always
                  works, including for anyone who cannot drag. */}
              <button
                className="icon-button"
                type="button"
                title={text.feedNow}
                onClick={() => feed(item.id)}
              >
                <Carrot size={12} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // The disguise. Nothing here may hint at a mood clock: a plain time and date,
  // the same button shapes every other widget has, and a running counter that
  // reads as a stopwatch rather than as "you are hiding".
  if (fishing.since > 0) {
    return (
      <div className="moo-body moo-plain" onDoubleClick={leaveFishing}>
        <div className="time">{formatClock(now)}</div>
        <div className="date">{formatDate(now)}</div>
        <div className="moo-actions" data-no-drag>
          <span className="moo-mood-label">{formatElapsed(at - fishing.since)}</span>
          <button
            className="icon-button"
            type="button"
            title={text.stopFishing}
            onClick={leaveFishing}
          >
            <Clock3 size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    )
  }

  if (island) {
    return (
      <div
        ref={islandRef}
        className={expanded ? 'moo-island open' : 'moo-island'}
        style={{ height: expanded ? islandHeights.open : islandHeights.collapsed }}
        onMouseEnter={() => {
          hovering.current = true
          setExpanded(true)
        }}
        onMouseLeave={() => {
          hovering.current = false
          setExpanded(false)
        }}
      >
        <div className="moo-capsule" ref={capsuleRef}>
          <span className="moo-face" role="img" aria-label={moodLabel(mood)}>
            {mood.emoji}
          </span>
          <span className="moo-capsule-time">{formatHm(now)}</span>
        </div>
        <div className="moo-island-body" ref={bodyRef}>
          <p className="moo-line">{aiLine ?? line}</p>
          <EarningsCounter metrics={metrics} compact />
          <div className="moo-actions" data-no-drag>
            {renderMoodLabel()}
            {renderButtons()}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="moo-body">
      {/* Everything that can grow scrolls; the action row below does not. The
          window is draggable to any size and the feed tray appears above the
          buttons, so without this split either one pushes them off the edge. */}
      <div className="moo-scroll">
        <div className="moo-head">
          {renderFace()}
          <div className="moo-clock">
            <div className="time">{formatClock(now)}</div>
            <div className="date">{formatDate(now)}</div>
          </div>
        </div>
        <p className="moo-line">{chewing ?? aiLine ?? line}</p>
        <EarningsCounter metrics={metrics} />
        <div className="moo-meters">{renderMeters()}</div>
        {showFeed && renderFeedTray()}
      </div>
      <div className="moo-actions" data-no-drag>
        {renderMoodLabel()}
        <span className="moo-mode-toggle" />
        {renderPlayButtons()}
        {renderButtons()}
      </div>
      {showReport && <ReportOverlay onClose={() => setShowReport(false)} />}
    </div>
  )
}

export default MooPanel
