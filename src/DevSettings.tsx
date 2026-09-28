// The "开发者" section of the settings page.
//
// It renders nothing at all unless the marker file is present, so a normal
// install never learns this exists. When S2 turns settings into a two-column
// layout this becomes one more navigation node with no change to what is below.

import { useEffect, useState } from 'react'
import { type DevModeInfo, devMode, openDevTools, reloadAllWindows } from './devtools'
import { useLocale } from './locales'


export function DevSettings() {
  const text = useLocale().devSettings
  const [dev, setDev] = useState<DevModeInfo | null>(null)

  useEffect(() => {
    void devMode().then(setDev)
  }, [])

  if (!dev?.enabled) return null

  return (
    <section className="settings-section">
      <h2>{text.title}</h2>
      <div className="field-row">
        <span>{text.root}</span>
      </div>
      <p className="dev-path">{dev.root}</p>
      <div className="field-row">
        <button type="button" className="reminder-button" onClick={() => void openDevTools()}>
          {text.open}
        </button>
        <button type="button" className="reminder-button" onClick={() => void reloadAllWindows()}>
          {text.reload}
        </button>
      </div>
      <p className="settings-hint">{text.hint}</p>
    </section>
  )
}
