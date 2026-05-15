//! The UI's door to DTCore.
//!
//! Every command in this module and in [`super::activity`] is `async`, and that
//! is a correctness requirement rather than a style: a synchronous Tauri command
//! runs on the main thread, and a round trip to another process — which may be
//! restarting, or wedged — would freeze every window at once. `spawn_blocking`
//! puts the blocking pipe read on a pool thread and leaves the UI running.

use std::sync::Arc;

use tauri::State;

use crate::api::{ApiError, ApiErrorCode, ApiResult};
use crate::ipc::client::CoreClient;
use crate::ipc::protocol::CoreMethod;

/// One DTCore call, off the main thread and decoded into `T`.
pub(crate) async fn call<T: serde::de::DeserializeOwned + Send + 'static>(
    client: &State<'_, Arc<CoreClient>>,
    method: CoreMethod,
    payload: serde_json::Value,
) -> ApiResult<T> {
    let client = Arc::clone(client.inner());
    tauri::async_runtime::spawn_blocking(move || client.call(method, payload))
        .await
        .map_err(|error| {
            ApiError::new(
                ApiErrorCode::CoreUnavailable,
                format!("the DTCore call could not be run: {error}"),
            )
        })?
}

/// The generic escape hatch, for calls the frontend makes by name. Typed
/// commands are preferred; this exists so a new method does not need a new
/// permission entry before it can be tried.
#[tauri::command]
pub async fn core_request(
    client: State<'_, Arc<CoreClient>>,
    request_id: String,
    method: CoreMethod,
    payload: serde_json::Value,
) -> ApiResult<serde_json::Value> {
    let client = Arc::clone(client.inner());
    tauri::async_runtime::spawn_blocking(move || client.request(request_id, method, payload))
        .await
        .map_err(|error| {
            ApiError::new(
                ApiErrorCode::CoreUnavailable,
                format!("the DTCore call could not be run: {error}"),
            )
        })?
}
