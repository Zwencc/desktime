//! The one command a browser widget's page is allowed to call.
//!
//! Everything a remote page can do to its window goes through here, and every
//! call carries a token it was handed rather than one it could construct. The
//! window setters are deliberately *not* in that window's capability: if they
//! were, a script on the page could pin, resize or hide the window without a
//! token at all, and the token would be decoration.

use std::sync::Arc;

use tauri::{PhysicalPosition, PhysicalSize, Runtime, State, WebviewWindow};

use crate::api::{ApiError, ApiErrorCode, ApiResult, FeatureId, FeatureState, FeatureStatus};
use crate::plugin::browser::{
    BrowseGeometry, BrowserAction, BrowserControlRequest, BrowserRegistry, BrowserSize,
};

#[tauri::command]
pub fn browser_widget_status() -> FeatureStatus {
    FeatureStatus {
        feature: FeatureId::BrowserWidget,
        state: FeatureState::Ready,
        api_version: 1,
        owner: "plugin host".to_owned(),
        next_module: "plugin::browser".to_owned(),
    }
}

#[tauri::command]
pub fn browser_widget_control<R: Runtime>(
    window: WebviewWindow<R>,
    registry: State<'_, Arc<BrowserRegistry>>,
    request: BrowserControlRequest,
) -> ApiResult<()> {
    let target = registry.authorize(window.label(), &request)?;

    match request.action {
        // The URL used is the one that was validated, not the string that was
        // sent — re-parsing it here would be a second chance to disagree.
        BrowserAction::Navigate => {
            let url = target.ok_or_else(|| refused("navigate requires a URL"))?;
            window.navigate(url).map_err(io)?;
        }
        // WebView2's own history, driven from the page's own context. There is
        // no Tauri call for this and the page cannot reach `history` across a
        // navigation it did not make.
        BrowserAction::Back => window.eval("history.back()").map_err(io)?,
        BrowserAction::Forward => window.eval("history.forward()").map_err(io)?,
        BrowserAction::Reload => window.eval("location.reload()").map_err(io)?,

        BrowserAction::Drag => window.start_dragging().map_err(io)?,
        BrowserAction::Pin => window.set_always_on_top(true).map_err(io)?,
        BrowserAction::Unpin => {
            window.set_always_on_top(false).map_err(io)?;
            // "Unpinned" is behind everything rather than merely not on top —
            // the same two steps every other widget in the app takes.
            let _ = crate::platform::set_window_to_bottom(&window);
        }
        BrowserAction::Hide => {
            if crate::platform::set_window_visibility(&window, false).is_err() {
                window.hide().map_err(io)?;
            }
        }

        BrowserAction::EnterPlayback => {
            let size = size_of(&request)?;
            // Saved before anything moves, and only the first time: a second
            // enter must not record the player's own size as "what this looked
            // like before", or exiting has nothing to restore.
            if let Some(geometry) = current_geometry(&window) {
                registry.remember_browsing(window.label(), geometry);
            }

            // Hidden, changed, shown — and shown whatever happened in between.
            // A resize that failed halfway through must not leave the window
            // invisible with no way for the page to ask for it back.
            hide(&window);
            let applied = resize(&window, size).and_then(|()| {
                window.set_always_on_top(true).map_err(io)
            });
            show(&window);
            applied?;
        }
        BrowserAction::ExitPlayback => {
            let Some(geometry) = registry.take_browsing(window.label()) else {
                // Never entered, or already exited. Doing nothing is right;
                // guessing a size would move a window the user had just placed.
                return Ok(());
            };

            hide(&window);
            let applied = window
                .set_size(PhysicalSize::new(geometry.width, geometry.height))
                .and_then(|()| window.set_position(PhysicalPosition::new(geometry.x, geometry.y)))
                .map_err(io);
            show(&window);
            applied?;
        }
        // The player's aspect ratio changed, or the page is asking for a
        // different crop. Only the size moves; the remembered browsing geometry
        // is left exactly as it was.
        BrowserAction::Resize => resize(&window, size_of(&request)?)?,

        // The host has nothing to do for this one: choosing a rectangle happens
        // entirely on the page, and the result arrives as EnterPlayback.
        BrowserAction::ManualSelect => {}
    }

    Ok(())
}

fn hide<R: Runtime>(window: &WebviewWindow<R>) {
    if crate::platform::set_window_visibility(window, false).is_err() {
        let _ = window.hide();
    }
}

fn show<R: Runtime>(window: &WebviewWindow<R>) {
    if crate::platform::set_window_visibility(window, true).is_err() {
        let _ = window.show();
    }
}

fn refused(message: &str) -> ApiError {
    ApiError::new(ApiErrorCode::InvalidRequest, message)
}

fn io(error: tauri::Error) -> ApiError {
    ApiError::new(ApiErrorCode::IoError, error.to_string())
}

fn size_of(request: &BrowserControlRequest) -> ApiResult<BrowserSize> {
    let size: BrowserSize = serde_json::from_value(request.payload.clone())
        .map_err(|_| refused("that action needs a width and a height"))?;
    // A window of zero, or of half a screen per side, is not a player. Refusing
    // is better than clamping: a page that asked for it has a bug, and silently
    // giving it something else hides the bug and moves the window anyway.
    let sane = size.width >= 160.0
        && size.height >= 90.0
        && size.width <= 8192.0
        && size.height <= 8192.0;
    if !sane {
        return Err(refused("that is not a size a player window can have"));
    }
    Ok(size)
}

fn resize<R: Runtime>(window: &WebviewWindow<R>, size: BrowserSize) -> ApiResult<()> {
    window
        .set_size(tauri::LogicalSize::new(size.width, size.height))
        .map_err(io)
}

fn current_geometry<R: Runtime>(window: &WebviewWindow<R>) -> Option<BrowseGeometry> {
    let position = window.outer_position().ok()?;
    let size = window.outer_size().ok()?;
    Some(BrowseGeometry {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    })
}
