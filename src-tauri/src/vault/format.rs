//! The `.dtv` container: one AES-GCM box with a header that says what it is.
//!
//! **The magic is plaintext, and that is deliberate.** It is what lets *this*
//! program tell an encrypted note from anything else — without it there is no
//! way to know whether a file is one of ours. The cost is that anyone else can
//! also see "this is some kind of encrypted file". Truly unmarked steganography
//! would leave us unable to recognise our own format either, and nobody builds
//! it that way. So the marker is four non-ASCII bytes rather than a product
//! name: a text editor shows noise, and those four bytes mean nothing to anyone
//! who does not already know them.
//!
//! The whole header is the AAD, so the version, the cipher and the file id are
//! all authenticated. That is what stops an object being swapped for another
//! one: the id the index expects has to be the id the box was sealed with, and
//! changing it makes the tag fail.

use serde::{Deserialize, Serialize};

use crate::api::{ApiError, ApiErrorCode, ApiResult};

use super::crypto::{CipherId, NONCE_BYTES};

pub const VAULT_FORMAT_VERSION: u16 = 1;
pub const OBJECT_MAGIC: [u8; 4] = [0xD7, 0x4E, 0xA5, 0x19];
pub const FILE_ID_BYTES: usize = 16;

/// magic(4) + version(2) + cipher(1) + file id(16) + nonce(12).
pub const HEADER_BYTES: usize = 4 + 2 + 1 + FILE_ID_BYTES + NONCE_BYTES;

/// The index's own object id.
///
/// Fixed rather than random so the index is findable without the index. Objects
/// get 128 random bits, so none of them can ever collide with it — which means
/// an object can never be moved over the index and still authenticate.
pub const INDEX_FILE_ID: [u8; FILE_ID_BYTES] = [0; FILE_ID_BYTES];

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ObjectHeader {
    pub magic: [u8; 4],
    pub format_version: u16,
    pub cipher_id: CipherId,
    pub file_id: [u8; FILE_ID_BYTES],
    pub nonce: [u8; NONCE_BYTES],
}

impl ObjectHeader {
    pub fn new(file_id: [u8; FILE_ID_BYTES], nonce: [u8; NONCE_BYTES]) -> Self {
        Self {
            magic: OBJECT_MAGIC,
            format_version: VAULT_FORMAT_VERSION,
            cipher_id: CipherId::Aes256Gcm,
            file_id,
            nonce,
        }
    }

    /// The header exactly as it sits on disk — which is also the AAD, because
    /// authenticating anything less would leave part of it free to be edited.
    pub fn aad(&self) -> Vec<u8> {
        let mut aad = Vec::with_capacity(HEADER_BYTES);
        aad.extend_from_slice(&self.magic);
        aad.extend_from_slice(&self.format_version.to_le_bytes());
        aad.push(self.cipher_id.to_byte());
        aad.extend_from_slice(&self.file_id);
        aad.extend_from_slice(&self.nonce);
        aad
    }

    /// Splits a stored object into its header and the box it introduces.
    ///
    /// Refuses a version or cipher this build does not implement rather than
    /// reading it as the one it does know: a format that silently reinterprets
    /// old files is a format that can corrupt them on the next write.
    pub fn parse(bytes: &[u8]) -> ApiResult<(Self, &[u8])> {
        if bytes.len() < HEADER_BYTES {
            return Err(corrupt("the object is too short to hold a header"));
        }
        if bytes[..4] != OBJECT_MAGIC {
            return Err(corrupt("the file is not a DeskTime vault object"));
        }

        let format_version = u16::from_le_bytes([bytes[4], bytes[5]]);
        if format_version != VAULT_FORMAT_VERSION {
            return Err(ApiError::new(
                ApiErrorCode::UnsupportedCryptoVersion,
                format!("vault object format v{format_version} is not supported"),
            ));
        }
        let cipher_id = CipherId::from_byte(bytes[6])?;

        let mut file_id = [0u8; FILE_ID_BYTES];
        file_id.copy_from_slice(&bytes[7..7 + FILE_ID_BYTES]);
        let mut nonce = [0u8; NONCE_BYTES];
        nonce.copy_from_slice(&bytes[7 + FILE_ID_BYTES..HEADER_BYTES]);

        Ok((
            Self {
                magic: OBJECT_MAGIC,
                format_version,
                cipher_id,
                file_id,
                nonce,
            },
            &bytes[HEADER_BYTES..],
        ))
    }
}

fn corrupt(message: &str) -> ApiError {
    ApiError::new(ApiErrorCode::CorruptObject, message)
}
