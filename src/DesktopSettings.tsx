// Launcher settings.
//
// This page used to carry the desktop layer as well. The layer was retired in
// v0.1.4 (see `disabled` in widgets.ts), but the launcher shipped alongside it
// and shares its store, so what is left here is the one thing that has no
// sensible default for everyone — which key opens it.

import { useSyncExternalStore } from 'react'
import { desktopSnapshot, readDesktop, subscribeDesktop, updateDesktop } from './desktop'
import { useLocale } from './locales'

export function DesktopSettings() {
  const text = useLocale().launcher
  useSyncExternalStore(subscribeDesktop, desktopSnapshot)
  const config = readDesktop()

  return (
    <section className="settings-section">
      <h2>{text.title}</h2>
      <p className="settings-hint">{text.intro}</p>

      <label className="field-row">
        <span>{text.hotkey}</span>
        <input
          type="text"
          className="grow"
          value={config.hotkey}
          onChange={(event) => updateDesktop({ hotkey: event.target.value })}
        />
      </label>
      <p className="settings-hint">{text.hotkeyHint}</p>
    </section>
  )
}

export default DesktopSettings
