use std::fmt::{Display, Formatter};

#[derive(Debug)]
pub enum BackendError {
    WindowNotFound(String),
    TargetExists(String),
    LaunchFailed(String),
    #[cfg(not(windows))]
    UnsupportedPlatform(&'static str),
    StatePoisoned(&'static str),
    /// Any reason the optional LLM path cannot produce a line. Always recoverable
    /// — the caller falls back to the local line library.
    LlmUnavailable(&'static str),
    Io(std::io::Error),
    Json(serde_json::Error),
    Tauri(tauri::Error),
    Http(reqwest::Error),
    #[cfg(windows)]
    Windows(windows::core::Error),
}

impl Display for BackendError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::WindowNotFound(label) => write!(formatter, "window not found: {label}"),
            Self::TargetExists(path) => write!(formatter, "already exists: {path}"),
            Self::LaunchFailed(path) => write!(formatter, "could not open: {path}"),
            #[cfg(not(windows))]
            Self::UnsupportedPlatform(feature) => {
                write!(formatter, "{feature} is not supported on this platform")
            }
            Self::StatePoisoned(state) => write!(formatter, "{state} state lock is poisoned"),
            Self::LlmUnavailable(reason) => write!(formatter, "llm unavailable: {reason}"),
            Self::Io(error) => Display::fmt(error, formatter),
            Self::Json(error) => Display::fmt(error, formatter),
            Self::Tauri(error) => Display::fmt(error, formatter),
            Self::Http(error) => Display::fmt(error, formatter),
            #[cfg(windows)]
            Self::Windows(error) => Display::fmt(error, formatter),
        }
    }
}

impl std::error::Error for BackendError {}

impl From<std::io::Error> for BackendError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<serde_json::Error> for BackendError {
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error)
    }
}

impl From<tauri::Error> for BackendError {
    fn from(error: tauri::Error) -> Self {
        Self::Tauri(error)
    }
}

impl From<reqwest::Error> for BackendError {
    fn from(error: reqwest::Error) -> Self {
        Self::Http(error)
    }
}

#[cfg(windows)]
impl From<windows::core::Error> for BackendError {
    fn from(error: windows::core::Error) -> Self {
        Self::Windows(error)
    }
}

pub type BackendResult<T> = Result<T, BackendError>;
