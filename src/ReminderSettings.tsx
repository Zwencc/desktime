// The "提醒" section of the settings window: the global mute, what an in-app
// reminder falls back to, and the defaults a new schedule item starts with.

import { useState } from 'react'
import { ReminderFields } from './ReminderFields'
import { readMuted, readReminderDefaults, saveMuted, saveReminderDefaults } from './reminder'
import { type AppSettings, readSettings, updateSettings } from './settings'
import { useLocale } from './locales'


export function ReminderSettings() {
  const text = useLocale().reminderSettings
  const [settings, setSettings] = useState<AppSettings>(readSettings)
  const [muted, setMuted] = useState(readMuted)
  const [reminderDefaults, setReminderDefaults] = useState(readReminderDefaults)

  function patch(next: Partial<AppSettings>) {
    setSettings(updateSettings(next))
  }

  function updateDefaults(next: typeof reminderDefaults) {
    setReminderDefaults(next)
    saveReminderDefaults(next)
  }

  function toggleMute(next: boolean) {
    setMuted(next)
    saveMuted(next)
  }

  return (
    <section className="settings-section">
      <h2>{text.title}</h2>
      <label className="field-row">
        <input type="checkbox" checked={muted} onChange={(event) => toggleMute(event.target.checked)} />
        <span>{text.mute}</span>
      </label>
      <label className="field-row wrap">
        <input
          type="checkbox"
          checked={settings.inappFallbackToDesktop}
          onChange={(event) => patch({ inappFallbackToDesktop: event.target.checked })}
        />
        <span>{text.fallback}</span>
      </label>
      <div className="settings-subhead">{text.defaults}</div>
      <ReminderFields value={reminderDefaults} onChange={updateDefaults} />
    </section>
  )
}

export default ReminderSettings
