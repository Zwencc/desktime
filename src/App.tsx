import { Suspense, useEffect, useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { useRef } from 'react'
import { getCurrentWindow, PhysicalPosition, PhysicalSize, Window } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { GripHorizontal, Pin, PinOff, Settings } from 'lucide-react'
import { settingsSnapshot, subscribeSettings } from './settings'
import { desktopSnapshot, subscribeDesktop } from './desktop'
import { isTauri } from './env'
import {
  type ShortcutStateChange,
  allBindings,
  runShortcut,
  shortcutRecordingStore,
  shortcutStore,
  syncShortcuts,
} from './shortcuts'
import { appTimeZone, subscribeTimeZone } from './time'
import { useLocale } from './locales'
import { type WidgetKey, isWidgetKey, widgetKeys, widgetName, widgetOf } from './widgets'
import {
  type MenuAction,
  MENU_ACTION_KEY,
  applyPanelPin,
  applyPanelVisibility,
  pinnedKey,
  resetPanelPosition,
  readAllPinnedStates,
  readAllVisibleStates,
  readPinnedState,
  readSavedPosition,
  readSavedSize,
  readVisibleState,
  requestContextMenu,
  requestVisibility,
  resolveDefaultPosition,
  savePinnedState,
  saveWindowPosition,
  saveWindowSize,
  visibleKey,
} from './panels'
import './App.css'

type PanelState = Record<WidgetKey, boolean>

// Monotonic-per-launch nonce so repeated right-clicks at the same spot still
// change the stored request value and fire the cross-window storage event.
let menuNonce = Date.now()
function nextMenuNonce() {
  menuNonce += 1
  return menuNonce
}

const nonDragSelector = [
  'button',
  'input',
  'textarea',
  'select',
  'a',
  '[role="button"]',
  '[data-no-drag]',
].join(',')

// `[data-own-context]` marks regions that show their own in-page menu (the
// notebook sidebar); the global widget menu must not fire on top of them.
const editableContextSelector =
  'input, textarea, select, [contenteditable="true"], [data-own-context]'

// Esc unpins the window, but only as a last resort: inside a field or the note
// editor it means "leave what I am editing", and while a widget has an overlay
// open it means "close this". The overlay is looked for anywhere in the document
// rather than along the event's path, because an overlay owns Esc even when the
// focus has drifted off it — and because that check does not depend on which
// listener the browser happens to call first.
const escapeEditingSelector = 'input, textarea, select, [contenteditable="true"]'
const escapeOwnerSelector = '[data-escape-owner]'

/**
 * The window that speaks to the backend about shortcuts.
 *
 * Registration and execution are both the backend's now (see shortcuts.rs), so
 * what is left here is handing over the table and taking back what changed —
 * and exactly one window may do either, or one key press would sync the table
 * once per open widget. It has to be a window that exists for the whole run
 * whatever the user does: every widget window is created at startup and merely
 * hidden when switched off, so the first one in the registry is a stable
 * choice — and an arbitrary one, which is why it is read from the registry
 * rather than spelled.
 */
const SHORTCUT_HOST = widgetKeys[0]

function readCurrentPanel(): WidgetKey {
  const panel = new URLSearchParams(window.location.search).get('panel')
  return isWidgetKey(panel) ? panel : 'clock'
}

// The settings window is app-driven and stays out of the native VisibilityPolicy
// registry, so it must be shown through the plain window API — `set_window_visibility`
// would fail with WindowNotFound for an unregistered label.
async function openSettingsWindow() {
  // Built on demand: app-driven windows are no longer created at startup, so
  // for the first couple of seconds of a run this one does not exist yet.
  await invoke('ensure_window', { label: 'settings' }).catch(() => undefined)

  const target = await Window.getByLabel('settings')
  if (!target) return

  await target.show()
  await target.setFocus()
}

function isCtrlD(event: Pick<globalThis.KeyboardEvent, 'ctrlKey' | 'key'>) {
  return event.ctrlKey && event.key.toLowerCase() === 'd'
}

function startWindowDrag(event: MouseEvent<HTMLElement>) {
  if (event.button !== 0) return

  const target = event.target as HTMLElement | null
  if (target?.closest(nonDragSelector)) return

  void getCurrentWindow().startDragging()
}

function startWindowResize(event: MouseEvent<HTMLElement>) {
  if (event.button !== 0) return

  event.preventDefault()
  event.stopPropagation()
  void getCurrentWindow().startResizeDragging('SouthEast')
}

function App() {
  const strings = useLocale()
  const text = strings.widgetShell
  const panel = readCurrentPanel()
  const [pinnedStates, setPinnedStates] = useState<PanelState>(readAllPinnedStates)
  const [visibleStates, setVisibleStates] = useState<PanelState>(readAllVisibleStates)
  const menuActionRef = useRef<(action: MenuAction) => void>(() => {})
  // A widget title may depend on the zone (the clock names it), so re-render
  // when the setting changes.
  useSyncExternalStore(subscribeTimeZone, appTimeZone)
  // …and `selfManaged` reads a setting too, so re-render on any settings change.
  useSyncExternalStore(subscribeSettings, settingsSnapshot)

  const widget = widgetOf(panel)
  const pinned = pinnedStates[panel]
  const selfManaged = widget.selfManaged?.() ?? false
  const canResize = widget.resizable && !selfManaged

  useEffect(() => {
    function blockCtrlD(event: globalThis.KeyboardEvent) {
      if (!isCtrlD(event)) return

      event.preventDefault()
      event.stopImmediatePropagation()
      event.stopPropagation()
    }

    window.addEventListener('keydown', blockCtrlD, true)
    window.addEventListener('keypress', blockCtrlD, true)
    window.addEventListener('keyup', blockCtrlD, true)

    return () => {
      window.removeEventListener('keydown', blockCtrlD, true)
      window.removeEventListener('keypress', blockCtrlD, true)
      window.removeEventListener('keyup', blockCtrlD, true)
    }
  }, [])

  useEffect(() => {
    void applyPanelPin(panel, pinnedStates[panel])
    savePinnedState(panel, pinnedStates[panel])
  }, [panel, pinnedStates])

  // Unpinning is written into state only; the effect above is what persists it
  // and pushes the window to the bottom of the Z-order.
  useEffect(() => {
    function onEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return

      const target = event.target as HTMLElement | null
      if (target?.closest(escapeEditingSelector)) return
      if (document.querySelector(escapeOwnerSelector)) return

      setPinnedStates((current) => (current[panel] ? { ...current, [panel]: false } : current))
    }

    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [panel])

  useEffect(() => {
    function syncPanelState(event: StorageEvent) {
      const pinnedPanel = widgetKeys.find((item) => event.key === pinnedKey(item))
      if (pinnedPanel) {
        setPinnedStates((current) => ({
          ...current,
          [pinnedPanel]: event.newValue !== 'false',
        }))
        return
      }

      const visiblePanel = widgetKeys.find((item) => event.key === visibleKey(item))
      if (visiblePanel) {
        setVisibleStates((current) => ({
          ...current,
          [visiblePanel]: event.newValue !== 'false',
        }))
      }
    }

    window.addEventListener('storage', syncPanelState)
    return () => window.removeEventListener('storage', syncPanelState)
  }, [])

  // Everything that moves the window happens here, and *then* it is shown.
  //
  // Widget windows are created hidden in tauri.conf.json precisely so that order
  // is possible: a window created on screen sits at the config's coordinates for
  // as long as it takes WebView2 to load and React to mount, and then jumps —
  // visibly, on every launch.
  //
  // Three things have to be settled before the window appears, and each used to
  // be able to land after it:
  //
  //   *geometry* — `startup::restore_geometry` applies it in the backend before
  //     any effect can run, and normally has already done so by now. It is
  //     re-checked rather than assumed: a config file the backend could not
  //     write is a config file it had nothing to restore from, and the window
  //     would then keep tauri.conf.json's coordinates for the whole run while
  //     localStorage quietly held the right ones. One comparison, and an IPC
  //     call only when they disagree.
  //   *the first run* — nothing stored, so the anchor has to be resolved against
  //     the work area of the monitor the window landed on. That is a question
  //     about screens rather than about config, which is why it stays here.
  //   *the pin* — this is the one that was visible. Pinning is applied by its
  //     own effect, which fires at mount like this one does, so the two raced:
  //     an unpinned widget could be shown on top and sink a frame later. It is
  //     applied here first, and that effect then re-applies the same value,
  //     which costs one idempotent call.
  useEffect(() => {
    const appWindow = getCurrentWindow()
    const cleanups: Array<() => void> = []
    let cancelled = false

    async function place() {
      // A self-managed widget is placing the window itself; restoring and then
      // re-saving geometry here would overwrite what it should come back to.
      if (!selfManaged) {
        const saved = readSavedPosition(panel)
        if (saved) {
          const current = await appWindow.outerPosition()
          if (current.x !== saved.x || current.y !== saved.y) {
            await appWindow.setPosition(new PhysicalPosition(saved.x, saved.y))
          }
        } else {
          const position = await resolveDefaultPosition(panel)
          if (position) {
            await appWindow.setPosition(new PhysicalPosition(position.x, position.y))
            // Saved explicitly rather than left to `onMoved` below, which is
            // not listening yet: without this the backend would have nothing to
            // restore and every launch would re-resolve the anchor.
            saveWindowPosition(panel, position)
          }
        }

        const savedSize = readSavedSize(panel)
        if (savedSize) {
          const current = await appWindow.innerSize()
          if (current.width !== savedSize.width || current.height !== savedSize.height) {
            await appWindow.setSize(new PhysicalSize(savedSize.width, savedSize.height))
          }
        }

        cleanups.push(
          await appWindow.onMoved(({ payload }) => {
            saveWindowPosition(panel, { x: payload.x, y: payload.y })
          }),
        )
        cleanups.push(
          await appWindow.onResized(({ payload }) => {
            saveWindowSize(panel, { width: payload.width, height: payload.height })
          }),
        )
      }

      // Before the window is shown, so an unpinned widget is already at the
      // bottom of the Z-order the first time it is drawn.
      if (!cancelled) await applyPanelPin(panel, readPinnedState(panel))

      // tauri.conf.json cannot know what the user last chose, so every window
      // reconciles itself once on mount — switching a widget off, or swapping
      // the clock for the moo clock, then survives a restart.
      //
      // A self-managed widget is left out, and reveals itself instead. It is not
      // only placing the window: it is placing it *asynchronously*, after
      // measuring its own content, and this effect does not wait for that. The
      // island was therefore shown mid-way through becoming an island — the
      // shape appeared half-open and then settled, on every launch. `revealSelf`
      // is the same call, made at the moment the shape is finished.
      if (!cancelled && !selfManaged) {
        await applyPanelVisibility(panel, readVisibleState(panel))
      }
    }

    void place()

    return () => {
      cancelled = true
      cleanups.forEach((cleanup) => cleanup())
    }
  }, [panel, selfManaged])

  // Global shortcuts: hand the table to the backend, and run what it fires.
  //
  // Only the host window does either, or one key press would run its action once
  // per open widget. Re-syncs when the user records a different key, and hands
  // everything back while the recorder is waiting — the `storage` event carries
  // both changes over from the settings window.
  const storedShortcuts = useSyncExternalStore(shortcutStore.subscribe, shortcutStore.snapshot)
  const recordingShortcut = useSyncExternalStore(
    shortcutRecordingStore.subscribe,
    shortcutRecordingStore.snapshot,
  )
  // The launcher's hotkey lives in its own store but is registered with the
  // rest, so a change there has to re-sync the table too.
  const desktopConfig = useSyncExternalStore(subscribeDesktop, desktopSnapshot)

  useEffect(() => {
    if (!isTauri || panel !== SHORTCUT_HOST) return

    const recording = shortcutRecordingStore.parse(recordingShortcut).recording
    void syncShortcuts(recording ? [] : allBindings())
  }, [panel, storedShortcuts, recordingShortcut, desktopConfig])

  // Two events, and the difference is the whole point of the change:
  //
  //   `shortcut://applied` — the backend has already shown, hidden or pinned the
  //     window, and is saying what it changed. Nothing waits for this; it only
  //     brings the webview's own copy of the state back in line. Writing to
  //     localStorage is what carries it to the other windows, whose `storage`
  //     listener above is already watching these keys.
  //   `shortcut://fire`   — the fallback, for a binding that reached the backend
  //     without a plan attached. Then the action really does happen here.
  useEffect(() => {
    if (!isTauri || panel !== SHORTCUT_HOST) return

    const stops = [
      listen<ShortcutStateChange[]>('shortcut://applied', ({ payload }) => {
        payload.forEach(({ key, value }) => localStorage.setItem(key, value))
        // Re-read rather than patched key by key: the states are derived from
        // localStorage everywhere else too, and `storage` does not fire in the
        // window that wrote the value.
        setPinnedStates(readAllPinnedStates())
        setVisibleStates(readAllVisibleStates())
      }),
      listen<string>('shortcut://fire', ({ payload }) => runShortcut(payload)),
    ]

    return () => void Promise.all(stops).then((unlisten) => unlisten.forEach((stop) => stop()))
  }, [panel])

  useEffect(() => {
    function onMenuAction(event: StorageEvent) {
      if (event.key !== MENU_ACTION_KEY || !event.newValue) return

      try {
        menuActionRef.current(JSON.parse(event.newValue) as MenuAction)
      } catch {
        // ignore malformed menu actions
      }
    }

    window.addEventListener('storage', onMenuAction)
    return () => window.removeEventListener('storage', onMenuAction)
  }, [])

  function setPanelPinned(targetPanel: WidgetKey, nextPinned: boolean) {
    setPinnedStates((current) => ({
      ...current,
      [targetPanel]: nextPinned,
    }))
    savePinnedState(targetPanel, nextPinned)
    void applyPanelPin(targetPanel, nextPinned)
  }

  function setPanelVisible(targetPanel: WidgetKey, nextVisible: boolean) {
    const next = requestVisibility(visibleStates, targetPanel, nextVisible)
    if (next) setVisibleStates(next)
  }

  function toggleCurrentPinned() {
    setPanelPinned(panel, !pinnedStates[panel])
  }

  function showContextMenu(event: MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement | null
    if (target?.closest(editableContextSelector)) return

    event.preventDefault()
    event.stopPropagation()

    // Built on demand like the other app-driven windows; it reads the request
    // below on mount, so this does not have to be awaited.
    void invoke('ensure_window', { label: 'menu' }).catch(() => undefined)

    // Use the event's screen coordinates (no IPC round-trip) and convert CSS to
    // physical pixels so the menu window can position itself at the cursor.
    const scale = window.devicePixelRatio || 1
    requestContextMenu({
      x: Math.round(event.screenX * scale),
      y: Math.round(event.screenY * scale),
      panel,
      nonce: nextMenuNonce(),
    })
  }

  function resetCurrentPosition() {
    void resetPanelPosition(panel)
  }

  menuActionRef.current = (action: MenuAction) => {
    if (action.origin !== panel) return

    if (action.type === 'pin') setPanelPinned(action.target, action.value)
    else if (action.type === 'visible') setPanelVisible(action.target, action.value)
    else resetCurrentPosition()
  }

  function renderPinButton() {
    return (
      <button
        className="icon-button pin-button"
        type="button"
        onClick={toggleCurrentPinned}
        title={pinned ? text.unpinTop : text.pinTop}
      >
        {pinned ? <Pin size={15} aria-hidden="true" /> : <PinOff size={15} aria-hidden="true" />}
      </button>
    )
  }

  function renderSettingsButton() {
    return (
      <button
        className="icon-button"
        type="button"
        onClick={() => void openSettingsWindow()}
        title={strings.settings.title}
      >
        <Settings size={15} aria-hidden="true" />
      </button>
    )
  }

  function renderShell(children: ReactNode) {
    return (
      <main
        className="widget-window"
        onContextMenu={(event) => void showContextMenu(event)}
        onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
          if (isCtrlD(event.nativeEvent)) {
            event.preventDefault()
            event.stopPropagation()
          }
        }}
      >
        {children}
        {canResize && (
          <div
            className="resize-grip"
            data-no-drag
            title={text.resize}
            onMouseDown={startWindowResize}
          />
        )}
      </main>
    )
  }

  // One render path for every widget: the registry supplies the icon, the title
  // and the body, so a new widget needs no branch here.
  const WidgetIcon = widget.icon
  const WidgetPanel = widget.Panel
  const title = widget.title ? widget.title() : widgetName(panel)

  return renderShell(
    <section
      className={`floating-panel ${panel}-panel${selfManaged ? ' bare' : ''}`}
      aria-label={title}
    >
      {!selfManaged && (
        <div className="panel-handle" onMouseDown={startWindowDrag}>
          <GripHorizontal size={16} aria-hidden="true" />
          <WidgetIcon size={16} aria-hidden="true" />
          <span>{title}</span>
          {renderPinButton()}
          {renderSettingsButton()}
        </div>
      )}
      {/* The registry hands back a lazy component; `main.tsx`'s boundary is
          above the shell, so without one here the handle would disappear
          along with the body while the chunk loads. */}
      <Suspense fallback={null}>
        <WidgetPanel />
      </Suspense>
    </section>,
  )
}

export default App
