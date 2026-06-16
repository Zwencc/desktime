//! The `.dtnote` container: a ZIP holding one note and every picture in it.
//!
//! The layout is fixed and small — `info.json`, `text.markdown`, `assets/*` —
//! and this module is the only place that knows it. Two rules shape everything
//! here:
//!
//! **Reading is hostile-input parsing.** A `.dtnote` may have come from
//! anywhere, and a ZIP is a format with a long history of entries that escape
//! the directory they were unpacked into, names that collide so two readers
//! disagree about which one is real, and small archives that unpack into
//! gigabytes. Every one of those is refused by name below rather than left to
//! whatever the reader happens to do.
//!
//! **Writing is all-or-nothing.** The cost of putting a note and its pictures in
//! one file is that a half-written file loses all of it, where a `.md` beside an
//! `assets/` folder would only have lost one. So a save never touches the note:
//! it builds a complete second file next to it, reads that back in full, and
//! only then renames it over the top.

use std::collections::HashSet;
use std::fs::File;
use std::io::{BufReader, BufWriter, Cursor, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::api::{ApiError, ApiErrorCode, ApiResult};

use super::limits::NOTE_LIMITS;
use super::model::{
    has_supported_extension, NoteAsset, NoteDocument, NoteInfo, ASSET_PREFIX, INFO_ENTRY, TEXT_ENTRY,
};

pub trait NoteContainer: Send + Sync {
    fn read(&self, path: &Path) -> ApiResult<NoteDocument>;
    fn write_atomic(&self, path: &Path, document: &NoteDocument) -> ApiResult<()>;
    fn validate(&self, path: &Path) -> ApiResult<()>;
}

/// The concrete type is fixed now so callers cannot invent a second note
/// format. Archive parsing and atomic replacement are completed in this module.
pub struct ZipNoteContainer;

impl ZipNoteContainer {
    fn require_dtnote(path: &Path) -> ApiResult<()> {
        if !has_supported_extension(path) {
            return Err(ApiError::new(
                ApiErrorCode::UnsupportedNoteType,
                "DeskTime only opens .dtnote files",
            ));
        }
        Ok(())
    }
}

impl NoteContainer for ZipNoteContainer {
    fn read(&self, path: &Path) -> ApiResult<NoteDocument> {
        Self::require_dtnote(path)?;
        read_archive(path)
    }

    fn write_atomic(&self, path: &Path, document: &NoteDocument) -> ApiResult<()> {
        Self::require_dtnote(path)?;
        write_archive(path, document)
    }

    fn validate(&self, path: &Path) -> ApiResult<()> {
        Self::require_dtnote(path)?;
        read_archive(path).map(|_| ())
    }
}

// —— Entry names ——

/// What one entry is, once its name has been believed.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Slot {
    Info,
    Text,
    Asset,
}

fn invalid(message: impl Into<String>) -> ApiError {
    ApiError::new(ApiErrorCode::InvalidDtnote, message)
}

fn limit(message: impl Into<String>) -> ApiError {
    ApiError::new(ApiErrorCode::ArchiveLimitExceeded, message)
}

fn missing(message: impl Into<String>) -> ApiError {
    ApiError::new(ApiErrorCode::MissingContent, message)
}

fn duplicate(name: &str) -> ApiError {
    ApiError::new(
        ApiErrorCode::DuplicateEntry,
        format!("the container holds more than one `{name}`"),
    )
}

fn zip_error(error: zip::result::ZipError) -> ApiError {
    invalid(format!("the container is not a readable archive: {error}"))
}

/// Places one entry name, or refuses it.
///
/// `None` is an entry this version has no use for. It is deliberately *ignored*
/// rather than rejected: the container is the single point of failure for a
/// whole note, and refusing to open one because a stray file rode along would
/// turn a harmless surprise into lost work. Nothing unknown is ever written
/// back, so an ignored entry disappears at the next save.
fn classify(name: &str) -> ApiResult<Option<Slot>> {
    if name.is_empty() {
        return Err(invalid("the container holds an entry with no name"));
    }
    // A directory marker carries no bytes and names nothing this reader wants.
    if name.ends_with('/') {
        return Ok(None);
    }

    // Everything a ZIP entry may not be. The backslash and the colon are here
    // because this runs on Windows, where `assets\..\..\x` and `C:x` are both
    // paths out of the container that a slash-only check would wave through.
    let escapes = name.starts_with('/')
        || name.contains('\\')
        || name.contains(':')
        || name
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..");
    if escapes {
        return Err(ApiError::new(
            ApiErrorCode::PathTraversal,
            format!("entry `{name}` points outside the container"),
        ));
    }

    if name == INFO_ENTRY {
        return Ok(Some(Slot::Info));
    }
    if name == TEXT_ENTRY {
        return Ok(Some(Slot::Text));
    }
    // A second body is the one surprise that cannot be ignored: picking either
    // one is a guess, and guessing wrong shows the user someone else's note.
    if name.starts_with("text.") {
        return Err(invalid(format!(
            "`{name}` is a second body, and a note has exactly one"
        )));
    }

    match name.strip_prefix(ASSET_PREFIX) {
        Some(rest) if !rest.contains('/') => Ok(Some(Slot::Asset)),
        Some(_) => Err(invalid(format!("`{name}` is not a plain file in {ASSET_PREFIX}"))),
        None => Ok(None),
    }
}

// —— Reading ——

/// One entry as the central directory describes it — before a byte of it has
/// been believed enough to allocate for.
struct Planned {
    index: usize,
    slot: Slot,
    name: String,
    size: u64,
}

fn read_archive(path: &Path) -> ApiResult<NoteDocument> {
    read_source(BufReader::new(File::open(path)?))
}

/// A container that never had a file of its own.
///
/// The vault stores a whole `.dtnote` as one encrypted blob, so what comes back
/// from a decryption is a container in memory. It has to be parsed by exactly
/// the same code that parses one on disk — a second reader with slightly
/// different limits is how the encrypted copy ends up trusting something the
/// plain one would have refused.
pub fn read_bytes(bytes: &[u8]) -> ApiResult<NoteDocument> {
    read_source(Cursor::new(bytes))
}

pub fn pack_bytes(document: &NoteDocument) -> ApiResult<Vec<u8>> {
    Ok(pack_into(Cursor::new(Vec::new()), document)?.into_inner())
}

fn read_source<R: Read + Seek>(mut source: R) -> ApiResult<NoteDocument> {
    let declared = declared_entry_count(&mut source)?;
    if declared > NOTE_LIMITS.entries {
        return Err(limit(format!(
            "the container declares {declared} entries, over the {} allowed",
            NOTE_LIMITS.entries
        )));
    }

    let mut archive = ZipArchive::new(source).map_err(zip_error)?;
    // `ZipArchive` keys its entries by name, so a second `assets/1.png` quietly
    // replaces the first and `len()` can never show it. The directory's own
    // count can, and a mismatch is exactly the ambiguity to refuse.
    if archive.len() != declared {
        return Err(ApiError::new(
            ApiErrorCode::DuplicateEntry,
            format!(
                "the directory lists {declared} entries but only {} have distinct names",
                archive.len()
            ),
        ));
    }

    let planned = plan_entries(&mut archive)?;

    let mut info = None;
    let mut markdown = None;
    let mut assets = Vec::new();
    for entry in planned {
        let bytes = read_entry(&mut archive, entry.index, entry.size)?;
        match entry.slot {
            Slot::Info => {
                info = Some(serde_json::from_slice::<NoteInfo>(&bytes).map_err(|error| {
                    invalid(format!(
                        "{INFO_ENTRY} is not the metadata it should be: {error}"
                    ))
                })?);
            }
            Slot::Text => {
                markdown = Some(
                    String::from_utf8(bytes)
                        .map_err(|_| invalid(format!("{TEXT_ENTRY} is not UTF-8 text")))?,
                );
            }
            Slot::Asset => assets.push(NoteAsset {
                path: entry.name,
                bytes,
            }),
        }
    }

    Ok(NoteDocument {
        info: info.ok_or_else(|| missing(format!("the container has no {INFO_ENTRY}")))?,
        markdown: markdown.ok_or_else(|| missing(format!("the container has no {TEXT_ENTRY}")))?,
        assets,
    })
}

/// Walks the central directory and applies every limit, reading no content.
///
/// This is the whole zip-bomb defence and it has to come first: once bytes are
/// being decompressed it is already too late to decide they were too many.
fn plan_entries<R: Read + Seek>(archive: &mut ZipArchive<R>) -> ApiResult<Vec<Planned>> {
    let mut planned = Vec::new();
    let mut seen = HashSet::new();
    let mut total = 0u64;
    let mut images = 0usize;

    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(zip_error)?;
        let name = entry.name().to_owned();
        let Some(slot) = classify(&name)? else {
            continue;
        };
        if !seen.insert(name.clone()) {
            return Err(duplicate(&name));
        }

        let size = entry.size();
        if size > NOTE_LIMITS.entry_bytes {
            return Err(limit(format!(
                "`{name}` unpacks to {size} bytes, over the {} allowed for one entry",
                NOTE_LIMITS.entry_bytes
            )));
        }
        total = total.saturating_add(size);
        if total > NOTE_LIMITS.total_uncompressed_bytes {
            return Err(limit(format!(
                "the container unpacks to more than the {} bytes allowed",
                NOTE_LIMITS.total_uncompressed_bytes
            )));
        }

        // A few kilobytes that unpack to a few hundred megabytes is not a note.
        let packed = entry.compressed_size();
        if packed > 0 && size / packed > NOTE_LIMITS.compression_ratio {
            return Err(limit(format!(
                "`{name}` expands {}x, over the {}x allowed",
                size / packed,
                NOTE_LIMITS.compression_ratio
            )));
        }

        if slot == Slot::Asset {
            images += 1;
            if images > NOTE_LIMITS.images {
                return Err(limit(format!(
                    "the container holds more than the {} images allowed",
                    NOTE_LIMITS.images
                )));
            }
        }

        planned.push(Planned {
            index,
            slot,
            name,
            size,
        });
    }

    Ok(planned)
}

/// Reads one entry, believing the directory only as far as the byte it named.
fn read_entry<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    index: usize,
    size: u64,
) -> ApiResult<Vec<u8>> {
    let entry = archive.by_index(index).map_err(zip_error)?;
    let mut bytes = Vec::with_capacity(size as usize);
    // `size` is a claim made by the directory, and the stream can disagree with
    // it in either direction. Capping the read one byte past the claim turns a
    // lying header into a refusal instead of an allocation.
    entry
        .take(size + 1)
        .read_to_end(&mut bytes)
        // A failure here is a corrupt entry — the CRC check the reader performs
        // at the end of the stream arrives as one of these — not a bad disk.
        .map_err(|error| invalid(format!("an entry could not be unpacked: {error}")))?;

    if bytes.len() as u64 != size {
        return Err(invalid(
            "an entry does not hold the number of bytes its directory record claims",
        ));
    }
    Ok(bytes)
}

/// The number of records the end-of-directory record says the directory has.
///
/// Read by hand because the answer is not otherwise reachable, and it is the
/// only way to see a name that appears twice.
fn declared_entry_count<R: Read + Seek>(source: &mut R) -> ApiResult<usize> {
    const SIGNATURE: [u8; 4] = [0x50, 0x4b, 0x05, 0x06];
    const EOCD_BYTES: usize = 22;

    let size = source.seek(SeekFrom::End(0))?;
    if size < EOCD_BYTES as u64 {
        return Err(invalid("the file is too small to be an archive"));
    }

    // The record sits at the end, after a comment of up to 64 KiB.
    let window = size.min((EOCD_BYTES + u16::MAX as usize) as u64) as usize;
    source.seek(SeekFrom::End(-(window as i64)))?;
    let mut tail = vec![0u8; window];
    source.read_exact(&mut tail)?;

    let start = tail
        .windows(SIGNATURE.len())
        .rposition(|candidate| candidate == SIGNATURE)
        .ok_or_else(|| invalid("the file has no archive directory"))?;
    if tail.len() - start < EOCD_BYTES {
        return Err(invalid("the archive directory is truncated"));
    }

    let count = u16::from_le_bytes([tail[start + 10], tail[start + 11]]) as usize;
    // The saturated value means the real count lives in a ZIP64 record. Anything
    // holding that many entries is over the limit either way, so there is
    // nothing to gain by going to read it.
    if count == u16::MAX as usize {
        return Err(limit("the container declares too many entries to be a note"));
    }
    Ok(count)
}

// —— Writing ——

fn write_archive(path: &Path, document: &NoteDocument) -> ApiResult<()> {
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .ok_or_else(|| {
            ApiError::new(
                ApiErrorCode::IoError,
                format!("{} names no folder to write into", path.display()),
            )
        })?;
    std::fs::create_dir_all(parent)?;

    // The same folder, because a rename is only atomic within one volume — and
    // a fixed name, so the leftover of a save that died mid-write is cleared by
    // the next one rather than accumulating.
    let temp = temp_path(path);
    let _ = std::fs::remove_file(&temp);

    if let Err(error) = pack(&temp, document).and_then(|()| verify(&temp, document)) {
        let _ = std::fs::remove_file(&temp);
        return Err(error);
    }

    // Only now does the note on disk change, and it changes in one step.
    if let Err(error) = std::fs::rename(&temp, path) {
        let _ = std::fs::remove_file(&temp);
        return Err(error.into());
    }
    Ok(())
}

fn temp_path(path: &Path) -> PathBuf {
    path.with_extension("dtnote.part")
}

fn pack(temp: &Path, document: &NoteDocument) -> ApiResult<()> {
    let file = pack_into(BufWriter::new(File::create(temp)?), document)?
        .into_inner()
        .map_err(|error| ApiError::new(ApiErrorCode::IoError, error.to_string()))?;
    // A rename that reaches the disk before the bytes it points at is how a
    // power cut turns an atomic replace into an empty note.
    file.sync_all()?;
    Ok(())
}

/// Builds the whole container, wherever it is going.
fn pack_into<W: Write + Seek>(writer: W, document: &NoteDocument) -> ApiResult<W> {
    if document.assets.len() > NOTE_LIMITS.images {
        return Err(limit(format!("a note may hold {} images", NOTE_LIMITS.images)));
    }

    let mut seen = HashSet::new();
    for asset in &document.assets {
        if classify(&asset.path)? != Some(Slot::Asset) {
            return Err(invalid(format!(
                "`{}` is not a path inside {ASSET_PREFIX}",
                asset.path
            )));
        }
        if !seen.insert(asset.path.as_str()) {
            return Err(duplicate(&asset.path));
        }
        if asset.bytes.len() as u64 > NOTE_LIMITS.entry_bytes {
            return Err(limit(format!(
                "`{}` is larger than the {} bytes allowed for one entry",
                asset.path, NOTE_LIMITS.entry_bytes
            )));
        }
    }

    let deflated = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    // png, jpg and webp arrive already compressed. Deflating them again costs
    // real time on every autosave and saves almost nothing.
    let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);

    let mut writer = ZipWriter::new(writer);
    writer.start_file(INFO_ENTRY, deflated).map_err(zip_error)?;
    writer.write_all(
        &serde_json::to_vec(&document.info)
            .map_err(|error| invalid(format!("{INFO_ENTRY} could not be written: {error}")))?,
    )?;
    writer.start_file(TEXT_ENTRY, deflated).map_err(zip_error)?;
    writer.write_all(document.markdown.as_bytes())?;
    for asset in &document.assets {
        writer
            .start_file(asset.path.clone(), stored)
            .map_err(zip_error)?;
        writer.write_all(&asset.bytes)?;
    }

    writer.finish().map_err(zip_error)
}

/// Reads the new file back before anything is replaced.
///
/// Reading it *is* the check: `read_archive` verifies every entry's CRC on the
/// way through, so what is left to compare is that the note which came back is
/// the note that went in — not its bytes a second time.
fn verify(temp: &Path, document: &NoteDocument) -> ApiResult<()> {
    let written = read_archive(temp)?;
    let intact = written.markdown == document.markdown
        && written.assets.len() == document.assets.len()
        && written
            .assets
            .iter()
            .zip(&document.assets)
            .all(|(left, right)| left.path == right.path && left.bytes.len() == right.bytes.len());

    if !intact {
        return Err(invalid("the note did not survive being written"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::sync::atomic::{AtomicU32, Ordering};

    /// A folder of this test's own, gone when the test that made it ends.
    struct Scratch(PathBuf);

    impl Scratch {
        fn new() -> Self {
            static COUNTER: AtomicU32 = AtomicU32::new(0);
            let dir = std::env::temp_dir().join(format!(
                "desktime-note-{}-{}",
                std::process::id(),
                COUNTER.fetch_add(1, Ordering::Relaxed)
            ));
            std::fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }

        fn path(&self, name: &str) -> PathBuf {
            self.0.join(name)
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn document(markdown: &str, assets: &[(&str, &[u8])]) -> NoteDocument {
        NoteDocument {
            info: NoteInfo::default(),
            markdown: markdown.to_owned(),
            assets: assets
                .iter()
                .map(|(path, bytes)| NoteAsset {
                    path: (*path).to_owned(),
                    bytes: bytes.to_vec(),
                })
                .collect(),
        }
    }

    /// Builds an archive entry by entry, so a test can write the shapes a
    /// well-behaved writer never would — which is the only way to check that
    /// the reader refuses them.
    fn raw_archive(path: &Path, entries: &[(&str, &[u8])]) {
        let mut writer = ZipWriter::new(File::create(path).unwrap());
        for (name, bytes) in entries {
            writer
                .start_file(*name, SimpleFileOptions::default())
                .unwrap();
            writer.write_all(bytes).unwrap();
        }
        writer.finish().unwrap();
    }

    const INFO: &[u8] = br#"{"version":2,"type":"net.daringfireball.markdown","transient":false,"creatorIdentifier":"com.desktime.app"}"#;

    fn refused(path: &Path) -> ApiErrorCode {
        ZipNoteContainer.read(path).unwrap_err().code
    }

    #[test]
    fn a_note_and_its_pictures_survive_a_round_trip() {
        let scratch = Scratch::new();
        let note = scratch.path("note.dtnote");
        let written = document(
            "# 标题\n\n![shot](assets/1.png)\n",
            &[("assets/1.png", &[0x89, 0x50, 0x4e, 0x47]), ("assets/2.jpg", b"jpeg")],
        );

        ZipNoteContainer.write_atomic(&note, &written).unwrap();
        let read = ZipNoteContainer.read(&note).unwrap();

        assert_eq!(read.markdown, written.markdown);
        assert_eq!(read.assets.len(), 2);
        assert_eq!(read.assets[0].path, "assets/1.png");
        assert_eq!(read.assets[0].bytes, vec![0x89, 0x50, 0x4e, 0x47]);
        assert_eq!(read.info.content_type, "net.daringfireball.markdown");

        // Pictures arrive already compressed, so they go in uncompressed. This
        // is checked rather than assumed because deflating them again is
        // invisible until an autosave of a note full of screenshots gets slow.
        let mut archive = ZipArchive::new(File::open(&note).unwrap()).unwrap();
        assert_eq!(
            archive.by_name("assets/1.png").unwrap().compression(),
            CompressionMethod::Stored
        );
        assert_eq!(
            archive.by_name(TEXT_ENTRY).unwrap().compression(),
            CompressionMethod::Deflated
        );
    }

    #[test]
    fn opens_nothing_but_a_dtnote() {
        let scratch = Scratch::new();
        let markdown = scratch.path("note.md");
        std::fs::write(&markdown, "# not ours").unwrap();

        assert_eq!(refused(&markdown), ApiErrorCode::UnsupportedNoteType);
        assert_eq!(
            ZipNoteContainer
                .write_atomic(&markdown, &document("x", &[]))
                .unwrap_err()
                .code,
            ApiErrorCode::UnsupportedNoteType
        );
    }

    #[test]
    fn refuses_a_file_that_is_not_an_archive() {
        let scratch = Scratch::new();
        let note = scratch.path("broken.dtnote");
        std::fs::write(&note, b"this was a markdown file once").unwrap();

        assert_eq!(refused(&note), ApiErrorCode::InvalidDtnote);
    }

    #[test]
    fn refuses_an_entry_that_points_out_of_the_container() {
        let scratch = Scratch::new();
        let note = scratch.path("slip.dtnote");
        raw_archive(
            &note,
            &[
                (INFO_ENTRY, INFO),
                (TEXT_ENTRY, b"body"),
                ("assets/../../evil.png", b"payload"),
            ],
        );

        assert_eq!(refused(&note), ApiErrorCode::PathTraversal);

        // The Windows separator is the same attack in the shape this reader
        // would otherwise miss: `assets\..\..\evil.png` has no `..` component
        // as far as a slash-only check is concerned.
        let backslash = scratch.path("slip-windows.dtnote");
        raw_archive(
            &backslash,
            &[
                (INFO_ENTRY, INFO),
                (TEXT_ENTRY, b"body"),
                ("assets\\..\\..\\evil.png", b"payload"),
            ],
        );
        assert_eq!(refused(&backslash), ApiErrorCode::PathTraversal);
    }

    /// Renames every copy of an entry name in a finished archive, local header
    /// and directory record alike.
    ///
    /// This exists because `ZipWriter` refuses to write a duplicate name — which
    /// is right of it, and leaves no other way to produce the archive this
    /// reader has to refuse. The names must be the same length so no offset in
    /// the file moves.
    fn rename_entries(path: &Path, from: &str, to: &str) {
        assert_eq!(from.len(), to.len());
        let bytes = std::fs::read(path).unwrap();
        let mut patched = Vec::with_capacity(bytes.len());
        let mut rest = bytes.as_slice();
        while let Some(at) = rest
            .windows(from.len())
            .position(|window| window == from.as_bytes())
        {
            patched.extend_from_slice(&rest[..at]);
            patched.extend_from_slice(to.as_bytes());
            rest = &rest[at + from.len()..];
        }
        patched.extend_from_slice(rest);
        std::fs::write(path, patched).unwrap();
    }

    #[test]
    fn refuses_two_entries_with_the_same_name() {
        let scratch = Scratch::new();
        let note = scratch.path("twins.dtnote");
        raw_archive(
            &note,
            &[
                (INFO_ENTRY, INFO),
                (TEXT_ENTRY, b"the note the user wrote"),
                ("assets/1.png", b"first"),
                ("assets/2.png", b"second"),
            ],
        );
        rename_entries(&note, "assets/2.png", "assets/1.png");

        // Left to itself the reader would keep one of the two and never say so,
        // which is how two programs end up showing different pictures for the
        // same note.
        assert_eq!(refused(&note), ApiErrorCode::DuplicateEntry);
    }

    #[test]
    fn refuses_a_container_that_is_missing_a_part() {
        let scratch = Scratch::new();

        let no_info = scratch.path("no-info.dtnote");
        raw_archive(&no_info, &[(TEXT_ENTRY, b"body")]);
        assert_eq!(refused(&no_info), ApiErrorCode::MissingContent);

        let no_text = scratch.path("no-text.dtnote");
        raw_archive(&no_text, &[(INFO_ENTRY, INFO)]);
        assert_eq!(refused(&no_text), ApiErrorCode::MissingContent);
    }

    #[test]
    fn refuses_a_container_with_a_second_body() {
        let scratch = Scratch::new();
        let note = scratch.path("two-bodies.dtnote");
        raw_archive(
            &note,
            &[
                (INFO_ENTRY, INFO),
                (TEXT_ENTRY, b"the real one"),
                ("text.txt", b"or is it this one"),
            ],
        );

        assert_eq!(refused(&note), ApiErrorCode::InvalidDtnote);
    }

    #[test]
    fn refuses_more_entries_than_the_limit_allows() {
        let scratch = Scratch::new();
        let note = scratch.path("crowded.dtnote");

        let names: Vec<String> = (0..=NOTE_LIMITS.entries)
            .map(|index| format!("spare-{index}"))
            .collect();
        let entries: Vec<(&str, &[u8])> = names
            .iter()
            .map(|name| (name.as_str(), b"x".as_slice()))
            .collect();
        raw_archive(&note, &entries);

        assert_eq!(refused(&note), ApiErrorCode::ArchiveLimitExceeded);
    }

    #[test]
    fn refuses_more_images_than_the_limit_allows() {
        let scratch = Scratch::new();
        let note = scratch.path("gallery.dtnote");

        let paths: Vec<String> = (0..=NOTE_LIMITS.images)
            .map(|index| format!("assets/{index}.png"))
            .collect();
        let assets: Vec<(&str, &[u8])> = paths
            .iter()
            .map(|path| (path.as_str(), b"png".as_slice()))
            .collect();

        assert_eq!(
            ZipNoteContainer
                .write_atomic(&note, &document("body", &assets))
                .unwrap_err()
                .code,
            ApiErrorCode::ArchiveLimitExceeded
        );
        assert!(!note.exists());
    }

    #[test]
    fn refuses_an_entry_that_unpacks_out_of_all_proportion() {
        let scratch = Scratch::new();
        let note = scratch.path("bomb.dtnote");
        // Two megabytes of nothing deflate to about two kilobytes — a ratio an
        // order of magnitude past anything a real picture reaches.
        let zeros = vec![0u8; 2 * 1024 * 1024];
        raw_archive(
            &note,
            &[
                (INFO_ENTRY, INFO),
                (TEXT_ENTRY, b"body"),
                ("assets/bomb.png", &zeros),
            ],
        );

        assert_eq!(refused(&note), ApiErrorCode::ArchiveLimitExceeded);
    }

    #[test]
    fn a_refused_write_leaves_the_note_that_was_already_there() {
        let scratch = Scratch::new();
        let note = scratch.path("kept.dtnote");
        ZipNoteContainer
            .write_atomic(&note, &document("the version worth keeping", &[]))
            .unwrap();

        let bad = document("the version that never lands", &[("../escape.png", b"x")]);
        assert_eq!(
            ZipNoteContainer.write_atomic(&note, &bad).unwrap_err().code,
            ApiErrorCode::PathTraversal
        );

        assert_eq!(
            ZipNoteContainer.read(&note).unwrap().markdown,
            "the version worth keeping"
        );
        // And nothing half-written is left beside it.
        assert!(!temp_path(&note).exists());
    }
}
