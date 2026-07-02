//! The privacy vault, end to end.
//!
//! Three rules shape everything below, and each one is a thing that would
//! otherwise leak plaintext:
//!
//! **Names are secrets.** "离职计划.dtnote" is the private part. So the disk
//! holds nothing but random 128-bit object names; every real name, the folder
//! tree and the mapping between them live in the encrypted index. A locked
//! vault is a folder of noise with no file count to read off it.
//!
//! **The key never leaves this process.** Unlocking hands the frontend an
//! unguessable handle, not a key, and every later call carries the handle back.
//! Locking drops the key and the handle with it. This does not — and the feature
//! must not claim it does — protect against anything running as the logged-in
//! user while the vault is open: the decrypted note is in the webview by then,
//! and there is no reliable way to erase a JS heap. What it protects is the
//! locked state and the bytes at rest.
//!
//! **Nothing is replaced until its replacement has been read back.** Objects,
//! the index and the metadata are each written to a temp file, decrypted again
//! from that file, and only then renamed over the top.

use std::sync::Mutex;
use std::time::{Duration, SystemTime};

use crate::api::{ApiError, ApiErrorCode, ApiResult};
use crate::note::container::{pack_bytes, read_bytes};
use crate::note::model::{NoteDocument, NoteInfo};

use super::crypto::{
    hex, random_bytes, unhex, CryptoV1, VaultCrypto, KEY_BYTES, NONCE_BYTES, SALT_BYTES,
};
use super::format::{ObjectHeader, FILE_ID_BYTES, INDEX_FILE_ID};
use super::model::{
    EnvelopeKind, KeyEnvelope, VaultCreateFolderRequest, VaultCreateNoteRequest, VaultCreateRequest,
    VaultDeleteRequest, VaultDocumentDto, VaultEntry, VaultEntryKind, VaultExportRequest,
    VaultImportResult, VaultIndex, VaultMeta, VaultMoveRequest, VaultReadRequest,
    VaultRenameRequest, VaultResetPasswordRequest, VaultSessionDto, VaultStatus,
    VaultTransferRequest, VaultUnlockRequest, VaultWriteRequest,
};
use super::session::{SessionStore, VaultKey};
use super::store::{self, VaultPaths};

/// Shortest password, question and answer that are accepted.
///
/// Fixed and simple on purpose. A meter that scores passwords would be advice
/// dressed as a guarantee; the honest version is the sentence the create screen
/// shows about the answer being a second password.
const MIN_PASSWORD: usize = 8;
const MIN_QUESTION: usize = 4;
const MIN_ANSWER: usize = 2;

pub struct VaultController {
    pub paths: VaultPaths,
    sessions: SessionStore,
    crypto: CryptoV1,
    /// Serialises the read-modify-write of the index, and holds the failed
    /// attempt count that the unlock delay is based on.
    guard: Mutex<Guard>,
    /// Objects older than this cannot belong to work in flight, which is what
    /// makes sweeping them safe.
    started_at: SystemTime,
    /// What *new* envelopes are written with. Reading always uses the count
    /// recorded in the file, so raising this later leaves old vaults openable
    /// and lowering it in a test cannot weaken a real one.
    iterations: u32,
}

#[derive(Default)]
struct Guard {
    failures: u32,
    swept: bool,
}

impl VaultController {
    pub fn new(paths: VaultPaths) -> Self {
        Self::with_iterations(paths, super::crypto::DEFAULT_PBKDF2_ITERATIONS)
    }

    fn with_iterations(paths: VaultPaths, iterations: u32) -> Self {
        Self {
            paths,
            sessions: SessionStore::default(),
            crypto: CryptoV1,
            guard: Mutex::new(Guard::default()),
            started_at: SystemTime::now(),
            iterations,
        }
    }

    pub fn status(&self) -> VaultStatus {
        VaultStatus {
            initialized: self.paths.meta.is_file(),
            unlocked: self.sessions.is_unlocked(),
            api_version: 1,
            // Read from the metadata rather than remembered, so it is right
            // straight after a create in another window.
            security_question: self
                .read_meta()
                .map(|meta| meta.security_question)
                .unwrap_or_default(),
            folder: self.paths.root.to_string_lossy().into_owned(),
        }
    }

    // —— Getting in ——

    pub fn create(&self, request: VaultCreateRequest) -> ApiResult<VaultSessionDto> {
        let password = request.password;
        require(password.chars().count() >= MIN_PASSWORD, "the password is too short")?;
        require(password == request.password_confirmation, "the passwords do not match")?;

        let question = request.security_question.trim().to_owned();
        require(question.chars().count() >= MIN_QUESTION, "the question is too short")?;
        // Trimmed and case-sensitive, and that rule is fixed: an answer that
        // opens the vault whatever the capitalisation is a weaker second key
        // than the one the user thought they set.
        let answer = request.security_answer.trim().to_owned();
        require(answer.chars().count() >= MIN_ANSWER, "the answer is too short")?;
        require(
            answer == request.security_answer_confirmation.trim(),
            "the answers do not match",
        )?;

        let _guard = self.locked()?;
        if self.paths.meta.is_file() {
            return Err(ApiError::new(
                ApiErrorCode::NameConflict,
                "a vault already exists here",
            ));
        }

        let vek = random_bytes::<KEY_BYTES>()?;
        let descriptor = super::crypto::CryptoDescriptor {
            iterations: self.iterations,
            ..self.crypto.descriptor()
        };
        let meta = VaultMeta {
            descriptor,
            security_question: question,
            envelopes: vec![
                self.wrap(EnvelopeKind::Password, password.as_bytes(), &vek, descriptor.iterations)?,
                self.wrap(
                    EnvelopeKind::SecurityAnswer,
                    answer.as_bytes(),
                    &vek,
                    descriptor.iterations,
                )?,
            ],
        };

        self.paths.ensure()?;
        // The index first: a crash between the two leaves no metadata, which
        // reads as "no vault yet" rather than as a vault that cannot be opened.
        self.write_index(&vek, &VaultIndex::default())?;
        self.write_meta(&meta)?;

        Ok(VaultSessionDto {
            session_handle: self.sessions.insert(VaultKey::new(vek))?,
        })
    }

    pub fn unlock_password(&self, request: VaultUnlockRequest) -> ApiResult<VaultSessionDto> {
        self.unlock(EnvelopeKind::Password, request.credential.as_bytes().to_vec())
    }

    /// The "forgot password" route. The answer is trimmed and compared exactly
    /// as it was when it was set — see `create`.
    pub fn unlock_recovery(&self, request: VaultUnlockRequest) -> ApiResult<VaultSessionDto> {
        self.unlock(
            EnvelopeKind::SecurityAnswer,
            request.credential.trim().as_bytes().to_vec(),
        )
    }

    fn unlock(&self, kind: EnvelopeKind, secret: Vec<u8>) -> ApiResult<VaultSessionDto> {
        let mut guard = self.locked()?;
        // Only slows attempts made through this program. Someone holding a copy
        // of `vault.meta` can grind at it offline with no delay at all, which is
        // why the real defence is the PBKDF2 cost and the strength of the two
        // secrets — not this.
        Self::wait_out(guard.failures);

        let meta = self.read_meta()?;
        let envelope = meta.envelope(kind).ok_or_else(|| {
            ApiError::new(
                ApiErrorCode::InvalidCredentialOrCorruptMeta,
                "the vault metadata has no envelope of that kind",
            )
        })?;

        let vek = match self.unwrap(envelope, &secret) {
            Ok(vek) => vek,
            Err(error) => {
                guard.failures = guard.failures.saturating_add(1);
                return Err(error);
            }
        };
        guard.failures = 0;

        // Opening the index proves the key is really the vault's, and surfaces a
        // damaged index now rather than on the first note the user opens.
        let index = self.read_index(&vek)?;
        if !guard.swept {
            self.sweep(&index);
            guard.swept = true;
        }
        drop(guard);

        Ok(VaultSessionDto {
            session_handle: self.sessions.insert(VaultKey::new(vek))?,
        })
    }

    /// Attempts one and two are free; from the third the wait doubles.
    fn wait_out(failures: u32) {
        if failures < 2 {
            return;
        }
        let seconds = 1u64 << (failures - 2).min(5);
        std::thread::sleep(Duration::from_secs(seconds));
    }

    pub fn lock(&self, session_handle: &str) {
        self.sessions.remove(session_handle);
    }

    pub fn reset_password(&self, request: VaultResetPasswordRequest) -> ApiResult<()> {
        require(
            request.new_password.chars().count() >= MIN_PASSWORD,
            "the password is too short",
        )?;
        require(
            request.new_password == request.new_password_confirmation,
            "the passwords do not match",
        )?;

        let _guard = self.locked()?;
        let mut meta = self.read_meta()?;
        let iterations = meta.descriptor.iterations;
        // Only the password envelope is rebuilt. The vault key underneath it is
        // the same one, so every note written before the change still opens —
        // changing a password does not mean re-encrypting a notebook.
        let envelope = self.sessions.with_key(&request.session_handle, |vek| {
            self.wrap(
                EnvelopeKind::Password,
                request.new_password.as_bytes(),
                vek,
                iterations,
            )
        })?;

        meta.envelopes.retain(|held| held.kind != EnvelopeKind::Password);
        meta.envelopes.push(envelope);
        self.write_meta(&meta)
    }

    // —— The tree ——

    pub fn list(&self, session_handle: &str) -> ApiResult<Vec<VaultEntry>> {
        let _guard = self.locked()?;
        self.sessions
            .with_key(session_handle, |vek| Ok(self.read_index(vek)?.entries))
    }

    pub fn create_folder(&self, request: VaultCreateFolderRequest) -> ApiResult<VaultEntry> {
        let _guard = self.locked()?;
        self.sessions.with_key(&request.session_handle, |vek| {
            let mut index = self.read_index(vek)?;
            let entry = VaultEntry {
                id: hex(&random_bytes::<16>()?),
                parent_id: request.parent_id.clone(),
                kind: VaultEntryKind::Folder,
                name: check_name(&index, &request.name, request.parent_id.as_deref(), None)?,
                file_id: None,
                revision: 1,
            };
            index.entries.push(entry.clone());
            self.write_index(vek, &index)?;
            Ok(entry)
        })
    }

    pub fn create_note(&self, request: VaultCreateNoteRequest) -> ApiResult<VaultEntry> {
        let empty = pack_bytes(&NoteDocument {
            info: NoteInfo::default(),
            markdown: String::new(),
            assets: Vec::new(),
        })?;

        let _guard = self.locked()?;
        self.sessions.with_key(&request.session_handle, |vek| {
            let mut index = self.read_index(vek)?;
            let name = check_name(&index, &request.name, request.parent_id.as_deref(), None)?;
            let file_id = random_bytes::<FILE_ID_BYTES>()?;
            // The object goes down first. A crash before the index is committed
            // leaves it unreferenced, which the next unlock sweeps away; the
            // other order would leave the index naming a file that is not there.
            self.store_object(vek, file_id, &empty)?;

            let entry = VaultEntry {
                id: hex(&random_bytes::<16>()?),
                parent_id: request.parent_id.clone(),
                kind: VaultEntryKind::Note,
                name,
                file_id: Some(hex(&file_id)),
                revision: 1,
            };
            index.entries.push(entry.clone());
            self.write_index(vek, &index)?;
            Ok(entry)
        })
    }

    pub fn rename(&self, request: VaultRenameRequest) -> ApiResult<VaultEntry> {
        let _guard = self.locked()?;
        self.sessions.with_key(&request.session_handle, |vek| {
            let mut index = self.read_index(vek)?;
            let at = position_of(&index, &request.entry_id)?;
            let name = check_name(
                &index,
                &request.name,
                index.entries[at].parent_id.clone().as_deref(),
                Some(&request.entry_id),
            )?;

            index.entries[at].name = name;
            index.entries[at].revision += 1;
            self.write_index(vek, &index)?;
            Ok(index.entries[at].clone())
        })
    }

    pub fn move_entry(&self, request: VaultMoveRequest) -> ApiResult<VaultEntry> {
        let _guard = self.locked()?;
        self.sessions.with_key(&request.session_handle, |vek| {
            let mut index = self.read_index(vek)?;
            let at = position_of(&index, &request.entry_id)?;
            // A folder filed inside itself detaches the whole branch, and the
            // branch is invisible from the outside once it is gone.
            if let Some(parent) = request.parent_id.as_deref() {
                if parent == request.entry_id || descends_from(&index, parent, &request.entry_id) {
                    return Err(ApiError::new(
                        ApiErrorCode::InvalidRequest,
                        "a folder cannot be moved inside itself",
                    ));
                }
            }

            let mut entry = index.entries.remove(at);
            entry.parent_id = request.parent_id.clone();
            entry.revision += 1;

            // Order is position in the index, so "before" is an insertion point.
            let insert_at = request
                .before_id
                .as_deref()
                .and_then(|before| index.entries.iter().position(|held| held.id == before))
                .unwrap_or(index.entries.len());
            index.entries.insert(insert_at, entry.clone());

            self.write_index(vek, &index)?;
            Ok(entry)
        })
    }

    pub fn delete(&self, request: VaultDeleteRequest) -> ApiResult<()> {
        let _guard = self.locked()?;
        self.sessions.with_key(&request.session_handle, |vek| {
            let mut index = self.read_index(vek)?;
            let doomed = subtree(&index, &request.entry_id);
            if doomed.is_empty() {
                return Err(missing_entry());
            }

            let objects: Vec<String> = index
                .entries
                .iter()
                .filter(|entry| doomed.contains(&entry.id))
                .filter_map(|entry| entry.file_id.clone())
                .collect();
            index.entries.retain(|entry| !doomed.contains(&entry.id));

            // The index first, so a crash leaves objects nothing points at
            // rather than an index pointing at objects that are gone.
            self.write_index(vek, &index)?;
            for file_id in objects {
                if let Some(path) = self.paths.object(&file_id) {
                    let _ = std::fs::remove_file(path);
                }
            }
            Ok(())
        })
    }

    // —— Notes ——

    pub fn read(&self, request: VaultReadRequest) -> ApiResult<VaultDocumentDto> {
        let _guard = self.locked()?;
        self.sessions.with_key(&request.session_handle, |vek| {
            let index = self.read_index(vek)?;
            let entry = index.entries[position_of(&index, &request.entry_id)?].clone();
            let plaintext = self.load_object(vek, &entry)?;
            Ok(VaultDocumentDto {
                entry,
                document: crate::note::to_dto(read_bytes(&plaintext)?),
            })
        })
    }

    pub fn write(&self, request: VaultWriteRequest) -> ApiResult<VaultEntry> {
        let _guard = self.locked()?;
        self.sessions.with_key(&request.session_handle, |vek| {
            let mut index = self.read_index(vek)?;
            let at = position_of(&index, &request.entry_id)?;
            if index.entries[at].revision != request.expected_revision {
                return Err(ApiError::new(
                    ApiErrorCode::RevisionConflict,
                    "this note changed since it was opened",
                ));
            }

            let entry = index.entries[at].clone();
            let file_id = object_id(&entry)?;
            // Only unpack the stored note when the save is keeping something out
            // of it — the ordinary case, where the editor sends only what it
            // just pasted. A first save that carries everything skips a whole
            // decrypt.
            let kept = if request.document.assets.iter().any(|asset| asset.base64.is_none()) {
                read_bytes(&self.load_object(vek, &entry)?)?.assets
            } else {
                Vec::new()
            };

            let document = crate::note::compose_from(kept, &request.document)?;
            self.store_object(vek, file_id, &pack_bytes(&document)?)?;

            index.entries[at].revision += 1;
            self.write_index(vek, &index)?;
            Ok(index.entries[at].clone())
        })
    }

    /// The encrypted last resort for a save that failed.
    ///
    /// Without it, the one thing the notebook does when a write fails — park the
    /// text in a draft — would write a private note to disk in the clear. The
    /// backup is a vault entry like any other, so it is encrypted, it is inside
    /// the vault, and it disappears when the vault is locked away.
    pub fn write_backup(&self, request: VaultWriteRequest) -> ApiResult<VaultEntry> {
        let _guard = self.locked()?;
        self.sessions.with_key(&request.session_handle, |vek| {
            let mut index = self.read_index(vek)?;
            let source = index.entries[position_of(&index, &request.entry_id)?].clone();
            let backup_id = format!("{}-backup", source.id);

            let document = crate::note::compose_from(Vec::new(), &request.document)?;
            let packed = pack_bytes(&document)?;

            let at = index.entries.iter().position(|held| held.id == backup_id);
            let file_id = match at {
                Some(at) => object_id(&index.entries[at])?,
                None => random_bytes::<FILE_ID_BYTES>()?,
            };
            self.store_object(vek, file_id, &packed)?;

            let entry = VaultEntry {
                id: backup_id,
                parent_id: source.parent_id.clone(),
                kind: VaultEntryKind::Backup,
                name: format!("{} (backup)", source.name),
                file_id: Some(hex(&file_id)),
                revision: at.map_or(1, |at| index.entries[at].revision + 1),
            };
            match at {
                Some(at) => index.entries[at] = entry.clone(),
                None => index.entries.push(entry.clone()),
            }

            self.write_index(vek, &index)?;
            Ok(entry)
        })
    }

    // —— In and out ——

    pub fn import(&self, request: VaultTransferRequest) -> ApiResult<VaultImportResult> {
        let bytes = std::fs::read(&request.source)?;
        // Refused before anything is encrypted and the plain copy deleted: a
        // file that is not a note would be sealed into something unopenable.
        read_bytes(&bytes)?;
        let name = request
            .source
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .ok_or_else(|| ApiError::new(ApiErrorCode::InvalidRequest, "that is not a file"))?;

        let _guard = self.locked()?;
        self.sessions.with_key(&request.session_handle, |vek| {
            let mut index = self.read_index(vek)?;
            let name = check_name(&index, &name, request.target_parent_id.as_deref(), None)?;

            let file_id = random_bytes::<FILE_ID_BYTES>()?;
            self.store_object(vek, file_id, &bytes)?;
            let entry = VaultEntry {
                id: hex(&random_bytes::<16>()?),
                parent_id: request.target_parent_id.clone(),
                kind: VaultEntryKind::Note,
                name,
                file_id: Some(hex(&file_id)),
                revision: 1,
            };
            index.entries.push(entry.clone());
            self.write_index(vek, &index)?;

            // Unlinked, never sent to the recycle bin. A recycled file is a
            // fully recoverable plaintext copy, which would make "move into the
            // vault" mean "leave a readable copy outside it". What this cannot
            // promise is erasure: on an SSD, in a filesystem journal, in a sync
            // client's history or in a backup, the old bytes may well survive.
            let source_removed = std::fs::remove_file(&request.source).is_ok();
            Ok(VaultImportResult {
                entry,
                source_removed,
            })
        })
    }

    pub fn export(&self, request: VaultExportRequest) -> ApiResult<()> {
        // The only operation that turns a private note back into a readable
        // file, so it does not happen by accident.
        require(
            request.confirmed_plaintext,
            "moving a note out writes it to disk unencrypted and must be confirmed",
        )?;
        if !crate::note::model::has_supported_extension(&request.destination) {
            return Err(ApiError::new(
                ApiErrorCode::UnsupportedNoteType,
                "a note can only be written out as a .dtnote",
            ));
        }

        let _guard = self.locked()?;
        self.sessions.with_key(&request.session_handle, |vek| {
            let mut index = self.read_index(vek)?;
            let at = position_of(&index, &request.entry_id)?;
            let entry = index.entries[at].clone();
            let plaintext = self.load_object(vek, &entry)?;
            read_bytes(&plaintext)?;

            store::write_atomic(&request.destination, &plaintext)?;

            // Only once the plain copy is on disk does the encrypted one go.
            index.entries.remove(at);
            self.write_index(vek, &index)?;
            if let Some(path) = entry.file_id.as_deref().and_then(|id| self.paths.object(id)) {
                let _ = std::fs::remove_file(path);
            }
            Ok(())
        })
    }

    // —— Bytes ——

    /// A poisoned lock means some earlier call panicked, not that the vault is
    /// unusable — the data on disk is whole either way, because nothing is ever
    /// replaced before its replacement has been read back.
    fn locked(&self) -> ApiResult<std::sync::MutexGuard<'_, Guard>> {
        Ok(self.guard.lock().unwrap_or_else(|error| error.into_inner()))
    }

    fn wrap(
        &self,
        kind: EnvelopeKind,
        secret: &[u8],
        vek: &[u8; KEY_BYTES],
        iterations: u32,
    ) -> ApiResult<KeyEnvelope> {
        let mut envelope = KeyEnvelope {
            kind,
            salt: random_bytes::<SALT_BYTES>()?,
            iterations,
            nonce: random_bytes::<NONCE_BYTES>()?,
            wrapped_vek: Vec::new(),
        };
        let kek = self.crypto.derive_key(secret, &envelope.salt, iterations);
        envelope.wrapped_vek = self
            .crypto
            .seal(&kek, &envelope.nonce, &envelope.aad(), vek)?;
        Ok(envelope)
    }

    fn unwrap(&self, envelope: &KeyEnvelope, secret: &[u8]) -> ApiResult<[u8; KEY_BYTES]> {
        let kek = self
            .crypto
            .derive_key(secret, &envelope.salt, envelope.iterations);
        let vek = self.crypto.open(
            &kek,
            &envelope.nonce,
            &envelope.aad(),
            &envelope.wrapped_vek,
        )?;
        vek.try_into().map_err(|_| {
            ApiError::new(
                ApiErrorCode::InvalidCredentialOrCorruptMeta,
                "the vault key is not the size it should be",
            )
        })
    }

    fn read_meta(&self) -> ApiResult<VaultMeta> {
        let bytes = store::read_meta(&self.paths)?;
        serde_json::from_slice(&bytes).map_err(|_| {
            ApiError::new(
                ApiErrorCode::InvalidCredentialOrCorruptMeta,
                "the vault metadata could not be read",
            )
        })
    }

    fn write_meta(&self, meta: &VaultMeta) -> ApiResult<()> {
        let bytes = serde_json::to_vec(meta).map_err(|error| {
            ApiError::new(ApiErrorCode::IoError, format!("metadata: {error}"))
        })?;
        store::write_meta(&self.paths, &bytes)
    }

    /// Wraps plaintext in a `.dtv`: fresh nonce, header as the AAD.
    fn seal(
        &self,
        vek: &[u8; KEY_BYTES],
        file_id: [u8; FILE_ID_BYTES],
        plaintext: &[u8],
    ) -> ApiResult<Vec<u8>> {
        let header = ObjectHeader::new(file_id, random_bytes::<NONCE_BYTES>()?);
        let aad = header.aad();
        let ciphertext = self.crypto.seal(vek, &header.nonce, &aad, plaintext)?;

        // The header on disk *is* the AAD, so there is one copy of it and no way
        // for the two to disagree.
        let mut bytes = aad;
        bytes.extend_from_slice(&ciphertext);
        Ok(bytes)
    }

    fn open(
        &self,
        vek: &[u8; KEY_BYTES],
        expected: [u8; FILE_ID_BYTES],
        bytes: &[u8],
    ) -> ApiResult<Vec<u8>> {
        let (header, ciphertext) = ObjectHeader::parse(bytes)?;
        // The index says which object this is; the object says so too, and the
        // tag covers it. Moving one object over another is caught here.
        if header.file_id != expected {
            return Err(ApiError::new(
                ApiErrorCode::CorruptObject,
                "this is not the object the index expects",
            ));
        }
        self.crypto
            .open(vek, &header.nonce, &header.aad(), ciphertext)
            .map_err(|_| {
                ApiError::new(
                    ApiErrorCode::CorruptObject,
                    "the stored note failed its integrity check",
                )
            })
    }

    fn store_object(
        &self,
        vek: &[u8; KEY_BYTES],
        file_id: [u8; FILE_ID_BYTES],
        plaintext: &[u8],
    ) -> ApiResult<()> {
        let path = self
            .paths
            .object(&hex(&file_id))
            .ok_or_else(|| ApiError::new(ApiErrorCode::CorruptObject, "bad object id"))?;
        self.write_sealed(&path, vek, file_id, plaintext)
    }

    fn load_object(&self, vek: &[u8; KEY_BYTES], entry: &VaultEntry) -> ApiResult<Vec<u8>> {
        let file_id = object_id(entry)?;
        let path = entry
            .file_id
            .as_deref()
            .and_then(|id| self.paths.object(id))
            .ok_or_else(|| ApiError::new(ApiErrorCode::CorruptObject, "bad object id"))?;
        self.open(vek, file_id, &std::fs::read(path)?)
    }

    fn read_index(&self, vek: &[u8; KEY_BYTES]) -> ApiResult<VaultIndex> {
        let bytes = match std::fs::read(&self.paths.index) {
            Ok(bytes) => bytes,
            // A create that died between the two writes. An empty index is the
            // truth, and the objects that survive it are swept.
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(VaultIndex::default())
            }
            Err(error) => return Err(error.into()),
        };

        serde_json::from_slice(&self.open(vek, INDEX_FILE_ID, &bytes)?).map_err(|_| {
            ApiError::new(ApiErrorCode::CorruptObject, "the vault index is unreadable")
        })
    }

    fn write_index(&self, vek: &[u8; KEY_BYTES], index: &VaultIndex) -> ApiResult<()> {
        let bytes = serde_json::to_vec(index)
            .map_err(|error| ApiError::new(ApiErrorCode::IoError, format!("index: {error}")))?;
        let path = self.paths.index.clone();
        self.write_sealed(&path, vek, INDEX_FILE_ID, &bytes)
    }

    /// Seals, writes, reads the written file back, decrypts it, and only then
    /// puts it in place.
    fn write_sealed(
        &self,
        path: &std::path::Path,
        vek: &[u8; KEY_BYTES],
        file_id: [u8; FILE_ID_BYTES],
        plaintext: &[u8],
    ) -> ApiResult<()> {
        self.paths.ensure()?;
        let sealed = self.seal(vek, file_id, plaintext)?;
        store::write_checked(path, &sealed, |written| {
            if self.open(vek, file_id, written)? != plaintext {
                return Err(ApiError::new(
                    ApiErrorCode::CorruptObject,
                    "the note did not survive being written",
                ));
            }
            Ok(())
        })
    }

    /// Removes objects nothing points at.
    ///
    /// Only ones already on disk when this process started: anything newer may
    /// belong to a write whose index commit has not landed yet, and deleting
    /// that would turn a crash into the data loss the two-step commit exists to
    /// avoid.
    fn sweep(&self, index: &VaultIndex) {
        let referenced: Vec<&str> = index
            .entries
            .iter()
            .filter_map(|entry| entry.file_id.as_deref())
            .collect();

        let Ok(entries) = std::fs::read_dir(&self.paths.objects) else {
            return;
        };
        for file in entries.flatten() {
            let path = file.path();
            if path.extension().is_none_or(|extension| extension != "dtv") {
                continue;
            }
            let Some(name) = path.file_stem().map(|name| name.to_string_lossy().into_owned())
            else {
                continue;
            };
            if referenced.contains(&name.as_str()) {
                continue;
            }
            let old = file
                .metadata()
                .and_then(|data| data.modified())
                .is_ok_and(|at| at < self.started_at);
            if old {
                let _ = std::fs::remove_file(path);
            }
        }
    }
}

// —— Index helpers ——

fn missing_entry() -> ApiError {
    ApiError::new(ApiErrorCode::InvalidRequest, "no such entry in this vault")
}

fn position_of(index: &VaultIndex, id: &str) -> ApiResult<usize> {
    index
        .entries
        .iter()
        .position(|entry| entry.id == id)
        .ok_or_else(missing_entry)
}

fn object_id(entry: &VaultEntry) -> ApiResult<[u8; FILE_ID_BYTES]> {
    entry
        .file_id
        .as_deref()
        .and_then(unhex::<FILE_ID_BYTES>)
        .ok_or_else(|| ApiError::new(ApiErrorCode::CorruptObject, "this entry has no note"))
}

/// The trimmed name, or a refusal because a sibling already has it.
fn check_name(
    index: &VaultIndex,
    name: &str,
    parent_id: Option<&str>,
    ignoring: Option<&str>,
) -> ApiResult<String> {
    let name = name.trim().to_owned();
    if name.is_empty() {
        return Err(ApiError::new(ApiErrorCode::InvalidRequest, "a name is required"));
    }

    let taken = index.entries.iter().any(|entry| {
        entry.parent_id.as_deref() == parent_id
            && entry.name == name
            && Some(entry.id.as_str()) != ignoring
    });
    if taken {
        return Err(ApiError::new(
            ApiErrorCode::NameConflict,
            "something here is already called that",
        ));
    }
    Ok(name)
}

fn descends_from(index: &VaultIndex, candidate: &str, ancestor: &str) -> bool {
    let mut current = Some(candidate.to_owned());
    while let Some(id) = current {
        if id == ancestor {
            return true;
        }
        current = index
            .entries
            .iter()
            .find(|entry| entry.id == id)
            .and_then(|entry| entry.parent_id.clone());
    }
    false
}

/// An entry and everything filed under it.
fn subtree(index: &VaultIndex, root: &str) -> Vec<String> {
    if !index.entries.iter().any(|entry| entry.id == root) {
        return Vec::new();
    }

    let mut collected = vec![root.to_owned()];
    let mut frontier = vec![root.to_owned()];
    while let Some(parent) = frontier.pop() {
        for entry in &index.entries {
            if entry.parent_id.as_deref() == Some(parent.as_str())
                && !collected.contains(&entry.id)
            {
                collected.push(entry.id.clone());
                frontier.push(entry.id.clone());
            }
        }
    }
    collected
}

fn require(condition: bool, message: &str) -> ApiResult<()> {
    if condition {
        return Ok(());
    }
    Err(ApiError::new(ApiErrorCode::InvalidRequest, message))
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::sync::atomic::{AtomicU32, Ordering};

    use crate::note::model::{NoteAssetInput, NoteInputDto};
    use crate::note::{NoteContainer, ZipNoteContainer};

    /// A vault of this test's own, gone when the test that made it ends.
    struct Scratch {
        dir: std::path::PathBuf,
        vault: VaultController,
    }

    impl Scratch {
        fn new() -> Self {
            static COUNTER: AtomicU32 = AtomicU32::new(0);
            let dir = std::env::temp_dir().join(format!(
                "desktime-vault-{}-{}",
                std::process::id(),
                COUNTER.fetch_add(1, Ordering::Relaxed)
            ));
            std::fs::create_dir_all(&dir).unwrap();
            // A real derivation is a fifth of a second by design, which is right
            // in the product and useless in a test suite. What is under test is
            // the envelope, not PBKDF2.
            let vault = VaultController::with_iterations(VaultPaths::from_data_root(&dir), 2);
            Self { dir, vault }
        }

        fn created(&self) -> String {
            self.vault
                .create(VaultCreateRequest {
                    password: "a good long password".to_owned(),
                    password_confirmation: "a good long password".to_owned(),
                    security_question: "which street".to_owned(),
                    security_answer: "  Marlborough  ".to_owned(),
                    security_answer_confirmation: "Marlborough".to_owned(),
                })
                .unwrap()
                .session_handle
        }

        fn note(&self, session: &str, name: &str, body: &str) -> VaultEntry {
            let entry = self
                .vault
                .create_note(VaultCreateNoteRequest {
                    session_handle: session.to_owned(),
                    parent_id: None,
                    name: name.to_owned(),
                })
                .unwrap();
            self.vault
                .write(VaultWriteRequest {
                    session_handle: session.to_owned(),
                    entry_id: entry.id.clone(),
                    expected_revision: entry.revision,
                    document: NoteInputDto {
                        markdown: body.to_owned(),
                        assets: Vec::new(),
                    },
                })
                .unwrap()
        }

        fn objects(&self) -> Vec<std::path::PathBuf> {
            let mut paths: Vec<std::path::PathBuf> = std::fs::read_dir(&self.vault.paths.objects)
                .unwrap()
                .flatten()
                .map(|entry| entry.path())
                .filter(|path| path.extension().is_some_and(|extension| extension == "dtv"))
                .collect();
            paths.sort();
            paths
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.dir);
        }
    }

    fn unlock(scratch: &Scratch, password: &str) -> ApiResult<VaultSessionDto> {
        scratch.vault.unlock_password(VaultUnlockRequest {
            credential: password.to_owned(),
        })
    }

    #[test]
    fn a_note_survives_being_locked_away_and_opened_again() {
        let scratch = Scratch::new();
        let session = scratch.created();
        let entry = scratch.note(&session, "plan.dtnote", "# the plan\n\nstep one\n");

        scratch.vault.lock(&session);
        assert!(!scratch.vault.status().unlocked);

        let session = unlock(&scratch, "a good long password").unwrap().session_handle;
        let read = scratch
            .vault
            .read(VaultReadRequest {
                session_handle: session,
                entry_id: entry.id,
            })
            .unwrap();
        assert_eq!(read.document.markdown, "# the plan\n\nstep one\n");
        assert_eq!(read.entry.name, "plan.dtnote");
    }

    #[test]
    fn the_security_answer_is_a_second_key_to_the_same_vault() {
        let scratch = Scratch::new();
        let session = scratch.created();
        let entry = scratch.note(&session, "plan.dtnote", "written under the password");
        scratch.vault.lock(&session);

        // Trimmed the same way it was when it was set, and still case-sensitive.
        let session = scratch
            .vault
            .unlock_recovery(VaultUnlockRequest {
                credential: " Marlborough ".to_owned(),
            })
            .unwrap()
            .session_handle;
        assert_eq!(
            scratch
                .vault
                .read(VaultReadRequest {
                    session_handle: session,
                    entry_id: entry.id,
                })
                .unwrap()
                .document
                .markdown,
            "written under the password"
        );

        assert!(scratch
            .vault
            .unlock_recovery(VaultUnlockRequest {
                credential: "marlborough".to_owned(),
            })
            .is_err());
    }

    #[test]
    fn a_wrong_password_and_a_damaged_envelope_are_the_same_answer() {
        // They have to be. GCM cannot tell them apart, and a message that
        // claimed to would be telling the user something it does not know.
        let scratch = Scratch::new();
        let session = scratch.created();
        scratch.vault.lock(&session);

        let wrong = unlock(&scratch, "not the password").unwrap_err();
        assert_eq!(wrong.code, ApiErrorCode::InvalidCredentialOrCorruptMeta);

        let mut meta: VaultMeta =
            serde_json::from_slice(&std::fs::read(&scratch.vault.paths.meta).unwrap()).unwrap();
        for envelope in &mut meta.envelopes {
            envelope.wrapped_vek[0] ^= 0xff;
        }
        std::fs::write(
            &scratch.vault.paths.meta,
            serde_json::to_vec(&meta).unwrap(),
        )
        .unwrap();

        let damaged = unlock(&scratch, "a good long password").unwrap_err();
        assert_eq!(damaged.code, wrong.code);
        assert_eq!(damaged.message, wrong.message);
    }

    #[test]
    fn the_envelope_parameters_cannot_be_edited_underneath_it() {
        // An iteration count quietly lowered to 1 in a file anyone can open
        // would make the whole key derivation free to brute-force.
        let scratch = Scratch::new();
        let session = scratch.created();
        scratch.vault.lock(&session);

        let mut meta: VaultMeta =
            serde_json::from_slice(&std::fs::read(&scratch.vault.paths.meta).unwrap()).unwrap();
        for envelope in &mut meta.envelopes {
            envelope.iterations = 1;
        }
        std::fs::write(
            &scratch.vault.paths.meta,
            serde_json::to_vec(&meta).unwrap(),
        )
        .unwrap();

        assert_eq!(
            unlock(&scratch, "a good long password").unwrap_err().code,
            ApiErrorCode::InvalidCredentialOrCorruptMeta
        );
    }

    #[test]
    fn nothing_is_ever_sealed_under_the_same_nonce_twice() {
        // A repeated nonce under one AES-GCM key is not a weakness, it is the
        // end of the guarantee — so this is checked rather than reasoned about.
        let scratch = Scratch::new();
        let session = scratch.created();
        let mut entry = scratch.note(&session, "plan.dtnote", "one");

        let mut nonces = Vec::new();
        for round in 0..8 {
            entry = scratch
                .vault
                .write(VaultWriteRequest {
                    session_handle: session.clone(),
                    entry_id: entry.id.clone(),
                    expected_revision: entry.revision,
                    // The same bytes every time: identical plaintext under a
                    // repeated nonce is the worst case, so that is the case.
                    document: NoteInputDto {
                        markdown: "the same words".to_owned(),
                        assets: Vec::new(),
                    },
                })
                .unwrap();
            let _ = round;

            for object in scratch.objects() {
                let bytes = std::fs::read(&object).unwrap();
                nonces.push(ObjectHeader::parse(&bytes).unwrap().0.nonce);
            }
        }

        let mut seen = nonces.clone();
        seen.sort_unstable();
        seen.dedup();
        assert_eq!(seen.len(), nonces.len(), "a nonce was reused");

        let meta: VaultMeta =
            serde_json::from_slice(&std::fs::read(&scratch.vault.paths.meta).unwrap()).unwrap();
        assert_ne!(meta.envelopes[0].nonce, meta.envelopes[1].nonce);
        assert_ne!(meta.envelopes[0].salt, meta.envelopes[1].salt);
    }

    #[test]
    fn an_object_put_where_another_one_was_is_refused() {
        let scratch = Scratch::new();
        let session = scratch.created();
        let first = scratch.note(&session, "first.dtnote", "the first note");
        let second = scratch.note(&session, "second.dtnote", "the second note");

        // Both are sealed with the same key, so only the file id inside the
        // header — which the tag covers — stands between them.
        let paths = scratch.objects();
        let left = std::fs::read(&paths[0]).unwrap();
        let right = std::fs::read(&paths[1]).unwrap();
        std::fs::write(&paths[0], &right).unwrap();
        std::fs::write(&paths[1], &left).unwrap();

        for entry in [first, second] {
            assert_eq!(
                scratch
                    .vault
                    .read(VaultReadRequest {
                        session_handle: session.clone(),
                        entry_id: entry.id,
                    })
                    .unwrap_err()
                    .code,
                ApiErrorCode::CorruptObject
            );
        }
    }

    #[test]
    fn a_note_with_one_byte_changed_does_not_open() {
        let scratch = Scratch::new();
        let session = scratch.created();
        let entry = scratch.note(&session, "plan.dtnote", "the original words");

        let object = scratch.objects().remove(0);
        let mut bytes = std::fs::read(&object).unwrap();
        let last = bytes.len() - 1;
        bytes[last] ^= 0x01;
        std::fs::write(&object, &bytes).unwrap();

        assert_eq!(
            scratch
                .vault
                .read(VaultReadRequest {
                    session_handle: session,
                    entry_id: entry.id,
                })
                .unwrap_err()
                .code,
            ApiErrorCode::CorruptObject
        );
    }

    #[test]
    fn the_metadata_backup_is_what_saves_a_vault() {
        let scratch = Scratch::new();
        let session = scratch.created();
        let entry = scratch.note(&session, "plan.dtnote", "still here");

        // A second metadata write is what puts the working copy in the backup.
        scratch
            .vault
            .reset_password(VaultResetPasswordRequest {
                session_handle: session.clone(),
                new_password: "the replacement password".to_owned(),
                new_password_confirmation: "the replacement password".to_owned(),
            })
            .unwrap();
        scratch.vault.lock(&session);

        std::fs::remove_file(&scratch.vault.paths.meta).unwrap();
        // The backup predates the change, so it is the *old* password that opens
        // it — which is the honest behaviour: a backup is a moment in time.
        let session = unlock(&scratch, "a good long password").unwrap().session_handle;
        assert_eq!(
            scratch
                .vault
                .read(VaultReadRequest {
                    session_handle: session,
                    entry_id: entry.id,
                })
                .unwrap()
                .document
                .markdown,
            "still here"
        );
    }

    #[test]
    fn changing_the_password_leaves_every_note_readable() {
        // The password wraps the key; it does not encrypt the notes. If this
        // ever stopped being true, a password change would mean rewriting a
        // whole notebook and any interruption would lose half of it.
        let scratch = Scratch::new();
        let session = scratch.created();
        let entry = scratch.note(&session, "plan.dtnote", "written before the change");

        scratch
            .vault
            .reset_password(VaultResetPasswordRequest {
                session_handle: session.clone(),
                new_password: "the replacement password".to_owned(),
                new_password_confirmation: "the replacement password".to_owned(),
            })
            .unwrap();
        scratch.vault.lock(&session);

        assert!(unlock(&scratch, "a good long password").is_err());
        let session = unlock(&scratch, "the replacement password")
            .unwrap()
            .session_handle;
        assert_eq!(
            scratch
                .vault
                .read(VaultReadRequest {
                    session_handle: session,
                    entry_id: entry.id.clone(),
                })
                .unwrap()
                .document
                .markdown,
            "written before the change"
        );

        // And the answer still opens it: only one envelope was rebuilt.
        let session = scratch
            .vault
            .unlock_recovery(VaultUnlockRequest {
                credential: "Marlborough".to_owned(),
            })
            .unwrap()
            .session_handle;
        assert!(scratch
            .vault
            .read(VaultReadRequest {
                session_handle: session,
                entry_id: entry.id,
            })
            .is_ok());
    }

    #[test]
    fn an_entry_reaches_the_frontend_in_the_shape_it_reads() {
        // The renaming is an attribute, so getting it wrong compiles and then
        // shows every private note with no icon and no menu.
        let entry = VaultEntry {
            id: "abc".to_owned(),
            parent_id: None,
            kind: VaultEntryKind::Backup,
            name: "plan.dtnote".to_owned(),
            file_id: Some("00".repeat(16)),
            revision: 3,
        };
        assert_eq!(
            serde_json::to_value(&entry).unwrap(),
            serde_json::json!({
                "id": "abc",
                "parentId": null,
                "kind": "backup",
                "name": "plan.dtnote",
                "fileId": "00000000000000000000000000000000",
                "revision": 3,
            })
        );
    }

    #[test]
    fn a_locked_vault_gives_away_neither_names_nor_a_file_count() {
        let scratch = Scratch::new();
        let session = scratch.created();
        scratch.note(&session, "resignation-plan.dtnote", "I am handing in my notice");
        scratch.vault.lock(&session);

        // Every session is gone, so the handle that was working a moment ago is
        // not a way back in.
        assert_eq!(
            scratch.vault.list(&session).unwrap_err().code,
            ApiErrorCode::SessionExpired
        );

        // The metadata is the one file that is readable while locked. It holds
        // the question and nothing else the user typed.
        let meta = String::from_utf8_lossy(
            &std::fs::read(&scratch.vault.paths.meta).unwrap(),
        )
        .into_owned();
        assert!(meta.contains("which street"));
        assert!(!meta.contains("resignation"));
        assert!(!meta.contains("notice"));
        assert!(!meta.contains("Marlborough"));
        assert!(!meta.contains("a good long password"));

        for file in [&scratch.vault.paths.index, &scratch.objects()[0]] {
            let bytes = std::fs::read(file).unwrap();
            let text = String::from_utf8_lossy(&bytes);
            assert!(!text.contains("resignation"), "{}", file.display());
            assert!(!text.contains("notice"), "{}", file.display());
        }

        // And the name on disk says nothing either.
        let stem = scratch.objects()[0]
            .file_stem()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        assert_eq!(stem.len(), 32);
        assert!(stem.chars().all(|character| character.is_ascii_hexdigit()));
    }

    #[test]
    fn moving_a_note_in_leaves_no_readable_copy_behind() {
        let scratch = Scratch::new();
        let session = scratch.created();

        let plain = scratch.dir.join("diary.dtnote");
        ZipNoteContainer
            .write_atomic(
                &plain,
                &NoteDocument {
                    info: NoteInfo::default(),
                    markdown: "what I actually think".to_owned(),
                    assets: Vec::new(),
                },
            )
            .unwrap();

        let result = scratch
            .vault
            .import(VaultTransferRequest {
                session_handle: session.clone(),
                source: plain.clone(),
                target_parent_id: None,
            })
            .unwrap();

        assert!(result.source_removed);
        // Unlinked, not recycled: a recycled file is a fully recoverable
        // plaintext copy sitting outside the vault.
        assert!(!plain.exists());
        assert_eq!(
            scratch
                .vault
                .read(VaultReadRequest {
                    session_handle: session,
                    entry_id: result.entry.id,
                })
                .unwrap()
                .document
                .markdown,
            "what I actually think"
        );
    }

    #[test]
    fn moving_a_note_out_has_to_be_asked_for_twice() {
        let scratch = Scratch::new();
        let session = scratch.created();
        let entry = scratch.note(&session, "plan.dtnote", "back into the open");
        let out = scratch.dir.join("out.dtnote");

        let refused = scratch.vault.export(VaultExportRequest {
            session_handle: session.clone(),
            entry_id: entry.id.clone(),
            destination: out.clone(),
            confirmed_plaintext: false,
        });
        assert_eq!(refused.unwrap_err().code, ApiErrorCode::InvalidRequest);
        assert!(!out.exists());

        scratch
            .vault
            .export(VaultExportRequest {
                session_handle: session.clone(),
                entry_id: entry.id.clone(),
                destination: out.clone(),
                confirmed_plaintext: true,
            })
            .unwrap();

        assert_eq!(
            ZipNoteContainer.read(&out).unwrap().markdown,
            "back into the open"
        );
        // It moved, so it is no longer in the vault.
        assert!(scratch
            .vault
            .list(&session)
            .unwrap()
            .iter()
            .all(|held| held.id != entry.id));
    }

    #[test]
    fn a_folder_takes_everything_under_it_when_it_goes() {
        let scratch = Scratch::new();
        let session = scratch.created();
        let folder = scratch
            .vault
            .create_folder(VaultCreateFolderRequest {
                session_handle: session.clone(),
                parent_id: None,
                name: "private".to_owned(),
            })
            .unwrap();
        let inner = scratch
            .vault
            .create_note(VaultCreateNoteRequest {
                session_handle: session.clone(),
                parent_id: Some(folder.id.clone()),
                name: "inside.dtnote".to_owned(),
            })
            .unwrap();

        assert_eq!(scratch.objects().len(), 1);
        scratch
            .vault
            .delete(VaultDeleteRequest {
                session_handle: session.clone(),
                entry_id: folder.id,
            })
            .unwrap();

        assert!(scratch.vault.list(&session).unwrap().is_empty());
        // The object goes too, or the vault would grow forever with files
        // nothing can ever name.
        assert!(scratch.objects().is_empty());
        assert!(scratch
            .vault
            .read(VaultReadRequest {
                session_handle: session,
                entry_id: inner.id,
            })
            .is_err());
    }

    #[test]
    fn a_save_keeps_the_pictures_it_was_not_handed() {
        // The same rule as an ordinary note, checked separately because the
        // encrypted path reaches it by a different route.
        let scratch = Scratch::new();
        let session = scratch.created();
        let entry = scratch
            .vault
            .create_note(VaultCreateNoteRequest {
                session_handle: session.clone(),
                parent_id: None,
                name: "illustrated.dtnote".to_owned(),
            })
            .unwrap();

        let with_picture = scratch
            .vault
            .write(VaultWriteRequest {
                session_handle: session.clone(),
                entry_id: entry.id.clone(),
                expected_revision: entry.revision,
                document: NoteInputDto {
                    markdown: "![a](assets/1.png)".to_owned(),
                    assets: vec![NoteAssetInput {
                        path: "assets/1.png".to_owned(),
                        base64: Some(base64_of(b"picture bytes")),
                    }],
                },
            })
            .unwrap();

        let kept = scratch
            .vault
            .write(VaultWriteRequest {
                session_handle: session.clone(),
                entry_id: entry.id.clone(),
                expected_revision: with_picture.revision,
                document: NoteInputDto {
                    markdown: "![a](assets/1.png) and more text".to_owned(),
                    assets: vec![NoteAssetInput {
                        path: "assets/1.png".to_owned(),
                        base64: None,
                    }],
                },
            })
            .unwrap();

        let read = scratch
            .vault
            .read(VaultReadRequest {
                session_handle: session,
                entry_id: entry.id,
            })
            .unwrap();
        assert_eq!(read.entry.revision, kept.revision);
        assert_eq!(read.document.assets.len(), 1);
        assert_eq!(read.document.assets[0].base64, base64_of(b"picture bytes"));
    }

    #[test]
    fn an_object_from_a_version_this_build_does_not_know_is_not_guessed_at() {
        let scratch = Scratch::new();
        let session = scratch.created();
        let entry = scratch.note(&session, "plan.dtnote", "from the future");

        let object = scratch.objects().remove(0);
        let mut bytes = std::fs::read(&object).unwrap();
        bytes[4] = 9;
        std::fs::write(&object, &bytes).unwrap();

        assert_eq!(
            scratch
                .vault
                .read(VaultReadRequest {
                    session_handle: session,
                    entry_id: entry.id,
                })
                .unwrap_err()
                .code,
            ApiErrorCode::UnsupportedCryptoVersion
        );
    }

    fn base64_of(bytes: &[u8]) -> String {
        use base64::Engine;
        base64::engine::general_purpose::STANDARD.encode(bytes)
    }
}
