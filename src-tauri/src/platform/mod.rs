#[cfg(windows)]
mod windows;

#[cfg(windows)]
pub use windows::{plugin, policy_app_visible, set_window_to_bottom, set_window_visibility};

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
pub const APP_DRIVEN_WINDOWS: &[&str] =
    &["menu", "reminder", "settings", "launcher", "devtools"];

pub fn is_app_driven(label: &str) -> bool {
    APP_DRIVEN_WINDOWS.contains(&label)
}

#[cfg(not(windows))]
pub fn plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("platform").build()
}

#[cfg(not(windows))]
pub fn set_window_to_bottom<R: tauri::Runtime>(
    _window: &tauri::WebviewWindow<R>,
) -> crate::error::BackendResult<()> {
    Err(crate::error::BackendError::UnsupportedPlatform(
        "always-on-bottom",
    ))
}

/// There is no native visibility policy off Windows, so no window has one.
#[cfg(not(windows))]
pub fn policy_app_visible<R: tauri::Runtime>(
    _app: &tauri::AppHandle<R>,
    _label: &str,
) -> Option<bool> {
    None
}

#[cfg(not(windows))]
pub fn set_window_visibility<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
    visible: bool,
) -> crate::error::BackendResult<()> {
    if visible {
        window.show()?;
    } else {
        window.hide()?;
    }
    Ok(())
}
