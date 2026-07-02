//! The vault's command surface.
//!
//! Every one of these is `async` and every one hops onto a blocking thread, and
//! that is a correctness requirement rather than a style. A key derivation is a
//! fifth of a second by design, and a wrong password is answered after a delay
//! that doubles — up to half a minute. A synchronous Tauri command runs on the
//! main thread, so either of those would freeze every window in the app.
//!
//! Nothing here returns key material. `VaultSessionDto` carries a random handle
//! that means something only to this process and only until the vault is locked.

use std::sync::Arc;

use tauri::State;

use crate::api::{ApiError, ApiErrorCode, ApiResult};
use crate::vault::controller::VaultController;
use crate::vault::model::{
    VaultCreateFolderRequest, VaultCreateNoteRequest, VaultCreateRequest, VaultDeleteRequest,
    VaultDocumentDto, VaultEntry, VaultExportRequest, VaultImportResult, VaultMoveRequest,
    VaultReadRequest, VaultRenameRequest, VaultResetPasswordRequest, VaultSessionDto, VaultStatus,
    VaultTransferRequest, VaultUnlockRequest, VaultWriteRequest,
};

/// Runs one vault operation on a pool thread.
async fn off_thread<T: Send + 'static>(
    vault: &State<'_, Arc<VaultController>>,
    operation: impl FnOnce(&VaultController) -> ApiResult<T> + Send + 'static,
) -> ApiResult<T> {
    let vault = Arc::clone(vault.inner());
    tauri::async_runtime::spawn_blocking(move || operation(&vault))
        .await
        .map_err(|error| {
            ApiError::new(
                ApiErrorCode::IoError,
                format!("the vault operation could not be run: {error}"),
            )
        })?
}

#[tauri::command]
pub async fn vault_status(vault: State<'_, Arc<VaultController>>) -> ApiResult<VaultStatus> {
    off_thread(&vault, |vault| Ok(vault.status())).await
}

#[tauri::command]
pub async fn vault_create(
    vault: State<'_, Arc<VaultController>>,
    request: VaultCreateRequest,
) -> ApiResult<VaultSessionDto> {
    off_thread(&vault, move |vault| vault.create(request)).await
}

#[tauri::command]
pub async fn vault_unlock_password(
    vault: State<'_, Arc<VaultController>>,
    request: VaultUnlockRequest,
) -> ApiResult<VaultSessionDto> {
    off_thread(&vault, move |vault| vault.unlock_password(request)).await
}

#[tauri::command]
pub async fn vault_unlock_recovery(
    vault: State<'_, Arc<VaultController>>,
    request: VaultUnlockRequest,
) -> ApiResult<VaultSessionDto> {
    off_thread(&vault, move |vault| vault.unlock_recovery(request)).await
}

/// Locking is the one call that must never fail or wait: it is what the idle
/// timer, a hidden window and an unpinned widget all end up calling.
#[tauri::command]
pub fn vault_lock(vault: State<'_, Arc<VaultController>>, session_handle: String) {
    vault.lock(&session_handle);
}

#[tauri::command]
pub async fn vault_list(
    vault: State<'_, Arc<VaultController>>,
    session_handle: String,
) -> ApiResult<Vec<VaultEntry>> {
    off_thread(&vault, move |vault| vault.list(&session_handle)).await
}

#[tauri::command]
pub async fn vault_read(
    vault: State<'_, Arc<VaultController>>,
    request: VaultReadRequest,
) -> ApiResult<VaultDocumentDto> {
    off_thread(&vault, move |vault| vault.read(request)).await
}

#[tauri::command]
pub async fn vault_write(
    vault: State<'_, Arc<VaultController>>,
    request: VaultWriteRequest,
) -> ApiResult<VaultEntry> {
    off_thread(&vault, move |vault| vault.write(request)).await
}

#[tauri::command]
pub async fn vault_write_backup(
    vault: State<'_, Arc<VaultController>>,
    request: VaultWriteRequest,
) -> ApiResult<VaultEntry> {
    off_thread(&vault, move |vault| vault.write_backup(request)).await
}

#[tauri::command]
pub async fn vault_reset_password(
    vault: State<'_, Arc<VaultController>>,
    request: VaultResetPasswordRequest,
) -> ApiResult<()> {
    off_thread(&vault, move |vault| vault.reset_password(request)).await
}

#[tauri::command]
pub async fn vault_create_folder(
    vault: State<'_, Arc<VaultController>>,
    request: VaultCreateFolderRequest,
) -> ApiResult<VaultEntry> {
    off_thread(&vault, move |vault| vault.create_folder(request)).await
}

#[tauri::command]
pub async fn vault_create_note(
    vault: State<'_, Arc<VaultController>>,
    request: VaultCreateNoteRequest,
) -> ApiResult<VaultEntry> {
    off_thread(&vault, move |vault| vault.create_note(request)).await
}

#[tauri::command]
pub async fn vault_rename(
    vault: State<'_, Arc<VaultController>>,
    request: VaultRenameRequest,
) -> ApiResult<VaultEntry> {
    off_thread(&vault, move |vault| vault.rename(request)).await
}

#[tauri::command]
pub async fn vault_move(
    vault: State<'_, Arc<VaultController>>,
    request: VaultMoveRequest,
) -> ApiResult<VaultEntry> {
    off_thread(&vault, move |vault| vault.move_entry(request)).await
}

#[tauri::command]
pub async fn vault_delete(
    vault: State<'_, Arc<VaultController>>,
    request: VaultDeleteRequest,
) -> ApiResult<()> {
    off_thread(&vault, move |vault| vault.delete(request)).await
}

#[tauri::command]
pub async fn vault_import(
    vault: State<'_, Arc<VaultController>>,
    request: VaultTransferRequest,
) -> ApiResult<VaultImportResult> {
    off_thread(&vault, move |vault| vault.import(request)).await
}

#[tauri::command]
pub async fn vault_export(
    vault: State<'_, Arc<VaultController>>,
    request: VaultExportRequest,
) -> ApiResult<()> {
    off_thread(&vault, move |vault| vault.export(request)).await
}
