mod messages;
mod state;
mod webview;
mod window;

use tauri::Manager;

use state::WindowsPlatformState;

pub use window::set_window_to_bottom;

pub fn set_window_visibility<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
    visible: bool,
) -> crate::error::BackendResult<()> {
    let result = window
        .state::<WindowsPlatformState>()
        .apply_app_visibility(window.label(), visible, || {
            if visible {
                window.show()
            } else {
                window.hide()
            }
        })?;
    result?;
    Ok(())
}

pub fn plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("windows-platform")
        .setup(|app, _api| {
            app.manage(WindowsPlatformState::default());
            Ok(())
        })
        .on_webview_ready(|webview| {
            if let Err(error) = webview::disable_browser_accelerators(&webview) {
                report_error(
                    "failed to schedule WebView2 configuration",
                    webview.label(),
                    &error,
                );
            }

            let window = webview.window();
            if !crate::platform::is_app_driven(window.label()) {
                if let Err(error) = webview
                    .state::<WindowsPlatformState>()
                    .register_window(&window)
                {
                    report_error(
                        "failed to register native window messages",
                        window.label(),
                        &error,
                    );
                }
            }
        })
        .on_drop(|app| {
            if let Some(state) = app.try_state::<WindowsPlatformState>() {
                if let Err(error) = state.detach_all() {
                    report_error("failed to detach native window messages", "app", &error);
                }
            }
        })
        .build()
}

pub(super) fn report_error(context: &str, target: &str, error: &dyn std::error::Error) {
    eprintln!("{context} for {target}: {error}");
}
