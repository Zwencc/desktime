//! Contracts for work that is allowed to run in DTCore.

use std::time::Duration;

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskPolicy {
    pub timeout: Duration,
    pub max_concurrency: usize,
    pub cancellable: bool,
}

impl Default for TaskPolicy {
    fn default() -> Self {
        Self {
            timeout: Duration::from_secs(30),
            max_concurrency: 1,
            cancellable: true,
        }
    }
}

pub trait BackgroundTask: Send + 'static {
    type Output: Send + 'static;

    fn name(&self) -> &'static str;
    fn policy(&self) -> TaskPolicy;
    fn run(self) -> Result<Self::Output, String>;
}
