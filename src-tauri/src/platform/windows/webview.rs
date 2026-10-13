use tauri::{Runtime, Webview};
use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
use windows::core::Interface;

use crate::error::BackendResult;

/// Makes a WebView2 behave like part of a desktop app rather than a browser.
///
/// Two settings, both about giving the frontend the input it expects:
///
/// * **Browser accelerators off**, so web content owns shortcuts such as Ctrl+D
///   and DeskTime's frontend handles only the combinations it wants.
/// * **Default context menus off.** A right click on any region without a menu
///   of its own otherwise raised WebView2's — refresh, save as, print — which is
///   a browser's menu on something the user is looking at as a desktop widget.
///   Done here rather than with a `contextmenu` handler per page because *here*
///   is the only place that covers every window there is, including a plugin's,
///   whose page is somebody else's HTML and cannot be asked to remember.
pub fn configure_webview<R: Runtime>(webview: &Webview<R>) -> BackendResult<()> {
    let label = webview.label().to_owned();

    webview.with_webview(move |platform_webview| {
        let result = (|| unsafe {
            let core = platform_webview.controller().CoreWebView2()?;
            let settings = core.Settings()?;
            settings.SetAreDefaultContextMenusEnabled(false)?;

            let settings: ICoreWebView2Settings3 = settings.cast()?;
            settings.SetAreBrowserAcceleratorKeysEnabled(false)
        })();

        if let Err(error) = result {
            super::report_error("failed to configure WebView2", &label, &error);
        }
    })?;
    Ok(())
}
