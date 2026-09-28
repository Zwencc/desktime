//! Developer mode: one marker file, no probing, no fallback.
//!
//! A build runs in developer mode when a file named `devmod.dev` sits in the
//! app's own directory — the directory the executable is in. There is no second
//! location to check and no fallback to `%APPDATA%`: wherever the app is
//! installed is where its data lives, which is the same rule O2 will move
//! config, drafts and activity data to.
//!
//! Debug builds are the single exception, and not out of preference: a dev
//! build's executable sits under `target\debug\`, so `cargo clean` or a switch
//! between debug and release would take the marker with it. Those builds look in
//! `src-tauri\` instead, which survives both.
//!
//! The marker is read once, at startup. Dropping the file in while the app is
//! running is deliberately not a live switch — every consumer of this flag
//! decides what to build at window-creation time.

use std::path::PathBuf;

const MARKER: &str = "devmod.dev";

/// Managed state: the answer, plus the directory it was looked for in. The
/// directory is reported to the frontend because "I created the file and nothing
/// happened" is otherwise unanswerable — it is almost always the wrong folder.
pub struct DevMode {
    pub enabled: bool,
    pub root: PathBuf,
}

pub fn detect() -> DevMode {
    let root = root_dir();
    DevMode {
        enabled: root.join(MARKER).is_file(),
        root,
    }
}

#[cfg(not(debug_assertions))]
pub fn root_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(std::path::Path::to_path_buf))
        .unwrap_or_else(|| PathBuf::from("."))
}

#[cfg(debug_assertions)]
pub fn root_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}
