// The widget registry.
//
// Everything that distinguishes one always-on-desktop widget from another lives
// in a single entry here: its window label, the name menus show for it, where it
// lands on first run, whether it can be resized, and what it renders.
//
// Adding a widget is three edits and no new wiring:
//   1. an entry below,
//   2. a window with the same label in src-tauri/tauri.conf.json
//      (copy `additionalBrowserArgs` verbatim — WebView2 instances sharing a
//      user-data folder must be launched with identical browser arguments),
//   3. that label in src-tauri/capabilities/default.json `windows`
//      (without it every IPC call from the new window fails silently).
//
// The shell, context menu, tray, settings list, pin/visibility state and window
// position persistence all read this registry, so none of them need to change.

import { type ComponentType, lazy } from 'react'
import { Beef, CalendarDays, Clock3, Layers, NotebookPen } from 'lucide-react'
import { locale } from './locales'
import { readSettings } from './settings'
import { timeZoneLabel } from './time'

// **Only the bodies are lazy.** A window renders one widget, but the registry
// itself is read whole by the settings list, the context menu and the tray —
// so the label, the icon and the position stay ordinary values and just the
// component behind `Panel` becomes a chunk of its own. Without this the clock
// window still pulled in CodeMirror and the Markdown renderer through the
// notebook, which is most of what a widget window was ever downloading.
const ClockPanel = lazy(() => import('./ClockPanel').then((module) => ({ default: module.ClockPanel })))
const DesktopPanel = lazy(() =>
  import('./DesktopPanel').then((module) => ({ default: module.DesktopPanel })),
)
const MooPanel = lazy(() => import('./MooPanel').then((module) => ({ default: module.MooPanel })))
const NotebookPanel = lazy(() =>
  import('./NotebookPanel').then((module) => ({ default: module.NotebookPanel })),
)
const SchedulePanel = lazy(() =>
  import('./SchedulePanel').then((module) => ({ default: module.SchedulePanel })),
)

export type WidgetKey = 'clock' | 'note' | 'schedule' | 'moo' | 'desktop'

export type Anchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

/**
 * A corner of the monitor's work area, plus a margin in **CSS pixels**.
 *
 * Absolute coordinates were only ever right on the display they were written
 * on: on a 4K screen they cluster in the top-left eighth, and on a second
 * monitor they land on the first one. A corner and a margin mean the same thing
 * everywhere, and `panels.ts` resolves them against the monitor the window is
 * actually on, at its actual size and scale.
 */
export type DefaultPosition = {
  anchor: Anchor
  dx: number
  dy: number
}

export type WidgetDefinition = {
  /** Window label; must match tauri.conf.json and the `?panel=` query. */
  key: WidgetKey
  icon: ComponentType<{ size?: number | string; 'aria-hidden'?: boolean | 'true' | 'false' }>
  /** First-run position, and where "reset window position" sends it back to. */
  position: DefaultPosition
  resizable: boolean
  Panel: ComponentType
  /** Overrides `name` in the widget's own title bar when it is not a constant. */
  title?: () => string
  /** Whether the widget is on screen before the user has ever chosen; true by default. */
  defaultVisible?: boolean
  /**
   * Whether the widget starts pinned above other windows; true by default.
   * A widget that is meant to read as part of the desktop starts unpinned, which
   * is what sinks it to the bottom of the Z-order.
   */
  defaultPinned?: boolean
  /**
   * True while the widget places and sizes its own window. The shell then draws
   * no title bar and no resize grip, and stops persisting position and size —
   * otherwise it would save the geometry the widget just imposed and hand that
   * back the next time the widget returns to being an ordinary window.
   */
  selfManaged?: () => boolean
  /**
   * Retired: the entry and its component stay here, but nothing derives a
   * widget from it any more. Kept as a flag rather than a deletion because the
   * decision to retire one is a product call that can be taken back, and the
   * window it describes is the only record of how it was configured.
   */
  disabled?: boolean
}

const allWidgets: WidgetDefinition[] = [
  {
    key: 'clock',
    icon: Clock3,
    position: { anchor: 'top-right', dx: 24, dy: 24 },
    resizable: false,
    Panel: ClockPanel,
    // The clock's own header names the zone it is showing, which is a setting.
    title: timeZoneLabel,
  },
  {
    key: 'note',
    icon: NotebookPen,
    position: { anchor: 'top-left', dx: 24, dy: 24 },
    resizable: true,
    Panel: NotebookPanel,
  },
  {
    key: 'schedule',
    icon: CalendarDays,
    position: { anchor: 'bottom-right', dx: 24, dy: 24 },
    resizable: true,
    Panel: SchedulePanel,
  },
  {
    key: 'moo',
    icon: Beef,
    // The same corner as the clock: the two exclude each other, so swapping one
    // for the other reads as the widget changing rather than as it moving.
    position: { anchor: 'top-right', dx: 24, dy: 24 },
    resizable: true,
    Panel: MooPanel,
    // Starts off so a first run shows one clock, not two (see MUTEX_GROUPS).
    defaultVisible: false,
    selfManaged: () => readSettings().mooShape === 'island',
  },
  {
    key: 'desktop',
    icon: Layers,
    // Never used: the layer sizes itself to the monitor and its position is not
    // persisted (see `selfManaged`). Present because every widget needs one.
    position: { anchor: 'top-left', dx: 0, dy: 0 },
    resizable: false,
    Panel: DesktopPanel,
    // Covering the desktop is a decision, not a default.
    defaultVisible: false,
    // Below everything, or it would cover the apps rather than the wallpaper.
    defaultPinned: false,
    // It sizes itself to the monitor and must never carry a title bar: the whole
    // point is that it reads as wallpaper.
    selfManaged: () => true,
    // Retired in v0.1.4. Covering the real desktop meant owning icon positions,
    // DPI, multi-monitor and Z-order, and that bill came to more than the layer
    // was worth. The launcher it shipped alongside is not retired — that lives
    // in desktop.rs too and is still reachable from its hotkey.
    disabled: true,
  },
]

/**
 * The widgets that exist as far as the rest of the app is concerned.
 *
 * Everything downstream — the shell, the tray, the settings list, the shortcut
 * table, the pin/visible state maps — derives from this, so retiring one is the
 * single `disabled` flag above rather than an edit in each of those places.
 */
export const widgets: WidgetDefinition[] = allWidgets.filter((widget) => !widget.disabled)

export const widgetKeys: WidgetKey[] = widgets.map((widget) => widget.key)

// Widgets that cannot share the screen: switching one on switches its peers off.
// The clock and the moo clock both tell the time, so showing both is duplication.
const MUTEX_GROUPS: WidgetKey[][] = [['clock', 'moo']]

const byKey = new Map(widgets.map((widget) => [widget.key, widget]))

export function widgetOf(key: WidgetKey) {
  return byKey.get(key) as WidgetDefinition
}

export function isWidgetKey(value: string | null): value is WidgetKey {
  return value !== null && byKey.has(value as WidgetKey)
}

/**
 * The name menus, the tray and the settings list show for a widget.
 *
 * Looked up rather than stored on the definition: a name in the registry would
 * be a module-level constant, and would therefore hold whichever language was
 * current when this file was first imported.
 */
export function widgetName(key: WidgetKey) {
  return locale().widgetNames[key] ?? key
}

/** The widgets that must go off screen when `key` comes on. */
export function mutexPeers(key: WidgetKey): WidgetKey[] {
  const group = MUTEX_GROUPS.find((entry) => entry.includes(key))
  return group ? group.filter((entry) => entry !== key) : []
}
