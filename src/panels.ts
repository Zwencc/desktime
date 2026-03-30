// Per-widget window state: pin, visibility, position and size.
//
// Both the widget windows (App) and the standalone context-menu and settings
// windows read and write the same localStorage keys, so the key names and
// accessors live here to keep every window in sync. Which widgets exist is not
// decided here — that comes from the registry in widgets.ts.

import { invoke } from '@tauri-apps/api/core'
import { PhysicalPosition, Window } from '@tauri-apps/api/window'
import { type WidgetKey, widgetKeys, widgetOf } from './widgets'

export type SavedPosition = {
  x: number
  y: number
}

export type SavedSize = {
  width: number
  height: number
}

const PINNED_KEY_PREFIX = 'desktime.pinned.'
const VISIBLE_KEY_PREFIX = 'desktime.visible.'
const WINDOW_POSITION_KEY_PREFIX = 'desktime.windowPosition.'
const WINDOW_SIZE_KEY_PREFIX = 'desktime.windowSize.'

export function pinnedKey(widget: WidgetKey) {
  return `${PINNED_KEY_PREFIX}${widget}`
}

export function visibleKey(widget: WidgetKey) {
  return `${VISIBLE_KEY_PREFIX}${widget}`
}

export function readSavedPosition(widget: WidgetKey) {
  try {
    const value = localStorage.getItem(`${WINDOW_POSITION_KEY_PREFIX}${widget}`)
    return value ? (JSON.parse(value) as SavedPosition) : null
  } catch {
    return null
  }
}

export function saveWindowPosition(widget: WidgetKey, position: SavedPosition) {
  localStorage.setItem(`${WINDOW_POSITION_KEY_PREFIX}${widget}`, JSON.stringify(position))
}

export function readSavedSize(widget: WidgetKey): SavedSize | null {
  try {
    const value = localStorage.getItem(`${WINDOW_SIZE_KEY_PREFIX}${widget}`)
    return value ? (JSON.parse(value) as SavedSize) : null
  } catch {
    return null
  }
}

export function saveWindowSize(widget: WidgetKey, size: SavedSize) {
  localStorage.setItem(`${WINDOW_SIZE_KEY_PREFIX}${widget}`, JSON.stringify(size))
}

export function readPinnedState(widget: WidgetKey) {
  const value = localStorage.getItem(pinnedKey(widget))
  const legacyValue = localStorage.getItem('desktime.pinned')

  return (value ?? legacyValue) !== 'false'
}

export function readVisibleState(widget: WidgetKey) {
  return localStorage.getItem(visibleKey(widget)) !== 'false'
}

// Built from the registry so a new widget shows up in every window's state map
// without touching this file.
function stateOfAll(read: (widget: WidgetKey) => boolean): Record<WidgetKey, boolean> {
  return Object.fromEntries(widgetKeys.map((widget) => [widget, read(widget)])) as Record<
    WidgetKey,
    boolean
  >
}

export function readAllPinnedStates() {
  return stateOfAll(readPinnedState)
}

export function readAllVisibleStates() {
  return stateOfAll(readVisibleState)
}

export function savePinnedState(widget: WidgetKey, pinned: boolean) {
  localStorage.setItem(pinnedKey(widget), String(pinned))
}

export function saveVisibleState(widget: WidgetKey, visible: boolean) {
  localStorage.setItem(visibleKey(widget), String(visible))
}

// Window operations any window may perform on any widget — the widgets do it
// from their own title bar, the settings panel does it from its component list.
//
// "Pinned" and "unpinned" are two active modes, not on/off: unpinned widgets are
// pushed behind other apps so they behave like desktop gadgets.
export async function applyPanelPin(widget: WidgetKey, pinned: boolean) {
  const target = await Window.getByLabel(widget)
  if (!target) return

  if (pinned) {
    await target.setAlwaysOnBottom(false)
    await target.setAlwaysOnTop(true)
    return
  }

  await target.setAlwaysOnTop(false)
  await target.setAlwaysOnBottom(true)
  await invoke('set_window_to_bottom', { label: widget })
}

export async function applyPanelVisibility(widget: WidgetKey, visible: boolean) {
  await invoke('set_window_visibility', { label: widget, visible })
}

export async function resetPanelPosition(widget: WidgetKey) {
  const position = widgetOf(widget).position
  saveWindowPosition(widget, position)

  const target = await Window.getByLabel(widget)
  await target?.setPosition(new PhysicalPosition(position.x, position.y))
}

// Context-menu request channel: a widget writes the cursor position + which
// widget it was triggered from, and the standalone menu window picks it up via
// the cross-window `storage` event. The nonce makes each request a distinct
// value so repeated right-clicks at the same spot still fire the event.
export const MENU_REQUEST_KEY = 'desktime.menuRequest'

export type MenuRequest = {
  x: number
  y: number
  panel: WidgetKey
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
  | { type: 'pin'; origin: WidgetKey; target: WidgetKey; value: boolean; nonce: number }
  | { type: 'visible'; origin: WidgetKey; target: WidgetKey; value: boolean; nonce: number }
  | { type: 'reset'; origin: WidgetKey; nonce: number }

export function sendMenuAction(action: MenuAction) {
  localStorage.setItem(MENU_ACTION_KEY, JSON.stringify(action))
}
