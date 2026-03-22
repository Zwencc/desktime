import { useEffect, useState } from 'react'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow, PhysicalPosition, PhysicalSize, Window } from '@tauri-apps/api/window'
import {
  CalendarDays,
  Clock3,
  GripHorizontal,
  NotebookPen,
  Pin,
  PinOff,
  Trash2,
} from 'lucide-react'
import { ClockPanel } from './ClockPanel'
import { NoteEditor } from './NoteEditor'
import { SchedulePanel } from './SchedulePanel'
import {
  type MenuAction,
  type PanelKey,
  MENU_ACTION_KEY,
  defaultPositions,
  panels,
  pinnedKey,
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

type PanelState = Record<PanelKey, boolean>

const NOTE_KEY = 'desktime.note'

const text = {
  add: '\u6dfb\u52a0',
  beijingTime: '\u5317\u4eac\u65f6\u95f4',
  clear: '\u6e05\u7a7a',
  currentWindowReset: '\u91cd\u7f6e\u5f53\u524d\u7a97\u53e3\u4f4d\u7f6e',
  delete: '\u5220\u9664',
  done: '\u6807\u8bb0\u5b8c\u6210',
  newSchedule: '\u65b0\u65e5\u7a0b',
  note: '\u4e34\u65f6\u8bb0\u4e8b',
  noteBook: '\u4e34\u65f6\u8bb0\u4e8b\u672c',
  notePlaceholder: '\u968f\u624b\u8bb0\u70b9\u4ec0\u4e48...',
  pin: '\u9489\u5728\u4e0a\u5c42',
  pinTop: '\u9489\u5728\u6700\u4e0a\u5c42',
  resize: '\u62d6\u62fd\u8c03\u6574\u5927\u5c0f',
  schedule: '\u65e5\u7a0b',
  schedulePanel: '\u684c\u9762\u65e5\u7a0b',
  show: '\u663e\u793a',
  todayReview: '\u6574\u7406\u4eca\u5929\u7684\u91cd\u70b9',
  unpinTop: '\u53d6\u6d88\u9489\u5728\u6700\u4e0a\u5c42',
  undone: '\u6807\u8bb0\u672a\u5b8c\u6210',
}

const validPanels = new Set<PanelKey>(panels)

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

const editableContextSelector = 'input, textarea, select, [contenteditable="true"]'

function readCurrentPanel(): PanelKey {
  const panel = new URLSearchParams(window.location.search).get('panel')
  return validPanels.has(panel as PanelKey) ? (panel as PanelKey) : 'clock'
}

async function getPanelWindow(panel: PanelKey) {
  return panel === readCurrentPanel()
    ? getCurrentWindow()
    : await Window.getByLabel(panel)
}

async function applyWindowPin(panel: PanelKey, pinned: boolean) {
  const targetWindow = await getPanelWindow(panel)
  if (!targetWindow) return

  if (pinned) {
    await targetWindow.setAlwaysOnBottom(false)
    await targetWindow.setAlwaysOnTop(true)
    return
  }

  await targetWindow.setAlwaysOnTop(false)
  await targetWindow.setAlwaysOnBottom(true)
  await invoke('set_window_to_bottom', { label: panel })
}

async function applyWindowVisibility(panel: PanelKey, visible: boolean) {
  await invoke('set_window_visibility', { label: panel, visible })
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
  const [note, setNote] = useState(() => localStorage.getItem(NOTE_KEY) ?? '')
  const menuActionRef = useRef<(action: MenuAction) => void>(() => {})

  const pinned = pinnedStates[panel]
  const canResize = panel !== 'clock'
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
    void applyWindowPin(panel, pinnedStates[panel])
    savePinnedState(panel, pinnedStates[panel])
  }, [panel, pinnedStates])

  useEffect(() => {
    function syncPanelState(event: StorageEvent) {
      const pinnedPanel = panels.find((item) => event.key === pinnedKey(item))
      if (pinnedPanel) {
        setPinnedStates((current) => ({
          ...current,
          [pinnedPanel]: event.newValue !== 'false',
        }))
        return
      }

      const visiblePanel = panels.find((item) => event.key === visibleKey(item))
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
    localStorage.setItem(NOTE_KEY, note)
  }, [note])

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

  function setPanelPinned(targetPanel: PanelKey, nextPinned: boolean) {
    setPinnedStates((current) => ({
      ...current,
      [targetPanel]: nextPinned,
    }))
    savePinnedState(targetPanel, nextPinned)
    void applyWindowPin(targetPanel, nextPinned)
  }

  function setPanelVisible(targetPanel: PanelKey, nextVisible: boolean) {
    if (!nextVisible && visibleStates[targetPanel] && visibleCount <= 1) return

    setVisibleStates((current) => ({
      ...current,
      [targetPanel]: nextVisible,
    }))
    saveVisibleState(targetPanel, nextVisible)
    void applyWindowVisibility(targetPanel, nextVisible)
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
    const position = defaultPositions[panel]

    saveWindowPosition(panel, position)
    void getCurrentWindow().setPosition(new PhysicalPosition(position.x, position.y))
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

  if (panel === 'clock') {
    return renderShell(
      <section
        className="floating-panel clock-panel"
        aria-label={text.beijingTime}
      >
        <div className="panel-handle" onMouseDown={startWindowDrag}>
          <GripHorizontal size={16} aria-hidden="true" />
          <Clock3 size={16} aria-hidden="true" />
          <span>{text.beijingTime}</span>
          {renderPinButton()}
        </div>
        <ClockPanel />
      </section>,
    )
  }

  if (panel === 'note') {
    return renderShell(
      <section
        className="floating-panel note-panel"
        aria-label={text.noteBook}
      >
        <div className="panel-handle" onMouseDown={startWindowDrag}>
          <GripHorizontal size={16} aria-hidden="true" />
          <NotebookPen size={16} aria-hidden="true" />
          <span>{text.note}</span>
          {renderPinButton()}
          <button className="icon-button" type="button" onClick={() => setNote('')} title={text.clear}>
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>
        <NoteEditor value={note} onChange={setNote} placeholder={text.notePlaceholder} />
      </section>,
    )
  }

  return renderShell(
    <section
      className="floating-panel schedule-panel"
      aria-label={text.schedulePanel}
    >
      <div className="panel-handle" onMouseDown={startWindowDrag}>
        <GripHorizontal size={16} aria-hidden="true" />
        <CalendarDays size={16} aria-hidden="true" />
        <span>{text.schedule}</span>
        {renderPinButton()}
      </div>
      <SchedulePanel />
    </section>,
  )
}

export default App
