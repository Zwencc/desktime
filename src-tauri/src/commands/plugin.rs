//! The commands a plugin's webview is allowed to call.
//!
//! This list *is* the sandbox. A plugin window's capability grants these and the
//! basic window controls, and nothing else — so a plugin page cannot read a
//! file, cannot reach the activity data, cannot touch the LLM key, and cannot
//! address another plugin: every command here takes an id, and the id was baked
//! into that window's SDK by the host rather than chosen by the page.
//!
//! (The plugin's *backend* is a different matter, and `plugin/mod.rs` says so.)

use std::sync::Arc;

use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewWindow};

use crate::plugin::{PluginState, Plugins};

/// Everything the settings page needs to render the plugin list, failures and all.
#[tauri::command]
pub fn plugin_list<R: Runtime>(app: AppHandle<R>) -> Vec<PluginState> {
    crate::plugin::states(&app)
}

/// Switches one plugin on or off, and answers with the list as it now stands.
///
/// Off is not "hidden": the window is destroyed and the backend stopped, so a
/// plugin the user has finished with costs nothing until they change their mind.
#[tauri::command]
pub fn plugin_set_enabled<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    enabled: bool,
) -> Result<Vec<PluginState>, String> {
    crate::plugin::set_enabled(&app, &id, enabled)?;
    Ok(crate::plugin::states(&app))
}

/// Re-reads the plugins folder and rebuilds every plugin window and backend,
/// answering with the new list so the settings page does not have to ask twice.
///
/// Stays a plain (non-`async`) command because there is no longer anything slow
/// in it: it tears the old windows down, re-reads the folder and answers. The
/// windows are rebuilt afterwards, off this call stack — `plugin::reload` says
/// why that part cannot happen here.
#[tauri::command]
pub fn plugin_reload<R: Runtime>(app: AppHandle<R>) -> Result<Vec<PluginState>, String> {
    crate::plugin::reload(&app)?;
    Ok(plugin_list(app))
}

/// Tells the settings page that a plugin window changed itself.
///
/// The switches in that page are the only place a plugin window can be shown or
/// pinned from, so they have to follow the window rather than only drive it: a
/// user who closes a widget with its own button and then finds "show" still
/// ticked has been told something untrue by the interface.
fn announce_window<R: Runtime>(window: &WebviewWindow<R>, field: &str, value: bool) {
    let detail = serde_json::json!({ "label": window.label(), field: value });
    let _ = window.app_handle().emit("plugin://window", detail);
}

/// Calls the plugin's own backend, starting it if this is the first time.
#[tauri::command]
pub fn plugin_call<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    method: String,
    params: Value,
) -> Result<Value, String> {
    crate::plugin::call(&app, &id, &method, params)
}

/// Window controls, so a plugin does not reimplement dragging and pinning.
///
/// The window is taken from the *caller*, not looked up by id: that way a plugin
/// can only ever move its own window, whatever it puts in the arguments.
#[tauri::command]
pub fn plugin_window<R: Runtime>(
    window: WebviewWindow<R>,
    action: String,
    width: Option<f64>,
    height: Option<f64>,
    edge: Option<String>,
) -> Result<(), String> {
    let result = match action.as_str() {
        "drag" => window.start_dragging(),
        // Both steps, in the order `applyPanelPin` uses for the built-in
        // widgets. "Unpinned" is not "not on top" here — it is *behind*
        // everything, the way a desktop gadget sits, and doing only half of it
        // would make this button disagree with the same switch in the settings
        // list for the same window.
        "pin" => {
            let _ = window.set_always_on_bottom(false);
            announce_window(&window, "pinned", true);
            window.set_always_on_top(true)
        }
        "unpin" => {
            let _ = window.set_always_on_top(false);
            let _ = window.set_always_on_bottom(true);
            announce_window(&window, "pinned", false);
            return crate::platform::set_window_to_bottom(&window)
                .map_err(|error| error.to_string());
        }
        // Not `window.hide()`. A plugin window is not app-driven, so the native
        // visibility policy guards it, and a hide it was not told about is
        // precisely what that policy rejects — the close button did nothing at
        // all. This is the call that tells it.
        "hide" => {
            announce_window(&window, "visible", false);
            return crate::platform::set_window_visibility(&window, false)
                .map_err(|error| error.to_string());
        }
        // The host's resize grips. A frameless window has no resize border of
        // its own, so the edge being pulled is named rather than hit-tested.
        "resize-drag" => {
            let Some(direction) = edge.as_deref().and_then(resize_direction) else {
                return Err("resize-drag needs an edge: n, s, e, w, ne, nw, se or sw".to_owned());
            };
            // Through the underlying window: resize-dragging is a window
            // operation, and `WebviewWindow` only forwards the move.
            window.as_ref().window().start_resize_dragging(direction)
        }
        "resize" => match (width, height) {
            (Some(width), Some(height)) => {
                window.set_size(tauri::LogicalSize::new(width, height))
            }
            _ => return Err("resize needs a width and a height".to_owned()),
        },
        other => return Err(format!("unknown window action: {other}")),
    };

    result.map_err(|error| error.to_string())
}

fn resize_direction(edge: &str) -> Option<tauri_runtime::ResizeDirection> {
    use tauri_runtime::ResizeDirection;

    Some(match edge {
        "n" => ResizeDirection::North,
        "s" => ResizeDirection::South,
        "e" => ResizeDirection::East,
        "w" => ResizeDirection::West,
        "ne" => ResizeDirection::NorthEast,
        "nw" => ResizeDirection::NorthWest,
        "se" => ResizeDirection::SouthEast,
        "sw" => ResizeDirection::SouthWest,
        _ => return None,
    })
}

/// Reads one value from the plugin's own slice of the config file.
#[tauri::command]
pub fn plugin_storage_get<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    key: String,
) -> Result<Option<String>, String> {
    let config = app
        .try_state::<crate::config::Config>()
        .ok_or_else(|| "config is not loaded".to_owned())?;

    Ok(config.raw(&storage_key(&id, &key)))
}

#[tauri::command]
pub fn plugin_storage_set<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    key: String,
    value: String,
) -> Result<(), String> {
    let config = app
        .try_state::<crate::config::Config>()
        .ok_or_else(|| "config is not loaded".to_owned())?;

    config
        .apply(vec![crate::config::ConfigEntry {
            key: storage_key(&id, &key),
            value: Some(value),
        }])
        .map_err(|error| error.to_string())
}

/// Namespaced by plugin id, which the host supplies — so one plugin cannot read
/// or overwrite another's values however it spells the key.
fn storage_key(id: &str, key: &str) -> String {
    format!("plugin.{id}.{key}")
}

/// The settings the manifest declared, with the user's values applied.
#[tauri::command]
pub fn plugin_settings<R: Runtime>(app: AppHandle<R>, id: String) -> Result<Value, String> {
    settings_of(&app, &id)
}

/// Writes one of the settings the manifest declared, then tells the plugin.
///
/// Deliberately not `plugin_storage_set`. That one lives in `plugin-host`, which
/// a plugin's own window carries, and this one lives in `plugin-management`,
/// which only the settings window has: a plugin must not be able to quietly
/// rewrite the values the user chose for it. The key is checked against the
/// manifest for the same reason — this is not a second way into arbitrary
/// storage.
#[tauri::command]
pub fn plugin_settings_set<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    key: String,
    value: Value,
) -> Result<(), String> {
    let config = app
        .try_state::<crate::config::Config>()
        .ok_or_else(|| "config is not loaded".to_owned())?;

    if !manifest_of(&app, &id)?
        .contributes
        .settings
        .iter()
        .any(|setting| setting.key == key)
    {
        return Err(format!("{id} declares no setting called {key}"));
    }

    config
        .apply(vec![crate::config::ConfigEntry {
            key: storage_key(&id, &key),
            value: Some(value.to_string()),
        }])
        .map_err(|error| error.to_string())?;

    // The plugin is already on screen holding the old value, and nothing else
    // would ever tell it otherwise. Without this a setting only takes effect
    // after a reload, which is indistinguishable from a setting that does
    // nothing.
    announce(&app, &id);
    Ok(())
}

fn manifest_of<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<crate::plugin::Manifest, String> {
    app.try_state::<Arc<Plugins>>()
        .ok_or_else(|| "plugins are not loaded".to_owned())?
        .snapshot()
        .into_iter()
        .find(|state| state.id == id)
        .ok_or_else(|| format!("no plugin called {id}"))?
        .manifest
        .ok_or_else(|| format!("{id} did not load"))
}

fn settings_of<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<Value, String> {
    let config = app
        .try_state::<crate::config::Config>()
        .ok_or_else(|| "config is not loaded".to_owned())?;
    let manifest = manifest_of(app, id)?;

    let mut values = serde_json::Map::new();
    for setting in &manifest.contributes.settings {
        // The declared default until the user changes it, so a plugin never has
        // to handle "not set yet".
        let stored = config
            .raw(&storage_key(id, &setting.key))
            .and_then(|raw| serde_json::from_str::<Value>(&raw).ok());
        values.insert(setting.key.clone(), stored.unwrap_or(setting.default.clone()));
    }

    Ok(Value::Object(values))
}

/// Hands every value to the plugin's own windows, and to nobody else's.
///
/// Same delivery as a backend notification: evaluated straight into those
/// windows rather than emitted app-wide, so isolation costs nothing and depends
/// on nothing. The id travels with it and the SDK checks it, matching the other
/// channel exactly — the two are easy to mistake for each other, and a copy of
/// one should behave like the other.
fn announce<R: Runtime>(app: &AppHandle<R>, id: &str) {
    let Ok(settings) = settings_of(app, id) else {
        return;
    };

    let detail = serde_json::json!({ "plugin": id, "settings": settings });
    let script = format!(
        "window.dispatchEvent(new CustomEvent('desktime-plugin-settings',{{detail:{detail}}}))"
    );

    for (label, window) in app.webview_windows() {
        if crate::plugin::label_belongs_to(&label, id) {
            let _ = window.eval(&script);
        }
    }
}

/// Epoch milliseconds from the host, so a plugin shares the app's clock.
#[tauri::command]
pub fn plugin_now() -> i64 {
    crate::reminder::now_ms()
}

/// The host's language id, for a plugin's own translations.
#[tauri::command]
pub fn plugin_locale<R: Runtime>(app: AppHandle<R>) -> String {
    app.try_state::<crate::config::Config>()
        .and_then(|config| config.language())
        .unwrap_or_default()
}

/// The host's theme variables, so a plugin can use `var(--accent)` and follow
/// whatever the user picked without knowing any of the palette.
#[tauri::command]
pub fn plugin_theme<R: Runtime>(app: AppHandle<R>) -> Value {
    app.try_state::<crate::config::Config>()
        .and_then(|config| config.theme_variables())
        .unwrap_or(Value::Null)
}

#[tauri::command]
pub fn plugin_log(id: String, message: String) -> Result<(), String> {
    use std::io::Write;

    let path = crate::plugin::log_path(&id);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| error.to_string())?;

    writeln!(file, "{message}").map_err(|error| error.to_string())
}

/// Opens the plugins folder, for the settings page's "open folder" button.
#[tauri::command]
pub fn plugins_directory() -> Result<String, String> {
    let dir = crate::plugin::dir();
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.to_string_lossy().into_owned())
}
