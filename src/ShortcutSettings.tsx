// The "快捷键" section of the settings window.
//
// Each row records a key by listening for one press rather than parsing typed
// text: what the user pressed is exactly what gets stored, so there is no way
// to save a spelling the Rust parser will reject.

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  type ResolvedShortcut,
  conflictOf,
  resolveShortcuts,
  shortcutFailureStore,
  shortcutRecordingStore,
  shortcutStore,
} from './shortcuts'
import { locale, useLocale } from './locales'


/** Codes that are a modifier on their own — pressing Ctrl is not a shortcut. */
const MODIFIER_CODE = /^(Control|Alt|Shift|Meta|OS)/

function acceleratorFrom(event: KeyboardEvent): string | null {
  if (MODIFIER_CODE.test(event.code)) return null

  const parts: string[] = []
  if (event.ctrlKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (event.metaKey) parts.push('Super')
  // A bare key registered globally would be swallowed everywhere on the machine.
  if (parts.length === 0) return null

  return [...parts, event.code].join('+')
}

/** `Ctrl+Alt+Digit1` → `Ctrl + Alt + 1`: the stored form is for the parser, not for reading. */
function formatAccelerator(accelerator: string) {
  if (!accelerator) return locale().shortcutSettings.unbound

  return accelerator
    .split('+')
    .map((part) => part.replace(/^Digit/, '').replace(/^Key/, ''))
    .join(' + ')
}

export function ShortcutSettings() {
  const strings = useLocale()
  const text = strings.shortcutSettings
  const stored = useSyncExternalStore(shortcutStore.subscribe, shortcutStore.snapshot)
  const failures = useSyncExternalStore(shortcutFailureStore.subscribe, shortcutFailureStore.snapshot)
  // The id being recorded, or '' for none — a plain string rather than a
  // nullable one so the id can key the store without a cast.
  const [recording, setRecording] = useState('')

  const shortcuts = useMemo(() => resolveShortcuts(shortcutStore.parse(stored)), [stored])
  const failed = useMemo(
    () => new Set(shortcutFailureStore.parse(failures).failed),
    [failures],
  )

  useEffect(() => {
    if (!recording) return

    // The launcher gives the keys back for as long as this is set, or an
    // already-bound key would run its action instead of being recorded.
    shortcutRecordingStore.save({ recording: true })

    function onKeyDown(event: KeyboardEvent) {
      // Capture phase and stopped here: while recording, the window's own Escape
      // handler must not close the settings window out from under the row.
      event.preventDefault()
      event.stopPropagation()

      if (event.code === 'Escape') {
        setRecording('')
        return
      }

      const accelerator = acceleratorFrom(event)
      if (!accelerator) return

      shortcutStore.update({ [recording]: accelerator })
      setRecording('')
    }

    // Hiding the window does not unmount it, so without this a row left
    // recording would keep every shortcut unregistered for the rest of the run.
    function cancel() {
      setRecording('')
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('blur', cancel)
      shortcutRecordingStore.save({ recording: false })
    }
  }, [recording])

  function renderRow(shortcut: ResolvedShortcut) {
    const clash = conflictOf(shortcuts, shortcut.id, shortcut.accelerator)
    const isRecording = recording === shortcut.id

    return (
      <div className="shortcut-row" key={shortcut.id}>
        <span className="grow">{shortcut.label}</span>
        <button
          type="button"
          className={isRecording ? 'shortcut-key recording' : 'shortcut-key'}
          onClick={() => setRecording(isRecording ? '' : shortcut.id)}
        >
          {isRecording ? text.recording : formatAccelerator(shortcut.accelerator)}
        </button>
        <button
          type="button"
          className="shortcut-clear"
          title={strings.common.reset}
          onClick={() => shortcutStore.update({ [shortcut.id]: '' })}
        >
          ×
        </button>
        {clash && <p className="shortcut-warn">{text.conflict(clash)}</p>}
        {!clash && failed.has(shortcut.id) && <p className="shortcut-warn">{text.failed}</p>}
      </div>
    )
  }

  return (
    <section className="settings-section">
      <h2>{text.title}</h2>
      <p className="settings-hint">{text.intro}</p>

      {shortcuts.map(renderRow)}

      <button type="button" className="reminder-button" onClick={() => shortcutStore.save({})}>
        {strings.common.reset}
      </button>
      <p className="settings-hint">{text.launcher}</p>

      <div className="settings-subhead">{text.inWindow}</div>
      <div className="shortcut-row">
        <span className="grow">{text.escapeLabel}</span>
        <span className="shortcut-key static">{'Esc'}</span>
      </div>
      <p className="settings-hint">{text.escapeHint}</p>
    </section>
  )
}

export default ShortcutSettings
