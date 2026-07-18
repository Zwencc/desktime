//! Security boundary for browser-type plugin windows (N4).
//!
//! A browser widget is a window showing somebody else's website. Everything in
//! this module exists because that page is hostile by default — not because
//! Bilibili is hostile, but because a page carries ads, embeds and injected
//! scripts that nobody vetted, and any of them can call whatever the window can
//! call.
//!
//! Three things hold the line, and none of them is the page's own good manners:
//!
//! - **A separate capability and label namespace.** `plugin-browser:*` windows
//!   get `browser_widget_control` and nothing else — no plugin host, no file
//!   access, no window setters. A remote page cannot pin, resize or hide the
//!   window by calling Tauri directly, because those commands are not granted.
//! - **A token the page was handed, not one it can guess.** It lives in the
//!   closure of an initialisation script that returns immediately in any frame
//!   that is not the top one, so an embedded ad never sees it.
//! - **Rust re-checks the URL.** A `navigate` carries a string, and a string
//!   from a web page is a claim. It is parsed here and matched against the
//!   manifest's origins again, because the page asking is exactly the party
//!   that would lie about it.
//!
//! What this is not: a defence against the *site* itself. A page inside its own
//! allowlisted origin can drive the window through the bridge as freely as the
//! plugin's own script can. The boundary is around DeskTime, not around
//! Bilibili.

use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::api::{ApiError, ApiErrorCode, ApiResult};
use crate::vault::crypto::{hex, random_bytes};

pub const BROWSER_LABEL_PREFIX: &str = "plugin-browser:";

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum BrowserAction {
    Navigate,
    Back,
    Forward,
    Reload,
    EnterPlayback,
    ExitPlayback,
    ManualSelect,
    Drag,
    Pin,
    Unpin,
    Hide,
    Resize,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserControlRequest {
    pub token: String,
    pub action: BrowserAction,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub payload: serde_json::Value,
}

/// The window size a playback or resize request is asking for.
#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSize {
    pub width: f64,
    pub height: f64,
}

/// What the window looked like before it became a player.
#[derive(Clone, Copy, Debug)]
pub struct BrowseGeometry {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Debug)]
struct BrowserSession {
    token: String,
    allowed_origins: Vec<String>,
    /// Saved on the way into playback and restored on the way out.
    ///
    /// Held here rather than in the page because the page is the thing that
    /// gets replaced: a site navigation, a reload or a crashed script would all
    /// lose it, and the window would be stuck at player size with no way back.
    browsing: Option<BrowseGeometry>,
}

#[derive(Default)]
pub struct BrowserRegistry {
    sessions: Mutex<HashMap<String, BrowserSession>>,
}

fn refused(message: &str) -> ApiError {
    ApiError::new(ApiErrorCode::InvalidRequest, message)
}

impl BrowserRegistry {
    pub fn register(&self, label: &str, allowed_origins: Vec<String>) -> ApiResult<String> {
        if !label.starts_with(BROWSER_LABEL_PREFIX) {
            return Err(refused("browser session label is not isolated"));
        }
        let token = hex(&random_bytes::<32>()?);
        self.sessions
            .lock()
            .map_err(|_| refused("browser registry is unavailable"))?
            .insert(
                label.to_owned(),
                BrowserSession {
                    token: token.clone(),
                    allowed_origins,
                    browsing: None,
                },
            );
        Ok(token)
    }

    pub fn unregister(&self, label: &str) {
        if let Ok(mut sessions) = self.sessions.lock() {
            sessions.remove(label);
        }
    }

    /// Checks the caller and, for a navigation, the destination.
    ///
    /// Returns the parsed URL rather than the string it was given, so the
    /// caller acts on what was actually validated instead of re-parsing and
    /// possibly landing somewhere else.
    pub fn authorize(
        &self,
        label: &str,
        request: &BrowserControlRequest,
    ) -> ApiResult<Option<url::Url>> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| refused("browser registry is unavailable"))?;
        let session = sessions
            .get(label)
            .ok_or_else(|| refused("browser session is not registered"))?;
        if request.token != session.token {
            return Err(refused("browser control token is invalid"));
        }

        if request.action != BrowserAction::Navigate {
            return Ok(None);
        }

        let target = request
            .url
            .as_deref()
            .ok_or_else(|| refused("navigate requires a URL"))?;
        let parsed = url::Url::parse(target).map_err(|_| refused("navigate URL is invalid"))?;
        if !allows(&session.allowed_origins, &parsed) {
            return Err(refused("navigate URL is outside the manifest allowlist"));
        }
        Ok(Some(parsed))
    }

    /// Whether this window may be *on* a URL at all.
    ///
    /// Asked by the navigation handler for every navigation the window makes,
    /// including the ones the page starts by itself — a link, a redirect, a
    /// `location =`. The bridge is not involved, so this is the check that
    /// actually keeps a browser widget on the sites it declared.
    pub fn permits_navigation(&self, label: &str, url: &url::Url) -> bool {
        // The plugin's own page, served out of its folder by this app.
        if url.scheme() == "plugin" {
            return true;
        }
        let Ok(sessions) = self.sessions.lock() else {
            return false;
        };
        sessions
            .get(label)
            .is_some_and(|session| allows(&session.allowed_origins, url))
    }

    /// Remembers the browsing geometry, unless it already has one.
    ///
    /// Entering playback twice must not overwrite it with a player-sized
    /// rectangle — that is how "exit" stops being able to give anything back.
    pub fn remember_browsing(&self, label: &str, geometry: BrowseGeometry) {
        if let Ok(mut sessions) = self.sessions.lock() {
            if let Some(session) = sessions.get_mut(label) {
                session.browsing.get_or_insert(geometry);
            }
        }
    }

    pub fn take_browsing(&self, label: &str) -> Option<BrowseGeometry> {
        let mut sessions = self.sessions.lock().ok()?;
        sessions.get_mut(label)?.browsing.take()
    }
}

/// An exact origin match. Not a prefix, not a suffix, not a substring.
///
/// `https://www.youtube.com.evil.test` ends with the right characters and is a
/// different site; string comparison on the whole serialised origin is the only
/// form of this check that has never had that class of bug.
fn allows(allowed: &[String], url: &url::Url) -> bool {
    if url.scheme() != "https" {
        return false;
    }
    let origin = url.origin().ascii_serialization();
    allowed.iter().any(|candidate| {
        url::Url::parse(candidate)
            .ok()
            .is_some_and(|candidate| candidate.origin().ascii_serialization() == origin)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn registry() -> (BrowserRegistry, String, String) {
        let registry = BrowserRegistry::default();
        let label = format!("{BROWSER_LABEL_PREFIX}video-player:browser");
        let token = registry
            .register(
                &label,
                vec![
                    "https://www.bilibili.com".to_owned(),
                    "https://www.youtube.com".to_owned(),
                ],
            )
            .unwrap();
        (registry, label, token)
    }

    fn request(token: &str, action: BrowserAction, url: Option<&str>) -> BrowserControlRequest {
        BrowserControlRequest {
            token: token.to_owned(),
            action,
            url: url.map(str::to_owned),
            payload: serde_json::Value::Null,
        }
    }

    #[test]
    fn a_page_without_the_token_controls_nothing() {
        let (registry, label, token) = registry();
        assert!(registry
            .authorize(&label, &request(&token, BrowserAction::Reload, None))
            .is_ok());

        // Guessed, empty, or the token of some other window: all the same.
        for forged in ["", "0", &"a".repeat(64), &token[..63]] {
            assert!(registry
                .authorize(&label, &request(forged, BrowserAction::Reload, None))
                .is_err());
        }
    }

    #[test]
    fn a_window_that_was_never_registered_controls_nothing() {
        let (registry, _, token) = registry();
        // The label is checked as well as the token, so a page in some other
        // plugin window cannot borrow one.
        assert!(registry
            .authorize("plugin:other:widget", &request(&token, BrowserAction::Hide, None))
            .is_err());
    }

    #[test]
    fn a_navigation_is_re_checked_against_the_manifest() {
        let (registry, label, token) = registry();

        let allowed = registry
            .authorize(
                &label,
                &request(&token, BrowserAction::Navigate, Some("https://www.youtube.com/watch?v=x")),
            )
            .unwrap();
        assert_eq!(allowed.unwrap().host_str(), Some("www.youtube.com"));

        for hostile in [
            // A different site whose name ends with an allowed one.
            "https://www.youtube.com.evil.test/",
            // A subdomain that was not declared.
            "https://evil.youtube.com/",
            // Same host, no TLS.
            "http://www.youtube.com/",
            // Everything that is not the web.
            "file:///C:/Windows/win.ini",
            "data:text/html,<script>alert(1)</script>",
            "javascript:alert(1)",
            "tauri://localhost/",
            "plugin://video-player/web/index.html",
        ] {
            assert!(
                registry
                    .authorize(&label, &request(&token, BrowserAction::Navigate, Some(hostile)))
                    .is_err(),
                "{hostile} was allowed"
            );
        }
    }

    #[test]
    fn the_navigation_handler_refuses_what_the_bridge_refuses() {
        // The page can navigate itself without asking, so this check and the
        // bridge's have to agree — a link that the bridge would reject must not
        // work simply because the page used `location =` instead.
        let (registry, label, _) = registry();

        assert!(registry.permits_navigation(
            &label,
            &url::Url::parse("https://www.bilibili.com/video/BV1").unwrap()
        ));
        // The plugin's own page, which is where the window starts.
        assert!(registry.permits_navigation(
            &label,
            &url::Url::parse("plugin://video-player/web/index.html").unwrap()
        ));

        for hostile in [
            "https://accounts.google.com/",
            "http://www.bilibili.com/",
            "file:///C:/Windows/win.ini",
            "data:text/html,hi",
        ] {
            assert!(
                !registry.permits_navigation(&label, &url::Url::parse(hostile).unwrap()),
                "{hostile} was allowed"
            );
        }

        // And an unknown window is refused rather than defaulted to open.
        assert!(!registry.permits_navigation(
            "plugin-browser:nobody:none",
            &url::Url::parse("https://www.bilibili.com/").unwrap()
        ));
    }

    #[test]
    fn the_browsing_geometry_survives_a_second_enter() {
        let (registry, label, _) = registry();
        registry.remember_browsing(
            &label,
            BrowseGeometry {
                x: 100,
                y: 120,
                width: 1200,
                height: 800,
            },
        );
        // A player-sized rectangle arriving second must not become "what the
        // window looked like before", or exiting playback has nothing to give
        // back and the window stays small forever.
        registry.remember_browsing(
            &label,
            BrowseGeometry {
                x: 0,
                y: 0,
                width: 480,
                height: 270,
            },
        );

        let restored = registry.take_browsing(&label).unwrap();
        assert_eq!((restored.width, restored.height), (1200, 800));
        assert!(registry.take_browsing(&label).is_none());
    }

    #[test]
    fn a_session_only_exists_under_its_own_label_prefix() {
        let registry = BrowserRegistry::default();
        assert!(registry
            .register("plugin:video-player:browser", vec![])
            .is_err());
    }
}
