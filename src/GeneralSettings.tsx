// The "通用" section of the settings window: theme and time zone.
//
// Split out of SettingsWindow when settings became a two-column navigation, so
// the shell holds the tree and each section owns its own state.

import { useMemo, useState } from 'react'
import {
  type LanguageId,
  FOLLOW_SYSTEM,
  currentLanguage,
  languages,
  setLanguage,
  useLocale,
} from './locales'
import { type AppSettings, readSettings, updateSettings } from './settings'
import { themes } from './theme'
import { systemTimeZone } from './time'

/** A language's own name, for the "follow system" row. */
function languageName(id: LanguageId) {
  return languages.find((entry) => entry.id === id)?.locale.language.name ?? id
}

export function GeneralSettings() {
  const strings = useLocale()
  const text = strings.general
  const [settings, setSettings] = useState<AppSettings>(readSettings)

  // The full IANA list is one call and native `<select>` already does
  // type-ahead, so no custom picker is needed.
  const zones = useMemo(() => {
    try {
      return Intl.supportedValuesOf('timeZone')
    } catch {
      return [settings.timeZone]
    }
  }, [settings.timeZone])

  function patch(next: Partial<AppSettings>) {
    setSettings(updateSettings(next))
  }

  return (
    <section className="settings-section">
      <h2>{text.title}</h2>
      <div className="field-row">
        <span>{text.theme}</span>
        <div className="theme-swatches">
          {themes.map((entry) => (
            <button
              key={entry.id}
              type="button"
              title={strings.themeNames[entry.id]}
              aria-label={strings.themeNames[entry.id]}
              aria-pressed={settings.theme === entry.id}
              className={settings.theme === entry.id ? 'theme-swatch active' : 'theme-swatch'}
              style={{
                background: `linear-gradient(160deg, ${entry.vars['--panel-top']}, ${entry.vars['--panel-bottom']})`,
                color: entry.vars['--accent'],
              }}
              onClick={() => patch({ theme: entry.id })}
            >
              <span className="theme-swatch-dot" />
            </button>
          ))}
        </div>
      </div>
      <label className="field-row">
        <span>{text.language}</span>
        <select
          className="grow"
          // The stored value rather than the language in force: an empty one is
          // the "follow system" choice, and collapsing it to whatever that
          // resolved to would leave the row unable to show its own default.
          // Read fresh rather than from `settings`, which is this component's
          // own copy and is not what `setLanguage` writes through.
          value={readSettings().language}
          onChange={(event) => setLanguage(event.target.value as LanguageId)}
        >
          {/* Named with the language it currently resolves to, so choosing it
              is not a step into the dark. */}
          <option value={FOLLOW_SYSTEM}>
            {`${text.followSystem} (${languageName(currentLanguage())})`}
          </option>
          {languages.map((entry) => (
            // Each language names itself: someone who has landed in a language
            // they cannot read still has to be able to find their way out.
            <option key={entry.id} value={entry.id}>
              {entry.locale.language.name}
            </option>
          ))}
        </select>
      </label>
      <div className="field-row">
        <span>{text.timeZone}</span>
        <label>
          <input
            type="radio"
            name="tzMode"
            checked={settings.timeZoneMode === 'system'}
            onChange={() => patch({ timeZoneMode: 'system' })}
          />
          <span>{text.followSystem}</span>
        </label>
        <label>
          <input
            type="radio"
            name="tzMode"
            checked={settings.timeZoneMode === 'fixed'}
            onChange={() => patch({ timeZoneMode: 'fixed' })}
          />
          <span>{text.fixedZone}</span>
        </label>
      </div>
      <div className="field-row">
        <select
          className="grow"
          value={settings.timeZoneMode === 'system' ? systemTimeZone() : settings.timeZone}
          disabled={settings.timeZoneMode === 'system'}
          onChange={(event) => patch({ timeZone: event.target.value })}
        >
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </div>
    </section>
  )
}

export default GeneralSettings
