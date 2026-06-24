//! Unsaved notes, which are `.dtnote` files like every other note.
//!
//! A draft is a note that has not been given a home yet, and nothing more. It is
//! the same container in the same format, sitting in the app's own folder — so
//! "save as" is a move, and the pictures in it move because they were never
//! anywhere else. The whole business of parking a draft's images next to the
//! drafts folder and shuffling them across when it was saved is gone with it.
//!
//! Drafts written by earlier versions are `.md` beside an `assets/<id>/` folder.
//! They are converted the first time they are opened, and a conversion that
//! fails changes nothing on disk: the text still comes back, the old files are
//! all still there, and the next attempt starts from the same place.

use std::path::{Path, PathBuf};

use crate::api::{ApiError, ApiErrorCode, ApiResult};

use super::container::{NoteContainer, ZipNoteContainer};
use super::model::{NoteAsset, NoteDocument, NoteInfo, ASSET_PREFIX, NOTE_EXTENSION};

/// Next to the executable, like every other piece of user data — see config.rs.
pub fn dir() -> ApiResult<PathBuf> {
    let dir = crate::devmode::root_dir().join("drafts");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub fn path(id: &str) -> ApiResult<PathBuf> {
    if !is_safe_id(id) {
        return Err(ApiError::new(
            ApiErrorCode::PathTraversal,
            format!("`{id}` is not a draft id"),
        ));
    }
    Ok(dir()?.join(format!("{id}.{NOTE_EXTENSION}")))
}

// Ids arrive from the frontend, so anything that is not a plain UUID-shaped
// token is rejected: a `..` or a separator here would let a draft write itself
// anywhere on disk.
fn is_safe_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 72
        && id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
}

/// A draft with no file yet reads as an empty note, so a fresh one and an
/// emptied one look the same.
pub fn read(id: &str) -> ApiResult<NoteDocument> {
    let path = path(id)?;
    if path.exists() {
        return ZipNoteContainer.read(&path);
    }
    adopt(id, &path)
}

pub fn write(id: &str, document: &NoteDocument) -> ApiResult<()> {
    ZipNoteContainer.write_atomic(&path(id)?, document)
}

/// Deleting a draft that was never written is not an error — the caller only
/// wants it gone.
pub fn delete(id: &str) -> ApiResult<()> {
    remove(&path(id)?)?;
    // Whatever an earlier version left behind goes too, or a deleted draft
    // would come back the next time its id was read.
    let dir = dir()?;
    remove(&dir.join(format!("{id}.md")))?;
    let _ = std::fs::remove_dir_all(dir.join("assets").join(id));
    Ok(())
}

fn remove(path: &Path) -> ApiResult<()> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn empty() -> NoteDocument {
    NoteDocument {
        info: NoteInfo::default(),
        markdown: String::new(),
        assets: Vec::new(),
    }
}

/// Converts one pre-container draft, or answers with an empty note when there
/// was never anything there.
fn adopt(id: &str, target: &Path) -> ApiResult<NoteDocument> {
    let dir = dir()?;
    let legacy = dir.join(format!("{id}.md"));
    let Ok(markdown) = std::fs::read_to_string(&legacy) else {
        return Ok(empty());
    };

    // A draft wrote its pictures as `assets/<id>/name`, because the drafts
    // folder was shared and it needed a corner of its own. Inside a container it
    // has the whole of `assets/`, and the prefix that bought it that corner is
    // exactly what has to come back out of the text.
    let folder = dir.join("assets").join(id);
    let mut assets = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&folder) {
        for entry in entries.flatten() {
            let file = entry.path();
            if !file.is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            match std::fs::read(&file) {
                Ok(bytes) => assets.push(NoteAsset {
                    path: format!("{ASSET_PREFIX}{name}"),
                    bytes,
                }),
                Err(error) => return Ok(unconverted(id, markdown, &error.to_string())),
            }
        }
    }

    let document = NoteDocument {
        info: NoteInfo::default(),
        markdown: markdown.replace(&format!("{ASSET_PREFIX}{id}/"), ASSET_PREFIX),
        assets,
    };

    match ZipNoteContainer.write_atomic(target, &document) {
        Ok(()) => {
            let _ = std::fs::remove_file(&legacy);
            let _ = std::fs::remove_dir_all(&folder);
            Ok(document)
        }
        Err(error) => Ok(unconverted(id, markdown, &error.message)),
    }
}

/// The text, with nothing on disk touched.
///
/// The pictures are not attached, so they show as the markdown that names them
/// — visible and fixable, where a draft that failed to open would not be. The
/// old files are all still there for the next attempt.
fn unconverted(id: &str, markdown: String, reason: &str) -> NoteDocument {
    let logs = crate::devmode::root_dir().join("logs");
    if std::fs::create_dir_all(&logs).is_ok() {
        use std::io::Write;
        if let Ok(mut log) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(logs.join("draft-migration.log"))
        {
            let stamp = crate::reminder::now_ms();
            let _ = writeln!(log, "{stamp} draft {id} not converted: {reason}");
        }
    }

    NoteDocument {
        info: NoteInfo::default(),
        markdown,
        assets: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::is_safe_id;

    #[test]
    fn accepts_uuid_shaped_ids() {
        assert!(is_safe_id("2f1c9d0e-4b7a-4f21-9a55-0c3d8e6b1a24"));
        assert!(is_safe_id("2f1c9d0e-4b7a-4f21-9a55-0c3d8e6b1a24-backup"));
    }

    #[test]
    fn rejects_path_traversal_and_separators() {
        assert!(!is_safe_id(".."));
        assert!(!is_safe_id("../../secrets"));
        assert!(!is_safe_id("nested/id"));
        assert!(!is_safe_id("nested\\id"));
        assert!(!is_safe_id("with.dot"));
        assert!(!is_safe_id(""));
    }
}
