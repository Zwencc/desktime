import { useEffect, useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { useRef } from 'react'
import { getCurrentWindow, PhysicalPosition, PhysicalSize, Window } from '@tauri-apps/api/window'
import { GripHorizontal, Pin, PinOff, Settings } from 'lucide-react'
import { appTimeZone, subscribeTimeZone } from './time'
import { type WidgetKey, isWidgetKey, widgetKeys, widgetOf } from './widgets'
import {
  type MenuAction,
  MENU_ACTION_KEY,
  applyPanelPin,
  applyPanelVisibility,
  pinnedKey,
  resetPanelPosition,
  readAllPinnedStates,
  readAllVisibleStates,
  readSavedPosition,
  readSavedSize,
  requestContextMenu,
  savePinnedState,
  saveVisibleState,
  saveWindowPosition,
  saveWindowSize,
  visibleKey,
} from './panels'
import './App.css'

type PanelState = Record<WidgetKey, boolean>

const text = {
  add: '\u6dfb\u52a0',
  currentWindowReset: '\u91cd\u7f6e\u5f53\u524d\u7a97\u53e3\u4f4d\u7f6e',
  delete: '\u5220\u9664',
  done: '\u6807\u8bb0\u5b8c\u6210',
  newSchedule: '\u65b0\u65e5\u7a0b',
  pin: '\u9489\u5728\u4e0a\u5c42',
  pinTop: '\u9489\u5728\u6700\u4e0a\u5c42',
  resize: '\u62d6\u62fd\u8c03\u6574\u5927\u5c0f',
  settings: '\u8bbe\u7f6e',
  show: '\u663e\u793a',
  todayReview: '\u6574\u7406\u4eca\u5929\u7684\u91cd\u70b9',
  unpinTop: '\u53d6\u6d88\u9489\u5728\u6700\u4e0a\u5c42',
  undone: '\u6807\u8bb0\u672a\u5b8c\u6210',
}

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

function readCurrentPanel(): WidgetKey {
  const panel = new URLSearchParams(window.location.search).get('panel')
  return isWidgetKey(panel) ? panel : 'clock'
}

// The settings window is app-driven and stays out of the native VisibilityPolicy
// registry, so it must be shown through the plain window API — `set_window_visibility`
// would fail with WindowNotFound for an unregistered label.
async function openSettingsWindow() {
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
  const panel = readCurrentPanel()
  const [pinnedStates, setPinnedStates] = useState<PanelState>(readAllPinnedStates)
  const [visibleStates, setVisibleStates] = useState<PanelState>(readAllVisibleStates)
  const menuActionRef = useRef<(action: MenuAction) => void>(() => {})
  // A widget title may depend on the zone (the clock names it), so re-render
  // when the setting changes.
  useSyncExternalStore(subscribeTimeZone, appTimeZone)

  const widget = widgetOf(panel)
  const pinned = pinnedStates[panel]
  const canResize = widget.resizable
  const visibleCount = Object.values(visibleStates).filter(Boolean).length

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

  useEffect(() => {
    const appWindow = getCurrentWindow()
    const savedPosition = readSavedPosition(panel)
    const savedSize = readSavedSize(panel)
    const cleanups: Array<() => void> = []

    if (savedPosition) {
      void appWindow.setPosition(new PhysicalPosition(savedPosition.x, savedPosition.y))
    }
    if (savedSize && canResize) {
      void appWindow.setSize(new PhysicalSize(savedSize.width, savedSize.height))
    }

    void appWindow.onMoved(({ payload }) => {
      saveWindowPosition(panel, { x: payload.x, y: payload.y })
    }).then((cleanup) => {
      cleanups.push(cleanup)
    })

    void appWindow.onResized(({ payload }) => {
      saveWindowSize(panel, { width: payload.width, height: payload.height })
    }).then((cleanup) => {
      cleanups.push(cleanup)
    })

    return () => {
      cleanups.forEach((cleanup) => cleanup())
    }
  }, [panel, canResize])

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
    if (!nextVisible && visibleStates[targetPanel] && visibleCount <= 1) return

    setVisibleStates((current) => ({
      ...current,
      [targetPanel]: nextVisible,
    }))
    saveVisibleState(targetPanel, nextVisible)
    void applyPanelVisibility(targetPanel, nextVisible)
  }

  function toggleCurrentPinned() {
    setPanelPinned(panel, !pinnedStates[panel])
  }

  function showContextMenu(event: MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement | null
    if (target?.closest(editableContextSelector)) return

    event.preventDefault()
    event.stopPropagation()

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
        title={text.settings}
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
  const title = widget.title ? widget.title() : widget.name

  return renderShell(
    <section className={`floating-panel ${panel}-panel`} aria-label={title}>
      <div className="panel-handle" onMouseDown={startWindowDrag}>
        <GripHorizontal size={16} aria-hidden="true" />
        <WidgetIcon size={16} aria-hidden="true" />
        <span>{title}</span>
        {renderPinButton()}
        {renderSettingsButton()}
      </div>
      <WidgetPanel />
    </section>,
  )
}

export default App
