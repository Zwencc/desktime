use serde::{Deserialize, Serialize};

use crate::api::ApiError;

pub const PROTOCOL_VERSION: u16 = 1;
pub const MAX_FRAME_BYTES: usize = 1024 * 1024;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CoreMethod {
    Ping,
    Status,
    ActivityQuery,
    ActivityConfigUpdate,
    ActivityClear,
    ActivityAppNames,
    ActivityDebug,
    ScheduleList,
    ScheduleUpsert,
    ScheduleDelete,
    ReminderList,
    ReminderUpsert,
    ReminderDelete,
    Subscribe,
    CancelTask,
    Shutdown,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestFrame {
    pub protocol_version: u16,
    pub request_id: String,
    pub method: CoreMethod,
    #[serde(default)]
    pub payload: serde_json::Value,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResponseFrame {
    pub protocol_version: u16,
    pub request_id: String,
    pub result: Result<serde_json::Value, ApiError>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventFrame {
    pub protocol_version: u16,
    pub sequence: u64,
    pub topic: EventTopic,
    pub payload: serde_json::Value,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EventTopic {
    ActivityChanged,
    ScheduleChanged,
    ReminderChanged,
    TaskProgress,
    CoreStopping,
}

/// Payloads.
///
/// They live beside the method enum rather than in DTCore, because both ends
/// have to agree on them: a request the UI builds by hand out of `json!` is a
/// contract nothing checks until it fails at run time.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityQueryRequest {
    /// Half-open `[start, end)` epoch ranges. The UI passes the bounds because
    /// the time zone is a setting it owns; DTCore stores on a plain UTC grid.
    pub ranges: Vec<(i64, i64)>,
    pub recent_minutes: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityAppNamesRequest {
    pub exes: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityDebugRequest {
    pub records: usize,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordDeleteRequest {
    pub id: String,
    pub expected_revision: u64,
}

/// What DTCore answers `Status` with — enough to tell "running but on an older
/// schema" from "not running", which a boolean cannot.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreStatus {
    pub pid: u32,
    pub protocol_version: u16,
    pub schema_version: i64,
    pub started_at_ms: i64,
    pub stored_minutes: i64,
}

impl RequestFrame {
    pub fn validate(&self) -> Result<(), ApiError> {
        if self.protocol_version != PROTOCOL_VERSION {
            return Err(ApiError::new(
                crate::api::ApiErrorCode::ProtocolMismatch,
                format!(
                    "protocol v{} is not supported; expected v{PROTOCOL_VERSION}",
                    self.protocol_version
                ),
            ));
        }
        if self.request_id.is_empty() || self.request_id.len() > 72 {
            return Err(ApiError::new(
                crate::api::ApiErrorCode::InvalidRequest,
                "requestId must contain 1 to 72 characters",
            ));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{CoreMethod, RequestFrame, PROTOCOL_VERSION};

    #[test]
    fn rejects_a_future_protocol_before_dispatch() {
        let request = RequestFrame {
            protocol_version: PROTOCOL_VERSION + 1,
            request_id: "request-1".to_owned(),
            method: CoreMethod::Ping,
            payload: serde_json::Value::Null,
        };
        assert!(request.validate().is_err());
    }
}
