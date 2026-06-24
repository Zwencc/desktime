//! The notebook's whole file surface.
//!
//! Everything the editor does to a note on disk goes through the container:
//! there is no path here that reads or writes a bare `.md`, and no way for the
//! webview to reach a picture except by being handed it. The temporary unpack
//! directory the container layer uses does not exist — a note is read into
//! memory and written from it — so there is nothing for a caller to be told
//! about or to leave behind.

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::State;

use crate::api::{ApiError, ApiErrorCode, ApiResult, FeatureId, FeatureState, FeatureStatus};
use crate::note::migration::{MigrationPlan, MigrationResult};
use crate::note::model::{
    NoteDocumentDto, NoteInputDto, NoteOpenRequest, NoteRelocateRequest, NoteSaveRequest,
};
use crate::note::{drafts, NoteContainer, ZipNoteContainer};

/// The plan the user was last shown, held between the scan and their answer.
///
/// The migrator rewrites files, so it may only ever act on a list somebody
/// looked at. Keeping the plan here — rather than taking one back from the
/// frontend — means what gets converted is what was displayed.
#[derive(Default)]
pub struct MigrationPlans(Mutex<Option<MigrationPlan>>);

#[tauri::command]
pub fn note_container_status() -> FeatureStatus {
    FeatureStatus {
        feature: FeatureId::NoteContainer,
        state: FeatureState::Ready,
        api_version: 1,
        owner: "DeskTime".to_owned(),
        next_module: "note::container".to_owned(),
    }
}

#[tauri::command]
pub fn note_open(request: NoteOpenRequest) -> ApiResult<NoteDocumentDto> {
    ZipNoteContainer
        .read(&request.path)
        .map(crate::note::to_dto)
}

#[tauri::command]
pub fn note_save(request: NoteSaveRequest) -> ApiResult<()> {
    let document = crate::note::compose(&request.path, &request.document)?;
    ZipNoteContainer.write_atomic(&request.path, &document)
}

/// A new, empty note at a path the user picked.
#[tauri::command]
pub fn note_create(request: NoteOpenRequest) -> ApiResult<()> {
    let document = crate::note::compose(
        &request.path,
        &NoteInputDto {
            markdown: String::new(),
            assets: Vec::new(),
        },
    )?;
    ZipNoteContainer.write_atomic(&request.path, &document)
}

/// Moves or copies a whole note.
///
/// This is "save as" and it is also what promoting a draft became. Both used to
/// mean writing the text somewhere new and then chasing its pictures across the
/// disk behind it; a note is one file now, so both are this.
#[tauri::command]
pub fn note_relocate(request: NoteRelocateRequest) -> ApiResult<()> {
    ZipNoteContainer.validate(&request.from)?;
    if !crate::note::model::has_supported_extension(&request.to) {
        return Err(ApiError::new(
            ApiErrorCode::UnsupportedNoteType,
            "a note can only be saved as a .dtnote",
        ));
    }

    if request.keep_source {
        std::fs::copy(&request.from, &request.to)?;
        return Ok(());
    }

    // A move across volumes is not a rename, and the user picking a folder on
    // another drive is the ordinary case rather than the exotic one.
    if std::fs::rename(&request.from, &request.to).is_err() {
        std::fs::copy(&request.from, &request.to)?;
        let _ = std::fs::remove_file(&request.from);
    }
    Ok(())
}

// —— Drafts ——

#[tauri::command]
pub fn drafts_directory() -> ApiResult<String> {
    drafts::dir().map(|dir| dir.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn draft_read(id: String) -> ApiResult<NoteDocumentDto> {
    drafts::read(&id).map(crate::note::to_dto)
}

#[tauri::command]
pub fn draft_write(id: String, document: NoteInputDto) -> ApiResult<()> {
    let path = drafts::path(&id)?;
    let composed = crate::note::compose(&path, &document)?;
    drafts::write(&id, &composed)
}

#[tauri::command]
pub fn draft_delete(id: String) -> ApiResult<()> {
    drafts::delete(&id)
}

// —— The one-off legacy migration ——

#[tauri::command]
pub fn note_migration_scan(
    paths: Vec<PathBuf>,
    plans: State<'_, MigrationPlans>,
) -> ApiResult<MigrationPlan> {
    let plan = crate::note::migration::scan(&paths)?;
    *plans.0.lock().unwrap_or_else(|error| error.into_inner()) = Some(plan.clone());
    Ok(plan)
}

#[tauri::command]
pub fn note_migration_execute(
    plan_id: String,
    plans: State<'_, MigrationPlans>,
) -> ApiResult<Vec<MigrationResult>> {
    // Taken rather than read: a plan is good for one answer, so a second click
    // cannot convert the same list twice.
    let plan = plans
        .0
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .take()
        .filter(|plan| plan.plan_id == plan_id)
        .ok_or_else(|| {
            ApiError::new(
                ApiErrorCode::InvalidRequest,
                "that migration plan is no longer the current one; scan again",
            )
        })?;

    Ok(crate::note::migration::execute(
        &plan,
        &crate::devmode::root_dir().join("logs"),
    ))
}
