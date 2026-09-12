// LLM settings.
//
// The list of what gets sent is written out in full rather than summarised. It
// is the only way a user can judge whether to turn this on, and the backend's
// context struct is small enough that the list is genuinely complete.

import { useEffect, useState, useSyncExternalStore } from 'react'
import { hasLlmKey, llmSnapshot, readLlm, setLlmKey, subscribeLlm, updateLlm } from './llm'
import { useLocale } from './locales'


export function LlmSettings() {
  const strings = useLocale()
  const text = strings.llmSettings
  useSyncExternalStore(subscribeLlm, llmSnapshot)
  const config = readLlm()
  const [keyDraft, setKeyDraft] = useState('')
  const [keyStored, setKeyStored] = useState(false)

  useEffect(() => {
    void hasLlmKey().then(setKeyStored)
  }, [])

  async function saveKey(value: string) {
    await setLlmKey(value)
    setKeyDraft('')
    setKeyStored(await hasLlmKey())
  }

  return (
    <section className="settings-section">
      <h2>{text.title}</h2>
      <p className="settings-hint">{text.intro}</p>

      <label className="field-row">
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(event) => updateLlm({ enabled: event.target.checked })}
        />
        <span>{text.enable}</span>
      </label>

      <label className="field-row">
        <span>{text.baseUrl}</span>
        <input
          type="text"
          className="grow"
          value={config.baseUrl}
          onChange={(event) => updateLlm({ baseUrl: event.target.value })}
        />
      </label>

      <label className="field-row">
        <span>{text.model}</span>
        <input
          type="text"
          className="grow"
          value={config.model}
          onChange={(event) => updateLlm({ model: event.target.value })}
        />
      </label>

      <div className="field-row">
        <span>{text.apiKey}</span>
        <input
          type="password"
          className="grow"
          placeholder={keyStored ? text.keySet : text.keyEmpty}
          value={keyDraft}
          onChange={(event) => setKeyDraft(event.target.value)}
        />
        <button
          type="button"
          className="reminder-button"
          disabled={!keyDraft.trim()}
          onClick={() => void saveKey(keyDraft.trim())}
        >
          {strings.common.save}
        </button>
        <button type="button" className="reminder-button" onClick={() => void saveKey('')}>
          {text.clear}
        </button>
      </div>

      <label className="field-row">
        <span>{text.timeout}</span>
        <input
          type="number"
          min={1000}
          max={30000}
          step={500}
          value={config.timeoutMs}
          onChange={(event) =>
            updateLlm({
              timeoutMs: Math.min(30000, Math.max(1000, Number(event.target.value) || 8000)),
            })
          }
        />
        <small>{text.ms}</small>
      </label>

      <label className="field-row wrap">
        <input
          type="checkbox"
          checked={config.sendSalary}
          onChange={(event) => updateLlm({ sendSalary: event.target.checked })}
        />
        <span>{text.sendSalary}</span>
      </label>

      <div className="settings-subhead">{text.sends}</div>
      <p className="settings-hint">{text.sendList}</p>
      <div className="settings-subhead">{text.never}</div>
      <p className="settings-hint">{text.neverList}</p>
      <p className="settings-hint">{text.rate}</p>
    </section>
  )
}

export default LlmSettings
