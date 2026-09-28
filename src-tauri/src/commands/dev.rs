//! Read-only diagnostics for developer mode.
//!
//! Every command here observes and nothing more: no command in this module
//! changes a setting, a window or a stored minute. That is deliberate — a debug
//! surface that can also act is a debug surface whose readings you cannot trust.
//!
//! Availability is the frontend's business. These commands answer whether they
//! are asked or not; `is_dev_mode` is what decides whether anything asks.

use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::activity::ActivityDebug;
use crate::api::ApiResult;
use crate::devmode::DevMode;
use crate::ipc::client::CoreClient;
use crate::ipc::protocol::{CoreMethod, CoreStatus};
use crate::reminder::{Scheduler, SchedulerStatus};

use super::core::call;

/// Records served to the debug window's "what actually landed" list.
const DEBUG_RECORDS: usize = 10;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DevModeInfo {
    pub enabled: bool,
    /// Where the marker was looked for. Reported because "I created the file and
    /// nothing happened" is almost always the wrong folder, and no amount of
    /// documentation answers that as directly as the path itself.
    pub root: String,
}

#[tauri::command]
pub fn is_dev_mode(dev: State<'_, DevMode>) -> DevModeInfo {
    DevModeInfo {
        enabled: dev.enabled,
        root: dev.root.to_string_lossy().into_owned(),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    /// The backend's clock, so the frontend can age the timestamps below rather
    /// than trusting that two processes agree on "now".
    pub now: i64,
    /// What DTCore answered, or `None` when it could not be reached. The two
    /// have to be told apart: a background process that is not running looks
    /// exactly like one that is running and collecting nothing.
    pub core: Option<CoreStatus>,
    /// Why DTCore could not be reached, when it could not be. Empty otherwise.
    pub core_error: String,
    /// Epoch ms of the sampler's last pass. Zero means it has never run.
    pub activity_sampled_at: i64,
    pub activity_enabled: bool,
    pub activity_committed: u32,
    /// The last activity write that failed inside DTCore, if one has.
    pub activity_store_error: String,
    pub reminder: SchedulerStatus,
}

#[tauri::command]
pub async fn runtime_status(
    client: State<'_, Arc<CoreClient>>,
    scheduler: State<'_, Arc<Scheduler>>,
) -> ApiResult<RuntimeStatus> {
    // A dead DTCore is a reading, not a failure: this window exists to show it.
    let core = call::<CoreStatus>(&client, CoreMethod::Status, serde_json::Value::Null).await;
    let activity =
        call::<ActivityDebug>(&client, CoreMethod::ActivityDebug, serde_json::json!({ "records": 0 }))
            .await;

    Ok(RuntimeStatus {
        now: now_ms(),
        core_error: core.as_ref().err().map(|error| error.message.clone()).unwrap_or_default(),
        core: core.ok(),
        activity_sampled_at: activity.as_ref().map(|debug| debug.snapshot.sampled_at).unwrap_or(0),
        activity_enabled: activity.as_ref().is_ok_and(|debug| debug.snapshot.enabled),
        activity_committed: activity.as_ref().map(|debug| debug.snapshot.committed).unwrap_or(0),
        activity_store_error: activity
            .map(|debug| debug.snapshot.store_error)
            .unwrap_or_default(),
        reminder: scheduler.status(),
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowDiagnostic {
    pub label: String,
    pub visible: bool,
    pub focused: bool,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale: f64,
    /// What the native visibility policy believes. `None` for app-driven windows,
    /// which are deliberately not registered with it — a widget reading `None`
    /// here is the bug, not a popup that does.
    pub app_visible: Option<bool>,
}

#[tauri::command]
pub fn window_diagnostics(app: AppHandle) -> Vec<WindowDiagnostic> {
    let mut windows: Vec<WindowDiagnostic> = app
        .webview_windows()
        .into_iter()
        .map(|(label, window)| {
            let position = window.outer_position().unwrap_or_default();
            let size = window.outer_size().unwrap_or_default();
            WindowDiagnostic {
                visible: window.is_visible().unwrap_or(false),
                focused: window.is_focused().unwrap_or(false),
                x: position.x,
                y: position.y,
                width: size.width,
                height: size.height,
                scale: window.scale_factor().unwrap_or(1.0),
                app_visible: crate::platform::policy_app_visible(&app, &label),
                label,
            }
        })
        .collect();

    windows.sort_by(|a, b| a.label.cmp(&b.label));
    windows
}

/// The activity sampler's live view, plus the config DTCore is holding.
#[tauri::command]
pub async fn activity_debug_snapshot(
    client: State<'_, Arc<CoreClient>>,
) -> ApiResult<ActivityDebug> {
    call(
        &client,
        CoreMethod::ActivityDebug,
        serde_json::json!({ "records": DEBUG_RECORDS }),
    )
    .await
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as i64)
        .unwrap_or(0)
}
