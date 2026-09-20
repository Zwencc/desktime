// The boss key.
//
// While it is on the moo clock renders as a plain clock and the whole app takes
// the darkest theme, so nothing on screen suggests a widget that has opinions
// about your working day. That is the entire feature — a disguise that is
// obviously a disguise is worse than none.
//
// The state is stored rather than held in the component so a reload cannot strip
// the disguise off, and so the timer survives one.

import { readSettings, updateSettings } from './settings'
import { createStore } from './store'

export type FishingState = {
  /** Epoch ms the disguise went on; 0 when it is off. */
  since: number
  /** Theme to put back afterwards. */
  previousTheme: string
}

/** The theme the disguise wears: dark, dense, and nothing like a mood widget. */
const DISGUISE_THEME = 'cyber'

const fishingStore = createStore<FishingState>('desktime.fishing', {
  since: 0,
  previousTheme: 'default',
})

export const readFishing = fishingStore.read
export const subscribeFishing = fishingStore.subscribe
export const fishingSnapshot = fishingStore.snapshot

export function startFishing() {
  const previousTheme = readSettings().theme
  fishingStore.save({ since: Date.now(), previousTheme })
  updateSettings({ theme: DISGUISE_THEME })
}

/** Ends the disguise and reports how many minutes it bought back. */
export function stopFishing() {
  const { since, previousTheme } = fishingStore.read()
  if (!since) return 0

  fishingStore.save({ since: 0, previousTheme })
  updateSettings({ theme: previousTheme })
  return (Date.now() - since) / 60000
}

export function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = String(Math.floor(total / 60)).padStart(2, '0')
  return `${minutes}:${String(total % 60).padStart(2, '0')}`
}
