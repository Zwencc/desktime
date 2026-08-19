// The "启动与后台" section. Windows service details stay behind the product
// term "background protection"; users can repair it, not toggle it off.

import { useCallback, useEffect, useState } from 'react'
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import {
  backgroundStatus,
  repairBackgroundProtection,
  type BackgroundStatus,
} from './api/background'
import { isTauri } from './env'
import { useLocale } from './locales'

const POLL_MS = 1500

const emptyStatus: BackgroundStatus = {
  serviceInstalled: false,
  serviceRunning: false,
  degraded: true,
}

export function StartupSettings() {
  const text = useLocale().startup
  const [autostart, setAutostart] = useState(false)
  const [background, setBackground] = useState<BackgroundStatus>(emptyStatus)
  const [pending, setPending] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const refreshBackground = useCallback(async () => {
    if (!isTauri) return emptyStatus
    try {
      const next = await backgroundStatus()
      setBackground(next)
      return next
    } catch {
      return emptyStatus
    }
  }, [])

  useEffect(() => {
    if (!isTauri) return
    void isEnabled().then(setAutostart).catch(() => undefined)
    void refreshBackground()
  }, [refreshBackground])

  useEffect(() => {
    if (!pending) return
    const timer = window.setInterval(async () => {
      const status = await refreshBackground()
      if (status.serviceRunning) setPending(false)
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [pending, refreshBackground])

  async function toggleAutostart(next: boolean) {
    try {
      await (next ? enable() : disable())
      setAutostart(next)
    } catch {
      // The registry remains the source of truth.
    }
  }

  async function repairBackground() {
    setDismissed(false)
    setPending(true)
    try {
      if (!(await repairBackgroundProtection())) {
        setDismissed(true)
        setPending(false)
      }
    } catch {
      setDismissed(true)
      setPending(false)
    }
  }

  const statusLabel = pending
    ? text.waiting
    : background.serviceRunning
      ? text.serviceRunning
      : background.serviceInstalled
        ? text.serviceInstalled
        : text.serviceOff

  return (
    <section className="settings-section">
      <h2>{text.title}</h2>

      <label className="field-row">
        <span>{text.autostart}</span>
        <input
          type="checkbox"
          checked={autostart}
          onChange={(event) => void toggleAutostart(event.target.checked)}
        />
      </label>
      <p className="settings-hint">{text.autostartHint}</p>

      <div className="field-row">
        <span>{text.service}</span>
        <small>{statusLabel}</small>
        {background.degraded && (
          <button type="button" disabled={pending} onClick={() => void repairBackground()}>
            {text.repair}
          </button>
        )}
      </div>
      <p className="settings-hint">{text.serviceHint}</p>
      {dismissed && <p className="settings-hint">{text.dismissed}</p>}
    </section>
  )
}

export default StartupSettings
