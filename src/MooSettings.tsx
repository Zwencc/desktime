// The "外观" section of the moo clock's settings: which window shape it takes.

import { useState } from 'react'
import { type AppSettings, readSettings, updateSettings } from './settings'
import { useLocale } from './locales'


export function MooSettings() {
  const text = useLocale().mooSettings
  const [settings, setSettings] = useState<AppSettings>(readSettings)

  function patch(next: Partial<AppSettings>) {
    setSettings(updateSettings(next))
  }

  return (
    <section className="settings-section">
      <h2>{text.title}</h2>
      <div className="field-row">
        <span>{text.shape}</span>
        <label>
          <input
            type="radio"
            name="mooShape"
            checked={settings.mooShape === 'float'}
            onChange={() => patch({ mooShape: 'float' })}
          />
          <span>{text.float}</span>
        </label>
        <label>
          <input
            type="radio"
            name="mooShape"
            checked={settings.mooShape === 'island'}
            onChange={() => patch({ mooShape: 'island' })}
          />
          <span>{text.island}</span>
        </label>
      </div>
      <p className="settings-hint">{text.islandHint}</p>
    </section>
  )
}

export default MooSettings
