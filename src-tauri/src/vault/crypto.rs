use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use pbkdf2::pbkdf2_hmac;
use serde::{Deserialize, Serialize};
use sha2::Sha256;

use crate::api::{ApiError, ApiErrorCode, ApiResult};

pub const KEY_BYTES: usize = 32;
pub const NONCE_BYTES: usize = 12;
pub const SALT_BYTES: usize = 16;
pub const DEFAULT_PBKDF2_ITERATIONS: u32 = 200_000;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum CipherId {
    Aes256Gcm,
}

impl CipherId {
    /// The byte that names this cipher inside an object header.
    ///
    /// Written out rather than derived from the discriminant so that adding a
    /// variant cannot renumber an existing one — a file sealed as `1` has to
    /// keep opening as `1` for as long as any of them exist.
    pub fn to_byte(self) -> u8 {
        match self {
            Self::Aes256Gcm => 1,
        }
    }

    pub fn from_byte(byte: u8) -> ApiResult<Self> {
        match byte {
            1 => Ok(Self::Aes256Gcm),
            other => Err(ApiError::new(
                ApiErrorCode::UnsupportedCryptoVersion,
                format!("cipher {other} is not one this version implements"),
            )),
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum KdfId {
    Pbkdf2HmacSha256,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CryptoDescriptor {
    pub format_version: u16,
    pub cipher_id: CipherId,
    pub kdf_id: KdfId,
    pub iterations: u32,
}

impl Default for CryptoDescriptor {
    fn default() -> Self {
        Self {
            format_version: 1,
            cipher_id: CipherId::Aes256Gcm,
            kdf_id: KdfId::Pbkdf2HmacSha256,
            iterations: DEFAULT_PBKDF2_ITERATIONS,
        }
    }
}

pub trait VaultCrypto: Send + Sync {
    fn descriptor(&self) -> CryptoDescriptor;
    fn derive_key(&self, secret: &[u8], salt: &[u8], iterations: u32) -> [u8; KEY_BYTES];
    fn seal(
        &self,
        key: &[u8; KEY_BYTES],
        nonce: &[u8; NONCE_BYTES],
        aad: &[u8],
        plaintext: &[u8],
    ) -> ApiResult<Vec<u8>>;
    fn open(
        &self,
        key: &[u8; KEY_BYTES],
        nonce: &[u8; NONCE_BYTES],
        aad: &[u8],
        ciphertext: &[u8],
    ) -> ApiResult<Vec<u8>>;
}

pub struct CryptoV1;

impl VaultCrypto for CryptoV1 {
    fn descriptor(&self) -> CryptoDescriptor {
        CryptoDescriptor::default()
    }

    fn derive_key(&self, secret: &[u8], salt: &[u8], iterations: u32) -> [u8; KEY_BYTES] {
        let mut key = [0u8; KEY_BYTES];
        pbkdf2_hmac::<Sha256>(secret, salt, iterations, &mut key);
        key
    }

    fn seal(
        &self,
        key: &[u8; KEY_BYTES],
        nonce: &[u8; NONCE_BYTES],
        aad: &[u8],
        plaintext: &[u8],
    ) -> ApiResult<Vec<u8>> {
        let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| crypto_error())?;
        cipher
            .encrypt(Nonce::from_slice(nonce), Payload { msg: plaintext, aad })
            .map_err(|_| crypto_error())
    }

    fn open(
        &self,
        key: &[u8; KEY_BYTES],
        nonce: &[u8; NONCE_BYTES],
        aad: &[u8],
        ciphertext: &[u8],
    ) -> ApiResult<Vec<u8>> {
        let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| crypto_error())?;
        cipher
            .decrypt(Nonce::from_slice(nonce), Payload { msg: ciphertext, aad })
            .map_err(|_| crypto_error())
    }
}

pub fn random_bytes<const N: usize>() -> ApiResult<[u8; N]> {
    let mut bytes = [0u8; N];
    getrandom::fill(&mut bytes)
        .map_err(|error| ApiError::new(ApiErrorCode::IoError, error.to_string()))?;
    Ok(bytes)
}

pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// A fixed-width hex string back to bytes, or `None` if it is not one.
///
/// Used on object ids, which arrive from the encrypted index but are still
/// turned into a file name — so "looks like hex" is checked rather than assumed.
pub fn unhex<const N: usize>(text: &str) -> Option<[u8; N]> {
    if text.len() != N * 2 {
        return None;
    }
    let mut bytes = [0u8; N];
    for (index, byte) in bytes.iter_mut().enumerate() {
        *byte = u8::from_str_radix(text.get(index * 2..index * 2 + 2)?, 16).ok()?;
    }
    Some(bytes)
}

fn crypto_error() -> ApiError {
    ApiError::new(
        ApiErrorCode::InvalidCredentialOrCorruptMeta,
        "credential is invalid or encrypted data is corrupt",
    )
}

#[cfg(test)]
mod tests {
    use super::{CryptoV1, VaultCrypto, NONCE_BYTES, SALT_BYTES};

    #[test]
    fn crypto_v1_authenticates_ciphertext_and_aad() {
        let crypto = CryptoV1;
        let salt = [7u8; SALT_BYTES];
        let nonce = [3u8; NONCE_BYTES];
        let key = crypto.derive_key(b"correct horse battery staple", &salt, 1);
        let ciphertext = crypto.seal(&key, &nonce, b"header", b"note").unwrap();
        assert_eq!(
            crypto.open(&key, &nonce, b"header", &ciphertext).unwrap(),
            b"note"
        );
        assert!(crypto.open(&key, &nonce, b"changed", &ciphertext).is_err());
    }
}
