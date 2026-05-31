//! Config on disk.
//!
//! localStorage lives inside WebView2's user-data folder, which a browser-data
//! clean-up, a WebView2 reinstall or a full 5MB quota can each take away — and
//! all three do it without saying so. The values therefore live here, in a file
//! next to the executable, and localStorage is demoted to a synchronous cache
//! that the frontend can still read without an await.
//!
//! **Everything the frontend touches goes through memory.** The file is read
//! once at startup into managed state; reads answer from that copy and writes
//! update it before it goes back to disk. A widget saving its position on every
//! frame of a drag therefore costs the UI one batched IPC call, not a disk seek
//! per frame — and because the call is IPC, the write happens off the webview's
//! thread whatever it costs.
//!
//! Values are kept as the raw strings localStorage holds and are never re-parsed
//! on the way through. A round trip via typed structs would be one more place
//! for a value to quietly change shape between the write and the read, and this
//! module exists precisely because config changing shape on its own is the
//! problem.

use std::collections::BTreeMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

use crate::activity::ActivityConfig;
use crate::devmode::root_dir;
use crate::error::{BackendError, BackendResult};

const DIR: &str = "config";
const FILE: &str = "config.json";
const TEMP: &str = "config.json.tmp";

/// Marker recording that the one-time move out of `%APPDATA%` has been done.
const MIGRATED: &str = ".migrated";

/// The key the frontend stores activity settings under, read here so collection
/// does not depend on a window being mounted. See [`Config::activity_config`].
const ACTIVITY_KEY: &str = "desktime.activity";

/// Where each widget window was left. Written by the frontend on every move and
/// resize; read back here at startup. See [`crate::startup::restore_geometry`].
///
/// Visible to the crate because plugin windows are stored under the same two
/// keys — `crate::plugin::geometry` writes them from Rust, having no frontend of
/// ours to do it. One spelling, so the two halves cannot drift apart.
pub(crate) const WINDOW_POSITION_PREFIX: &str = "desktime.windowPosition.";
pub(crate) const WINDOW_SIZE_PREFIX: &str = "desktime.windowSize.";

/// Whether a plugin is switched on, written as `"true"` or `"false"` like the
/// widgets' own pinned and visible flags.
pub(crate) const PLUGIN_ENABLED_PREFIX: &str = "desktime.pluginEnabled.";

/// Whether a window is on screen and on top. **Every** window uses these two,
/// built-in widget and plugin alike — the plugin half had its own store until it
/// turned out that a store the backend does not read is a switch that cannot
/// survive a restart.
pub(crate) const PINNED_PREFIX: &str = "desktime.pinned.";
pub(crate) const VISIBLE_PREFIX: &str = "desktime.visible.";

/// The general settings blob, read here only for the moo clock's current shape.
const SETTINGS_KEY: &str = "desktime.settings";

/// The resolved theme, written by the frontend for the benefit of plugin
/// windows: they are not part of the React app and cannot run `theme.ts`.
const THEME_VARIABLES_KEY: &str = "desktime.theme.variables";

/// The island strip's own geometry, which the ordinary window keys do not cover:
/// the island places itself and is deliberately left out of position persistence.
const ISLAND_GEOMETRY_KEY: &str = "desktime.island.geometry";

/// Held across a whole [`Config::apply`]. See that method for why the map's own
/// lock is not enough.
static WRITING: Mutex<()> = Mutex::new(());


/// Physical pixels, matching what the frontend stores — the values come from
/// Tauri's own move and resize events, which report physical coordinates.
#[derive(Deserialize)]
pub struct SavedPosition {
    pub x: i32,
    pub y: i32,
}

#[derive(Deserialize)]
pub struct SavedSize {
    pub width: u32,
    pub height: u32,
}

/// Position and size together, for a window that stores both as one value.
#[derive(Deserialize)]
pub struct SavedGeometry {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// A `BTreeMap` rather than a `HashMap`: the file is meant to be readable and
/// diffable, and that needs a stable key order.
pub type ConfigMap = BTreeMap<String, String>;

/// One change in a batch. A `None` value deletes the key, mirroring
/// `localStorage.removeItem`.
#[derive(Deserialize)]
pub struct ConfigEntry {
    pub key: String,
    pub value: Option<String>,
}

/// What the frontend needs to bring localStorage up to date, in one call. The
/// path travels with it so a failure notice can name the folder — "config could
/// not be saved" is not answerable without one.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigSnapshot {
    pub path: String,
    pub values: ConfigMap,
}

pub struct Config {
    values: Mutex<ConfigMap>,
}

pub fn dir() -> PathBuf {
    root_dir().join(DIR)
}

pub fn file_path() -> PathBuf {
    dir().join(FILE)
}

impl Config {
    /// Reads the file once. A missing or unreadable file yields an empty map,
    /// which the frontend reads as "first run" and answers by sending it
    /// everything localStorage currently holds.
    pub fn load() -> Self {
        Self {
            values: Mutex::new(read_file().unwrap_or_default()),
        }
    }

    pub fn snapshot(&self) -> BackendResult<ConfigSnapshot> {
        Ok(ConfigSnapshot {
            path: file_path().to_string_lossy().into_owned(),
            values: self.lock()?.clone(),
        })
    }

    /// Applies a batch and puts the whole map back on disk.
    ///
    /// The error is returned rather than swallowed. `activity/store.rs` can
    /// afford to drop a minute of statistics; losing a setting is the failure
    /// this module was added to stop, so the frontend has to be able to say so.
    ///
    /// **The whole read-modify-write is serialised, not just the file.** The
    /// command that calls this is `async`, so two windows can be in here at
    /// once, and the map lock alone would not be enough: each would take a
    /// snapshot, and whichever reached `rename` last would put its own back
    /// over the other's. The later writer has to be the one that saw the
    /// earlier writer's change, which means holding this from before the
    /// snapshot until after the file. It also makes the fixed temp file name
    /// safe again — only one writer is ever using it.
    pub fn apply(&self, entries: Vec<ConfigEntry>) -> BackendResult<()> {
        // The guarded value is `()`; a poisoned lock carries no damaged state
        // to recover from, and refusing to save settings because an unrelated
        // write panicked once would be the worse failure.
        let _writing = WRITING.lock().unwrap_or_else(|error| error.into_inner());

        let snapshot = {
            let mut values = self.lock()?;
            for entry in entries {
                match entry.value {
                    Some(value) => values.insert(entry.key, value),
                    None => values.remove(&entry.key),
                };
            }
            values.clone()
        };

        write_file(&snapshot)
    }

    /// The stored collection config, or the default when there is none.
    ///
    /// Read here rather than waited for. The backend used to start with
    /// collection off and rely on the moo clock's webview mounting to push the
    /// stored value across, which made collection depend on a window that
    /// nobody has to open and that starts hidden.
    pub fn activity_config(&self) -> ActivityConfig {
        #[derive(Deserialize)]
        struct Stored {
            monitor: ActivityConfig,
        }

        self.lock()
            .ok()
            .and_then(|values| values.get(ACTIVITY_KEY).cloned())
            .and_then(|raw| serde_json::from_str::<Stored>(&raw).ok())
            .map(|stored| stored.monitor)
            .unwrap_or_default()
    }

    /// Where this window was last left, if it has ever been placed.
    pub fn window_position(&self, label: &str) -> Option<SavedPosition> {
        self.parsed(&format!("{WINDOW_POSITION_PREFIX}{label}"))
    }

    /// The collapsed island strip's last geometry, when the moo clock is wearing
    /// that shape. `None` covers both "not an island" and "never been one", and
    /// the caller then falls back to the ordinary window geometry.
    pub fn island_geometry(&self) -> Option<SavedGeometry> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Stored {
            moo_shape: Option<String>,
        }

        let shape = self.parsed::<Stored>(SETTINGS_KEY)?.moo_shape?;
        if shape != "island" {
            return None;
        }

        self.parsed(ISLAND_GEOMETRY_KEY)
    }

    /// The size this window was last dragged to, if it is resizable and was.
    pub fn window_size(&self, label: &str) -> Option<SavedSize> {
        self.parsed(&format!("{WINDOW_SIZE_PREFIX}{label}"))
    }

    /// Whether a plugin is switched on.
    ///
    /// Absent means yes: a plugin sitting in the folder is one the user put
    /// there, and defaulting to off would make every install look broken.
    pub fn plugin_enabled(&self, id: &str) -> bool {
        self.raw(&format!("{PLUGIN_ENABLED_PREFIX}{id}"))
            .as_deref()
            != Some("false")
    }

    /// Whether this window was last left on screen. `None` means never recorded,
    /// which each caller answers differently: a widget has a registry default and
    /// a plugin window starts hidden.
    pub fn window_visible(&self, label: &str) -> Option<bool> {
        self.flag(VISIBLE_PREFIX, label)
    }

    /// Whether this window was last left on top.
    pub fn window_pinned(&self, label: &str) -> Option<bool> {
        self.flag(PINNED_PREFIX, label)
    }

    fn flag(&self, prefix: &str, label: &str) -> Option<bool> {
        self.raw(&format!("{prefix}{label}"))
            .map(|value| value != "false")
    }

    /// One stored value, exactly as the frontend wrote it.
    ///
    /// Used by the plugin commands, which namespace their keys under
    /// `plugin.<id>.` and therefore cannot reach anything else in the file.
    pub fn raw(&self, key: &str) -> Option<String> {
        self.lock().ok()?.get(key).cloned()
    }

    /// The language in force, for plugins that ship their own translations.
    pub fn language(&self) -> Option<String> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Stored {
            language: Option<String>,
        }

        self.parsed::<Stored>(SETTINGS_KEY)?.language
    }

    /// The active theme's CSS variables, handed to plugin windows so they can
    /// follow the user's theme without knowing the palette. Returns `None` when
    /// the frontend has not written the resolved set yet.
    pub fn theme_variables(&self) -> Option<serde_json::Value> {
        self.parsed(THEME_VARIABLES_KEY)
    }

    /// The one place a stored value is parsed rather than passed through. A
    /// malformed entry answers `None` and the caller falls back to a default,
    /// which is why nothing here reports an error.
    fn parsed<T: serde::de::DeserializeOwned>(&self, key: &str) -> Option<T> {
        self.lock()
            .ok()?
            .get(key)
            .and_then(|raw| serde_json::from_str(raw).ok())
    }

    fn lock(&self) -> BackendResult<std::sync::MutexGuard<'_, ConfigMap>> {
        self.values
            .lock()
            .map_err(|_| BackendError::StatePoisoned("config"))
    }
}

fn read_file() -> BackendResult<ConfigMap> {
    Ok(serde_json::from_str(&std::fs::read_to_string(file_path())?)?)
}

fn write_file(values: &ConfigMap) -> BackendResult<()> {
    let dir = dir();
    std::fs::create_dir_all(&dir)?;

    // A temp file and a rename, never a write in place: a config that survives
    // half a write is the same loss as one that does not survive at all, and
    // renaming within a single directory is atomic on Windows.
    let temp = dir.join(TEMP);
    let mut file = std::fs::File::create(&temp)?;
    file.write_all(serde_json::to_string_pretty(values)?.as_bytes())?;
    file.sync_all()?;
    drop(file);

    std::fs::rename(&temp, dir.join(FILE))?;
    Ok(())
}

/// Brings across the data that used to live in `%APPDATA%\com.desktime.app\`.
///
/// Runs once, on the first start after the move, and **copies rather than
/// moves**: if the new location turns out to be unwritable, the old copy is
/// then still the one that exists. The marker records where the data came from,
/// because "my notes are gone" needs an answer that is a path.
///
/// Failures are deliberately quiet. A missing legacy folder is the normal case
/// for a fresh install, and a copy that cannot be made leaves the old data
/// exactly where it was — neither is worth a message on first launch.
pub fn migrate_legacy_data<R: Runtime>(app: &AppHandle<R>) {
    let root = root_dir();
    let marker = root.join(MIGRATED);
    if marker.exists() {
        return;
    }

    let Ok(legacy) = app.path().app_data_dir() else {
        return;
    };

    copy_dir(&legacy.join("drafts"), &root.join("drafts"));
    copy_dir(&legacy.join("activity"), &root.join("activity"));
    copy_file(&legacy.join(crate::llm::KEY_FILE), &root.join(crate::llm::KEY_FILE));

    let _ = std::fs::write(
        marker,
        format!("copied from {}\n", legacy.to_string_lossy()),
    );
}

/// Flat by design: both legacy folders hold one file per draft and one per day,
/// with no nesting to walk.
fn copy_dir(from: &Path, to: &Path) {
    let Ok(entries) = std::fs::read_dir(from) else {
        return;
    };
    if std::fs::create_dir_all(to).is_err() {
        return;
    }

    for entry in entries.flatten() {
        if entry.file_type().is_ok_and(|kind| kind.is_file()) {
            copy_file(&entry.path(), &to.join(entry.file_name()));
        }
    }
}

/// Never overwrites: on a second run the new location is the live one, and its
/// copy is the newer of the two.
fn copy_file(from: &Path, to: &Path) {
    if from.is_file() && !to.exists() {
        let _ = std::fs::copy(from, to);
    }
}
