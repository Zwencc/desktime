// The money display: how much this cycle has earned so far, and — once the day
// runs past its end without overtime pay — how much is being given away.
//
// It owns its own animation loop so that a number moving twelve times a second
// only redraws itself, not the clock and the mood line above it. The loop just
// republishes `Date.now()`; every figure is derived from that timestamp, so a
// throttled frame rate costs smoothness and never accuracy.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { WorkMetrics } from './activity'
import { cycleBase, liveEarnings } from './earnings'
import { earningsRemark } from './moo'
import { today } from './time'
import { formatMoney, hasSalary, parseWork, subscribeWork, workSnapshot } from './work'
import { useLocale } from './locales'


/** ~12fps. Cents move visibly, and the panel stays cheap. */
const FRAME_MS = 80

/** How long the celebration styling stays on after crossing a round number. */
const CELEBRATE_MS = 1600

/** Round number worth noticing. */
const MILESTONE = 100

export function EarningsCounter({
  metrics,
  compact = false,
}: {
  metrics: WorkMetrics | null
  /** One line instead of a block — the island has no room for the full thing. */
  compact?: boolean
}) {
  const text = useLocale().earnings
  const stored = useSyncExternalStore(subscribeWork, workSnapshot)
  const ymd = today()
  const [at, setAt] = useState(() => Date.now())
  const [celebrating, setCelebrating] = useState(false)
  const milestone = useRef(-1)

  const work = useMemo(() => parseWork(stored), [stored])
  // Expanding a month of shifts is not something to redo twelve times a second.
  const base = useMemo(() => cycleBase(work, ymd), [work, ymd])

  useEffect(() => {
    let frame = 0
    let previous = 0

    function tick(elapsed: number) {
      if (elapsed - previous >= FRAME_MS) {
        previous = elapsed
        setAt(Date.now())
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const state = liveEarnings(work, base, metrics, ymd, at)

  // Crossing a round hundred is the counter's one moment of drama. The first
  // reading only seeds the reference, or every launch would celebrate.
  useEffect(() => {
    const crossed = Math.floor(state.earned / MILESTONE)
    if (milestone.current < 0) {
      milestone.current = crossed
      return
    }
    if (crossed <= milestone.current) return

    milestone.current = crossed
    setCelebrating(true)
    const timer = window.setTimeout(() => setCelebrating(false), CELEBRATE_MS)
    return () => window.clearTimeout(timer)
  }, [state.earned])

  if (!hasSalary(work.salary)) {
    return compact ? null : <span className="moo-locked">{text.locked}</span>
  }

  const remark = earningsRemark(state.efficiency, (metrics?.presentMinutes ?? 0) > 30)
  const cycleLabel = text[work.earnings.cycle]
  const classes = ['moo-earned-value']
  if (state.billing) classes.push('live')
  if (state.overtime) classes.push('stalled')
  if (celebrating) classes.push('celebrate')

  if (compact) {
    return (
      <div className="moo-earned compact">
        <span className="moo-earned-label">
          {cycleLabel}
          {text.earned}
        </span>
        <strong className={classes.join(' ')}>
          {formatMoney(state.earned, state.currency, state.showCents)}
        </strong>
        {state.overtime && (
          <span className="moo-wasted-inline">
            {text.wasted} {formatMoney(state.wasted, state.currency, true)}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="moo-earnings">
      <div className="moo-earned">
        <span className="moo-earned-label">
          {cycleLabel}
          {text.earned}
        </span>
        <strong className={classes.join(' ')}>
          {formatMoney(state.earned, state.currency, state.showCents)}
        </strong>
      </div>

      <div className="moo-earned-sub">
        <span>
          {state.unitLabel} {formatMoney(state.unitRate, state.currency, state.unitRate < 1000)}
        </span>
        <span className="moo-progress">
          <span
            className="moo-progress-fill"
            style={{ width: `${Math.round(Math.min(1, state.cycleProgress) * 100)}%` }}
          />
        </span>
      </div>

      {state.overtime && (
        <div className="moo-wasted">
          <span>{text.wasted}</span>
          <strong>{formatMoney(state.wasted, state.currency, true)}</strong>
        </div>
      )}

      {remark && <p className="moo-remark">{remark}</p>}
    </div>
  )
}

export default EarningsCounter
