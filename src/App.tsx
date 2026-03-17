import { useEffect, useState } from 'react'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Menu, type MenuOptions } from '@tauri-apps/api/menu'
import { getCurrentWindow, PhysicalPosition, Window } from '@tauri-apps/api/window'
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
import './App.css'

type PanelKey = 'clock' | 'note' | 'schedule'

type SavedPosition = {
  x: number
  y: number
}

type PanelState = Record<PanelKey, boolean>

const NOTE_KEY = 'desktime.note'
const PINNED_KEY_PREFIX = 'desktime.pinned.'
const VISIBLE_KEY_PREFIX = 'desktime.visible.'
const WINDOW_POSITION_KEY_PREFIX = 'desktime.windowPosition.'

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
  schedule: '\u65e5\u7a0b',
  schedulePanel: '\u684c\u9762\u65e5\u7a0b',
  show: '\u663e\u793a',
  todayReview: '\u6574\u7406\u4eca\u5929\u7684\u91cd\u70b9',
  unpinTop: '\u53d6\u6d88\u9489\u5728\u6700\u4e0a\u5c42',
  undone: '\u6807\u8bb0\u672a\u5b8c\u6210',
}

const panels: PanelKey[] = ['clock', 'note', 'schedule']
const panelNames: Record<PanelKey, string> = {
  clock: text.beijingTime,
  note: text.note,
  schedule: text.schedule,
}

const defaultPositions: Record<PanelKey, SavedPosition> = {
  clock: { x: 80, y: 80 },
  note: { x: 80, y: 270 },
  schedule: { x: 430, y: 80 },
}

const validPanels = new Set<PanelKey>(panels)

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

function pinnedKey(panel: PanelKey) {
  return `${PINNED_KEY_PREFIX}${panel}`
}

function visibleKey(panel: PanelKey) {
  return `${VISIBLE_KEY_PREFIX}${panel}`
}

function readSavedPosition(panel: PanelKey) {
  try {
    const value = localStorage.getItem(`${WINDOW_POSITION_KEY_PREFIX}${panel}`)
    return value ? (JSON.parse(value) as SavedPosition) : null
  } catch {
    return null
  }
}

function saveWindowPosition(panel: PanelKey, position: SavedPosition) {
  localStorage.setItem(`${WINDOW_POSITION_KEY_PREFIX}${panel}`, JSON.stringify(position))
}

function readPinnedState(panel: PanelKey) {
  const panelValue = localStorage.getItem(pinnedKey(panel))
  const legacyValue = localStorage.getItem('desktime.pinned')

  return (panelValue ?? legacyValue) !== 'false'
}

function readVisibleState(panel: PanelKey) {
  return localStorage.getItem(visibleKey(panel)) !== 'false'
}

function readAllPinnedStates(): PanelState {
  return {
    clock: readPinnedState('clock'),
    note: readPinnedState('note'),
    schedule: readPinnedState('schedule'),
  }
}

function readAllVisibleStates(): PanelState {
  return {
    clock: readVisibleState('clock'),
    note: readVisibleState('note'),
    schedule: readVisibleState('schedule'),
  }
}

function savePinnedState(panel: PanelKey, pinned: boolean) {
  localStorage.setItem(pinnedKey(panel), String(pinned))
}

function saveVisibleState(panel: PanelKey, visible: boolean) {
  localStorage.setItem(visibleKey(panel), String(visible))
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

function App() {
  const panel = readCurrentPanel()
  const [pinnedStates, setPinnedStates] = useState<PanelState>(readAllPinnedStates)
  const [visibleStates, setVisibleStates] = useState<PanelState>(readAllVisibleStates)
  const [note, setNote] = useState(() => localStorage.getItem(NOTE_KEY) ?? '')
  const contextMenuOpen = useRef(false)

  const pinned = pinnedStates[panel]
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
    let unlisten: (() => void) | undefined

    if (savedPosition) {
      void appWindow.setPosition(new PhysicalPosition(savedPosition.x, savedPosition.y))
    }

    void appWindow.onMoved(({ payload }) => {
      saveWindowPosition(panel, { x: payload.x, y: payload.y })
    }).then((cleanup) => {
      unlisten = cleanup
    })

    return () => {
      unlisten?.()
    }
  }, [panel])

  useEffect(() => {
    localStorage.setItem(NOTE_KEY, note)
  }, [note])

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

  async function showContextMenu(event: MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement | null
    if (target?.closest(editableContextSelector)) return

    event.preventDefault()
    event.stopPropagation()
    if (contextMenuOpen.current) return
    contextMenuOpen.current = true

    const items: NonNullable<MenuOptions['items']> = []

    panels.forEach((targetPanel, index) => {
      const hideDisabled = visibleStates[targetPanel] && visibleCount <= 1

      items.push(
        {
          id: `panel-title-${targetPanel}`,
          text: panelNames[targetPanel],
          enabled: false,
        },
        {
          id: `pin-${targetPanel}`,
          text: text.pin,
          checked: pinnedStates[targetPanel],
          action: () => setPanelPinned(targetPanel, !pinnedStates[targetPanel]),
        },
        {
          id: `visible-${targetPanel}`,
          text: text.show,
          checked: visibleStates[targetPanel],
          enabled: !hideDisabled,
          action: () => setPanelVisible(targetPanel, !visibleStates[targetPanel]),
        },
      )

      if (index < panels.length - 1) items.push({ item: 'Separator' })
    })

    items.push(
      { item: 'Separator' },
      {
        id: `reset-position-${panel}`,
        text: text.currentWindowReset,
        action: resetCurrentPosition,
      },
    )

    let contextMenu: Menu | null = null
    try {
      contextMenu = await Menu.new({ items })
      await contextMenu.popup(undefined, getCurrentWindow())
    } catch (error) {
      console.error('Failed to show native context menu', error)
    } finally {
      if (contextMenu) {
        await contextMenu.close().catch((error) => {
          console.error('Failed to release native context menu', error)
        })
      }
      contextMenuOpen.current = false
    }
  }

  function resetCurrentPosition() {
    const position = defaultPositions[panel]

    saveWindowPosition(panel, position)
    void getCurrentWindow().setPosition(new PhysicalPosition(position.x, position.y))
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
      </main>
    )
  }

  if (panel === 'clock') {
    return renderShell(
      <section
        className="floating-panel clock-panel"
        aria-label={text.beijingTime}
        onMouseDown={startWindowDrag}
      >
        <div className="panel-handle">
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
        onMouseDown={startWindowDrag}
      >
        <div className="panel-handle">
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
      onMouseDown={startWindowDrag}
    >
      <div className="panel-handle">
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
