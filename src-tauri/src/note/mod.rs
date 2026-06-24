//! `.dtnote` domain boundary (N3).

pub mod container;
pub mod drafts;
pub mod limits;
pub mod markdown;
pub mod migration;
pub mod model;

use std::collections::HashMap;
use std::path::Path;

use base64::Engine;

use crate::api::{ApiError, ApiErrorCode, ApiResult};

pub use container::{NoteContainer, ZipNoteContainer};
use model::{NoteAsset, NoteAssetDto, NoteDocument, NoteDocumentDto, NoteInfo, NoteInputDto};

/// Builds the note to write, taking the pictures it was not handed from the one
/// already on disk.
///
/// The editor sends bytes only for what it has just added; everything else
/// arrives as a name. That is what keeps an autosave from carrying every picture
/// in the note across the IPC boundary every ten seconds, and it is why an
/// unknown name is an error rather than a silently dropped image — losing a
/// picture on save is exactly the failure a container format must not have.
pub fn compose(path: &Path, input: &NoteInputDto) -> ApiResult<NoteDocument> {
    // Only unpack the old note when something is actually going to be taken from
    // it. A save that carries everything — the first save of a new file — should
    // not pay to read a file that may not even be there.
    let wants_kept = input.assets.iter().any(|asset| asset.base64.is_none());
    let existing = if wants_kept && path.exists() {
        ZipNoteContainer.read(path)?.assets
    } else {
        Vec::new()
    };
    compose_from(existing, input)
}

/// The same, for a note whose current pictures the caller already holds.
///
/// The vault keeps its notes as ciphertext rather than as files, so there is no
/// path to read them from — but the rule about what a save carries has to be
/// identical, or the encrypted copy would follow different rules from the plain
/// one.
pub fn compose_from(existing: Vec<NoteAsset>, input: &NoteInputDto) -> ApiResult<NoteDocument> {
    let mut kept: HashMap<String, Vec<u8>> = existing
        .into_iter()
        .map(|asset| (asset.path, asset.bytes))
        .collect();

    let mut assets = Vec::with_capacity(input.assets.len());
    for asset in &input.assets {
        let bytes = match &asset.base64 {
            Some(encoded) => base64::engine::general_purpose::STANDARD
                .decode(encoded.as_bytes())
                .map_err(|_| {
                    ApiError::new(
                        ApiErrorCode::InvalidRequest,
                        format!("`{}` was not sent as base64", asset.path),
                    )
                })?,
            None => kept.remove(&asset.path).ok_or_else(|| {
                ApiError::new(
                    ApiErrorCode::MissingContent,
                    format!("`{}` is not in the note being saved", asset.path),
                )
            })?,
        };
        assets.push(NoteAsset {
            path: asset.path.clone(),
            bytes,
        });
    }

    Ok(NoteDocument {
        info: NoteInfo::default(),
        markdown: input.markdown.clone(),
        assets,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    use model::{NoteAssetInput, NoteDocument};

    fn scratch(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("desktime-compose-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir.join(name)
    }

    #[test]
    fn a_save_keeps_the_pictures_it_was_not_handed() {
        let note = scratch("compose.dtnote");
        ZipNoteContainer
            .write_atomic(
                &note,
                &NoteDocument {
                    info: NoteInfo::default(),
                    markdown: "first".to_owned(),
                    assets: vec![
                        NoteAsset {
                            path: "assets/1.png".to_owned(),
                            bytes: b"kept bytes".to_vec(),
                        },
                        NoteAsset {
                            path: "assets/2.png".to_owned(),
                            bytes: b"dropped bytes".to_vec(),
                        },
                    ],
                },
            )
            .unwrap();

        // The editor names the picture it is keeping, sends the one it just
        // pasted, and simply stops mentioning the one deleted from the text.
        let composed = compose(
            &note,
            &NoteInputDto {
                markdown: "second".to_owned(),
                assets: vec![
                    NoteAssetInput {
                        path: "assets/1.png".to_owned(),
                        base64: None,
                    },
                    NoteAssetInput {
                        path: "assets/3.png".to_owned(),
                        base64: Some(
                            base64::engine::general_purpose::STANDARD.encode(b"pasted bytes"),
                        ),
                    },
                ],
            },
        )
        .unwrap();

        assert_eq!(composed.markdown, "second");
        assert_eq!(composed.assets.len(), 2);
        assert_eq!(composed.assets[0].bytes, b"kept bytes");
        assert_eq!(composed.assets[1].bytes, b"pasted bytes");

        let _ = std::fs::remove_file(&note);
    }

    #[test]
    fn a_name_the_note_does_not_have_is_refused_rather_than_dropped() {
        let note = scratch("missing.dtnote");
        let _ = std::fs::remove_file(&note);

        // Quietly writing the note without it would lose a picture on save,
        // which is the one failure a single-file format must not have.
        let error = compose(
            &note,
            &NoteInputDto {
                markdown: "body".to_owned(),
                assets: vec![NoteAssetInput {
                    path: "assets/1.png".to_owned(),
                    base64: None,
                }],
            },
        )
        .unwrap_err();
        assert_eq!(error.code, ApiErrorCode::MissingContent);
    }
}

/// A note on its way to the editor, pictures encoded for the trip.
///
/// base64 rather than byte arrays, and the reason is not cosmetic: a `Vec<u8>`
/// crosses this boundary as a JSON array of numbers, which for a 3 MB screenshot
/// is three million elements and about 12 MB of text — enough to take the
/// notebook window down mid-open. The webview turns each string into a blob URL
/// and lets go of it.
pub fn to_dto(document: NoteDocument) -> NoteDocumentDto {
    NoteDocumentDto {
        markdown: document.markdown,
        assets: document
            .assets
            .into_iter()
            .map(|asset| NoteAssetDto {
                path: asset.path,
                base64: base64::engine::general_purpose::STANDARD.encode(asset.bytes),
            })
            .collect(),
    }
}
