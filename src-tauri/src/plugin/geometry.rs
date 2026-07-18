//! Where a plugin window was last left.
//!
//! Plugin windows use the **same two config keys** as the built-in widgets —
//! `desktime.windowPosition.<label>` and `desktime.windowSize.<label>` — so
//! `Config` needs to know nothing about plugins, and a plugin window is restored
//! from exactly the values a widget window is.
//!
//! The saving is the one half that cannot be shared. A built-in widget persists
//! its own geometry from `App.tsx`, because a built-in widget *is* our frontend;
//! a plugin page is somebody else's HTML with no access to any of that, so the
//! host watches the window instead.
//!
//! Writes are batched. `Moved` arrives on every frame of a drag and every
//! `Config::apply` rewrites the whole file, so the first change opens a 250ms
//! window and everything landing inside it is written once — the same debt-style
//! debounce `src/config.ts` uses on the frontend, for the same reason. Nothing
//! is dropped: a long drag simply costs one write per 250ms instead of one per
//! frame, and the final position closes the last batch.

use std::collections::HashMap;
use std::sync::mpsc::{self, Sender};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Runtime};

use crate::config::{Config, ConfigEntry, WINDOW_POSITION_PREFIX, WINDOW_SIZE_PREFIX};

/// How long a batch stays open. Matches `FLUSH_MS` in `src/config.ts`.
const BATCH: Duration = Duration::from_millis(250);

/// Managed state: the way into the batching thread.
///
/// Behind a `Mutex` because `mpsc::Sender` is `Send` but not `Sync`, and Tauri's
/// managed state has to be both.
pub struct Writer(Mutex<Sender<ConfigEntry>>);

/// Starts the batching thread. Called once, from [`super::start`].
pub fn start<R: Runtime>(app: &AppHandle<R>) {
    let (sender, receiver) = mpsc::channel::<ConfigEntry>();
    let handle = app.clone();

    std::thread::spawn(move || {
        // Blocks until something moves, so an idle desktop costs nothing.
        while let Ok(first) = receiver.recv() {
            let mut batch = HashMap::new();
            batch.insert(first.key.clone(), first);

            // Keyed by config key, so a drag's hundred positions collapse to the
            // one the window ended on.
            let deadline = Instant::now() + BATCH;
            while let Ok(next) =
                receiver.recv_timeout(deadline.saturating_duration_since(Instant::now()))
            {
                batch.insert(next.key.clone(), next);
            }

            if let Some(config) = handle.try_state::<Config>() {
                let _ = config.apply(batch.into_values().collect());
            }
        }
    });

    app.manage(Writer(Mutex::new(sender)));
}

fn remember<R: Runtime>(app: &AppHandle<R>, key: String, value: String) {
    let Some(writer) = app.try_state::<Writer>() else {
        return;
    };
    let Ok(sender) = writer.0.lock() else {
        return;
    };

    // A failed send means the thread is gone, which happens only on shutdown.
    let _ = sender.send(ConfigEntry {
        key,
        value: Some(value),
    });
}

pub fn remember_position<R: Runtime>(
    app: &AppHandle<R>,
    label: &str,
    position: &PhysicalPosition<i32>,
) {
    let value = serde_json::json!({ "x": position.x, "y": position.y });
    remember(app, format!("{WINDOW_POSITION_PREFIX}{label}"), value.to_string());
}

pub fn remember_size<R: Runtime>(app: &AppHandle<R>, label: &str, size: &PhysicalSize<u32>) {
    // A window on its way out reports zero, and storing that would restore a
    // widget with no area at all at the next launch.
    if size.width == 0 || size.height == 0 {
        return;
    }

    let value = serde_json::json!({ "width": size.width, "height": size.height });
    remember(app, format!("{WINDOW_SIZE_PREFIX}{label}"), value.to_string());
}

/// Puts a freshly built plugin window back where it was left.
///
/// Done here rather than in [`crate::startup::restore_geometry`] because that
/// pass runs before the plugins are loaded — a plugin window does not exist yet
/// when it sweeps the window list. The order is the same as that pass's, and for
/// the same reason: on Windows a resize can nudge a window that would otherwise
/// overhang a monitor edge, so the position has to be applied to the final size.
pub fn restore<R: Runtime>(app: &AppHandle<R>, window: &tauri::WebviewWindow<R>) {
    let Some(config) = app.try_state::<Config>() else {
        return;
    };
    let label = window.label();

    if let Some(size) = config.window_size(label) {
        let _ = window.set_size(PhysicalSize::new(size.width, size.height));
    }

    if let Some(position) = config.window_position(label) {
        let _ = window.set_position(PhysicalPosition::new(position.x, position.y));
    }
}
