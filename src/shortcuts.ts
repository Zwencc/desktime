// Global keyboard shortcuts: the action table, the user's overrides, and what
// each action does.
//
// Registration and execution both live in Rust (see shortcuts.rs); what stays
// here is the table — which shortcuts exist, what they default to, how a
// recorded key is spelled, and which two of them clash. Those are questions
// about the interface.
//
// The *plan* travels with each binding: which window an action touches, and
// what its state is when nothing has been written down yet. That last part can
// only come from here, because it is the widget registry's own default, and the
// registry is a frontend file.
//
// Accelerators are stored in the plugin's syntax: modifiers joined by `+`, then
// a `KeyboardEvent.code` (`Digit1`, `KeyK`). That is both what the recorder in
// ShortcutSettings captures and what the Rust parser accepts, so no spelling
// has to be translated on the way through.

import { invoke } from '@tauri-apps/api/core'
import { readDesktop } from './desktop'
import { isTauri } from './env'
import { applyPanelPin, readPinnedState, readVisibleState, savePinnedState, showWidget } from './panels'
import { createStore } from './store'
import { type WidgetKey, isWidgetKey, widgetKeys, widgetName, widgetOf } from './widgets'
import { locale } from './locales'

export type ShortcutId = string

export type ShortcutAction = {
  id: ShortcutId
  label: string
  /** The key the action carries until the user records another one. */
  defaultAccelerator: string
}

export type ResolvedShortcut = ShortcutAction & {
  /** The key in force; empty when the user cleared it. */
  accelerator: string
}

export const SWAP_CLOCK = 'swap-clock'

const PIN_PREFIX = 'pin-'

function pinTarget(id: ShortcutId): WidgetKey | null {
  if (!id.startsWith(PIN_PREFIX)) return null
  const key = id.slice(PIN_PREFIX.length)
  return isWidgetKey(key) ? key : null
}

// Ctrl+Alt rather than the plain Ctrl+digit first sketched: these are *global*
// hotkeys, so Ctrl+1 would be taken away from every other application on the
// machine — browser tabs, editor groups, chat conversations — with no hint as
// to why they stopped working.
//
// A function rather than a constant, because the labels are translated: an array
// built at module load would hold whichever language was current when this file
// was first imported, and the settings rows would keep showing it after a switch.
function shortcutActions(): ShortcutAction[] {
  const text = locale().shortcutSettings
  return [
    { id: SWAP_CLOCK, label: text.swap, defaultAccelerator: 'Ctrl+Alt+Digit1' },
    // Built from the registry, so a new widget gets a pin shortcut for free.
    ...widgetKeys.map((key, index) => ({
      id: `${PIN_PREFIX}${key}`,
      label: `${widgetName(key)} ${text.pin}`,
      defaultAccelerator: `Ctrl+Alt+Digit${index + 2}`,
    })),
  ]
}

export const shortcutStore = createStore<Record<ShortcutId, string>>('desktime.shortcuts', {})

/**
 * Accelerators the OS refused to hand over — written by the launcher after it
 * tries to register, read by the settings page. Registration fails when another
 * application already owns the key, and that failure is otherwise completely
 * silent: the shortcut simply never fires.
 */
export const shortcutFailureStore = createStore<{ failed: ShortcutId[] }>(
  'desktime.shortcuts.failed',
  { failed: [] },
)

/**
 * True while the settings window is waiting for a key press, which makes the
 * launcher hand every shortcut back.
 *
 * Windows registers a global hotkey with `RegisterHotKey`, and that takes the
 * key away from the focused application entirely — so a key that is already
 * bound would fire its own action and never reach the recorder, leaving the row
 * waiting for a press the webview is never told about.
 */
export const shortcutRecordingStore = createStore<{ recording: boolean }>(
  'desktime.shortcuts.recording',
  { recording: false },
)

/**
 * One widget as a plan refers to it: a window label, and what to assume about
 * it when `config.json` has never recorded a value.
 *
 * The fallback travels rather than being looked up in Rust because it is
 * `defaultVisible` / `defaultPinned` from the registry — a widget that starts
 * hidden is otherwise indistinguishable from one nobody has switched on yet.
 */
type WidgetRef = { label: WidgetKey; fallback: boolean }

export type ShortcutPlan =
  | { kind: 'pin'; widget: WidgetRef }
  | { kind: 'swap'; widgets: WidgetRef[] }

export type ShortcutBinding = {
  id: ShortcutId
  accelerator: string
  action?: ShortcutPlan
}

function visibleRef(key: WidgetKey): WidgetRef {
  return { label: key, fallback: widgetOf(key)?.defaultVisible !== false }
}

function pinnedRef(key: WidgetKey): WidgetRef {
  return { label: key, fallback: widgetOf(key)?.defaultPinned !== false }
}

/** What the backend should do when this shortcut fires. */
function planFor(id: ShortcutId): ShortcutPlan | undefined {
  if (id === SWAP_CLOCK) {
    // A retired widget has no window to swap to.
    if (!isWidgetKey('moo') || !isWidgetKey('clock')) return undefined

    // Order matters: the backend brings on the first of these that is hidden,
    // so "neither is showing" lands on the moo clock — which is exactly what
    // `showWidget(readVisibleState('moo') ? 'clock' : 'moo')` below does.
    return { kind: 'swap', widgets: [visibleRef('moo'), visibleRef('clock')] }
  }

  const widget = pinTarget(id)
  return widget ? { kind: 'pin', widget: pinnedRef(widget) } : undefined
}

export function resolveShortcuts(overrides = shortcutStore.read()): ResolvedShortcut[] {
  return shortcutActions().map((action) => ({
    ...action,
    accelerator: overrides[action.id] ?? action.defaultAccelerator,
  }))
}

// Two accelerators can mean the same key while being spelled differently: the
// recorder always writes `Ctrl+Alt+Digit1`, but the launcher hotkey is a free
// text field where `Control+Alt+1` is just as valid.
const MODIFIER_ALIASES: Record<string, string> = {
  CONTROL: 'CTRL',
  COMMANDORCONTROL: 'CTRL',
  CMD: 'SUPER',
  COMMAND: 'SUPER',
  META: 'SUPER',
  OPTION: 'ALT',
}

const KEY_ALIASES: Record<string, string> = Object.fromEntries([
  ...[...'0123456789'].map((digit) => [digit, `DIGIT${digit}`]),
  ...[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((letter) => [letter, `KEY${letter}`]),
])

function normalize(accelerator: string) {
  const parts = accelerator
    .split('+')
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean)
  const key = parts.pop() ?? ''
  const modifiers = parts.map((part) => MODIFIER_ALIASES[part] ?? part).sort()

  return [...modifiers, KEY_ALIASES[key] ?? key].join('+')
}

/** The id the backend answers itself, by summoning the launcher window. */
export const LAUNCHER_SHORTCUT = 'launcher'

/**
 * Hands the resolved table to the backend, which owns registration, and writes
 * back whatever the OS refused.
 *
 * Registration used to live in the launcher window, which is why that window had
 * to be alive from the first moment of a run — a whole WebView2 instance kept
 * for a key press. A hotkey belongs to the process, so it now belongs to Rust;
 * what stays here is everything that is about the interface: the table, the
 * defaults, the spelling, and which two of them clash.
 *
 * An empty list is how the settings window stands the shortcuts down while it
 * waits for a key press — a registered hotkey never reaches the webview that is
 * listening for it.
 */
export async function syncShortcuts(bindings: ShortcutBinding[]) {
  if (!isTauri) return

  try {
    const failed = await invoke<ShortcutId[]>('sync_shortcuts', { bindings })
    shortcutFailureStore.save({ failed })
  } catch {
    // A backend that will not take the table leaves the previous registration
    // in place, which is better than reporting every shortcut as broken.
  }
}

/** Everything the backend should hold, the launcher's own hotkey included. */
export function allBindings(): ShortcutBinding[] {
  return [
    // The launcher carries no plan: summoning its window is the one action the
    // backend already answers by itself.
    ...resolveShortcuts().map(({ id, accelerator }) => ({
      id,
      accelerator,
      action: planFor(id),
    })),
    { id: LAUNCHER_SHORTCUT, accelerator: readDesktop().hotkey },
  ].filter((shortcut) => shortcut.accelerator)
}

/**
 * A state change the backend made on its own, on the way to localStorage.
 *
 * The window has already moved by the time this arrives — this is the copy in
 * the webview catching up, not the action being carried out.
 */
export type ShortcutStateChange = { key: string; value: string }

/**
 * The name of whatever already answers to `accelerator`, or null when it is
 * free. The launcher's own hotkey counts: it is registered by this same
 * process, so a clash there means one of the two silently never registers.
 */
export function conflictOf(
  list: ResolvedShortcut[],
  id: ShortcutId,
  accelerator: string,
): string | null {
  if (!accelerator) return null

  const wanted = normalize(accelerator)
  if (normalize(readDesktop().hotkey) === wanted) return locale().shortcutSettings.launcherAction

  const clash = list.find((entry) => entry.id !== id && normalize(entry.accelerator) === wanted)
  return clash ? clash.label : null
}

/**
 * Carries out one action in the webview.
 *
 * The **fallback path**. The backend does this itself now, against the config
 * mirror, precisely so a suspended WebView2 cannot swallow a key press — see
 * the note at the top of shortcuts.rs. This still answers `shortcut://fire`,
 * which the backend only sends for a binding that arrived without a plan.
 */
export function runShortcut(id: ShortcutId) {
  if (id === SWAP_CLOCK) {
    // Mutex peers, so showing one already hides the other.
    showWidget(readVisibleState('moo') ? 'clock' : 'moo')
    return
  }

  const widget = pinTarget(id)
  if (!widget) return

  const next = !readPinnedState(widget)
  savePinnedState(widget, next)
  void applyPanelPin(widget, next)
}
