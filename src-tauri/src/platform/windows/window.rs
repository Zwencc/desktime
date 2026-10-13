use tauri::WebviewWindow;
use windows::Win32::UI::WindowsAndMessaging::{
    SetWindowPos, HWND_BOTTOM, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
};

use crate::error::BackendResult;

// Generic over the runtime because the shortcut handler is: it sinks a window
// straight from the hotkey rather than through a command.
pub fn set_window_to_bottom<R: tauri::Runtime>(window: &WebviewWindow<R>) -> BackendResult<()> {
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
