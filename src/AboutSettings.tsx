// The "关于" section of the settings window.

import { useEffect, useState } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import { configLocation } from './config'
import { openInExplorer } from './notebook'
import { useLocale } from './locales'


export function AboutSettings() {
  const text = useLocale().about
  const [version, setVersion] = useState('')

  useEffect(() => {
    void getVersion()
      .then(setVersion)
      .catch(() => setVersion(''))
  }, [])

  const path = configLocation()

  return (
    <section className="settings-section">
      <h2>{text.title}</h2>
      <p className="settings-about">DeskTime {version}</p>

      {path && (
        <>
          <div className="settings-subhead">{text.storage}</div>
          <p className="dev-path">{path}</p>
          <button
            type="button"
            className="reminder-button"
            onClick={() => void openInExplorer(path, true)}
          >
            {text.open}
          </button>
          <p className="settings-hint">{text.storageHint}</p>
        </>
      )}
    </section>
  )
}

export default AboutSettings
