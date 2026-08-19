// The settings panel. Opened from the gear in any widget's title bar.
//
// It is deliberately not a fourth "panel": it stays out of the context menu's
// component list, out of the tray's show/hide-all, and out of the "keep one
// widget visible" rule, because it is a dialog the user opens and closes.
//
// The window itself is only a shell — navigation on the left, the selected page
// on the right. What those pages are comes from settingsSections.ts, so adding
// one never touches this file.

import { useEffect, useState } from 'react'
import { useLocale } from './locales'
import type { MouseEvent } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { X } from 'lucide-react'
import { devMode } from './devtools'
import { closeForGood } from './panels'
import {
  type SettingsSection,
  findSection,
  sectionPages,
  visibleSections,
} from './settingsSections'
import './App.css'

function startDrag(event: MouseEvent<HTMLElement>) {
  if (event.button !== 0) return
  if ((event.target as HTMLElement | null)?.closest('button,input,select')) return

  void getCurrentWindow().startDragging()
}

export function SettingsWindow() {
  const [dev, setDev] = useState(false)
  const [active, setActive] = useState('general')

  useEffect(() => {
    void devMode().then((info) => setDev(info.enabled))
  }, [])

  // Subscribed to for the language: the navigation labels are translated, and
  // `visibleSections` reads the current one itself.
  const text = useLocale()
  // Not memoised. The label of every entry depends on the language, which is a
  // dependency `useMemo` cannot see — and this is a twenty-item array, so the
  // memo was never buying anything worth the risk of it going stale.
  const sections = visibleSections(dev)
  // Falling back to the first page covers the one case the tree can produce:
  // leaving developer mode while its page is open.
  const current = findSection(sections, active) ?? sectionPages(sections)[0]

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') void closeForGood()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function renderNavItem(section: SettingsSection, child: boolean) {
    return (
      <button
        key={section.id}
        type="button"
        className={`settings-nav-item${child ? ' child' : ''}${
          current?.id === section.id ? ' active' : ''
        }`}
        onClick={() => setActive(section.id)}
      >
        {section.label}
      </button>
    )
  }

  const Current = current?.Component

  return (
    <main className="settings-window">
      <div className="settings-handle" onMouseDown={startDrag}>
        <span>{text.settings.title}</span>
        <button
          className="icon-button"
          type="button"
          title={text.common.close}
          onClick={() => void closeForGood()}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      {/* The scroll lives on an inner element so a scrollbar (only ever needed
          when the window is shrunk) sits inside the card instead of cutting
          across its rounded border. */}
      <div className="settings-body">
        <nav className="settings-nav">
          {sections.map((section) =>
            section.children ? (
              <div className="settings-nav-group" key={section.id}>
                <div className="settings-nav-head">{section.label}</div>
                {section.children.map((child) => renderNavItem(child, true))}
              </div>
            ) : (
              renderNavItem(section, false)
            ),
          )}
        </nav>

        <div className="settings-scroll">{Current && <Current />}</div>
      </div>
    </main>
  )
}

export default SettingsWindow
