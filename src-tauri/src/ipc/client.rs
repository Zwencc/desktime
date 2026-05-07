use std::sync::Arc;

use crate::api::{ApiError, ApiErrorCode, ApiResult};

use super::protocol::{CoreMethod, RequestFrame, PROTOCOL_VERSION};
use super::transport::{RequestTransport, REQUEST_TIMEOUT};

pub struct CoreClient {
    transport: Arc<dyn RequestTransport>,
}

impl CoreClient {
    pub fn new(transport: Arc<dyn RequestTransport>) -> Self {
        Self { transport }
    }

    pub fn request(
        &self,
        request_id: String,
        method: CoreMethod,
        payload: serde_json::Value,
    ) -> ApiResult<serde_json::Value> {
        let request = RequestFrame {
            protocol_version: PROTOCOL_VERSION,
            request_id,
            method,
            payload,
        };
        request.validate()?;
        let response = self.transport.round_trip(request, REQUEST_TIMEOUT)?;
        if response.protocol_version != PROTOCOL_VERSION {
            return Err(ApiError::new(
                ApiErrorCode::ProtocolMismatch,
                "DTCore returned an incompatible protocol version",
            ));
        }
        response.result
    }

    /// The same call, decoded into the type the caller expects.
    ///
    /// Commands use this rather than passing `serde_json::Value` through to the
    /// webview: the DTO shape is a contract between two Rust processes, and a
    /// field that quietly changed name would otherwise only be noticed by the
    /// frontend at runtime.
    pub fn call<T: serde::de::DeserializeOwned>(
        &self,
        method: CoreMethod,
        payload: serde_json::Value,
    ) -> ApiResult<T> {
        let value = self.request(request_id(), method, payload)?;
        serde_json::from_value(value).map_err(|error| {
            ApiError::new(
                ApiErrorCode::ProtocolMismatch,
                format!("DTCore returned an unexpected payload: {error}"),
            )
        })
    }
}

/// Correlation ids are per call and never reused. They exist so a response can
/// be matched to its request in a log; the wire itself is strictly ordered.
///
/// A counter rather than a timestamp: two calls in the same millisecond are
/// ordinary, and two log lines with the same id are not traceable.
fn request_id() -> String {
    static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let sequence = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    format!("ui-{:x}-{sequence:x}", std::process::id())
}
