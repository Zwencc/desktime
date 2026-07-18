// The plugin SDK, injected by the host into every plugin window.
//
// This is the "widget template" half of the plugin system: the chrome a desktop
// widget needs — dragging, pinning, the theme, the app's time zone — is provided
// here so a plugin page only has to write its own content. Without it every
// plugin would reimplement `startDragging`, and they would all draw a slightly
// different title bar.
//
// `__PLUGIN_ID__` and `__PLUGIN_CHROME__` are substituted by the host, per
// window. A plugin cannot change either, and therefore cannot read another
// plugin's storage, call another's backend, or give itself a shell its manifest
// did not ask for — both are assigned here rather than claimed by the page.

;(function () {
  const pluginId = __PLUGIN_ID__
  const internals = window.__TAURI_INTERNALS__

  function call(command, args) {
    if (!internals) return Promise.reject(new Error('not running inside DeskTime'))
    return internals.invoke(command, args)
  }

  const listeners = new Map()
  const settingsListeners = []

  // The host dispatches this when the user changes one of this plugin's settings
  // in the settings window. Filtered by id exactly like the backend channel
  // below — the delivery is already per-window, and the two should not differ in
  // a way somebody has to notice.
  window.addEventListener('desktime-plugin-settings', function (event) {
    const detail = (event && event.detail) || {}
    if (detail.plugin !== pluginId) return
    settingsListeners.forEach(function (handler) {
      handler(detail.settings)
    })
  })

  // The host broadcasts backend notifications; they are filtered by plugin id
  // here, so no plugin is ever handed another plugin's events.
  window.addEventListener('desktime-plugin-event', function (event) {
    const detail = (event && event.detail) || {}
    if (detail.plugin !== pluginId) return
    const handlers = listeners.get(detail.name)
    if (handlers) {
      handlers.forEach(function (handler) {
        handler(detail.payload)
      })
    }
  })

  window.desktime = {
    id: pluginId,

    // —— The window shell ——
    window: {
      /** Start a drag; attach to whatever the plugin uses as a title bar. */
      drag: function () {
        return call('plugin_window', { id: pluginId, action: 'drag' })
      },
      pin: function (pinned) {
        return call('plugin_window', { id: pluginId, action: pinned ? 'pin' : 'unpin' })
      },
      hide: function () {
        return call('plugin_window', { id: pluginId, action: 'hide' })
      },
      /** Widgets are usually content-sized, so this is the common case. */
      resize: function (width, height) {
        return call('plugin_window', {
          id: pluginId,
          action: 'resize',
          width: width,
          height: height,
        })
      },
    },

    // —— Storage, namespaced to this plugin ——
    storage: {
      get: function (key) {
        return call('plugin_storage_get', { id: pluginId, key: String(key) })
      },
      set: function (key, value) {
        return call('plugin_storage_set', {
          id: pluginId,
          key: String(key),
          value: JSON.stringify(value),
        })
      },
    },

    /** The settings this plugin's manifest declared, as the host has them now. */
    settings: function () {
      return call('plugin_settings', { id: pluginId })
    },

    /**
     * Called with every value whenever the user changes one of them.
     *
     * Worth attaching even for a plugin that reads `settings()` once at startup:
     * without it a setting only takes hold at the next launch, which the user
     * reads as a setting that does nothing.
     */
    onSettings: function (handler) {
      settingsListeners.push(handler)
    },

    // —— Time ——
    //
    // Always through the host. A plugin calling `new Date()` would show the
    // machine's zone while the clock widget beside it showed the configured one,
    // and the desktop would be telling the user two different times.
    time: {
      now: function () {
        return call('plugin_now', {})
      },
    },

    /** The host's language, so a plugin's own translations can follow it. */
    locale: function () {
      return call('plugin_locale', {})
    },

    // —— This plugin's own backend ——
    call: function (method, params) {
      return call('plugin_call', {
        id: pluginId,
        method: String(method),
        params: params || {},
      })
    },

    on: function (name, handler) {
      if (!listeners.has(name)) listeners.set(name, [])
      listeners.get(name).push(handler)
    },

    log: function (message) {
      return call('plugin_log', { id: pluginId, message: String(message) })
    },
  }

  // The host's theme variables, copied onto this document so a plugin can write
  // `var(--accent)` and follow the user's theme without doing anything for it.
  call('plugin_theme', {})
    .then(function (variables) {
      const root = document.documentElement
      Object.keys(variables || {}).forEach(function (name) {
        root.style.setProperty(name, variables[name])
      })
    })
    .catch(function () {})

  // —— The default widget shell ——
  //
  // Off entirely unless the manifest asked for a piece of it, so a plugin that
  // says nothing about `chrome` keeps drawing its own, exactly as before.
  //
  // It exists because a plugin window is frameless. Windows gives such a window
  // no resize border and no title bar, and a page cannot move its own OS window
  // from CSS or JS — so a plugin can draw a title bar that looks right and does
  // nothing at all. These are the parts it cannot build for itself.
  const shell = __PLUGIN_CHROME__

  // Where a drag must never start. The same rule the host's own widgets use, so
  // a plugin's buttons and fields behave the way every other widget's do.
  const NON_DRAG = 'button, a, input, select, textarea, [contenteditable], [data-no-drag]'

  // Edges first, corners after: one stacking level, so the later ones win where
  // they overlap — and a corner has to beat the two edges it sits between.
  const GRIPS = [
    ['n', 'top:0;left:0;right:0;height:5px', 'ns-resize'],
    ['s', 'bottom:0;left:0;right:0;height:5px', 'ns-resize'],
    ['w', 'top:0;bottom:0;left:0;width:5px', 'ew-resize'],
    ['e', 'top:0;bottom:0;right:0;width:5px', 'ew-resize'],
    ['nw', 'top:0;left:0;width:14px;height:14px', 'nwse-resize'],
    ['ne', 'top:0;right:0;width:14px;height:14px', 'nesw-resize'],
    ['sw', 'bottom:0;left:0;width:14px;height:14px', 'nesw-resize'],
    ['se', 'bottom:0;right:0;width:14px;height:14px', 'nwse-resize'],
  ]

  // lucide's own paths — the icon set the rest of the app draws with, so a
  // plugin's two buttons are the two glyphs the user already knows.
  const PIN_PATH =
    '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>'
  const CLOSE_PATH = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'

  // The shell hangs on the body's content box, never on the window.
  //
  // A widget window is deliberately bigger than the widget: the host's built-in
  // ones keep 16px of transparent margin all round so the panel's drop shadow
  // has somewhere to render (`--pad` in App.css, and the window is enlarged by
  // twice it in tauri.conf.json), and a plugin does the same thing with padding
  // on `body`. Grips pinned to the window edge would then sit out in that
  // transparent margin: the cursor would change only once it had left the
  // widget, which is exactly backwards. The host's own `.resize-grip` is inset
  // by `var(--pad)` for this reason; this measures the plugin's equivalent
  // rather than making it declare one.
  const layer = document.createElement('div')
  layer.setAttribute('data-no-drag', '')
  layer.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none'

  function fitLayer() {
    const rect = document.body.getBoundingClientRect()
    const style = getComputedStyle(document.body)
    const left = parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)
    const right = parseFloat(style.borderRightWidth) + parseFloat(style.paddingRight)
    const top = parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop)
    const bottom = parseFloat(style.borderBottomWidth) + parseFloat(style.paddingBottom)

    layer.style.left = rect.left + left + 'px'
    layer.style.top = rect.top + top + 'px'
    layer.style.width = Math.max(0, rect.width - left - right) + 'px'
    layer.style.height = Math.max(0, rect.height - top - bottom) + 'px'
  }

  function glyph(paths) {
    return (
      '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"' +
      ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      paths +
      '</svg>'
    )
  }

  // Fire and forget: there is nothing sensible for a grip to do if the window
  // refuses, and an uncaught rejection per drag would fill the console.
  function windowAction(args) {
    call('plugin_window', Object.assign({ id: pluginId }, args)).catch(function () {})
  }

  function installDrag() {
    document.addEventListener('pointerdown', function (event) {
      if (event.button !== 0) return
      if (event.target.closest && event.target.closest(NON_DRAG)) return
      windowAction({ action: 'drag' })
    })
  }

  function installGrips() {
    GRIPS.forEach(function (grip) {
      const element = document.createElement('div')
      element.style.cssText =
        'position:absolute;pointer-events:auto;' + grip[1] + ';cursor:' + grip[2]
      element.addEventListener('pointerdown', function (event) {
        if (event.button !== 0) return
        windowAction({ action: 'resize-drag', edge: grip[0] })
      })
      layer.appendChild(element)
    })
  }

  function installButtons() {
    const bar = document.createElement('div')
    bar.style.cssText =
      'position:absolute;top:4px;right:4px;display:flex;gap:2px;' +
      'opacity:0;pointer-events:none;transition:opacity .12s'

    // No tooltip and no label. This file is injected before the host's language
    // is known, so a string here would be the one piece of the interface that
    // never translates; two glyphs in the corner of a widget say what they do.
    function button(paths, onClick) {
      const element = document.createElement('button')
      element.type = 'button'
      element.innerHTML = glyph(paths)
      // The same two variables `.icon-button` uses in the host's own CSS. A
      // literal — or `--surface-rgb`, which is white in the default theme —
      // reads as a foreign white chip dropped on the widget.
      element.style.cssText =
        'display:grid;place-items:center;width:19px;height:19px;padding:0;border:0;' +
        'border-radius:6px;background:rgba(var(--chip-rgb,219 234 254),.84);' +
        'color:var(--accent-strong,#1d4ed8);cursor:pointer;transition:transform .12s,opacity .12s'
      element.addEventListener('click', onClick)
      return element
    }

    if (shell.pin) {
      // Every plugin window is built on top, so that is where this starts.
      let pinned = true
      const toggle = button(PIN_PATH, function () {
        pinned = !pinned
        windowAction({ action: pinned ? 'pin' : 'unpin' })
        // Tilted and faded when it is not holding. A pin lying on its side is
        // the convention for this, and it reads without a word of text.
        toggle.style.transform = pinned ? 'none' : 'rotate(45deg)'
        toggle.style.opacity = pinned ? '1' : '.55'
      })
      bar.appendChild(toggle)
    }

    if (shell.close) {
      bar.appendChild(
        button(CLOSE_PATH, function () {
          windowAction({ action: 'hide' })
        })
      )
    }

    layer.appendChild(bar)

    // Only while the pointer is over the widget. Two buttons sitting permanently
    // on a small panel are two buttons its author did not lay out.
    const root = document.documentElement
    root.addEventListener('mouseenter', function () {
      bar.style.opacity = '1'
      bar.style.pointerEvents = 'auto'
    })
    root.addEventListener('mouseleave', function () {
      bar.style.opacity = '0'
      bar.style.pointerEvents = 'none'
    })
  }

  function installShell() {
    if (shell.drag) installDrag()
    if (!shell.resize && !shell.close && !shell.pin) return

    if (shell.resize) installGrips()
    if (shell.close || shell.pin) installButtons()

    document.body.appendChild(layer)
    fitLayer()
    // The inset is usually a fixed number of pixels and would not move, but a
    // plugin is free to write it in percentages.
    window.addEventListener('resize', fitLayer)
  }

  // This runs before the page's own scripts, which is before there is a body to
  // put any of it into.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installShell)
  } else {
    installShell()
  }
})()
