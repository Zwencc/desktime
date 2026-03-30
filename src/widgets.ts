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

import type { ComponentType } from 'react'
import { CalendarDays, Clock3, NotebookPen } from 'lucide-react'
import { ClockPanel } from './ClockPanel'
import { NotebookPanel } from './NotebookPanel'
import { SchedulePanel } from './SchedulePanel'
import { timeZoneLabel } from './time'

export type WidgetKey = 'clock' | 'note' | 'schedule'

export type WidgetDefinition = {
  /** Window label; must match tauri.conf.json and the `?panel=` query. */
  key: WidgetKey
  /** Name used by the context menu, the tray and the settings list. */
  name: string
  icon: ComponentType<{ size?: number | string; 'aria-hidden'?: boolean | 'true' | 'false' }>
  /** First-run position, and where "reset window position" sends it back to. */
  position: { x: number; y: number }
  resizable: boolean
  Panel: ComponentType
  /** Overrides `name` in the widget's own title bar when it is not a constant. */
  title?: () => string
}

export const widgets: WidgetDefinition[] = [
  {
    key: 'clock',
    name: '时钟',
    icon: Clock3,
    position: { x: 80, y: 80 },
    resizable: false,
    Panel: ClockPanel,
    // The clock's own header names the zone it is showing, which is a setting.
    title: timeZoneLabel,
  },
  {
    key: 'note',
    name: '记事本',
    icon: NotebookPen,
    position: { x: 80, y: 270 },
    resizable: true,
    Panel: NotebookPanel,
  },
  {
    key: 'schedule',
    name: '日程',
    icon: CalendarDays,
    position: { x: 430, y: 80 },
    resizable: true,
    Panel: SchedulePanel,
  },
]

export const widgetKeys: WidgetKey[] = widgets.map((widget) => widget.key)

const byKey = new Map(widgets.map((widget) => [widget.key, widget]))

export function widgetOf(key: WidgetKey) {
  return byKey.get(key) as WidgetDefinition
}

export function isWidgetKey(value: string | null): value is WidgetKey {
  return value !== null && byKey.has(value as WidgetKey)
}

export function widgetName(key: WidgetKey) {
  return byKey.get(key)?.name ?? key
}
