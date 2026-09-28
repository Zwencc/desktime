// The desktop layer.
//
// A full-screen always-on-bottom window that sinks behind every other app, so it
// reads as part of the wallpaper. Because it covers the real desktop icons, it
// draws them itself — same icons, same names, and positions the user can drag,
// which is the trade that makes covering the desktop acceptable at all.

import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  PhysicalPosition,
  PhysicalSize,
  currentMonitor,
  getCurrentWindow,
  primaryMonitor,
} from '@tauri-apps/api/window'
import {
  type ShellEntry,
  desktopSnapshot,
  fetchDesktopEntries,
  launchPath,
  placeEntries,
  readDesktop,
  subscribeDesktop,
  updateDesktop,
} from './desktop'
import { useLocale } from './locales'


/**
 * How often the desktop folder is re-read. A directory listing is cheap, and it
 * replaces a `ReadDirectoryChangesW` watcher whose only advantage here would be
 * noticing a new shortcut a few seconds sooner.
 */
const RESCAN_MS = 30_000

/** Room the label needs under the icon, and the padding around the whole grid. */
const LABEL_HEIGHT = 30
const EDGE = 16

export function DesktopPanel() {
  const text = useLocale().desktopPanel
  useSyncExternalStore(subscribeDesktop, desktopSnapshot)
  const config = readDesktop()
  const [entries, setEntries] = useState<ShellEntry[]>([])
  const [rows, setRows] = useState(() => Math.max(1, Math.floor(window.innerHeight / 92)))

  // Self-managed geometry: fill the monitor. The registry marks this widget
  // `selfManaged`, so the shell neither sizes it nor stores what it does here.
  useEffect(() => {
    async function fill() {
      const monitor = (await currentMonitor()) ?? (await primaryMonitor())
      if (!monitor) return

      const appWindow = getCurrentWindow()
      await appWindow.setPosition(
        new PhysicalPosition(monitor.position.x, monitor.position.y),
      )
      await appWindow.setSize(new PhysicalSize(monitor.size.width, monitor.size.height))
    }

    void fill()
  }, [])

  useEffect(() => {
    let live = true
    function scan() {
      void fetchDesktopEntries().then((next) => {
        if (live) setEntries(next)
      })
    }

    scan()
    const timer = window.setInterval(scan, RESCAN_MS)
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [])

  // The window is sized to the monitor by the shell, so the row count follows the
  // viewport rather than any stored geometry.
  useEffect(() => {
    function measure() {
      setRows(Math.max(1, Math.floor((window.innerHeight - EDGE * 2) / config.cell)))
    }

    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [config.cell])

  function drop(event: React.DragEvent, path: string) {
    event.preventDefault()
    const column = Math.max(0, Math.floor((event.clientX - EDGE) / config.cell))
    const row = Math.max(0, Math.floor((event.clientY - EDGE) / config.cell))
    updateDesktop({ layout: { ...config.layout, [path]: { column, row } } })
  }

  const placed = placeEntries(entries, config.layout, rows)

  return (
    <div
      className="desktop-layer"
      style={{ background: config.dim ? `rgba(0, 0, 0, ${config.dim})` : 'transparent' }}
      onDragOver={(event) => event.preventDefault()}
    >
      {placed.length === 0 && <p className="desktop-empty">{text.empty}</p>}
      {placed.map(({ entry, column, row }) => (
        <button
          key={entry.path}
          type="button"
          className="desktop-icon"
          title={entry.path}
          draggable
          style={{
            left: EDGE + column * config.cell,
            top: EDGE + row * config.cell,
            width: config.cell,
            height: config.cell,
          }}
          onDragStart={(event) => event.dataTransfer.setData('text/plain', entry.path)}
          onDragEnd={(event) => drop(event, entry.path)}
          onDoubleClick={() => void launchPath(entry.path)}
        >
          {entry.icon ? (
            <img src={entry.icon} alt="" draggable={false} />
          ) : (
            <span className="desktop-icon-fallback">{entry.directory ? '📁' : '📄'}</span>
          )}
          <span className="desktop-label" style={{ maxHeight: LABEL_HEIGHT }}>
            {entry.name}
          </span>
        </button>
      ))}
    </div>
  )
}

export default DesktopPanel
