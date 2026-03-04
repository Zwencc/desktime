#[cfg(windows)]
mod windows;

#[cfg(windows)]
pub use windows::{plugin, set_window_to_bottom, set_window_visibility};

#[cfg(not(windows))]
pub fn plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("platform").build()
}

#[cfg(not(windows))]
pub fn set_window_to_bottom(_window: &tauri::WebviewWindow) -> crate::error::BackendResult<()> {
    Err(crate::error::BackendError::UnsupportedPlatform(
        "always-on-bottom",
    ))
}

#[cfg(not(windows))]
pub fn set_window_visibility(
    window: &tauri::WebviewWindow,
    visible: bool,
) -> crate::error::BackendResult<()> {
    if visible {
        window.show()?;
    } else {
        window.hide()?;
    }
    Ok(())
}
