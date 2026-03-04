use std::fmt::{Display, Formatter};

#[derive(Debug)]
pub enum BackendError {
    WindowNotFound(String),
    #[cfg(not(windows))]
    UnsupportedPlatform(&'static str),
    StatePoisoned(&'static str),
    Tauri(tauri::Error),
    #[cfg(windows)]
    Windows(windows::core::Error),
}

impl Display for BackendError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::WindowNotFound(label) => write!(formatter, "window not found: {label}"),
            #[cfg(not(windows))]
            Self::UnsupportedPlatform(feature) => {
                write!(formatter, "{feature} is not supported on this platform")
            }
            Self::StatePoisoned(state) => write!(formatter, "{state} state lock is poisoned"),
            Self::Tauri(error) => Display::fmt(error, formatter),
            #[cfg(windows)]
            Self::Windows(error) => Display::fmt(error, formatter),
        }
    }
}

impl std::error::Error for BackendError {}

impl From<tauri::Error> for BackendError {
    fn from(error: tauri::Error) -> Self {
        Self::Tauri(error)
    }
}

#[cfg(windows)]
impl From<windows::core::Error> for BackendError {
    fn from(error: windows::core::Error) -> Self {
        Self::Windows(error)
    }
}

pub type BackendResult<T> = Result<T, BackendError>;
