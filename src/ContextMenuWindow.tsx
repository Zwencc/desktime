import { useEffect, useRef, useState } from 'react'
import type { TransitionEvent } from 'react'
import { Check, RotateCcw } from 'lucide-react'
import {
  getCurrentWindow,
  monitorFromPoint,
  PhysicalPosition,
  PhysicalSize,
} from '@tauri-apps/api/window'
import {
  type MenuAction,
  type MenuRequest,
  MENU_REQUEST_KEY,
  readAllPinnedStates,
  readAllVisibleStates,
  sendMenuAction,
} from './panels'
import { type WidgetKey, widgetKeys, widgetName } from './widgets'
import './App.css'
import { useLocale } from './locales'


// Transparent frame (in CSS px) around the menu card so its drop shadow has
// room; must match the .context-menu-root padding in App.css.
const SHADOW_PAD = 20

let actionNonce = Date.now()
function nextActionNonce() {
  actionNonce += 1
  return actionNonce
}

type OpenState = {
  request: MenuRequest
  pinned: Record<WidgetKey, boolean>
  visible: Record<WidgetKey, boolean>
}

export function ContextMenuWindow() {
  const text = useLocale().contextMenu
  const [state, setState] = useState<OpenState | null>(null)
  const [visible, setVisible] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  // openRef is the latest intent (should the menu be shown?); tokenRef bumps on
  // every open/close so a newer request always wins over an in-flight close or a
  // stale positioning pass. This makes right-clicking straight onto another
  // widget reopen the menu in one click instead of just dismissing the old one.
  const openRef = useRef(false)
  const tokenRef = useRef(0)

  function startClose() {
    if (!openRef.current) return
    openRef.current = false
    tokenRef.current += 1
    // Let clicks pass through while the close animation plays so a right-click
    // aimed at another widget isn't swallowed by the fading, still-topmost menu.
    void getCurrentWindow().setIgnoreCursorEvents(true)
    setVisible(false)
  }

  // Pick up open requests written by any widget window.
  //
  // The stored request is read once on mount as well as listened for, because
  // this window is built on demand: the right-click that asks for it may be the
  // very thing that creates it, and that first request was written before there
  // was anything here to hear the `storage` event.
  useEffect(() => {
    function open(raw: string | null) {
      if (!raw) return

      try {
        const request = JSON.parse(raw) as MenuRequest
        openRef.current = true
        tokenRef.current += 1
        setState({
          request,
          pinned: readAllPinnedStates(),
          visible: readAllVisibleStates(),
        })
      } catch {
        // ignore malformed requests
      }
    }

    function onRequest(event: StorageEvent) {
      if (event.key !== MENU_REQUEST_KEY) return
      open(event.newValue)
    }

    // Consumed, not just read. The key is kept out of `config.json` but
    // localStorage itself survives a restart, so the last right click of the
    // previous session was still sitting here — and this window opened itself on
    // it the moment it was built, with nobody having clicked anything.
    //
    // Clearing it also costs nothing on the normal path: the request has been
    // read into `state` by then, and the removal's own `storage` event carries a
    // null value, which `open` ignores.
    const pending = localStorage.getItem(MENU_REQUEST_KEY)
    localStorage.removeItem(MENU_REQUEST_KEY)
    open(pending)

    window.addEventListener('storage', onRequest)
    return () => window.removeEventListener('storage', onRequest)
  }, [])

  // Size the window to the freshly-rendered menu, clamp it onto the monitor
  // under the cursor, then reveal it.
  useEffect(() => {
    if (!state) return

    const appWindow = getCurrentWindow()
    const token = tokenRef.current

    async function place(request: MenuRequest) {
      const el = rootRef.current
      if (!el) return

      // offsetWidth/Height is the layout box (unaffected by the scale transform
      // used for the reveal animation); getBoundingClientRect would report the
      // shrunk size and clip the menu.
      const scale = window.devicePixelRatio || 1
      const pad = Math.round(SHADOW_PAD * scale)
      const width = Math.max(1, Math.ceil(el.offsetWidth * scale))
      const height = Math.max(1, Math.ceil(el.offsetHeight * scale))
      const cardWidth = width - 2 * pad
      const cardHeight = height - 2 * pad
      if (tokenRef.current !== token) return
      await appWindow.setIgnoreCursorEvents(false)
      await appWindow.setSize(new PhysicalSize(width, height))

      // Position the visible card's top-left at the cursor; the window is padded
      // by SHADOW_PAD for the shadow, so it sits pad px further up and left.
      let cardX = request.x
      let cardY = request.y
      const monitor = await monitorFromPoint(request.x, request.y)
      if (monitor) {
        const right = monitor.position.x + monitor.size.width
        const bottom = monitor.position.y + monitor.size.height
        if (cardX + cardWidth > right) cardX = request.x - cardWidth
        if (cardY + cardHeight > bottom) cardY = request.y - cardHeight
        if (cardX < monitor.position.x) cardX = monitor.position.x
        if (cardY < monitor.position.y) cardY = monitor.position.y
      }
      if (tokenRef.current !== token) return

      await appWindow.setPosition(new PhysicalPosition(Math.round(cardX - pad), Math.round(cardY - pad)))
      await appWindow.show()
      await appWindow.setFocus()
      if (tokenRef.current !== token) return
      // Let the hidden (opacity 0) state paint once so the reveal transitions
      // in instead of snapping.
      requestAnimationFrame(() => {
        if (tokenRef.current === token) setVisible(true)
      })
    }

    void place(state.request)
  }, [state])

  // Dismiss on focus loss or Escape.
  useEffect(() => {
    const appWindow = getCurrentWindow()
    let unlisten: (() => void) | undefined

    void appWindow
      .onFocusChanged(({ payload }) => {
        if (!payload) startClose()
      })
      .then((fn) => {
        unlisten = fn
      })

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') startClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      unlisten?.()
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  function finishClose(event: TransitionEvent<HTMLDivElement>) {
    // Only the fade-out finishing while the menu should stay closed hides it; if
    // a new request reopened in the meantime, openRef is true and we keep it.
    // (Menu stays mounted, just hidden, so reopening skips a full rebuild.)
    if (event.propertyName !== 'opacity' || openRef.current) return

    void getCurrentWindow().hide()
  }

  function runAction(action: MenuAction) {
    sendMenuAction(action)
    startClose()
  }

  if (!state) return null

  const { request, pinned, visible: visibleStates } = state
  const visibleCount = widgetKeys.filter((item) => visibleStates[item]).length

  return (
    <div
      ref={rootRef}
      className={`context-menu-root${visible ? ' is-visible' : ''}`}
      onContextMenu={(event) => event.preventDefault()}
      onTransitionEnd={finishClose}
    >
      <div className="context-menu">
        {widgetKeys.map((item, index) => {
        const hideDisabled = visibleStates[item] && visibleCount <= 1

        return (
          <div key={item} className="menu-group">
            <div className="menu-header">{widgetName(item)}</div>
            <button
              type="button"
              className="menu-item"
              onClick={() =>
                runAction({
                  type: 'pin',
                  origin: request.panel,
                  target: item,
                  value: !pinned[item],
                  nonce: nextActionNonce(),
                })
              }
            >
              <span className="menu-check">{pinned[item] ? <Check size={13} aria-hidden="true" /> : null}</span>
              <span>{text.pin}</span>
            </button>
            <button
              type="button"
              className={`menu-item${hideDisabled ? ' disabled' : ''}`}
              disabled={hideDisabled}
              onClick={() =>
                runAction({
                  type: 'visible',
                  origin: request.panel,
                  target: item,
                  value: !visibleStates[item],
                  nonce: nextActionNonce(),
                })
              }
            >
              <span className="menu-check">{visibleStates[item] ? <Check size={13} aria-hidden="true" /> : null}</span>
              <span>{text.show}</span>
            </button>
            {index < widgetKeys.length - 1 ? <div className="menu-separator" /> : null}
          </div>
        )
      })}
      <div className="menu-separator" />
      <button
        type="button"
        className="menu-item"
        onClick={() => runAction({ type: 'reset', origin: request.panel, nonce: nextActionNonce() })}
      >
        <span className="menu-check">
          <RotateCcw size={13} aria-hidden="true" />
        </span>
        <span>{text.reset}</span>
      </button>
      </div>
    </div>
  )
}
