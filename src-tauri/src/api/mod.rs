//! Stable contracts shared by Tauri commands, DTCore IPC and tests.

mod error;
mod feature;

pub use error::{ApiError, ApiErrorCode, ApiResult};
pub use feature::{FeatureId, FeatureState, FeatureStatus};
