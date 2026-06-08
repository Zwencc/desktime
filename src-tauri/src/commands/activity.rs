//! Activity commands, forwarded to DTCore.
//!
//! Nothing here touches a store. The sampler and the database live in the
//! background process — the UI is a client of them, and a widget that could
//! collect on its own would be a second collector obeying a different switch.

use std::sync::Arc;

use tauri::State;

use crate::activity::{ActivityConfig, ActivitySummary};
use crate::api::ApiResult;
use crate::ipc::client::CoreClient;
use crate::ipc::protocol::{ActivityAppNamesRequest, ActivityQueryRequest, CoreMethod};

use super::core::call;

/// Replaces the collection config. Like `sync_reminders`, this is a full replace
/// pushed by the frontend, which owns the stored settings — the backend keeps no
/// copy of its own to fall out of step.
#[tauri::command]
pub async fn sync_activity_config(
    client: State<'_, Arc<CoreClient>>,
    config: ActivityConfig,
) -> ApiResult<()> {
    call(
        &client,
        CoreMethod::ActivityConfigUpdate,
        serde_json::to_value(config).unwrap_or_default(),
    )
    .await
}

/// The config DTCore is actually holding — the point of comparison for the
/// frontend's stored one. Asked for through the debug payload with no records,
/// which is the same round trip minus the rows.
#[tauri::command]
pub async fn activity_config(client: State<'_, Arc<CoreClient>>) -> ApiResult<ActivityConfig> {
    call(
        &client,
        CoreMethod::ActivityDebug,
        serde_json::json!({ "records": 0 }),
    )
    .await
    .map(|debug: crate::activity::ActivityDebug| debug.config)
}

/// Aggregates a list of epoch ranges, one summary each. The frontend supplies the
/// bounds because the time zone is a setting it owns; the backend stores on a
/// plain UTC grid. A whole month arrives as one call rather than 31.
#[tauri::command]
pub async fn activity_summaries(
    client: State<'_, Arc<CoreClient>>,
    ranges: Vec<(i64, i64)>,
    recent_minutes: u32,
) -> ApiResult<Vec<ActivitySummary>> {
    call(
        &client,
        CoreMethod::ActivityQuery,
        serde_json::to_value(ActivityQueryRequest {
            ranges,
            recent_minutes,
        })
        .unwrap_or_default(),
    )
    .await
}

/// Deletes every stored minute. Kept as its own command so "clear all my data"
/// is one obvious call rather than a side effect of changing retention.
#[tauri::command]
pub async fn clear_activity(client: State<'_, Arc<CoreClient>>) -> ApiResult<()> {
    call(&client, CoreMethod::ActivityClear, serde_json::Value::Null).await
}

/// Turns executable names into the names people use for them —
/// `code.exe` into "Visual Studio Code".
///
/// A whole list per call because the caller has a screenful at a time, and the
/// answers are static: one executable is always the same product, so the
/// frontend caches them and this is asked once per name per run. Names it cannot
/// resolve are left out rather than echoed back.
#[tauri::command]
pub async fn resolve_app_names(
    client: State<'_, Arc<CoreClient>>,
    exes: Vec<String>,
) -> ApiResult<std::collections::BTreeMap<String, String>> {
    call(
        &client,
        CoreMethod::ActivityAppNames,
        serde_json::to_value(ActivityAppNamesRequest { exes }).unwrap_or_default(),
    )
    .await
}
