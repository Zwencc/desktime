//! Where the vault's bytes live, and how they are replaced.
//!
//! Nothing here is ever written in place. Every file goes out as a temp file in
//! the same folder, gets flushed, and is renamed over the top — because a note
//! that is half old and half new does not decrypt, and a `vault.meta` that does
//! not decrypt is the whole vault gone.
//!
//! Two things follow from that and are worth stating:
//!
//! - `vault.meta` keeps a **backup of the last copy that opened**. Both being
//!   unreadable means the vault is unrecoverable, so there are two.
//! - Objects and the index are committed in that order, so a crash can leave an
//!   object nothing points at. That is an orphan, and orphans are swept. It
//!   cannot leave the index pointing at an object that is not there, which is
//!   the failure that would look like data loss.

use std::path::{Path, PathBuf};

use crate::api::{ApiError, ApiErrorCode, ApiResult};

pub const META_FILE: &str = "vault.meta";
pub const META_BACKUP_FILE: &str = "vault.meta.bak";
pub const INDEX_FILE: &str = "index.dtv";
pub const OBJECTS_DIR: &str = "objects";

#[derive(Clone, Debug)]
pub struct VaultPaths {
    pub root: PathBuf,
    pub meta: PathBuf,
    pub meta_backup: PathBuf,
    pub index: PathBuf,
    pub objects: PathBuf,
}

impl VaultPaths {
    pub fn from_data_root(data_root: &Path) -> Self {
        let root = data_root.join("vault");
        Self {
            meta: root.join(META_FILE),
            meta_backup: root.join(META_BACKUP_FILE),
            index: root.join(INDEX_FILE),
            objects: root.join(OBJECTS_DIR),
            root,
        }
    }

    pub fn object(&self, file_id: &str) -> Option<PathBuf> {
        let safe = file_id.len() == 32
            && file_id
                .chars()
                .all(|character| character.is_ascii_hexdigit());
        safe.then(|| self.objects.join(format!("{file_id}.dtv")))
    }

    pub fn ensure(&self) -> ApiResult<()> {
        std::fs::create_dir_all(&self.objects)?;
        Ok(())
    }
}

/// Replaces one file, or leaves the one that was there completely untouched.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> ApiResult<()> {
    write_checked(path, bytes, |_| Ok(()))
}

/// The same, with a chance to read the new file back before it takes over.
///
/// `check` is handed what is actually on disk, not what was meant to be there —
/// which is the point. A note that cannot be decrypted from its own file is
/// indistinguishable from a lost one, and this is the last moment at which the
/// old copy still exists.
pub fn write_checked(
    path: &Path,
    bytes: &[u8],
    check: impl FnOnce(&[u8]) -> ApiResult<()>,
) -> ApiResult<()> {
    use std::io::Write;

    let parent = path.parent().ok_or_else(|| {
        ApiError::new(
            ApiErrorCode::IoError,
            format!("{} names no folder to write into", path.display()),
        )
    })?;
    std::fs::create_dir_all(parent)?;

    // Same folder, because a rename is only atomic within one volume. Fixed
    // name, so the leftover of a write that died is cleared by the next one.
    let temp = path.with_extension("part");
    let _ = std::fs::remove_file(&temp);

    let write = || -> std::io::Result<()> {
        let mut file = std::fs::File::create(&temp)?;
        file.write_all(bytes)?;
        // Without this the rename can land before the bytes it points at, and a
        // power cut turns an atomic replace into an empty file.
        file.sync_all()
    };
    if let Err(error) = write() {
        let _ = std::fs::remove_file(&temp);
        return Err(error.into());
    }

    let verified = std::fs::read(&temp).map_err(ApiError::from).and_then(|written| {
        if written != bytes {
            return Err(ApiError::new(
                ApiErrorCode::IoError,
                "the file on disk is not what was written to it",
            ));
        }
        check(&written)
    });
    if let Err(error) = verified {
        let _ = std::fs::remove_file(&temp);
        return Err(error);
    }

    if let Err(error) = std::fs::rename(&temp, path) {
        let _ = std::fs::remove_file(&temp);
        return Err(error.into());
    }
    Ok(())
}

/// Replaces `vault.meta`, keeping the copy that was there as the backup.
///
/// The copy being replaced is one that opened successfully — every path that
/// writes meta has already used it — so the backup is always a working file
/// rather than whatever happened to be on disk.
pub fn write_meta(paths: &VaultPaths, bytes: &[u8]) -> ApiResult<()> {
    paths.ensure()?;
    if paths.meta.is_file() {
        std::fs::copy(&paths.meta, &paths.meta_backup)?;
    }
    write_atomic(&paths.meta, bytes)
}

/// The metadata, from whichever copy of it is still readable.
///
/// The fallback is on *parsing*, never on authentication: a wrong password and
/// a corrupt envelope are indistinguishable by design, so treating a failed
/// unlock as "try the backup" would double every typo's cost and still tell the
/// user nothing.
pub fn read_meta(paths: &VaultPaths) -> ApiResult<Vec<u8>> {
    match std::fs::read(&paths.meta) {
        Ok(bytes) if !bytes.is_empty() => Ok(bytes),
        _ => std::fs::read(&paths.meta_backup).map_err(|_| {
            ApiError::new(
                ApiErrorCode::InvalidCredentialOrCorruptMeta,
                "the vault metadata could not be read from either copy",
            )
        }),
    }
}
