use std::path::PathBuf;

use serde::{Deserialize, Serialize};

pub const NOTE_EXTENSION: &str = "dtnote";
pub const NOTE_FORMAT_VERSION: u16 = 1;
pub const INFO_ENTRY: &str = "info.json";
pub const TEXT_ENTRY: &str = "text.markdown";
pub const ASSET_PREFIX: &str = "assets/";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteInfo {
    pub version: u16,
    #[serde(rename = "type")]
    pub content_type: String,
    pub transient: bool,
    pub creator_identifier: String,
}

impl Default for NoteInfo {
    fn default() -> Self {
        Self {
            version: 2,
            content_type: "net.daringfireball.markdown".to_owned(),
            transient: false,
            creator_identifier: "com.desktime.app".to_owned(),
        }
    }
}

#[derive(Clone, Debug)]
pub struct NoteAsset {
    pub path: String,
    pub bytes: Vec<u8>,
}

#[derive(Clone, Debug)]
pub struct NoteDocument {
    pub info: NoteInfo,
    pub markdown: String,
    pub assets: Vec<NoteAsset>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteOpenRequest {
    pub path: PathBuf,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteDocumentDto {
    pub markdown: String,
    pub assets: Vec<NoteAssetDto>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteAssetDto {
    pub path: String,
    pub base64: String,
}

/// One picture on its way into a container.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteAssetInput {
    pub path: String,
    /// `None` keeps whatever is stored under this path in the note being saved.
    ///
    /// This is what makes an autosave affordable. The editor turns each picture
    /// into a blob URL the moment the note opens and lets go of the bytes; a
    /// save that had to carry them all back would mean holding every picture in
    /// the note in the webview's memory for as long as it is open, and shipping
    /// all of them across the IPC boundary every ten seconds.
    pub base64: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteInputDto {
    pub markdown: String,
    pub assets: Vec<NoteAssetInput>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSaveRequest {
    pub path: PathBuf,
    pub document: NoteInputDto,
}

/// Moving or copying a whole note, pictures and all.
///
/// This is what "save as" became: a note is one file, so giving a draft a home
/// is a move and copying a note somewhere else is a copy. Neither one has to
/// know what is inside.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteRelocateRequest {
    pub from: PathBuf,
    pub to: PathBuf,
    pub keep_source: bool,
}

pub fn has_supported_extension(path: &std::path::Path) -> bool {
    path.extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case(NOTE_EXTENSION))
}
