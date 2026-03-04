use tauri::{Runtime, Webview};
use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
use windows::core::Interface;

use crate::error::BackendResult;

/// Lets web content own browser shortcuts such as Ctrl+D instead of WebView2.
/// DeskTime's frontend can then handle only the combinations it needs.
pub fn disable_browser_accelerators<R: Runtime>(webview: &Webview<R>) -> BackendResult<()> {
    let label = webview.label().to_owned();

    webview.with_webview(move |platform_webview| {
        let result = (|| unsafe {
            let core = platform_webview.controller().CoreWebView2()?;
            let settings = core.Settings()?;
            let settings: ICoreWebView2Settings3 = settings.cast()?;
            settings.SetAreBrowserAcceleratorKeysEnabled(false)
        })();

        if let Err(error) = result {
            super::report_error("failed to configure WebView2 shortcuts", &label, &error);
        }
    })?;
    Ok(())
}
