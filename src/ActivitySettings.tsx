// Activity monitoring, in the settings window.
//
// The order of this panel is the privacy rule made visible: what is collected is
// stated before the switch that starts collecting, every signal has its own
// switch rather than hiding behind the master one, and deleting everything is a
// single button rather than a consequence of changing retention.

import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  type AppCategory,
  type WorkMetrics,
  activitySnapshot,
  categoryNames,
  categoryOf,
  clearActivityData,
  loadMetrics,
  pushMonitorConfig,
  readActivity,
  resolveAppNames,
  subscribeActivity,
  updateActivity,
} from './activity'
import { classifyApps, readLlm } from './llm'
import { useLocale } from './locales'


const CATEGORIES: AppCategory[] = ['chat', 'dev', 'office', 'browser', 'media', 'design', 'other']

export function ActivitySettings() {
  const strings = useLocale()
  const text = strings.activitySettings
  const stored = useSyncExternalStore(subscribeActivity, activitySnapshot)
  const { monitor, categories } = readActivity()
  const [metrics, setMetrics] = useState<WorkMetrics | null>(null)
  const [cleared, setCleared] = useState(false)
  // Executable name → the name the application calls itself. Filled in as the
  // list renders, so a row can show "Visual Studio Code" instead of "code.exe".
  const [appNames, setAppNames] = useState<Record<string, string>>({})
  const [classifying, setClassifying] = useState(false)
  const [classifyError, setClassifyError] = useState(false)

  // Applied immediately rather than on close: a user who just switched the
  // microphone probe off expects it to stop now, not after a restart.
  useEffect(() => {
    void pushMonitorConfig()
  }, [stored])

  useEffect(() => {
    let live = true
    void loadMetrics().then((next) => {
      if (live) setMetrics(next)
    })
    return () => {
      live = false
    }
  }, [stored, cleared])

  function patch(next: Partial<typeof monitor>) {
    updateActivity({ monitor: { ...monitor, ...next } })
  }

  function classify(app: string, category: AppCategory) {
    updateActivity({ categories: { ...categories, [app.toLowerCase()]: category } })
  }

  const todayApps = metrics?.today.apps ?? []

  // The product name is consulted here too, so an application the rules already
  // recognise by product name never shows up asking to be classified by hand.
  const unknown = todayApps.filter(
    (entry) => categoryOf(entry.app, categories, appNames[entry.app]) === 'other',
  )

  // The list of executables as one string, so the effect below depends on
  // *which* applications there are rather than on an array rebuilt every render.
  const appKeys = todayApps.map((entry) => entry.app).join('\n')

  // One call per executable per run — `resolveAppNames` caches, so re-rendering
  // costs nothing and a new application resolves the first time it appears.
  useEffect(() => {
    if (!appKeys) return

    let live = true
    void resolveAppNames(appKeys.split('\n')).then((names) => {
      if (live) setAppNames((current) => ({ ...current, ...names }))
    })
    return () => {
      live = false
    }
  }, [appKeys])

  const llmReady = readLlm().baseUrl !== '' && readLlm().model !== ''

  async function autoClassify() {
    setClassifying(true)
    setClassifyError(false)
    try {
      const guesses = await classifyApps(
        unknown.map((entry) => ({ exe: entry.app, product: appNames[entry.app] ?? '' })),
      )
      // The model is asked for one of seven words; anything else it invents is
      // dropped rather than stored as a category nothing will ever match.
      const accepted = Object.entries(guesses).flatMap(([exe, category]) =>
        CATEGORIES.includes(category as AppCategory)
          ? [[exe.toLowerCase(), category as AppCategory] as const]
          : [],
      )
      if (accepted.length === 0) {
        setClassifyError(true)
        return
      }

      // One write, not one per application: each `updateActivity` is a full
      // store save that every window hears about.
      updateActivity({ categories: { ...categories, ...Object.fromEntries(accepted) } })
    } catch {
      setClassifyError(true)
    } finally {
      setClassifying(false)
    }
  }

  return (
    <section className="settings-section">
      <h2>{text.title}</h2>
      <p className="settings-hint">{text.intro}</p>

      <label className="field-row">
        <input
          type="checkbox"
          checked={monitor.enabled}
          onChange={(event) => patch({ enabled: event.target.checked })}
        />
        <span>{text.enable}</span>
      </label>

      <label className="field-row">
        <input
          type="checkbox"
          checked={monitor.mic}
          disabled={!monitor.enabled}
          onChange={(event) => patch({ mic: event.target.checked })}
        />
        <span>{text.mic}</span>
      </label>
      <p className="settings-hint">{text.micHint}</p>

      <label className="field-row">
        <input
          type="checkbox"
          checked={monitor.audio}
          disabled={!monitor.enabled}
          onChange={(event) => patch({ audio: event.target.checked })}
        />
        <span>{text.audio}</span>
      </label>
      <p className="settings-hint">{text.audioHint}</p>

      <label className="field-row">
        <span>{text.away}</span>
        <input
          type="number"
          min={1}
          max={60}
          value={monitor.awayMinutes}
          onChange={(event) =>
            patch({ awayMinutes: Math.min(60, Math.max(1, Number(event.target.value) || 5)) })
          }
        />
        <small>{strings.common.minutes}</small>
      </label>
      <p className="settings-hint">{text.awayHint}</p>

      <label className="field-row">
        <span>{text.retain}</span>
        <input
          type="number"
          min={1}
          max={3650}
          value={monitor.retainDays}
          onChange={(event) =>
            patch({ retainDays: Math.min(3650, Math.max(1, Number(event.target.value) || 90)) })
          }
        />
        <small>{text.days}</small>
      </label>

      <div className="settings-subhead">{text.todayHead}</div>
      {!monitor.enabled && <p className="settings-hint">{text.disabled}</p>}
      <div className="metric-grid">
        <span>{text.present}</span>
        <strong>{metrics ? `${metrics.presentMinutes} 分钟` : '—'}</strong>
        <span>{text.effective}</span>
        <strong>{metrics ? `${metrics.effectiveMinutes} 分钟` : '—'}</strong>
        <span>{text.meeting}</span>
        <strong>{metrics ? `${metrics.meetingMinutes} 分钟` : '—'}</strong>
      </div>

      {unknown.length > 0 && (
        <>
          <div className="settings-subhead">{text.unknown}</div>
          <p className="settings-hint">{text.unknownHint}</p>
          {unknown.slice(0, 8).map((entry) => {
            const name = appNames[entry.app]
            return (
              <div className="money-row" key={entry.app}>
                {/* The product name leads and the executable follows in small
                    type: "微信" is the answer, "Weixin.exe" is the evidence. */}
                <span className="grow">
                  {name ?? entry.app}
                  {name && name !== entry.app && <small className="app-exe">{entry.app}</small>}
                </span>
                <select
                  value="other"
                  onChange={(event) => classify(entry.app, event.target.value as AppCategory)}
                >
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {categoryNames[category]}
                    </option>
                  ))}
                </select>
              </div>
            )
          })}

          <div className="field-row">
            <button
              type="button"
              className="reminder-button"
              disabled={!llmReady || classifying}
              onClick={() => void autoClassify()}
            >
              {classifying ? text.classifying : text.autoClassify}
            </button>
          </div>
          <p className="settings-hint">{llmReady ? text.autoHint : text.llmOff}</p>
          {classifyError && <p className="settings-hint">{text.classifyFailed}</p>}
        </>
      )}

      <button
        type="button"
        className="reminder-button"
        onClick={() => {
          void clearActivityData()
          setCleared(true)
        }}
      >
        {cleared ? text.cleared : text.clear}
      </button>
    </section>
  )
}

export default ActivitySettings
