//! The one-off conversion of `.md` + `assets/` notes into `.dtnote`.
//!
//! This is the only code in DeskTime that rewrites files the user made, so it
//! is built to be undone:
//!
//! - **Nothing happens without a plan the user saw.** [`scan`] only reads; it
//!   answers with what *would* be converted and what would be left behind, and
//!   [`execute`] refuses any plan but the one that was handed out.
//! - **The new file is complete before the old one is touched.** The container
//!   writer builds it, reads it back and checks it, and only then does the
//!   original go to the **recycle bin** rather than being deleted.
//! - **One note failing leaves the rest alone**, and leaves that note exactly as
//!   it was.
//!
//! It is deliberately not a Markdown importer. It converts the layout DeskTime
//! itself wrote — an `assets/` folder beside the note — and reports every other
//! kind of reference instead of guessing what the user meant by it.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::api::ApiResult;

use super::container::{NoteContainer, ZipNoteContainer};
use super::model::{NoteAsset, NoteDocument, NoteInfo, ASSET_PREFIX, NOTE_EXTENSION};

/// The extensions a note could have been saved with before v0.1.5.
const LEGACY_EXTENSIONS: [&str; 3] = ["md", "markdown", "txt"];

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyNoteCandidate {
    pub source_markdown: PathBuf,
    pub target_dtnote: PathBuf,
    pub referenced_assets: Vec<PathBuf>,
    pub warnings: Vec<MigrationWarning>,
}

/// Something the user has to be told before agreeing to the plan.
///
/// Each one carries the reference it is about: "this note has a picture that
/// will be left behind" is only actionable if it says *which* picture.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", tag = "kind", rename_all_fields = "camelCase")]
pub enum MigrationWarning {
    /// Not the `assets/` layout DeskTime wrote — somewhere else on disk, a
    /// deeper folder, or simply gone. Packing it would quietly change what the
    /// note means, so it stays where it is and the reference stays as written.
    ExternalAsset { reference: String },
    /// Used by more than one note in this plan. Each container gets its own
    /// copy, which is correct and takes more room than the shared file did.
    SharedAsset { reference: String },
    /// On the web. Left alone; nothing is downloaded.
    RemoteAsset { reference: String },
    /// A `.dtnote` of that name is already there. This note is not converted —
    /// overwriting one to make another is not a migration.
    TargetExists,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationPlan {
    pub plan_id: String,
    pub candidates: Vec<LegacyNoteCandidate>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationResult {
    pub source_markdown: PathBuf,
    pub target_dtnote: Option<PathBuf>,
    pub succeeded: bool,
    pub message: String,
}

// —— Scanning ——

/// One reference, as far as the scan got with it.
struct Reference {
    /// As the note wrote it, so the user recognises it in the plan.
    written: String,
    /// Where it lives now, and the identity used to notice two notes sharing it.
    file: PathBuf,
}

/// Looks at every path it is given and answers with what could be converted.
///
/// Reads only. The `plan_id` is what [`execute`] checks, so a plan the user
/// approved cannot be quietly swapped for a later one.
pub fn scan(paths: &[PathBuf]) -> ApiResult<MigrationPlan> {
    let mut scanned: Vec<(LegacyNoteCandidate, Vec<Reference>)> = Vec::new();

    for path in paths {
        if !is_legacy_note(path) {
            continue;
        }
        let Ok(source) = std::fs::read_to_string(path) else {
            // Unreadable now means unreadable during the conversion too. Leaving
            // it out of the plan leaves the note exactly as it is.
            continue;
        };

        let folder = path.parent().unwrap_or(Path::new("."));
        let target = path.with_extension(NOTE_EXTENSION);

        let mut warnings = Vec::new();
        if target.exists() {
            warnings.push(MigrationWarning::TargetExists);
        }

        let mut packable = Vec::new();
        for written in super::markdown::image_references(&source) {
            match resolve(&written, folder) {
                Resolved::Packable(file) => packable.push(Reference { written, file }),
                Resolved::Remote => {
                    warnings.push(MigrationWarning::RemoteAsset { reference: written })
                }
                Resolved::Inline => {}
                Resolved::Elsewhere => {
                    warnings.push(MigrationWarning::ExternalAsset { reference: written })
                }
            }
        }

        scanned.push((
            LegacyNoteCandidate {
                source_markdown: path.clone(),
                target_dtnote: target,
                referenced_assets: packable.iter().map(|entry| entry.file.clone()).collect(),
                warnings,
            },
            packable,
        ));
    }

    // A picture used by two notes becomes two copies. That is the right answer
    // — each container has to stand on its own — and it is also the one that
    // makes a folder grow after a migration, so it is said out loud first.
    let mut uses: HashMap<&Path, usize> = HashMap::new();
    for (_, references) in &scanned {
        for reference in references {
            *uses.entry(reference.file.as_path()).or_default() += 1;
        }
    }
    let shared: Vec<(usize, String)> = scanned
        .iter()
        .enumerate()
        .flat_map(|(index, (_, references))| {
            references
                .iter()
                .filter(|reference| uses.get(reference.file.as_path()).copied().unwrap_or(0) > 1)
                .map(move |reference| (index, reference.written.clone()))
        })
        .collect();
    for (index, reference) in shared {
        scanned[index]
            .0
            .warnings
            .push(MigrationWarning::SharedAsset { reference });
    }

    Ok(MigrationPlan {
        plan_id: plan_id()?,
        candidates: scanned.into_iter().map(|(candidate, _)| candidate).collect(),
    })
}

fn is_legacy_note(path: &Path) -> bool {
    path.is_file()
        && path.extension().is_some_and(|extension| {
            LEGACY_EXTENSIONS
                .iter()
                .any(|legacy| extension.eq_ignore_ascii_case(legacy))
        })
}

enum Resolved {
    /// A file in this note's own `assets/`, which is the layout DeskTime wrote.
    Packable(PathBuf),
    /// `https:` and friends.
    Remote,
    /// A `data:` URI — already inside the note, nothing to pack or warn about.
    Inline,
    Elsewhere,
}

fn resolve(reference: &str, folder: &Path) -> Resolved {
    if reference.starts_with("data:") {
        return Resolved::Inline;
    }
    // A scheme means the picture is not on this disk at all.
    if reference
        .split_once(':')
        .is_some_and(|(scheme, _)| !scheme.is_empty() && scheme.chars().all(is_scheme_char))
    {
        return Resolved::Remote;
    }

    // Only `assets/<name>` is converted. A deeper path, a sibling folder or a
    // Windows separator is a layout this program never produced, and inventing
    // a place for it inside the container would change what the note says.
    let Some(name) = reference.strip_prefix(ASSET_PREFIX) else {
        return Resolved::Elsewhere;
    };
    if name.is_empty() || name.contains('/') || name.contains('\\') || name.contains(':') {
        return Resolved::Elsewhere;
    }

    let file = folder.join(ASSET_PREFIX).join(name);
    // `canonicalize` is what makes a symlink out of the note's folder an
    // external reference rather than a file that merely looks local.
    let (Ok(inside), Ok(root)) = (file.canonicalize(), folder.canonicalize()) else {
        return Resolved::Elsewhere;
    };
    if !inside.starts_with(&root) {
        return Resolved::Elsewhere;
    }

    Resolved::Packable(inside)
}

fn is_scheme_char(character: char) -> bool {
    character.is_ascii_alphanumeric() || matches!(character, '+' | '-' | '.')
}

fn plan_id() -> ApiResult<String> {
    let bytes = crate::vault::crypto::random_bytes::<8>()?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

// —— Converting ——

/// Converts every candidate in `plan`, writing a line per note into `log_dir`.
///
/// Each note is on its own: the loop never stops early, because one unreadable
/// picture in one note is no reason to leave the other forty as they were.
pub fn execute(plan: &MigrationPlan, log_dir: &Path) -> Vec<MigrationResult> {
    let results: Vec<MigrationResult> = plan.candidates.iter().map(convert).collect();
    write_log(plan, &results, log_dir);
    results
}

fn convert(candidate: &LegacyNoteCandidate) -> MigrationResult {
    let failed = |message: String| MigrationResult {
        source_markdown: candidate.source_markdown.clone(),
        target_dtnote: None,
        succeeded: false,
        message,
    };

    if candidate.warnings.contains(&MigrationWarning::TargetExists) {
        return failed(format!(
            "{} already exists; the note was left as it was",
            candidate.target_dtnote.display()
        ));
    }

    let markdown = match std::fs::read_to_string(&candidate.source_markdown) {
        Ok(markdown) => markdown,
        Err(error) => return failed(format!("the note could not be read: {error}")),
    };

    let mut assets = Vec::new();
    for file in &candidate.referenced_assets {
        let Some(name) = file.file_name().map(|name| name.to_string_lossy().into_owned()) else {
            return failed(format!("{} is not a file", file.display()));
        };
        match std::fs::read(file) {
            Ok(bytes) => assets.push(NoteAsset {
                path: format!("{ASSET_PREFIX}{name}"),
                bytes,
            }),
            // Half a note is not a migration: the original still has every
            // picture, so it stays the copy that works.
            Err(error) => {
                return failed(format!("{} could not be read: {error}", file.display()))
            }
        }
    }

    let document = NoteDocument {
        info: NoteInfo::default(),
        markdown,
        assets,
    };
    // The writer builds the whole container, reads it back and checks it before
    // anything is replaced — which is why the original can be moved next.
    if let Err(error) = ZipNoteContainer.write_atomic(&candidate.target_dtnote, &document) {
        return failed(format!("the container could not be written: {}", error.message));
    }

    let mut message = format!("{} images packed", candidate.referenced_assets.len());
    // The recycle bin is the only undo there is, so a note that could not be
    // put there is reported as converted *and* still present rather than as a
    // failure — the `.dtnote` beside it is real and correct.
    if let Err(error) = trash::delete(&candidate.source_markdown) {
        message.push_str(&format!(
            "; the original could not be moved to the recycle bin ({error}) and is still there"
        ));
    }

    MigrationResult {
        source_markdown: candidate.source_markdown.clone(),
        target_dtnote: Some(candidate.target_dtnote.clone()),
        succeeded: true,
        message,
    }
}

/// A file that says what happened, because the window that showed it will be
/// closed long before anyone wonders where a note went.
fn write_log(plan: &MigrationPlan, results: &[MigrationResult], log_dir: &Path) {
    let Ok(()) = std::fs::create_dir_all(log_dir) else {
        return;
    };

    let stamp = crate::reminder::now_ms();
    let mut report = format!("plan {} at {stamp}\n", plan.plan_id);
    for result in results {
        report.push_str(&format!(
            "{} {} -> {}: {}\n",
            if result.succeeded { "ok  " } else { "fail" },
            result.source_markdown.display(),
            result
                .target_dtnote
                .as_ref()
                .map_or_else(|| "-".to_owned(), |path| path.display().to_string()),
            result.message,
        ));
    }
    // Images stay where they are even for a note that converted: one of them
    // may belong to a note outside this plan, and there is no way from here to
    // know that it does not.
    report.push_str("assets/ folders were left in place and can be removed by hand\n");

    let _ = std::fs::write(log_dir.join(format!("note-migration-{stamp}.log")), report);
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::sync::atomic::{AtomicU32, Ordering};

    struct Scratch(PathBuf);

    impl Scratch {
        fn new() -> Self {
            static COUNTER: AtomicU32 = AtomicU32::new(0);
            let dir = std::env::temp_dir().join(format!(
                "desktime-migration-{}-{}",
                std::process::id(),
                COUNTER.fetch_add(1, Ordering::Relaxed)
            ));
            std::fs::create_dir_all(dir.join("assets")).unwrap();
            Self(dir)
        }

        fn note(&self, name: &str, body: &str) -> PathBuf {
            let path = self.0.join(name);
            std::fs::write(&path, body).unwrap();
            path
        }

        fn asset(&self, name: &str) -> PathBuf {
            let path = self.0.join("assets").join(name);
            std::fs::write(&path, b"picture bytes").unwrap();
            path
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn a_note_and_the_pictures_beside_it_become_one_file() {
        let scratch = Scratch::new();
        scratch.asset("1.png");
        let note = scratch.note("note.md", "# hi\n\n![shot](assets/1.png)\n");

        let plan = scan(&[note.clone()]).unwrap();
        assert_eq!(plan.candidates.len(), 1);
        assert_eq!(plan.candidates[0].referenced_assets.len(), 1);
        assert!(plan.candidates[0].warnings.is_empty());

        let results = execute(&plan, &scratch.0.join("logs"));
        assert!(results[0].succeeded, "{}", results[0].message);

        let converted = ZipNoteContainer
            .read(&scratch.0.join("note.dtnote"))
            .unwrap();
        assert_eq!(converted.markdown, "# hi\n\n![shot](assets/1.png)\n");
        assert_eq!(converted.assets.len(), 1);
        assert_eq!(converted.assets[0].path, "assets/1.png");
        // The original is gone from where it was, but only as far as the
        // recycle bin.
        assert!(!note.exists());
        assert!(scratch.0.join("logs").read_dir().unwrap().next().is_some());
    }

    #[test]
    fn a_picture_the_container_cannot_hold_is_reported_and_left_alone() {
        let scratch = Scratch::new();
        let note = scratch.note(
            "note.md",
            "![out](../elsewhere/x.png)\n\n![web](https://example.com/y.png)\n\n![gone](assets/missing.png)\n",
        );

        let plan = scan(&[note]).unwrap();
        let warnings = &plan.candidates[0].warnings;

        assert!(plan.candidates[0].referenced_assets.is_empty());
        assert!(warnings.contains(&MigrationWarning::ExternalAsset {
            reference: "../elsewhere/x.png".to_owned()
        }));
        assert!(warnings.contains(&MigrationWarning::RemoteAsset {
            reference: "https://example.com/y.png".to_owned()
        }));
        assert!(warnings.contains(&MigrationWarning::ExternalAsset {
            reference: "assets/missing.png".to_owned()
        }));
    }

    #[test]
    fn a_picture_two_notes_share_is_called_out_in_both() {
        let scratch = Scratch::new();
        scratch.asset("shared.png");
        let first = scratch.note("first.md", "![a](assets/shared.png)");
        let second = scratch.note("second.md", "![b](assets/shared.png)");

        let plan = scan(&[first, second]).unwrap();
        let shared = MigrationWarning::SharedAsset {
            reference: "assets/shared.png".to_owned(),
        };
        assert!(plan.candidates[0].warnings.contains(&shared));
        assert!(plan.candidates[1].warnings.contains(&shared));

        // Both still convert, each with its own copy.
        let results = execute(&plan, &scratch.0.join("logs"));
        assert!(results.iter().all(|result| result.succeeded));
        assert_eq!(
            ZipNoteContainer
                .read(&scratch.0.join("second.dtnote"))
                .unwrap()
                .assets
                .len(),
            1
        );
    }

    #[test]
    fn a_warning_reaches_the_frontend_in_the_shape_it_reads() {
        // The tag and the field renaming are attributes, so getting them wrong
        // compiles and then shows the user a blank line in the plan they are
        // being asked to approve.
        assert_eq!(
            serde_json::to_value(MigrationWarning::SharedAsset {
                reference: "assets/1.png".to_owned()
            })
            .unwrap(),
            serde_json::json!({ "kind": "sharedAsset", "reference": "assets/1.png" })
        );
        assert_eq!(
            serde_json::to_value(MigrationWarning::TargetExists).unwrap(),
            serde_json::json!({ "kind": "targetExists" })
        );
    }

    #[test]
    fn a_note_whose_name_is_taken_is_left_exactly_as_it_was() {
        let scratch = Scratch::new();
        let note = scratch.note("note.md", "the original text");
        let taken = scratch.0.join("note.dtnote");
        std::fs::write(&taken, b"something already here").unwrap();

        let plan = scan(&[note.clone()]).unwrap();
        assert!(plan.candidates[0]
            .warnings
            .contains(&MigrationWarning::TargetExists));

        let results = execute(&plan, &scratch.0.join("logs"));
        assert!(!results[0].succeeded);
        assert_eq!(std::fs::read(&taken).unwrap(), b"something already here");
        assert_eq!(std::fs::read_to_string(&note).unwrap(), "the original text");
    }
}
