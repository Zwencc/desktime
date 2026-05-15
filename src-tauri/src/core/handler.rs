//! Method dispatch for the DTCore endpoint.
//!
//! One `match`, and every arm either does the work or says plainly that it
//! cannot. Nothing here returns a plausible-looking empty answer for a method
//! that is not built yet: a `Subscribe` that quietly succeeded and then never
//! delivered an event is worse than one that refuses, because the caller has no
//! way to tell it apart from a quiet day.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use crate::activity::{ActivityConfig, Monitor, SharedRepositories};
use crate::api::{ApiError, ApiResult};
use crate::ipc::protocol::{
    ActivityAppNamesRequest, ActivityDebugRequest, ActivityQueryRequest, CoreMethod, CoreStatus,
    RecordDeleteRequest, RequestFrame, ResponseFrame, PROTOCOL_VERSION,
};
use crate::ipc::server::RequestHandler;
use crate::storage::repositories::{
    ReminderRecord, ReminderRepository, ScheduleRecord, ScheduleRepository,
};

pub struct CoreRequestHandler {
    monitor: Arc<Monitor>,
    repositories: SharedRepositories,
    started_at_ms: i64,
    stopping: Arc<AtomicBool>,
}

impl CoreRequestHandler {
    pub fn new(
        monitor: Arc<Monitor>,
        repositories: SharedRepositories,
        stopping: Arc<AtomicBool>,
    ) -> Self {
        Self {
            monitor,
            repositories,
            started_at_ms: crate::reminder::now_ms(),
            stopping,
        }
    }

    fn dispatch(&self, request: RequestFrame) -> ApiResult<serde_json::Value> {
        match request.method {
            CoreMethod::Ping => encode(&()),
            CoreMethod::Status => encode(&self.status()?),

            CoreMethod::ActivityQuery => {
                let query: ActivityQueryRequest = decode(request.payload)?;
                encode(&self.monitor.summaries(&query.ranges, query.recent_minutes)?)
            }
            CoreMethod::ActivityConfigUpdate => {
                self.monitor.set_config(decode::<ActivityConfig>(request.payload)?);
                encode(&())
            }
            CoreMethod::ActivityClear => {
                self.monitor.clear()?;
                encode(&())
            }
            CoreMethod::ActivityAppNames => {
                let names: ActivityAppNamesRequest = decode(request.payload)?;
                encode(&self.monitor.app_names(&names.exes))
            }
            CoreMethod::ActivityDebug => {
                let debug: ActivityDebugRequest = decode(request.payload)?;
                encode(&self.monitor.debug(debug.records))
            }

            CoreMethod::ScheduleList => encode(&self.with(ScheduleRepository::list)?),
            CoreMethod::ScheduleUpsert => {
                let record: ScheduleRecord = decode(request.payload)?;
                encode(&self.with(|repositories| ScheduleRepository::upsert(repositories, &record))?)
            }
            CoreMethod::ScheduleDelete => {
                let target: RecordDeleteRequest = decode(request.payload)?;
                self.with(|repositories| {
                    ScheduleRepository::delete(repositories, &target.id, target.expected_revision)
                })?;
                encode(&())
            }

            CoreMethod::ReminderList => encode(&self.with(ReminderRepository::list)?),
            CoreMethod::ReminderUpsert => {
                let record: ReminderRecord = decode(request.payload)?;
                encode(&self.with(|repositories| ReminderRepository::upsert(repositories, &record))?)
            }
            CoreMethod::ReminderDelete => {
                let target: RecordDeleteRequest = decode(request.payload)?;
                self.with(|repositories| {
                    ReminderRepository::delete(repositories, &target.id, target.expected_revision)
                })?;
                encode(&())
            }

            CoreMethod::Shutdown => {
                self.stopping.store(true, Ordering::Relaxed);
                encode(&())
            }

            // Both need machinery this build does not have: an event fan-out
            // that survives a reconnect, and a cancellable task registry.
            CoreMethod::Subscribe => Err(ApiError::not_implemented("DTCore event subscription")),
            CoreMethod::CancelTask => Err(ApiError::not_implemented("DTCore task cancellation")),
        }
    }

    fn status(&self) -> ApiResult<CoreStatus> {
        let mut repositories = self
            .repositories
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        Ok(CoreStatus {
            pid: std::process::id(),
            protocol_version: PROTOCOL_VERSION,
            schema_version: crate::storage::migrations::CURRENT_SCHEMA_VERSION,
            started_at_ms: self.started_at_ms,
            stored_minutes: repositories.count_minutes()?,
        })
    }

    fn with<T>(
        &self,
        operation: impl FnOnce(&mut crate::storage::repositories::SqliteRepositories) -> ApiResult<T>,
    ) -> ApiResult<T> {
        let mut repositories = self
            .repositories
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        operation(&mut repositories)
    }
}

impl RequestHandler for CoreRequestHandler {
    fn handle(&self, request: RequestFrame) -> ApiResult<ResponseFrame> {
        let request_id = request.request_id.clone();
        Ok(ResponseFrame {
            protocol_version: PROTOCOL_VERSION,
            request_id,
            result: self.dispatch(request),
        })
    }
}

fn decode<T: serde::de::DeserializeOwned>(payload: serde_json::Value) -> ApiResult<T> {
    serde_json::from_value(payload).map_err(|error| {
        ApiError::new(
            crate::api::ApiErrorCode::InvalidRequest,
            format!("request payload does not match the method: {error}"),
        )
    })
}

fn encode<T: serde::Serialize>(value: &T) -> ApiResult<serde_json::Value> {
    serde_json::to_value(value).map_err(|error| {
        ApiError::new(
            crate::api::ApiErrorCode::StorageUnavailable,
            format!("response could not be encoded: {error}"),
        )
    })
}
