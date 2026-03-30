// The settings panel. Opened from the gear in any widget's title bar.
//
// It is deliberately not a fourth "panel": it stays out of the context menu's
// component list, out of the tray's show/hide-all, and out of the "keep one
// widget visible" rule, because it is a dialog the user opens and closes.

import { Fragment, useEffect, useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getVersion } from '@tauri-apps/api/app'
import { X } from 'lucide-react'
import {
  applyPanelPin,
  applyPanelVisibility,
  pinnedKey,
  readAllPinnedStates,
  readAllVisibleStates,
  resetPanelPosition,
  savePinnedState,
  saveVisibleState,
  visibleKey,
} from './panels'
import { type WidgetKey, widgetKeys, widgetName } from './widgets'
import {
  readMuted,
  readReminderDefaults,
  saveMuted,
  saveReminderDefaults,
} from './reminder'
import { ReminderFields } from './ReminderFields'
import { type AppSettings, readSettings, updateSettings } from './settings'
import { systemTimeZone } from './time'
import './App.css'

const text = {
  title: '设置',
  close: '关闭',
  general: '通用',
  timeZone: '时区',
  followSystem: '跟随系统',
  fixedZone: '指定时区',
  widgets: '组件',
  show: '显示',
  pin: '钉在上层',
  resetPositions: '重置所有窗口位置',
  reminders: '提醒',
  mute: '全局静音',
  fallback: '应用内提醒时若日程组件已隐藏，改用弹窗提醒',
  defaults: '新建日程默认',
  notebook: '记事本',
  autoSave: '自动保存间隔',
  seconds: '秒',
  about: '关于',
}

function startDrag(event: MouseEvent<HTMLElement>) {
  if (event.button !== 0) return
  if ((event.target as HTMLElement | null)?.closest('button,input,select')) return

  void getCurrentWindow().startDragging()
}

export function SettingsWindow() {
  const [settings, setSettings] = useState<AppSettings>(readSettings)
  const [pinnedStates, setPinnedStates] = useState(readAllPinnedStates)
  const [visibleStates, setVisibleStates] = useState(readAllVisibleStates)
  const [muted, setMuted] = useState(readMuted)
  const [reminderDefaults, setReminderDefaults] = useState(readReminderDefaults)
  const [version, setVersion] = useState('')

  // The full IANA list is one call and native `<select>` already does
  // type-ahead, so no custom picker is needed.
  const zones = useMemo(() => {
    try {
      return Intl.supportedValuesOf('timeZone')
    } catch {
      return [settings.timeZone]
    }
  }, [settings.timeZone])

  useEffect(() => {
    void getVersion()
      .then(setVersion)
      .catch(() => setVersion(''))
  }, [])

  // Pin/visible can also be changed from a widget title bar or the context menu.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      const pinnedPanel = widgetKeys.find((panel) => event.key === pinnedKey(panel))
      if (pinnedPanel) {
        setPinnedStates((current) => ({ ...current, [pinnedPanel]: event.newValue !== 'false' }))
        return
      }

      const visiblePanel = widgetKeys.find((panel) => event.key === visibleKey(panel))
      if (visiblePanel) {
        setVisibleStates((current) => ({ ...current, [visiblePanel]: event.newValue !== 'false' }))
      }
    }

    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') void getCurrentWindow().hide()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function patch(next: Partial<AppSettings>) {
    setSettings(updateSettings(next))
  }

  function setPinned(panel: WidgetKey, next: boolean) {
    setPinnedStates((current) => ({ ...current, [panel]: next }))
    savePinnedState(panel, next)
    void applyPanelPin(panel, next)
  }

  // Hiding the last widget would leave no way back except the tray, so the
  // widget windows refuse it — this list has to refuse it the same way.
  function setVisible(panel: WidgetKey, next: boolean) {
    const visibleCount = widgetKeys.filter((entry) => visibleStates[entry]).length
    if (!next && visibleStates[panel] && visibleCount <= 1) return

    setVisibleStates((current) => ({ ...current, [panel]: next }))
    saveVisibleState(panel, next)
    void applyPanelVisibility(panel, next)
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
    <main className="settings-window">
      <div className="settings-handle" onMouseDown={startDrag}>
        <span>{text.title}</span>
        <button
          className="icon-button"
          type="button"
          title={text.close}
          onClick={() => void getCurrentWindow().hide()}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      {/* The scroll lives on an inner element so a scrollbar (only ever needed
          when the window is shrunk) sits inside the card instead of cutting
          across its rounded border. */}
      <div className="settings-body">
        <div className="settings-scroll">
        <section className="settings-section">
          <h2>{text.general}</h2>
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

        <section className="settings-section">
          <h2>{text.widgets}</h2>
          <div className="widget-grid">
            <span />
            <span className="grid-head">{text.show}</span>
            <span className="grid-head">{text.pin}</span>
            {widgetKeys.map((panel) => (
              <Fragment key={panel}>
                <span>{widgetName(panel)}</span>
                <input
                  type="checkbox"
                  checked={visibleStates[panel]}
                  onChange={(event) => setVisible(panel, event.target.checked)}
                />
                <input
                  type="checkbox"
                  checked={pinnedStates[panel]}
                  onChange={(event) => setPinned(panel, event.target.checked)}
                />
              </Fragment>
            ))}
          </div>
          <button
            type="button"
            className="reminder-button"
            onClick={() => widgetKeys.forEach((panel) => void resetPanelPosition(panel))}
          >
            {text.resetPositions}
          </button>
        </section>

        <section className="settings-section">
          <h2>{text.reminders}</h2>
          <label className="field-row">
            <input
              type="checkbox"
              checked={muted}
              onChange={(event) => toggleMute(event.target.checked)}
            />
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

        <section className="settings-section">
          <h2>{text.notebook}</h2>
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
            <small>{text.seconds}</small>
          </label>
        </section>

        <section className="settings-section">
          <h2>{text.about}</h2>
          <p className="settings-about">DeskTime {version}</p>
        </section>
        </div>
      </div>
    </main>
  )
}

export default SettingsWindow
