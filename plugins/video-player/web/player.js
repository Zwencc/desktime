// The video-player plugin, running inside the site's own page.
//
// This file is injected by the host into a browser-type plugin window, before
// anything on the page runs. The host has already checked that this is the top
// frame and handed the bridge; everything below is ordinary page script with no
// privileges of its own.
//
// **The crop is a page transform, not a DOM edit.** The obvious approach —
// find the biggest <video> and hide everything else — is wrong for exactly the
// sites this exists for: on Bilibili and YouTube the control bar, the subtitles
// and the danmaku are siblings of the <video>, canvases, or overlays inside the
// player container. Hiding them leaves a bare picture with nothing to click. So
// the player element is used only to *measure* a rectangle, and then the whole
// page is translated and scaled so the window shows that rectangle and nothing
// else. The site's own player is untouched and still entirely usable.
//
// **Nothing here extracts, downloads or unlocks anything.** It is a small
// browser that can crop its own viewport.

;(function () {
  const bridge = window.desktimeBrowser
  if (!bridge) return

  const MAX_PLAYER_WIDTH = 720
  const MIN_PLAYER_WIDTH = 240
  /** How close to the top edge the pointer has to be for the bar to appear. */
  const BAR_REVEAL = 6

  const state = {
    /** null while browsing; otherwise what is being cropped to. */
    target: null,
    /** A manually drawn rectangle, in page coordinates. */
    manual: null,
    scale: 1,
    scroll: { x: 0, y: 0 },
    barPinned: false,
  }

  // —— Site adapters ——
  //
  // Tried in order, and only the one whose site this is. Each names the
  // *player container* rather than the <video>, because the container is what
  // holds the controls, the subtitles and the danmaku layer.

  const ADAPTERS = [
    {
      id: 'bilibili',
      matches: () => /(^|\.)bilibili\.com$/.test(location.hostname),
      selectors: [
        // Live rooms, checked first: a live page also has a `.bpx-player-container`
        // for the preview player further down.
        '#live-player',
        '.live-player-ctnr',
        // Ordinary videos and bangumi, current player generation.
        '#bilibili-player .bpx-player-container',
        '.bpx-player-container',
        '#player_module .bpx-player-container',
        // The generation before it, still served on some pages.
        '#bilibiliPlayer',
        '#player_placeholder',
      ],
    },
    {
      id: 'youtube',
      matches: () => /(^|\.)youtube\.com$/.test(location.hostname),
      selectors: [
        // Shorts is a different player and has to be looked for first: a Shorts
        // page also carries a hidden `#movie_player`.
        '#shorts-player',
        'ytd-reel-video-renderer[is-active] .html5-video-player',
        'ytd-player #movie_player',
        '#movie_player',
        '.html5-video-player',
      ],
    },
  ]

  function adapterTarget() {
    const adapter = ADAPTERS.find((entry) => entry.matches())
    if (!adapter) return null
    for (const selector of adapter.selectors) {
      const found = [...document.querySelectorAll(selector)].find(isUsable)
      if (found) return found
    }
    return null
  }

  /**
   * The generic fallback: the largest visible video, widened to its player.
   *
   * Second in line rather than first, because a site the adapters know is
   * always identified better by its own selectors — and because "largest
   * video" picks the wrong one on a page full of autoplaying previews.
   */
  function fallbackTarget() {
    const videos = [...document.querySelectorAll('video')].filter(isUsable)
    if (videos.length === 0) return null

    videos.sort((left, right) => area(right) - area(left))
    // One that is actually running beats a larger one that is not: an
    // autoplaying preview is usually the biggest thing on a Bilibili home page.
    const video = videos.find((entry) => !entry.paused && !entry.ended) ?? videos[0]
    return playerAround(video)
  }

  /**
   * Climbs from the video to the box that still fits it.
   *
   * The first ancestor that is meaningfully bigger is page furniture; the last
   * one that is not is the player, and it is the one carrying the controls.
   */
  function playerAround(video) {
    const own = video.getBoundingClientRect()
    let node = video
    for (let depth = 0; depth < 6 && node.parentElement; depth += 1) {
      const parent = node.parentElement
      const box = parent.getBoundingClientRect()
      if (box.width > own.width * 1.15 || box.height > own.height * 1.15) break
      node = parent
    }
    return node
  }

  function isUsable(element) {
    const box = element.getBoundingClientRect()
    if (box.width < 120 || box.height < 68) return false
    const style = getComputedStyle(element)
    return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0'
  }

  function area(element) {
    const box = element.getBoundingClientRect()
    return box.width * box.height
  }

  function findTarget() {
    return adapterTarget() ?? fallbackTarget()
  }

  // —— The crop ——

  /**
   * Where the crop is, in viewport pixels, measured with the transform off.
   *
   * Measuring while transformed would give the *cropped* rectangle back and the
   * window would converge on nothing, so the transform is cleared, the browser
   * is made to lay out, and only then is anything read.
   */
  function measure() {
    const previous = document.body.style.transform
    document.body.style.transform = ''
    // Forces layout with the transform gone, which is the whole point.
    void document.body.offsetWidth

    let box = null
    if (state.manual) {
      box = {
        left: state.manual.x - window.scrollX,
        top: state.manual.y - window.scrollY,
        width: state.manual.width,
        height: state.manual.height,
      }
    } else if (state.target && document.contains(state.target)) {
      const rect = state.target.getBoundingClientRect()
      box = { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    }

    document.body.style.transform = previous
    return box && box.width > 1 && box.height > 1 ? box : null
  }

  function applyCrop(box, scale) {
    const root = document.documentElement
    root.style.background = '#000'
    // The transform goes on <body> and the toolbar lives on <html>, so the
    // toolbar is not dragged along with the page it is floating over.
    document.body.style.transformOrigin = '0 0'
    document.body.style.transform = `scale(${scale}) translate(${-box.left}px, ${-box.top}px)`
  }

  function clearCrop() {
    document.body.style.transform = ''
    document.body.style.transformOrigin = ''
    document.documentElement.style.background = ''
  }

  /**
   * Re-measures and re-applies, keeping the window where it is.
   *
   * Called on every scroll, resize and player size change. Without it the crop
   * would slide off the player the first time anything moved.
   */
  function retarget() {
    if (!isPlaying()) return
    const box = measure()
    if (!box) {
      void recover()
      return
    }

    const scale = clamp(window.innerWidth / box.width, 0.1, 4)
    state.scale = scale
    applyCrop(box, scale)

    // Only the height follows the player's shape; the width is whatever the
    // user has made the window, so resizing it stays their decision.
    const wanted = Math.round(box.height * scale)
    if (Math.abs(wanted - window.innerHeight) > 2) {
      void bridge.control('resize', { width: window.innerWidth, height: wanted })
    }
  }

  function isPlaying() {
    return Boolean(state.target || state.manual)
  }

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value))
  }

  // —— Entering and leaving ——

  async function enterPlayback(manual) {
    const found = manual ? null : findTarget()
    if (!manual && !found) {
      // Deliberately still browsing. Shrinking the window first would leave the
      // user holding a small empty rectangle with nothing to click.
      say(text.notFound, true)
      return false
    }

    state.scroll = { x: window.scrollX, y: window.scrollY }
    state.target = found
    state.manual = manual

    const box = measure()
    if (!box) {
      state.target = null
      state.manual = null
      say(text.notFound, true)
      return false
    }

    const width = clamp(
      Math.min(box.width, MAX_PLAYER_WIDTH),
      MIN_PLAYER_WIDTH,
      MAX_PLAYER_WIDTH,
    )
    const scale = width / box.width
    state.scale = scale
    applyCrop(box, scale)

    // The window is hidden, resized and shown again by the host, so the first
    // frame anyone sees is the finished one.
    await bridge.control('enterPlayback', {
      width: Math.round(box.width * scale),
      height: Math.round(box.height * scale),
    })
    render()
    return true
  }

  async function exitPlayback() {
    state.target = null
    state.manual = null
    clearCrop()
    await bridge.control('exitPlayback', null)
    window.scrollTo(state.scroll.x, state.scroll.y)
    render()
  }

  /**
   * The player went away — a new episode, an SPA route, a rebuilt DOM.
   *
   * The old crop is dropped first and unconditionally. Keeping it while looking
   * for the replacement is what leaves a window showing a frozen corner of a
   * page that has already moved on.
   */
  async function recover() {
    clearCrop()
    state.target = null
    state.manual = null

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await sleep(250)
      const found = findTarget()
      if (!found) continue
      state.target = found
      const box = measure()
      if (box) {
        applyCrop(box, state.scale)
        retarget()
        render()
        return
      }
      state.target = null
    }

    await exitPlayback()
    say(text.lost, true)
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  // —— Manual selection ——
  //
  // The last resort, and it stays that way: it is reachable from the toolbar
  // after an automatic attempt has failed, not part of the ordinary path.

  function selectManually() {
    const layer = document.createElement('div')
    layer.style.cssText =
      'position:fixed;inset:0;z-index:2147483646;cursor:crosshair;background:rgba(0,0,0,0.25)'
    const box = document.createElement('div')
    box.style.cssText =
      'position:fixed;border:2px solid #38bdf8;background:rgba(56,189,248,0.15);pointer-events:none'
    layer.append(box)
    shadow.append(layer)

    let start = null
    const done = (event) => {
      layer.remove()
      if (!start) return
      const rect = normalise(start, { x: event.clientX, y: event.clientY })
      if (rect.width < 80 || rect.height < 45) return
      void enterPlayback({
        x: rect.left + window.scrollX,
        y: rect.top + window.scrollY,
        width: rect.width,
        height: rect.height,
      })
    }

    layer.addEventListener('pointerdown', (event) => {
      start = { x: event.clientX, y: event.clientY }
    })
    layer.addEventListener('pointermove', (event) => {
      if (!start) return
      const rect = normalise(start, { x: event.clientX, y: event.clientY })
      box.style.left = `${rect.left}px`
      box.style.top = `${rect.top}px`
      box.style.width = `${rect.width}px`
      box.style.height = `${rect.height}px`
    })
    layer.addEventListener('pointerup', done)
    layer.addEventListener('pointercancel', () => layer.remove())
  }

  function normalise(from, to) {
    return {
      left: Math.min(from.x, to.x),
      top: Math.min(from.y, to.y),
      width: Math.abs(to.x - from.x),
      height: Math.abs(to.y - from.y),
    }
  }

  // —— The toolbar ——

  const text = {
    play: '小窗播放',
    exit: '退出小窗',
    manual: '手动框选',
    back: '后退',
    forward: '前进',
    reload: '刷新',
    pin: '置顶',
    hide: '隐藏',
    notFound: '没有认出这个页面的播放器，可以试试手动框选',
    lost: '播放器不见了，已退出小窗',
  }

  // A closed shadow root keeps the site's CSS out of the toolbar. It is not a
  // security boundary and is not treated as one — the boundary is the token and
  // the host's own checks.
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;inset:0 0 auto 0;z-index:2147483647;pointer-events:none'
  const shadow = host.attachShadow({ mode: 'closed' })
  const bar = document.createElement('div')
  const message = document.createElement('span')

  const style = document.createElement('style')
  style.textContent = `
    .bar {
      display: flex; align-items: center; gap: 6px;
      padding: 4px 6px; pointer-events: auto;
      font: 12px system-ui, sans-serif; color: #e5e7eb;
      background: rgba(17, 24, 39, 0.92);
      border-bottom: 1px solid rgba(148, 163, 184, 0.3);
      transform: translateY(-110%); transition: transform 120ms ease;
    }
    .bar.shown { transform: none; }
    .bar button {
      height: 22px; padding: 0 8px; border: none; border-radius: 6px;
      background: rgba(148, 163, 184, 0.18); color: inherit; font: inherit; cursor: pointer;
    }
    .bar button:hover { background: rgba(148, 163, 184, 0.32); }
    .bar input {
      flex: 1; min-width: 0; height: 22px; padding: 0 8px;
      border: 1px solid rgba(148, 163, 184, 0.3); border-radius: 6px;
      background: rgba(15, 23, 42, 0.9); color: inherit; font: inherit;
    }
    .drag { flex: 0 0 18px; height: 22px; cursor: move; }
    .note { color: #fca5a5; }
  `

  const address = document.createElement('input')
  address.spellcheck = false

  function button(label, run) {
    const element = document.createElement('button')
    element.type = 'button'
    element.textContent = label
    element.addEventListener('click', run)
    return element
  }

  const playButton = button(text.play, () => {
    void (isPlaying() ? exitPlayback() : enterPlayback(null))
  })
  const manualButton = button(text.manual, selectManually)

  const drag = document.createElement('div')
  drag.className = 'drag'
  drag.addEventListener('pointerdown', () => void bridge.control('drag', null))

  bar.className = 'bar'
  bar.append(
    drag,
    button(text.back, () => void bridge.control('back', null)),
    button(text.forward, () => void bridge.control('forward', null)),
    button(text.reload, () => void bridge.control('reload', null)),
    address,
    playButton,
    manualButton,
    button(text.pin, () => void bridge.control('pin', null)),
    button(text.hide, () => void bridge.control('hide', null)),
    message,
  )
  message.className = 'note'
  shadow.append(style, bar)

  address.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return
    // The host parses this again and matches it against the manifest, so a
    // typed address is a request rather than an instruction.
    void bridge.control('navigate', null, address.value.trim())
  })

  function render() {
    playButton.textContent = isPlaying() ? text.exit : text.play
    manualButton.style.display = isPlaying() ? 'none' : ''
    if (document.activeElement !== address) address.value = location.href
  }

  function say(note, sticky) {
    message.textContent = note
    showBar(true)
    if (!sticky) return
    setTimeout(() => {
      message.textContent = ''
    }, 6000)
  }

  function showBar(shown) {
    bar.classList.toggle('shown', shown || state.barPinned)
  }

  // —— Wiring ——

  function install() {
    if (!document.documentElement.contains(host)) {
      document.documentElement.append(host)
    }
    render()
  }

  document.addEventListener('pointermove', (event) => showBar(event.clientY <= BAR_REVEAL), {
    passive: true,
  })
  document.addEventListener('pointerleave', () => showBar(false))

  // Capture phase, because the site sees these keys too and several of them
  // stop propagation. This is the way out of a crop that has gone wrong, so it
  // must not depend on the page cooperating.
  window.addEventListener(
    'keydown',
    (event) => {
      if (!event.ctrlKey || !event.shiftKey) return
      if (event.code === 'Space') {
        event.preventDefault()
        state.barPinned = !state.barPinned
        showBar(state.barPinned)
      }
      // Not Escape: Ctrl+Shift+Esc is Windows' own Task Manager shortcut and is
      // taken by the OS long before any page sees it. This has to be the way
      // out of a crop that has gone wrong, so it cannot be a key that never
      // arrives.
      if (event.code === 'KeyX') {
        event.preventDefault()
        if (isPlaying()) void exitPlayback()
      }
    },
    true,
  )

  let pending = 0
  function schedule() {
    if (pending) return
    pending = requestAnimationFrame(() => {
      pending = 0
      retarget()
      render()
    })
  }

  window.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', schedule)

  // An SPA route change is not a navigation as far as the window is concerned,
  // so the only way to hear about one is to watch the API the site uses.
  for (const name of ['pushState', 'replaceState']) {
    const original = history[name]
    history[name] = function patched(...args) {
      const result = original.apply(this, args)
      window.dispatchEvent(new Event('desktime:navigated'))
      return result
    }
  }
  window.addEventListener('popstate', () => window.dispatchEvent(new Event('desktime:navigated')))
  window.addEventListener('desktime:navigated', () => {
    render()
    // A new episode is a new player. The old rectangle describes a DOM that is
    // already gone, so it goes first and the adapter looks again.
    if (isPlaying()) void recover()
  })

  // The target can also disappear without any navigation at all — the player
  // being rebuilt in place is the ordinary case on both sites.
  setInterval(() => {
    if (state.target && !document.contains(state.target)) void recover()
  }, 1000)

  /**
   * Waits for a document to attach to.
   *
   * This script runs before the page does — which is what makes it able to see
   * everything — and at that moment `document.documentElement` can still be
   * null. Observing it then would throw and take the whole toolbar with it.
   */
  function boot() {
    if (!document.documentElement) {
      setTimeout(boot, 0)
      return
    }
    install()
    // The page can replace its own body; the toolbar has to come back with it.
    new MutationObserver(install).observe(document.documentElement, { childList: true })
    new ResizeObserver(schedule).observe(document.documentElement)
  }

  boot()
  document.addEventListener('DOMContentLoaded', install)
})()
