// The moo clock's mood layer: which face it wears and what it says.
//
// Two layers, not one. Six mutually exclusive **main states** answer "how is
// this day going" from L / F / I; a separate **environment modifier** answers
// "what is happening right now" from the foreground app and the microphone.
// Folding the second into the first would need 6 x 8 states, and most of the
// combinations never occur — so they are picked independently and only the
// *line* is looked up by the pair, falling back to the main state's own lines
// whenever a pair has nothing written for it.
//
// Every threshold below is a first guess. They are gathered in `thresholds` so
// tuning is one edit in one place after the thing has run for a while.

import type { AppCategory, RecentActivity } from './activity'
import { locale } from './locales'

export type MoodKey = 'nirvana' | 'clown' | 'angry' | 'burning' | 'numb' | 'smug' | 'idle'

export type Mood = {
  key: MoodKey
  emoji: string
}

export type ModifierKey =
  | 'zombie'
  | 'meeting'
  | 'chatStorm'
  | 'coding'
  | 'spreadsheet'
  | 'slacking'
  | 'aloneLate'
  | 'none'

export type Modifier = {
  key: ModifierKey
  emoji: string
  /** Highest wins when several apply at once. */
  weight: number
}

export const moods: Record<MoodKey, Mood> = {
  nirvana: { key: 'nirvana', emoji: '🥳' },
  clown: { key: 'clown', emoji: '🤡' },
  angry: { key: 'angry', emoji: '😡' },
  burning: { key: 'burning', emoji: '🥵' },
  numb: { key: 'numb', emoji: '🫥' },
  smug: { key: 'smug', emoji: '😎' },
  idle: { key: 'idle', emoji: '🙂' },
}

/** What this mood is called, in the language now in force. */
export function moodLabel(mood: Mood) {
  return locale().moo.moods[mood.key].label
}

export function modifierLabel(modifier: Modifier) {
  return locale().moo.modifiers[modifier.key]
}

export const modifiers: Record<ModifierKey, Modifier> = {
  // Ranked above plain "in a meeting": a meeting you are not participating in is
  // the more interesting fact, and the more common one.
  zombie: { key: 'zombie', emoji: '🧟', weight: 110 },
  meeting: { key: 'meeting', emoji: '🎙', weight: 100 },
  chatStorm: { key: 'chatStorm', emoji: '💬', weight: 90 },
  coding: { key: 'coding', emoji: '⌨️', weight: 80 },
  spreadsheet: { key: 'spreadsheet', emoji: '📊', weight: 80 },
  slacking: { key: 'slacking', emoji: '🐟', weight: 70 },
  aloneLate: { key: 'aloneLate', emoji: '🌙', weight: 60 },
  none: { key: 'none', emoji: '', weight: 0 },
}

/** First-guess thresholds, all in one place so they can be tuned together. */
export const thresholds = {
  /** Minutes either side of quitting time that still count as "just finished". */
  goneWindow: 10,
  /** Minutes past quitting time before unpaid work becomes a punchline. */
  clownAfter: 60,
  /** Minutes past quitting time before "still here alone" applies. */
  lateAfter: 30,
  /** Backspace share of recent keys that reads as frustration. */
  angryBackShare: 0.25,
  /** Copy/paste share that reads as mechanical work. */
  numbCopyShare: 0.2,
  /** Window switches in the recent window above which attention is shattered. */
  burningSwitches: 30,
  burningApps: 5,
  burningIntensity: 0.8,
  /** Slack rate above which a paid hour counts as a won hour. */
  smugSlack: 0.4,
  /** Keys per minute in a chat app that reads as a barrage. */
  chatRate: 60,
  /** Keys in the recent window that read as sustained typing. */
  codingKeys: 100,
  /** Recent keys below which a live microphone means nobody is working. */
  zombieKeys: 20,
  /** Recent keys below which a share cannot be trusted as a signal. */
  minKeysForShare: 30,
  /** Effective-hour value above and below the base rate that earns a comment. */
  efficiencyHigh: 1.2,
  efficiencyLow: 0.8,
}

export type MoodInput = {
  loss: number
  slack: number
  intensity: number
  /** Minutes past the scheduled end of the day; `null` on a day with no shift. */
  pastEndMinutes: number | null
  inWorkWindow: boolean
  overtimeMinutes: number
  overtimePaid: boolean
  category: AppCategory
  recent: RecentActivity
}

function share(part: number, whole: number, floor: number) {
  return whole >= floor ? part / whole : 0
}

/** One main-state rule, with the values that decided it. */
export type RuleTrace = {
  key: MoodKey
  conditions: { test: string; value: string; passed: boolean }[]
  /** True when every condition held. The first such rule is the answer. */
  matched: boolean
}

function condition(test: string, value: string, passed: boolean) {
  return { test, value, passed }
}

/**
 * Every main-state rule in priority order, with what it actually saw.
 *
 * `mainState` is defined in terms of this rather than the other way round. Two
 * copies of these comparisons would drift apart, and a debug view that disagrees
 * with the engine is worse than no debug view at all.
 */
export function traceMainState(input: MoodInput): RuleTrace[] {
  const { recent } = input
  // NaN rather than null: every comparison against it is then false, which is
  // what "there is no shift today" has to mean for a rule about quitting time.
  const pastEnd = input.pastEndMinutes ?? Number.NaN
  const perMinute = recent.minutes > 0 ? recent.keysTotal / recent.minutes : 0
  const backShare = share(recent.keysBack, recent.keysTotal, thresholds.minKeysForShare)
  const copyShare = share(recent.keysCopy, recent.keysTotal, thresholds.minKeysForShare)
  const num = (value: number) => (Number.isNaN(value) ? 'null' : value.toFixed(2))

  const rules: [MoodKey, RuleTrace['conditions']][] = [
    [
      'nirvana',
      [
        condition(
          `|pastEnd| <= ${thresholds.goneWindow}`,
          num(Math.abs(pastEnd)),
          Math.abs(pastEnd) <= thresholds.goneWindow,
        ),
        condition('overtime <= 5', String(input.overtimeMinutes), input.overtimeMinutes <= 5),
        condition('intensity < 0.15', num(input.intensity), input.intensity < 0.15),
      ],
    ],
    [
      'clown',
      [
        condition(`pastEnd > ${thresholds.clownAfter}`, num(pastEnd), pastEnd > thresholds.clownAfter),
        condition('overtimePaid = false', String(input.overtimePaid), !input.overtimePaid),
        condition('keys/min > 0', num(perMinute), perMinute > 0),
      ],
    ],
    [
      'angry',
      [
        condition(
          `backShare > ${thresholds.angryBackShare}`,
          num(backShare),
          backShare > thresholds.angryBackShare,
        ),
      ],
    ],
    [
      'burning',
      [
        condition(
          `intensity > ${thresholds.burningIntensity}`,
          num(input.intensity),
          input.intensity > thresholds.burningIntensity,
        ),
        condition(
          `distinctApps >= ${thresholds.burningApps}`,
          String(recent.distinctApps),
          recent.distinctApps >= thresholds.burningApps,
        ),
        condition(
          `appSwitches > ${thresholds.burningSwitches}`,
          String(recent.appSwitches),
          recent.appSwitches > thresholds.burningSwitches,
        ),
      ],
    ],
    [
      'numb',
      [
        condition(
          `copyShare > ${thresholds.numbCopyShare}`,
          num(copyShare),
          copyShare > thresholds.numbCopyShare,
        ),
        condition('appSwitches <= 3', String(recent.appSwitches), recent.appSwitches <= 3),
      ],
    ],
    [
      'smug',
      [
        condition('inWorkWindow', String(input.inWorkWindow), input.inWorkWindow),
        condition(`slack > ${thresholds.smugSlack}`, num(input.slack), input.slack > thresholds.smugSlack),
        condition('overtime = 0', String(input.overtimeMinutes), input.overtimeMinutes === 0),
      ],
    ],
  ]

  return rules.map(([key, conditions]) => ({
    key,
    conditions,
    matched: conditions.every((entry) => entry.passed),
  }))
}

/** First match wins, in the documented priority order; `idle` when none does. */
function mainState(input: MoodInput): MoodKey {
  return traceMainState(input).find((rule) => rule.matched)?.key ?? 'idle'
}

/** Several can be true; the heaviest one is the one that picks the line. */
function environmentModifier(input: MoodInput): ModifierKey {
  const { recent, category, pastEndMinutes: pastEnd } = input
  const perMinute = recent.minutes > 0 ? recent.keysTotal / recent.minutes : 0

  const active: ModifierKey[] = []
  if (recent.mic && recent.keysTotal < thresholds.zombieKeys) active.push('zombie')
  if (recent.mic) active.push('meeting')
  if (category === 'chat' && perMinute > thresholds.chatRate) active.push('chatStorm')
  if (category === 'dev' && recent.keysTotal > thresholds.codingKeys) active.push('coding')
  if (
    category === 'office' &&
    share(recent.keysCopy, recent.keysTotal, thresholds.minKeysForShare) > 0.15
  ) {
    active.push('spreadsheet')
  }
  if ((category === 'browser' || category === 'media') && input.inWorkWindow) active.push('slacking')
  if (pastEnd !== null && pastEnd > thresholds.lateAfter) active.push('aloneLate')

  return active.reduce<ModifierKey>(
    (best, key) => (modifiers[key].weight > modifiers[best].weight ? key : best),
    'none',
  )
}

export function evaluateMood(input: MoodInput) {
  const mood = moods[mainState(input)]
  return { mood, modifier: modifiers[environmentModifier(input)] }
}

/**
 * The face to wear with no activity data at all — the clock is the only thing
 * the widget can honestly claim to know, so it says only what the hour supports.
 */
export function clockMood(hour: number): Mood {
  if (hour < 6) return moods.numb
  if (hour < 9) return moods.idle
  if (hour < 12) return moods.burning
  if (hour < 14) return moods.smug
  if (hour < 17) return moods.idle
  if (hour < 19) return moods.nirvana
  return moods.clown
}

// Lines written for a specific pair. Anything absent falls back to the main
// state's own lines, so this table only needs the combinations worth the words.
/**
 * A line that holds still for a minute at a time. Re-picking every tick would
 * make the panel flicker once a second.
 */
export function pickLine(mood: Mood, modifier: Modifier, at: number) {
  const writing = locale().moo
  // The pair first, the mood alone as the fallback: the combo table only holds
  // the pairs that were worth writing something specific for.
  const pool = writing.combos[`${mood.key}:${modifier.key}`] ?? writing.moods[mood.key].lines
  return pool[Math.floor(at / 60000) % pool.length]
}

/**
 * The counter's own commentary. Separate from the mood line because it reacts to
 * money rather than behaviour, and because both can be worth saying at once.
 */
export function earningsRemark(efficiency: number, hasData: boolean) {
  if (!hasData) return null
  const writing = locale().moo
  if (efficiency >= thresholds.efficiencyHigh) return writing.efficiencyHigh
  if (efficiency > 0 && efficiency <= thresholds.efficiencyLow) {
    return writing.efficiencyLow(Math.round((1 - efficiency) * 100))
  }
  return null
}
