// Window geometry for the moo clock's dynamic-island shape.
//
// The animation is pure CSS: the capsule itself grows into the card, and the
// window only has to be large enough to contain it. That split is what keeps it
// smooth — an IPC round-trip per frame would never hold 60fps, and resizing the
// window in one step while the content eased over 200ms read as two separate
// jerks rather than one movement.
//
// So the window is a fixed-width transparent strip pinned to the top of the
// monitor, and only its *height* changes, once at each end of the animation:
//
//   opening  – grow the window immediately (fire and forget), start the CSS at
//              the same time. The extra room is transparent, so it is invisible
//              until the capsule expands into it a few frames later.
//   closing  – run the CSS first, shrink the window once it has finished.
//
// The width never changes, which is the reason there is no setPosition in the
// hot path: a window whose x and width both move needs two calls that are not
// applied atomically, and the capsule visibly jumps between them.
//
// **Heights are measured, never declared.** They used to be constants here that
// had to equal numbers in App.css, and the two drifted every time the card
// gained a row. Worse, the shell's own box was assumed rather than read — the
// bare panel still carried `.moo-panel`'s padding, so the card was always 26px
// taller than the window it was sized to fill and `overflow: hidden` cropped the
// difference. MooPanel now measures the card *and* the shell around it and
// passes the finished window height in; nothing here has a size to get wrong.

import {
  LogicalSize,
  PhysicalPosition,
  PhysicalSize,
  currentMonitor,
  getCurrentWindow,
  primaryMonitor,
} from '@tauri-apps/api/window'
import { readSavedPosition, readSavedSize, resolveDefaultPosition } from './panels'

export const ISLAND_WIDTH = 452

/** Gap between the top of the screen and the capsule. */
const TOP_MARGIN = 6

/**
 * The collapsed strip's geometry in physical pixels, remembered for the backend.
 *
 * The island's real geometry is not known until the card has been measured,
 * which is several frames after the window is on screen — so its first frame
 * used to be the floating window from tauri.conf.json, 340×420 in a corner,
 * which then jumped to a strip at the top of the screen. Every launch read as
 * the widget appearing wrong and correcting itself.
 *
 * Storing the finished geometry lets `startup::restore_geometry` place the
 * window before it is ever shown. Measurement still runs and still wins; it just
 * no longer has an audience. Only the *collapsed* height is kept, because that
 * is the shape a launch starts in.
 */
const GEOMETRY_KEY = 'desktime.island.geometry'

type IslandGeometry = { x: number; y: number; width: number; height: number }

function readGeometry(): IslandGeometry | null {
  try {
    const raw = localStorage.getItem(GEOMETRY_KEY)
    return raw ? (JSON.parse(raw) as IslandGeometry) : null
  } catch {
    return null
  }
}

function saveGeometry(geometry: IslandGeometry) {
  localStorage.setItem(GEOMETRY_KEY, JSON.stringify(geometry))
}

/**
 * Both match the `moo` window in tauri.conf.json. The size is needed the first
 * time the widget leaves the island without ever having been resized as a
 * floating window; the minimum is needed because the island is far smaller than
 * a widget has any business being, so the constraint is lifted while it is in
 * that shape and put back on the way out.
 */
const FLOAT_FALLBACK_SIZE = { width: 340, height: 420 }
const FLOAT_MIN_SIZE = { width: 300, height: 300 }

/**
 * Scale factor of the monitor the island sits on. Resolved once on entering the
 * island so that opening it costs no IPC beyond the resize itself — a monitor
 * query in front of every hover was a large part of what made it feel sluggish.
 */
let scaleCache = 1

function physical(height: number) {
  return new PhysicalSize(
    Math.round(ISLAND_WIDTH * scaleCache),
    // Rounded *up*: on a fractional scale factor a rounded-down window is a
    // fraction of a pixel shorter than the card it has to hold, and the panel's
    // `overflow: hidden` crops that fraction off the bottom edge.
    Math.ceil(height * scaleCache),
  )
}

/** Places the strip and returns it collapsed. Call once, on entering the shape. */
export async function enterIsland(collapsedHeight: number) {
  const appWindow = getCurrentWindow()
  // `currentMonitor` is null while the window is hidden, which it is whenever
  // the moo clock is switched off.
  const monitor = (await currentMonitor()) ?? (await primaryMonitor())
  if (!monitor) return

  scaleCache = monitor.scaleFactor
  const width = Math.round(ISLAND_WIDTH * scaleCache)
  const x = monitor.position.x + Math.round((monitor.size.width - width) / 2)
  const y = monitor.position.y + Math.round(TOP_MARGIN * scaleCache)

  // The configured minimum is taller than the whole capsule, and a minimum the
  // window cannot satisfy is silently clamped — which leaves an invisible strip
  // across the top of the screen swallowing clicks.
  await appWindow.setMinSize(null)
  await appWindow.setPosition(new PhysicalPosition(x, y))

  const size = physical(collapsedHeight)
  await appWindow.setSize(size)
  saveGeometry({ x, y, width: size.width, height: size.height })
}

/**
 * The only call in the hot path: one resize, no await at the call site.
 * `height` is the whole window, `ISLAND_PAD` included.
 *
 * `collapsed` marks the resize that returns the strip to its resting shape, and
 * only that one updates the stored height — a launch always starts collapsed, so
 * remembering an open card would put the window back a card taller than it needs.
 */
export function setIslandHeight(height: number, collapsed = false) {
  const size = physical(height)
  if (collapsed) {
    const stored = readGeometry()
    if (stored) saveGeometry({ ...stored, height: size.height })
  }
  return getCurrentWindow().setSize(size)
}

/**
 * Puts the window back where the floating shape left it. The island moved and
 * resized the window without saving anything, so the stored values are still the
 * floating ones.
 */
export async function restoreFloatingGeometry() {
  const appWindow = getCurrentWindow()
  const size = readSavedSize('moo') ?? FLOAT_FALLBACK_SIZE

  // Restored before the resize, or the minimum would clamp a window that is
  // still the width of the strip.
  await appWindow.setMinSize(new LogicalSize(FLOAT_MIN_SIZE.width, FLOAT_MIN_SIZE.height))
  await appWindow.setSize(new PhysicalSize(size.width, size.height))

  // Resolved after the resize: the registry's default is a corner plus a margin,
  // so it depends on the size the window is going back to, not the strip's.
  const position = readSavedPosition('moo') ?? (await resolveDefaultPosition('moo'))
  if (position) await appWindow.setPosition(new PhysicalPosition(position.x, position.y))
}
