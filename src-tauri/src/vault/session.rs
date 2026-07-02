use std::collections::HashMap;
use std::sync::Mutex;

use crate::api::{ApiError, ApiErrorCode, ApiResult};

use super::crypto::{random_bytes, KEY_BYTES};

pub struct VaultKey([u8; KEY_BYTES]);

impl VaultKey {
    pub fn new(bytes: [u8; KEY_BYTES]) -> Self {
        Self(bytes)
    }

    pub(crate) fn bytes(&self) -> &[u8; KEY_BYTES] {
        &self.0
    }
}

#[derive(Default)]
pub struct SessionStore {
    sessions: Mutex<HashMap<String, VaultKey>>,
}

impl SessionStore {
    pub fn insert(&self, key: VaultKey) -> ApiResult<String> {
        let handle = random_bytes::<32>()?
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        self.sessions
            .lock()
            .map_err(|_| ApiError::new(ApiErrorCode::VaultLocked, "vault session state is unavailable"))?
            .insert(handle.clone(), key);
        Ok(handle)
    }

    pub fn with_key<T>(
        &self,
        handle: &str,
        operation: impl FnOnce(&[u8; KEY_BYTES]) -> ApiResult<T>,
    ) -> ApiResult<T> {
        let sessions = self.sessions.lock().map_err(|_| {
            ApiError::new(ApiErrorCode::VaultLocked, "vault session state is unavailable")
        })?;
        let key = sessions.get(handle).ok_or_else(|| {
            ApiError::new(ApiErrorCode::SessionExpired, "vault session has expired")
        })?;
        operation(key.bytes())
    }

    pub fn remove(&self, handle: &str) {
        if let Ok(mut sessions) = self.sessions.lock() {
            sessions.remove(handle);
        }
    }

    pub fn clear(&self) {
        if let Ok(mut sessions) = self.sessions.lock() {
            sessions.clear();
        }
    }

    pub fn is_unlocked(&self) -> bool {
        self.sessions
            .lock()
            .map(|sessions| !sessions.is_empty())
            .unwrap_or(false)
    }
}
