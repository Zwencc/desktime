// The launcher.
//
// A centred search box on a global hotkey: type, arrow, enter. rofi is the shape
// this is copying, not a dependency — rofi is X11-only and cannot run here, so
// the indexing is ours (Rust), the matching is ours (launcher.ts) and this is
// the window that puts them together.
//
// It used to own the registration of every global hotkey, which made it a window
// that had to exist from the first moment of a run. That moved to Rust in v0.1.4
// (shortcuts.rs) so this window could be built on demand like the other
// app-driven ones; the backend shows it, and it takes over from there.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Search } from 'lucide-react'
import { type ShellEntry, fetchLauncherIndex, launchPath } from './desktop'
import { isTauri } from './env'
import { search } from './launcher'
import './App.css'
import { useLocale } from './locales'


/** Rebuilt on open rather than kept fresh: the Start Menu rarely changes, and a
 *  background rescan would be work nobody asked for. */
export function LauncherWindow() {
  const text = useLocale().launcherWindow
  const [entries, setEntries] = useState<ShellEntry[]>([])
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  const matches = useMemo(() => search(entries, query), [entries, query])

  const open = useCallback(async () => {
    const appWindow = getCurrentWindow()
    setQuery('')
    setCursor(0)
    void fetchLauncherIndex().then(setEntries)
    await appWindow.show()
    await appWindow.setFocus()
    input.current?.focus()
  }, [])

  const close = useCallback(async () => {
    setQuery('')
    await getCurrentWindow().hide()
  }, [])

  // The backend shows this window on the hotkey, so being made visible is the
  // only signal that it was asked for. Focus follows here rather than there
  // because the input is a DOM node, and a window built moments ago has not
  // necessarily mounted by the time the backend calls show().
  useEffect(() => {
    if (!isTauri) return

    let stop = () => {}
    void getCurrentWindow()
      .onFocusChanged(({ payload }) => {
        if (payload) void open()
      })
      .then((unlisten) => {
        stop = unlisten
      })

    // The window may already be visible: on the very first press the backend
    // built it, showed it and focused it before this listener existed.
    void getCurrentWindow()
      .isVisible()
      .then((visible) => {
        if (visible) void open()
      })

    return () => stop()
  }, [open])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        void close()
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setCursor((current) => Math.min(matches.length - 1, current + 1))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setCursor((current) => Math.max(0, current - 1))
        return
      }
      if (event.key === 'Enter') {
        const match = matches[cursor]
        if (!match) return
        void launchPath(match.entry.path)
        void close()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [matches, cursor, close])

  return (
    <main className="launcher">
      <div className="launcher-field">
        <Search size={16} aria-hidden="true" />
        <input
          ref={input}
          autoFocus
          value={query}
          placeholder={text.placeholder}
          onChange={(event) => {
            setQuery(event.target.value)
            setCursor(0)
          }}
        />
      </div>

      <div className="launcher-list">
        {matches.length === 0 && <p className="launcher-empty">{text.empty}</p>}
        {matches.map((match, index) => (
          <button
            key={match.entry.path}
            type="button"
            className={index === cursor ? 'launcher-item active' : 'launcher-item'}
            onMouseEnter={() => setCursor(index)}
            onClick={() => {
              void launchPath(match.entry.path)
              void close()
            }}
          >
            <span className="launcher-name">{match.entry.name}</span>
            <span className="launcher-source">
              {match.entry.source === 'desktop' ? text.desktop : text.menu}
            </span>
          </button>
        ))}
      </div>
    </main>
  )
}

export default LauncherWindow
