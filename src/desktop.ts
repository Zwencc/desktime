// Desktop layer: what is on the desktop, and where the user has put it.
//
// The layer covers the real icons, so it draws them again. Their **positions**
// are ours, not Windows': the system stores its grid in an undocumented registry
// blob that is not stable across shell versions, so reading it would break on a
// Windows update in a way nobody could diagnose. Instead the grid auto-fills and
// anything the user drags is remembered here.

import { invoke } from '@tauri-apps/api/core'
import { isTauri } from './env'
import { createStore } from './store'

export type ShellEntry = {
  name: string
  path: string
  directory: boolean
  /** `data:image/png;base64,...`, or empty when the shell had no icon. */
  icon: string
  source: 'desktop' | 'menu'
}

export type DesktopConfig = {
  /** Grid cell in px, covering both the icon and its label. */
  cell: number
  /** Path to `{ column, row }` for anything the user has dragged. */
  layout: Record<string, { column: number; row: number }>
  /** Global hotkey for the launcher. */
  hotkey: string
  /** How dark the layer paints over the wallpaper; 0 leaves it untouched. */
  dim: number
}

export const defaultDesktop: DesktopConfig = {
  cell: 92,
  layout: {},
  hotkey: 'Alt+Space',
  dim: 0,
}

const desktopStore = createStore<DesktopConfig>('desktime.desktop', defaultDesktop)
export const readDesktop = desktopStore.read
export const updateDesktop = desktopStore.update
export const subscribeDesktop = desktopStore.subscribe
export const desktopSnapshot = desktopStore.snapshot

export async function fetchDesktopEntries(): Promise<ShellEntry[]> {
  if (!isTauri) return []
  return invoke<ShellEntry[]>('desktop_entries').catch(() => [])
}

export async function fetchLauncherIndex(): Promise<ShellEntry[]> {
  if (!isTauri) return []
  return invoke<ShellEntry[]>('launcher_index').catch(() => [])
}

export async function launchPath(path: string) {
  if (!isTauri) return
  await invoke('launch_path', { path }).catch(() => undefined)
}

/**
 * Auto-fills column by column, the way the shell does, skipping cells the user
 * has claimed by dragging something into them.
 */
export function placeEntries(
  entries: ShellEntry[],
  layout: DesktopConfig['layout'],
  rows: number,
) {
  const taken = new Set(
    entries
      .filter((entry) => layout[entry.path])
      .map((entry) => `${layout[entry.path].column},${layout[entry.path].row}`),
  )

  let cursor = 0
  return entries.map((entry) => {
    const fixed = layout[entry.path]
    if (fixed) return { entry, ...fixed }

    let column = Math.floor(cursor / rows)
    let row = cursor % rows
    while (taken.has(`${column},${row}`)) {
      cursor += 1
      column = Math.floor(cursor / rows)
      row = cursor % rows
    }
    cursor += 1
    return { entry, column, row }
  })
}
