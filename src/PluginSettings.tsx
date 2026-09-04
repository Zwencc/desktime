// The "插件" settings page.
//
// This list is the only place a plugin that failed to load can be seen, so it
// shows failures as prominently as successes: "I put it in the folder and
// nothing happened" is the worst bug report a plugin host can receive, and the
// answer to it — a bad id, a missing entry file, the wrong API version — is
// always already known by the time this renders.
//
// It also states what a backend is. A plugin's page is confined by its
// capability; its backend process is not, and pretending otherwise would invite
// exactly the trust that cannot be honoured.

import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { AlertTriangle, FolderOpen, RefreshCw, Terminal } from 'lucide-react'
import { isTauri } from './env'
import { useLocale } from './locales'
import { openInExplorer } from './notebook'
import { applyPanelPin, applyPanelVisibility, pinnedKey, visibleKey } from './panels'

type PluginWidget = {
  key: string
  name: string
  /**
   * Present only on a browser-type widget, and the reason this type knows about
   * it: a window showing somebody else's website is a different thing to install
   * from a window showing the plugin's own page, and the person installing it is
   * entitled to see which sites before they turn it on.
   */
  browser: { allowedOrigins: string[] } | null
}

/**
 * One setting a plugin declared. Rendered here rather than by the plugin, which
 * is the point of declaring it: a plugin does not build a settings page, and so
 * cannot invent its own idea of what one looks like.
 */
type PluginSetting = {
  key: string
  label: string
  type: 'boolean' | 'number' | 'text' | 'select'
  min: number | null
  max: number | null
  unit: string | null
  options: string[]
}

type PluginManifest = {
  id: string
  name: string
  version: string
  description: string
  author: string
  contributes: { widgets: PluginWidget[]; settings: PluginSetting[] }
  backend: { command: string } | null
  permissions: string[]
}

type PluginState = {
  id: string
  manifest: PluginManifest | null
  error: string | null
  backendRunning: boolean
  backendFailed: boolean
  /** Off means the backend is stopped and the windows are gone, not hidden. */
  enabled: boolean
}

/** `plugin:<id>:<widget key>` — the label `plugin::create_window` uses. */
function windowLabel(id: string, key: string) {
  return `plugin:${id}:${key}`
}

type WindowFlags = { visible: Record<string, boolean>; pinned: Record<string, boolean> }

/**
 * Whether each plugin window is on screen and on top, from the same two keys a
 * built-in widget uses.
 *
 * This page used to keep a store of its own, and the backend could not read it —
 * so a window the user had left showing was rebuilt hidden at the next launch
 * while these switches went on claiming it was up, and clicking one only turned
 * it off. Sharing the keys makes the switch and the window the same fact.
 *
 * The defaults match `plugin::create_window`: unrecorded is hidden, and on top.
 */
function readFlags(list: PluginState[]): WindowFlags {
  const flags: WindowFlags = { visible: {}, pinned: {} }

  list.forEach((plugin) => {
    plugin.manifest?.contributes.widgets.forEach((widget) => {
      const label = windowLabel(plugin.id, widget.key)
      flags.visible[label] = localStorage.getItem(visibleKey(label)) === 'true'
      flags.pinned[label] = localStorage.getItem(pinnedKey(label)) !== 'false'
    })
  })

  return flags
}

type SettingValues = Record<string, unknown>

/**
 * Every declaring plugin's current values, in one pass.
 *
 * The backend answers with the declared default for anything the user has never
 * touched, so there is no "not set yet" state to render here — and a plugin that
 * fails to answer simply shows its defaults rather than taking the page down.
 */
async function readValues(list: PluginState[]) {
  const answers = await Promise.all(
    list
      .filter((plugin) => plugin.manifest?.contributes.settings.length)
      .map(async (plugin) => {
        const settings = await invoke<SettingValues>('plugin_settings', {
          id: plugin.id,
        }).catch(() => ({}) as SettingValues)
        return [plugin.id, settings] as const
      }),
  )

  return Object.fromEntries(answers)
}

function clamp(value: number, setting: PluginSetting) {
  const low = setting.min ?? Number.NEGATIVE_INFINITY
  const high = setting.max ?? Number.POSITIVE_INFINITY
  return Math.min(high, Math.max(low, value))
}

export function PluginSettings() {
  const strings = useLocale()
  const text = strings.plugins
  const [plugins, setPlugins] = useState<PluginState[]>([])
  const [values, setValues] = useState<Record<string, SettingValues>>({})
  const [windows, setWindows] = useState<WindowFlags>({ visible: {}, pinned: {} })
  const [reloading, setReloading] = useState(false)

  const refresh = useCallback(async () => {
    if (!isTauri) return

    try {
      const list = await invoke<PluginState[]>('plugin_list')
      setPlugins(list)
      setWindows(readFlags(list))
      setValues(await readValues(list))
    } catch {
      setPlugins([])
      setValues({})
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // A plugin window can hide or unpin itself from its own shell, and these
  // switches are the only place it can be reached from — so they have to follow
  // it. A "show" still ticked over a window that is gone is the interface
  // telling the user something untrue.
  useEffect(() => {
    if (!isTauri) return

    const stopping = listen<{ label: string; visible?: boolean; pinned?: boolean }>(
      'plugin://window',
      ({ payload }) => {
        if (payload.visible !== undefined) {
          localStorage.setItem(visibleKey(payload.label), String(payload.visible))
        }
        if (payload.pinned !== undefined) {
          localStorage.setItem(pinnedKey(payload.label), String(payload.pinned))
        }

        setWindows((current) => ({
          visible:
            payload.visible === undefined
              ? current.visible
              : { ...current.visible, [payload.label]: payload.visible },
          pinned:
            payload.pinned === undefined
              ? current.pinned
              : { ...current.pinned, [payload.label]: payload.pinned },
        }))
      },
    )

    return () => void stopping.then((stop) => stop())
  }, [])

  /**
   * Re-reads the folder in the backend, rather than re-reading the snapshot it
   * took at startup.
   *
   * That is the whole of the fix: this button used to call `plugin_list`, which
   * answers from a list discovered once when the app launched — so editing a
   * `plugin.json` and pressing reload changed nothing, with no error to explain
   * why. The command answers with the new list, so there is no second call and
   * no window in between where the page shows the old one.
   */
  async function reload() {
    if (!isTauri || reloading) return

    setReloading(true)
    try {
      const list = await invoke<PluginState[]>('plugin_reload')
      setPlugins(list)
      setWindows(readFlags(list))
      setValues(await readValues(list))
    } catch {
      // The backend keeps whatever it had; re-reading is the honest fallback.
      await refresh()
    } finally {
      setReloading(false)
    }
  }

  async function openFolder() {
    const dir = await invoke<string>('plugins_directory').catch(() => '')
    if (dir) await openInExplorer(dir, false)
  }

  function setVisible(label: string, visible: boolean) {
    localStorage.setItem(visibleKey(label), String(visible))
    setWindows((current) => ({ ...current, visible: { ...current.visible, [label]: visible } }))
    void applyPanelVisibility(label, visible)
    // A window that has just been shown has to be put back where the user left
    // it in the Z-order; nothing else re-applies it.
    if (visible) void applyPanelPin(label, windows.pinned[label] !== false)
  }

  function setPinned(label: string, pinned: boolean) {
    localStorage.setItem(pinnedKey(label), String(pinned))
    setWindows((current) => ({ ...current, pinned: { ...current.pinned, [label]: pinned } }))
    void applyPanelPin(label, pinned)
  }

  /** Switching a plugin off stops its backend and destroys its windows. */
  async function setEnabled(id: string, enabled: boolean) {
    const list = await invoke<PluginState[]>('plugin_set_enabled', { id, enabled }).catch(
      () => null,
    )
    if (!list) return
    setPlugins(list)
    if (enabled) return

    // The windows are gone, not hidden, so the switch that shows them cannot go
    // on claiming one is up. Written as false rather than removed, so the record
    // and what `create_window` will do next time say the same thing.
    const plugin = list.find((entry) => entry.id === id)
    plugin?.manifest?.contributes.widgets.forEach((widget) => {
      localStorage.setItem(visibleKey(windowLabel(id, widget.key)), 'false')
    })
    setWindows(readFlags(list))
  }

  /**
   * Written straight through rather than debounced.
   *
   * A setting is changed by hand every few months; the write is one small file,
   * and the backend has to see it anyway before it can tell the plugin. The
   * frontend's own settings debounce exists for window drags, which produce a
   * write per frame — this produces one per keystroke at worst.
   */
  function setValue(id: string, setting: PluginSetting, value: unknown) {
    setValues((current) => ({ ...current, [id]: { ...current[id], [setting.key]: value } }))
    void invoke('plugin_settings_set', { id, key: setting.key, value })
  }

  function control(id: string, setting: PluginSetting, value: unknown) {
    if (setting.type === 'boolean') {
      return (
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => setValue(id, setting, event.target.checked)}
        />
      )
    }

    if (setting.type === 'select') {
      return (
        <select
          value={String(value ?? '')}
          onChange={(event) => setValue(id, setting, event.target.value)}
        >
          {setting.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )
    }

    if (setting.type === 'number') {
      return (
        <input
          type="number"
          min={setting.min ?? undefined}
          max={setting.max ?? undefined}
          value={Number(value ?? 0)}
          onChange={(event) =>
            setValue(id, setting, clamp(Number(event.target.value) || 0, setting))
          }
        />
      )
    }

    return (
      <input
        type="text"
        value={String(value ?? '')}
        onChange={(event) => setValue(id, setting, event.target.value)}
      />
    )
  }

  function renderSettings(plugin: PluginState) {
    const declared = plugin.manifest?.contributes.settings ?? []
    if (!declared.length) return null

    const current = values[plugin.id] ?? {}

    return (
      <div className="plugin-settings">
        <div className="settings-subhead">{text.options}</div>
        {declared.map((setting) => (
          <label className="field-row" key={setting.key}>
            <span className="grow">{setting.label}</span>
            {control(plugin.id, setting, current[setting.key])}
            {setting.unit && <small>{setting.unit}</small>}
          </label>
        ))}
      </div>
    )
  }

  /**
   * The switches the *host* provides, in a column of their own.
   *
   * They used to sit under the description with the window's name in front of
   * them, which read as one of the plugin's own settings — the plugin's real
   * settings are now the thing directly under the description, where they
   * belong, and everything the framework contributes is over here.
   */
  function renderControls(plugin: PluginState) {
    const widgets = plugin.manifest?.contributes.widgets ?? []

    return (
      <div className="plugin-controls">
        <label>
          <input
            type="checkbox"
            checked={plugin.enabled}
            onChange={(event) => void setEnabled(plugin.id, event.target.checked)}
          />
          <span>{text.enabled}</span>
        </label>

        {widgets.map((widget) => {
          const label = windowLabel(plugin.id, widget.key)
          return (
            <div className="plugin-window-controls" key={widget.key}>
              {/* Worth naming only when there is more than one. With a single
                  window the plugin's own name above already says which. */}
              {widgets.length > 1 && <div className="plugin-control-name">{widget.name}</div>}
              <label>
                <input
                  type="checkbox"
                  disabled={!plugin.enabled}
                  checked={windows.visible[label] === true}
                  onChange={(event) => setVisible(label, event.target.checked)}
                />
                <span>{strings.widgetSettings.show}</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  disabled={!plugin.enabled}
                  // Built always-on-top, so an unrecorded window is pinned.
                  checked={windows.pinned[label] !== false}
                  onChange={(event) => setPinned(label, event.target.checked)}
                />
                <span>{strings.widgetSettings.pin}</span>
              </label>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <section className="settings-section">
      <h2>{text.title}</h2>
      <p className="settings-hint">{text.intro}</p>

      <div className="field-row">
        <button type="button" className="reminder-button" onClick={() => void openFolder()}>
          <FolderOpen size={13} aria-hidden="true" />
          {text.openFolder}
        </button>
        <button
          type="button"
          className="reminder-button"
          disabled={reloading}
          onClick={() => void reload()}
        >
          <RefreshCw size={13} aria-hidden="true" />
          {reloading ? text.reloading : text.reload}
        </button>
      </div>

      {plugins.length === 0 && <p className="settings-hint">{text.none}</p>}

      {plugins.map((plugin) => (
        <div key={plugin.id} className="plugin-card">
          <div className="plugin-head">
            <span className="plugin-name">{plugin.manifest?.name ?? plugin.id}</span>
            {plugin.manifest && <span className="plugin-version">{plugin.manifest.version}</span>}
          </div>

          {plugin.error ? (
            <p className="plugin-error">
              <AlertTriangle size={12} aria-hidden="true" />
              {text.failed(plugin.error)}
            </p>
          ) : (
            <div className="plugin-body">
              <div className="plugin-main">
                {plugin.manifest?.description && (
                  <p className="settings-hint">{plugin.manifest.description}</p>
                )}

                {plugin.manifest?.permissions.length ? (
                  <p className="plugin-meta">
                    {text.permissions}: {plugin.manifest.permissions.join(', ')}
                  </p>
                ) : null}

                {/* Derived from what the manifest actually grants, not from a
                    free-text permission the plugin claimed for itself. */}
                {plugin.manifest?.contributes.widgets
                  .filter((widget) => widget.browser)
                  .map((widget) => (
                    <p key={widget.key} className="plugin-error">
                      <AlertTriangle size={12} aria-hidden="true" />
                      {text.browserAccess(
                        (widget.browser?.allowedOrigins ?? [])
                          .map((origin) => origin.replace(/^https:\/\//, ''))
                          .join('、'),
                      )}
                    </p>
                  ))}

                {plugin.manifest?.backend && (
                  <p className="plugin-meta">
                    <Terminal size={12} aria-hidden="true" />
                    {text.backend}: <code>{plugin.manifest.backend.command}</code>
                  </p>
                )}

                {plugin.backendFailed && <p className="plugin-error">{text.backendFailed}</p>}

                {renderSettings(plugin)}
              </div>

              {renderControls(plugin)}
            </div>
          )}
        </div>
      ))}
    </section>
  )
}

export default PluginSettings
