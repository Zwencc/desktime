use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ApiErrorCode {
    NotImplemented,
    InvalidRequest,
    ProtocolMismatch,
    CoreUnavailable,
    StorageUnavailable,
    RevisionConflict,
    UnsupportedNoteType,
    InvalidDtnote,
    ArchiveLimitExceeded,
    PathTraversal,
    DuplicateEntry,
    MissingContent,
    VaultLocked,
    SessionExpired,
    InvalidCredentialOrCorruptMeta,
    CorruptObject,
    UnsupportedCryptoVersion,
    NameConflict,
    DiskFull,
    IoError,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApiError {
    pub code: ApiErrorCode,
    pub message: String,
}

impl ApiError {
    pub fn new(code: ApiErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub fn not_implemented(feature: &'static str) -> Self {
        Self::new(
            ApiErrorCode::NotImplemented,
            format!("{feature} framework exists but its business implementation is not complete"),
        )
    }
}

impl From<std::io::Error> for ApiError {
    fn from(error: std::io::Error) -> Self {
        let code = if error.kind() == std::io::ErrorKind::StorageFull {
            ApiErrorCode::DiskFull
        } else {
            ApiErrorCode::IoError
        };
        Self::new(code, error.to_string())
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
