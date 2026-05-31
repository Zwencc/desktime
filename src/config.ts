// Config persistence: the disk is the truth, localStorage is a cache of it.
//
// localStorage lives in WebView2's user-data folder, which a browser-data
// clean-up, a WebView2 reinstall or a full 5MB quota can each take away without
// saying so. So every `desktime.*` value is mirrored to a file next to the
// executable, and read back from there at startup.
//
// **No call site changes.** `localStorage.setItem` is wrapped once, here, rather
// than every one of the twenty-five places that write a setting being taught to
// persist as well — those places stay synchronous, and stay unaware.
//
// The cost of that wrapping is paid in three places, and each one matters:
//
//   - *Serialisation*: none. The string handed to `setItem` was already built
//     for localStorage; it goes to disk as-is and is never parsed on the way.
//   - *IPC*: batched behind a debounce. Dragging a widget writes its position on
//     every frame of the drag; those become one call.
//   - *The disk itself*: never on this thread. `invoke` is asynchronous and the
//     write happens in the backend, so the JS thread is never blocked by it.

import { invoke } from '@tauri-apps/api/core'
import { isTauri } from './env'
import { locale } from './locales'
import { notify } from './notify'

const PREFIX = 'desktime.'

/** At most this long between a change and the file, however many changes land. */
const FLUSH_MS = 250


/**
 * Keys that are cross-window message channels, not settings.
 *
 * They are written on every right click or every hotkey registration and read
 * once by whichever window is listening. Putting them on disk would be noise,
 * and reading one back at the next start would be worse than noise:
 * `shortcuts.recording` restored as `true` would leave every global shortcut
 * unregistered for the whole run, and a stale `menuAction` would have a widget
 * act on a menu click from a previous session.
 */
const TRANSIENT = new Set([
  'desktime.menuRequest',
  'desktime.menuAction',
  'desktime.reminderAction',
  'desktime.shortcuts.recording',
  'desktime.shortcuts.failed',
])

/** Draft bodies. Only ever written by the browser prototype, and possibly huge. */
const DRAFT_FALLBACK = 'desktime.notebook.draft.'

function persistable(key: string) {
  return key.startsWith(PREFIX) && !TRANSIENT.has(key) && !key.startsWith(DRAFT_FALLBACK)
}

type ConfigEntry = { key: string; value: string | null }

/** Where the file is, for the failure notice and the "关于" page. */
let configPath = ''

/** Reported once per run: a directory that cannot be written stays that way. */
let reported = false

function reportFailure(reason: unknown) {
  if (reported) return
  reported = true
  void notify(locale().about.configFailed, locale().about.configFailedBody(configPath, String(reason)))
}

const pending = new Map<string, string | null>()
let timer = 0

async function send(entries: ConfigEntry[]) {
  try {
    await invoke('write_config', { entries })
  } catch (error) {
    reportFailure(error)
  }
}

async function flush() {
  timer = 0
  if (pending.size === 0) return

  const entries = [...pending].map(([key, value]) => ({ key, value }))
  pending.clear()
  await send(entries)
}

function queue(key: string, value: string | null) {
  pending.set(key, value)
  // Deliberately not restarted on each write: the timer means "at most this
  // long until disk", so a drag firing every frame still produces one call
  // rather than pushing the write out until the drag ends.
  if (timer) return
  timer = window.setTimeout(() => void flush(), FLUSH_MS)
}

/** Everything localStorage currently holds that belongs on disk. */
function everything(): ConfigEntry[] {
  const entries: ConfigEntry[] = []
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (key && persistable(key)) entries.push({ key, value: localStorage.getItem(key) })
  }
  return entries
}

/**
 * Brings localStorage in line with the file. Must run before anything reads a
 * setting, and before {@link installConfigPersistence} — the writes below are
 * the file's own values, and echoing them straight back would be pointless.
 *
 * An empty file means this is the first run after config moved to disk, and the
 * migration goes the other way: what is already in localStorage *is* the config.
 *
 * Keys in localStorage that the file does not mention are left alone rather than
 * cleared. A file that is truncated or partly lost would otherwise take the
 * still-good cached copy down with it, which is the failure this module exists
 * to prevent, not to cause.
 */
export async function hydrateConfig() {
  if (!isTauri) return

  let snapshot: { path: string; values: Record<string, string> }
  try {
    snapshot = await invoke('read_config')
  } catch (error) {
    reportFailure(error)
    return
  }

  configPath = snapshot.path

  const keys = Object.keys(snapshot.values)
  if (keys.length === 0) {
    await send(everything())
    return
  }

  keys.forEach((key) => localStorage.setItem(key, snapshot.values[key]))
}

/** Wraps `localStorage` so every later write reaches the file too. */
export function installConfigPersistence() {
  if (!isTauri) return

  // Bound off the instance rather than patching `Storage.prototype`, which
  // sessionStorage shares.
  const setItem = localStorage.setItem.bind(localStorage)
  const removeItem = localStorage.removeItem.bind(localStorage)

  localStorage.setItem = (key: string, value: string) => {
    setItem(key, value)
    if (persistable(key)) queue(key, value)
  }

  localStorage.removeItem = (key: string) => {
    removeItem(key)
    if (persistable(key)) queue(key, null)
  }

  // A window is usually closed from somewhere other than itself, so losing
  // focus is the last moment this window reliably gets.
  window.addEventListener('blur', () => void flush())
}

/**
 * Writes anything still queued, now.
 *
 * `installConfigPersistence` flushes on blur, which covers a window being
 * switched away from — but destroying a window is not a blur, and a setting
 * changed in the last 250ms before it goes would be lost with it.
 */
export async function flushConfig() {
  await flush()
}

/** The config file's path, for the "关于" page. */
export function configLocation() {
  return configPath
}
