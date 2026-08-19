// The "记事本" section of the settings window.

import { useState } from 'react'
import { type AppSettings, readSettings, updateSettings } from './settings'
import { useLocale } from './locales'


export function NotebookSettings() {
  const strings = useLocale()
  const text = strings.notebookSettings
  const [settings, setSettings] = useState<AppSettings>(readSettings)

  function patch(next: Partial<AppSettings>) {
    setSettings(updateSettings(next))
  }

  return (
    <section className="settings-section">
      <h2>{text.title}</h2>
      <label className="field-row">
        <span>{text.autoSave}</span>
        <input
          type="number"
          min={3}
          max={120}
          value={settings.autoSaveSeconds}
          onChange={(event) =>
            patch({
              autoSaveSeconds: Math.min(120, Math.max(3, Number(event.target.value) || 10)),
            })
          }
        />
        <small>{strings.common.seconds}</small>
      </label>
      <label className="field-row">
        <span>{text.vaultLock}</span>
        <input
          type="number"
          min={1}
          max={120}
          value={settings.vaultLockMinutes}
          onChange={(event) =>
            patch({
              vaultLockMinutes: Math.min(120, Math.max(1, Number(event.target.value) || 5)),
            })
          }
        />
        <small>{strings.common.minutes}</small>
      </label>
      {/* The vault is one folder of ciphertext, so backing it up is copying it
          and restoring it is copying it back. Saying where it is beats a button
          that would only open Explorer. */}
      <p className="settings-hint">{text.vaultBackup}</p>
    </section>
  )
}

export default NotebookSettings
