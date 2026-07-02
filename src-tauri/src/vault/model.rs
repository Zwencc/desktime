use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::note::model::{NoteDocumentDto, NoteInputDto};

use super::crypto::{CryptoDescriptor, NONCE_BYTES, SALT_BYTES};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum EnvelopeKind {
    Password,
    SecurityAnswer,
}

/// One wrapping of the vault key.
///
/// There are exactly two — the password and the security answer — and both open
/// the same VEK. That is what lets a password change rewrite one envelope
/// instead of re-encrypting every note, and it is also the thing to be honest
/// about: **the vault is only as strong as the weaker of the two**, because
/// either one is a complete key.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyEnvelope {
    pub kind: EnvelopeKind,
    pub salt: [u8; SALT_BYTES],
    pub iterations: u32,
    pub nonce: [u8; NONCE_BYTES],
    pub wrapped_vek: Vec<u8>,
}

impl KeyEnvelope {
    /// Binds the envelope to the parameters it was made with, so none of them
    /// can be edited in `vault.meta` — an iteration count quietly lowered to 1
    /// would otherwise still open.
    pub fn aad(&self) -> Vec<u8> {
        let mut aad = Vec::with_capacity(1 + SALT_BYTES + 4 + NONCE_BYTES);
        aad.push(match self.kind {
            EnvelopeKind::Password => 1,
            EnvelopeKind::SecurityAnswer => 2,
        });
        aad.extend_from_slice(&self.salt);
        aad.extend_from_slice(&self.iterations.to_le_bytes());
        aad.extend_from_slice(&self.nonce);
        aad
    }
}

/// Everything needed to *attempt* an unlock, and nothing else.
///
/// No password, no answer, no file name and no part of the folder tree — those
/// all live in the encrypted index. The security question is the one piece of
/// user text kept in the clear, because it has to be readable while the vault is
/// locked in order to be asked.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultMeta {
    pub descriptor: CryptoDescriptor,
    pub security_question: String,
    pub envelopes: Vec<KeyEnvelope>,
}

impl VaultMeta {
    pub fn envelope(&self, kind: EnvelopeKind) -> Option<&KeyEnvelope> {
        self.envelopes.iter().find(|envelope| envelope.kind == kind)
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum VaultEntryKind {
    Folder,
    Note,
    Backup,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultEntry {
    pub id: String,
    pub parent_id: Option<String>,
    pub kind: VaultEntryKind,
    pub name: String,
    pub file_id: Option<String>,
    pub revision: u64,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultIndex {
    pub entries: Vec<VaultEntry>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatus {
    pub initialized: bool,
    pub unlocked: bool,
    pub api_version: u16,
    /// Empty until the vault exists. Readable while locked on purpose: the
    /// question is what the "forgot password" screen has to show.
    pub security_question: String,
    /// Where a backup of the whole vault would be copied from. Not a secret —
    /// the folder holds nothing but ciphertext under random names.
    pub folder: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultCreateRequest {
    pub password: String,
    pub password_confirmation: String,
    pub security_question: String,
    pub security_answer: String,
    pub security_answer_confirmation: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultUnlockRequest {
    pub credential: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultSessionDto {
    pub session_handle: String,
}

/// A save, in exactly the shape an ordinary note is saved in.
///
/// Markdown and pictures rather than a packed `.dtnote`, because the editor
/// cannot build one — and because it should not have to. The container is
/// assembled and then encrypted here, so a whole note plaintext never exists
/// anywhere the frontend can reach.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultWriteRequest {
    pub session_handle: String,
    pub entry_id: String,
    pub expected_revision: u64,
    pub document: NoteInputDto,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultCreateNoteRequest {
    pub session_handle: String,
    pub parent_id: Option<String>,
    pub name: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultRenameRequest {
    pub session_handle: String,
    pub entry_id: String,
    pub name: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultReadRequest {
    pub session_handle: String,
    pub entry_id: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultDocumentDto {
    pub entry: VaultEntry,
    pub document: NoteDocumentDto,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultResetPasswordRequest {
    pub session_handle: String,
    pub new_password: String,
    pub new_password_confirmation: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultCreateFolderRequest {
    pub session_handle: String,
    pub parent_id: Option<String>,
    pub name: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultMoveRequest {
    pub session_handle: String,
    pub entry_id: String,
    pub parent_id: Option<String>,
    pub before_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultDeleteRequest {
    pub session_handle: String,
    pub entry_id: String,
}

/// Moving one plaintext note in.
///
/// One file per call: a whole folder is the caller looping, which is what lets
/// it say exactly which notes made it and which did not rather than reporting a
/// half-finished batch as a single failure.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultTransferRequest {
    pub session_handle: String,
    pub source: PathBuf,
    pub target_parent_id: Option<String>,
}

/// What happened to one note that was moved in.
///
/// `source_removed` is separate from success because the two really can differ:
/// the note is in the vault and encrypted, and the plain copy is still on disk
/// because something had it open. Reporting that as a failure would invite a
/// retry and a duplicate; reporting it as a plain success would leave the
/// readable copy there without saying so.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultImportResult {
    pub entry: VaultEntry,
    pub source_removed: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultExportRequest {
    pub session_handle: String,
    pub entry_id: String,
    pub destination: PathBuf,
    pub confirmed_plaintext: bool,
}
