use tauri::WebviewWindow;
use windows::Win32::UI::WindowsAndMessaging::{
    SetWindowPos, HWND_BOTTOM, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
};

use crate::error::BackendResult;

pub fn set_window_to_bottom(window: &WebviewWindow) -> BackendResult<()> {
    let hwnd = window.hwnd()?;

    unsafe {
        SetWindowPos(
            hwnd,
            Some(HWND_BOTTOM),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        )
    }
    .map_err(Into::into)
}
