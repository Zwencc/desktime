// Shared panel storage layer.
// Both the widget windows (App) and the standalone context-menu window read and
// write the same localStorage keys, so the key names and accessors live here to
// keep the two windows in sync.

export type PanelKey = 'clock' | 'note' | 'schedule'

export type SavedPosition = {
  x: number
  y: number
}

export type SavedSize = {
  width: number
  height: number
}

export const panels: PanelKey[] = ['clock', 'note', 'schedule']

export const defaultPositions: Record<PanelKey, SavedPosition> = {
  clock: { x: 80, y: 80 },
  note: { x: 80, y: 270 },
  schedule: { x: 430, y: 80 },
}

const PINNED_KEY_PREFIX = 'desktime.pinned.'
const VISIBLE_KEY_PREFIX = 'desktime.visible.'
const WINDOW_POSITION_KEY_PREFIX = 'desktime.windowPosition.'
const WINDOW_SIZE_KEY_PREFIX = 'desktime.windowSize.'

export function pinnedKey(panel: PanelKey) {
  return `${PINNED_KEY_PREFIX}${panel}`
}

export function visibleKey(panel: PanelKey) {
  return `${VISIBLE_KEY_PREFIX}${panel}`
}

export function readSavedPosition(panel: PanelKey) {
  try {
    const value = localStorage.getItem(`${WINDOW_POSITION_KEY_PREFIX}${panel}`)
    return value ? (JSON.parse(value) as SavedPosition) : null
  } catch {
    return null
  }
}

export function saveWindowPosition(panel: PanelKey, position: SavedPosition) {
  localStorage.setItem(`${WINDOW_POSITION_KEY_PREFIX}${panel}`, JSON.stringify(position))
}

export function readSavedSize(panel: PanelKey): SavedSize | null {
  try {
    const value = localStorage.getItem(`${WINDOW_SIZE_KEY_PREFIX}${panel}`)
    return value ? (JSON.parse(value) as SavedSize) : null
  } catch {
    return null
  }
}

export function saveWindowSize(panel: PanelKey, size: SavedSize) {
  localStorage.setItem(`${WINDOW_SIZE_KEY_PREFIX}${panel}`, JSON.stringify(size))
}

export function readPinnedState(panel: PanelKey) {
  const panelValue = localStorage.getItem(pinnedKey(panel))
  const legacyValue = localStorage.getItem('desktime.pinned')

  return (panelValue ?? legacyValue) !== 'false'
}

export function readVisibleState(panel: PanelKey) {
  return localStorage.getItem(visibleKey(panel)) !== 'false'
}

export function readAllPinnedStates(): Record<PanelKey, boolean> {
  return {
    clock: readPinnedState('clock'),
    note: readPinnedState('note'),
    schedule: readPinnedState('schedule'),
  }
}

export function readAllVisibleStates(): Record<PanelKey, boolean> {
  return {
    clock: readVisibleState('clock'),
    note: readVisibleState('note'),
    schedule: readVisibleState('schedule'),
  }
}

export function savePinnedState(panel: PanelKey, pinned: boolean) {
  localStorage.setItem(pinnedKey(panel), String(pinned))
}

export function saveVisibleState(panel: PanelKey, visible: boolean) {
  localStorage.setItem(visibleKey(panel), String(visible))
}

// Context-menu request channel: a widget writes the cursor position + which
// panel it was triggered from, and the standalone menu window picks it up via
// the cross-window `storage` event. The nonce makes each request a distinct
// value so repeated right-clicks at the same spot still fire the event.
export const MENU_REQUEST_KEY = 'desktime.menuRequest'

export type MenuRequest = {
  x: number
  y: number
  panel: PanelKey
  nonce: number
}

export function requestContextMenu(request: MenuRequest) {
  localStorage.setItem(MENU_REQUEST_KEY, JSON.stringify(request))
}

// Context-menu action channel: the menu window is presentation only. When an
// item is clicked it writes the action here, and the widget window it was
// triggered from (`origin`) executes it with its existing pin/visible/reset
// logic. Routing by `origin` keeps a single window from double-applying.
export const MENU_ACTION_KEY = 'desktime.menuAction'

export type MenuAction =
  | { type: 'pin'; origin: PanelKey; target: PanelKey; value: boolean; nonce: number }
  | { type: 'visible'; origin: PanelKey; target: PanelKey; value: boolean; nonce: number }
  | { type: 'reset'; origin: PanelKey; nonce: number }

export function sendMenuAction(action: MenuAction) {
  localStorage.setItem(MENU_ACTION_KEY, JSON.stringify(action))
}
