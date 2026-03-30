#[cfg(windows)]
mod windows;

#[cfg(windows)]
pub use windows::{plugin, set_window_to_bottom, set_window_visibility};

/// Windows the app itself opens and closes on demand, rather than always-on-desktop
/// widgets.
///
/// They stay out of the native visibility policy: that policy exists to stop the
/// shell (Show Desktop, minimise-all) from hiding the widgets, and registering a
/// popup would also start it marked visible while it is in fact created hidden.
/// The consequence is that their visibility can only be changed with the plain
/// `show()`/`hide()` window API — `set_window_visibility` looks the label up in
/// the policy registry and fails with `WindowNotFound`.
///
/// Adding a widget needs no change here. Anything absent from this list counts as
/// a widget, so the tray and the visibility policy pick it up on their own.
pub const APP_DRIVEN_WINDOWS: &[&str] = &["menu", "reminder", "settings"];

pub fn is_app_driven(label: &str) -> bool {
    APP_DRIVEN_WINDOWS.contains(&label)
}

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
