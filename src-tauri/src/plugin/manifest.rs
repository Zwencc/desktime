//! The plugin manifest, and what makes one acceptable.
//!
//! Shaped after VSCode's `contributes`: a plugin does not create windows or
//! register commands itself, it *declares* what it contributes and the host
//! decides what to do with that. Ten years of extensions have shown this is the
//! model that survives — the host can list, disable, sandbox and lazily activate
//! a declaration, and can do none of those things to arbitrary startup code.
//!
//! Everything here is validated before a plugin is allowed to exist. A plugin
//! that fails validation is not silently skipped: it is kept in the list with
//! the reason, because "I put it in the folder and nothing happened" has to have
//! an answer somewhere the user can see.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Manifests declaring a different major version are refused rather than
/// half-supported. The host's side of the contract changes here.
pub const API_VERSION: u32 = 1;

pub const MANIFEST_FILE: &str = "plugin.json";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub version: String,
    pub api_version: u32,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub contributes: Contributes,
    #[serde(default)]
    pub backend: Option<Backend>,
    /// Declared, shown to the user, and enforced only for the webview half —
    /// see the module docs in `mod.rs` for why the backend half cannot be.
    #[serde(default)]
    pub permissions: Vec<String>,
    #[serde(default)]
    pub activation: Vec<Activation>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Contributes {
    #[serde(default)]
    pub widgets: Vec<WidgetContribution>,
    /// Rendered by the host's settings window, so a plugin does not have to
    /// build a settings page — or invent its own idea of what one looks like.
    #[serde(default)]
    pub settings: Vec<SettingContribution>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetContribution {
    /// Unique within the plugin. The window label is `plugin:<id>:<key>`.
    pub key: String,
    pub name: String,
    /// Path to the HTML entry point, relative to the plugin directory.
    pub entry: String,
    #[serde(default = "default_size")]
    pub size: Size,
    #[serde(default)]
    pub min_size: Option<Size>,
    #[serde(default)]
    pub resizable: bool,
    #[serde(default)]
    pub default_visible: bool,
    /// What the host draws around this widget; see [`Chrome`].
    #[serde(default)]
    pub chrome: Chrome,
    /// Opt-in browser capability. Ordinary widgets must leave this absent.
    #[serde(default)]
    pub browser: Option<BrowserContribution>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserContribution {
    /// Exact HTTPS origins this widget may navigate to.
    pub allowed_origins: Vec<String>,
    #[serde(default)]
    pub initial_url: Option<String>,
    /// A script the plugin wants running inside the remote page.
    ///
    /// This is the whole of a browser plugin: the window shows somebody else's
    /// site, so the only code the plugin gets to run is what goes in here. It is
    /// resolved inside the plugin folder like every other manifest path.
    #[serde(default)]
    pub injection: Option<String>,
    /// Whether the login stays after a restart. Either way the profile is the
    /// widget's own — it is never shared with DeskTime or another plugin.
    #[serde(default = "default_true")]
    pub persist_profile: bool,
}

fn default_true() -> bool {
    true
}

/// The parts of a widget's shell the host provides.
///
/// Every one of them is off unless the manifest asks, so a plugin that says
/// nothing behaves exactly as it did before this existed.
///
/// The reason any of it exists is that a plugin window is frameless. Windows
/// gives such a window no resize border and no title bar, and there is no CSS
/// for "move the OS window" — so without the host a plugin can draw a title bar
/// that looks right and does nothing. A plugin has two ways out: declare what it
/// wants here, or draw its own and call the SDK, which is what `_template` does.
#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Chrome {
    /// Drag the window from anywhere on the page that is not interactive.
    #[serde(default)]
    pub drag: bool,
    /// Invisible grips on the four edges and four corners. Ignored unless the
    /// widget is also `resizable` — a handle on a fixed window does nothing.
    #[serde(default)]
    pub resize: bool,
    /// A close button in the top-right corner, shown while the pointer is over
    /// the widget.
    #[serde(default)]
    pub close: bool,
    /// An always-on-top toggle beside it.
    #[serde(default)]
    pub pin: bool,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
pub struct Size {
    pub width: f64,
    pub height: f64,
}

fn default_size() -> Size {
    Size {
        width: 320.0,
        height: 220.0,
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingContribution {
    pub key: String,
    pub label: String,
    #[serde(rename = "type")]
    pub kind: SettingKind,
    #[serde(default)]
    pub default: serde_json::Value,
    #[serde(default)]
    pub min: Option<f64>,
    #[serde(default)]
    pub max: Option<f64>,
    #[serde(default)]
    pub unit: Option<String>,
    /// Only meaningful for `select`.
    #[serde(default)]
    pub options: Vec<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SettingKind {
    Boolean,
    Number,
    Text,
    Select,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Backend {
    /// Either a path inside the plugin directory, or a bare command name to be
    /// found on PATH (`python`, `node`).
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub protocol: Protocol,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Protocol {
    /// JSON-RPC 2.0 framed with `Content-Length`, as LSP does it. Chosen because
    /// every language already has a library for it.
    #[default]
    JsonrpcStdio,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Activation {
    /// Start the backend as soon as the app does. Rare, and costly.
    OnStartup,
    /// Start it the first time one of the plugin's windows is shown. The default
    /// — five installed plugins should not make startup five times slower.
    OnWidgetVisible,
}

impl Manifest {
    /// Reads and checks one plugin's manifest.
    ///
    /// The error is a sentence for the user, not a type to match on: every one
    /// of these ends up in the plugin list as the reason a plugin is not there.
    pub fn load(dir: &Path) -> Result<Manifest, String> {
        let path = dir.join(MANIFEST_FILE);
        let raw = std::fs::read_to_string(&path)
            .map_err(|error| format!("{MANIFEST_FILE} could not be read: {error}"))?;

        let manifest: Manifest = serde_json::from_str(&raw)
            .map_err(|error| format!("{MANIFEST_FILE} is not valid JSON: {error}"))?;

        manifest.validate(dir)?;
        Ok(manifest)
    }

    fn validate(&self, dir: &Path) -> Result<(), String> {
        if self.api_version != API_VERSION {
            return Err(format!(
                "needs plugin API v{}, this build provides v{API_VERSION}",
                self.api_version
            ));
        }

        if !is_safe_id(&self.id) {
            return Err(format!(
                "id \"{}\" must be lowercase letters, digits and hyphens",
                self.id
            ));
        }

        // The id is a window-label prefix, a storage namespace and a URL
        // authority. Letting it differ from the folder would mean two plugins
        // could claim one id by being installed in differently named folders.
        let folder = dir
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default();
        if folder != self.id {
            return Err(format!(
                "id \"{}\" does not match its folder name \"{folder}\"",
                self.id
            ));
        }

        if self.contributes.widgets.is_empty() {
            return Err("declares no widgets, so there is nothing to show".to_owned());
        }

        for widget in &self.contributes.widgets {
            if !is_safe_id(&widget.key) {
                return Err(format!(
                    "widget key \"{}\" must be lowercase letters, digits and hyphens",
                    widget.key
                ));
            }

            let entry = resolve_inside(dir, &widget.entry).ok_or_else(|| {
                format!("widget \"{}\" points outside the plugin folder", widget.key)
            })?;
            if !entry.is_file() {
                return Err(format!("widget entry \"{}\" does not exist", widget.entry));
            }

            if let Some(browser) = &widget.browser {
                validate_browser(dir, widget, browser)?;
            }
        }

        if let Some(backend) = &self.backend {
            // A bare command name (`python`) is looked up on PATH and is fine; a
            // path has to stay inside the plugin.
            if backend.command.contains(['/', '\\']) && resolve_inside(dir, &backend.command).is_none()
            {
                return Err("backend command points outside the plugin folder".to_owned());
            }
        }

        Ok(())
    }

    pub fn activation(&self) -> Activation {
        self.activation
            .first()
            .copied()
            .unwrap_or(Activation::OnWidgetVisible)
    }
}

fn validate_browser(
    dir: &Path,
    widget: &WidgetContribution,
    browser: &BrowserContribution,
) -> Result<(), String> {
    if browser.allowed_origins.is_empty() {
        return Err(format!(
            "browser widget \"{}\" must declare allowedOrigins",
            widget.key
        ));
    }

    for origin in &browser.allowed_origins {
        let parsed = url::Url::parse(origin).map_err(|_| {
            format!("browser widget \"{}\" has an invalid origin", widget.key)
        })?;
        let is_origin = parsed.scheme() == "https"
            && parsed.username().is_empty()
            && parsed.password().is_none()
            && parsed.query().is_none()
            && parsed.fragment().is_none()
            && matches!(parsed.path(), "" | "/")
            // A host has to be a host. `https://*.bilibili.com` parses happily,
            // is stored as a literal, and then matches nothing — so a manifest
            // written that way would look like it granted a whole subtree and
            // would in fact grant nothing. Refusing it says which of the two
            // the author got; accepting it says neither.
            && parsed.host_str().is_some_and(is_plain_host);
        if !is_origin {
            return Err(format!(
                "browser widget \"{}\" origins must be exact HTTPS origins, with no wildcard",
                widget.key
            ));
        }
    }

    if let Some(initial) = &browser.initial_url {
        let parsed = url::Url::parse(initial).map_err(|_| {
            format!("browser widget \"{}\" has an invalid initialUrl", widget.key)
        })?;
        let origin = parsed.origin().ascii_serialization();
        if !browser.allowed_origins.iter().any(|allowed| {
            url::Url::parse(allowed)
                .ok()
                .is_some_and(|allowed| allowed.origin().ascii_serialization() == origin)
        }) {
            return Err(format!(
                "browser widget \"{}\" initialUrl is outside allowedOrigins",
                widget.key
            ));
        }
    }

    if let Some(injection) = &browser.injection {
        let script = resolve_inside(dir, injection).ok_or_else(|| {
            format!(
                "browser widget \"{}\" injection points outside the plugin folder",
                widget.key
            )
        })?;
        if !script.is_file() {
            return Err(format!("browser widget injection \"{injection}\" does not exist"));
        }
    }

    Ok(())
}

/// A hostname and nothing clever: labels of letters, digits and hyphens.
///
/// `url` normalises an international domain to punycode before this sees it, so
/// a legitimate non-ASCII host passes and a pattern does not.
fn is_plain_host(host: &str) -> bool {
    !host.is_empty()
        && host.split('.').all(|label| {
            !label.is_empty()
                && label
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric() || character == '-')
        })
}

/// Ids become window labels, URL authorities and storage key prefixes, so they
/// are restricted to what is unambiguous in all three.
pub fn is_safe_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|character| character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-')
}

/// Resolves a manifest-supplied relative path and proves it stayed inside.
///
/// `canonicalize` rather than string comparison: `a/../../b` and a symlink both
/// look innocent as text, and both leave the folder. This is the single choke
/// point every plugin-supplied path goes through — the same rule `draft_path`
/// applies to draft ids, for the same reason.
pub fn resolve_inside(dir: &Path, relative: &str) -> Option<PathBuf> {
    let root = dir.canonicalize().ok()?;
    let candidate = root.join(relative).canonicalize().ok()?;
    candidate.starts_with(&root).then_some(candidate)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The plugin that ships with the app, loaded exactly as the host loads it.
    ///
    /// Checked rather than assumed because a browser widget's manifest is the
    /// whole of its security posture: the origins here are the list the
    /// navigation handler and the control bridge both match against, and a typo
    /// in this file is a hole in both at once.
    #[test]
    fn the_shipped_video_player_is_a_valid_browser_widget() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("plugins")
            .join("video-player");

        let manifest = Manifest::load(&dir).expect("the shipped plugin loads");
        let widget = &manifest.contributes.widgets[0];
        let browser = widget.browser.as_ref().expect("it is a browser widget");

        assert!(browser.persist_profile, "a login that does not survive is not a login");
        assert_eq!(browser.injection.as_deref(), Some("web/player.js"));
        assert!(browser
            .initial_url
            .as_deref()
            .is_some_and(|url| url.starts_with("https://")));
        // Every origin is exactly an origin — no path, no wildcard, no http.
        for origin in &browser.allowed_origins {
            let parsed = url::Url::parse(origin).unwrap();
            assert_eq!(parsed.scheme(), "https", "{origin}");
            assert!(matches!(parsed.path(), "" | "/"), "{origin}");
        }
    }

    #[test]
    fn a_browser_widget_without_an_allowlist_is_refused() {
        // The allowlist is what makes the window a *restricted* browser rather
        // than a browser, so there is no default and no empty case.
        let widget = WidgetContribution {
            key: "browser".to_owned(),
            name: "n".to_owned(),
            entry: "web/index.html".to_owned(),
            size: default_size(),
            min_size: None,
            resizable: true,
            default_visible: false,
            chrome: Chrome::default(),
            browser: None,
        };

        let empty = BrowserContribution {
            allowed_origins: Vec::new(),
            initial_url: None,
            injection: None,
            persist_profile: true,
        };
        assert!(validate_browser(std::path::Path::new("."), &widget, &empty).is_err());

        for origin in ["http://www.bilibili.com", "https://*.bilibili.com", "https://www.bilibili.com/video"] {
            let loose = BrowserContribution {
                allowed_origins: vec![origin.to_owned()],
                initial_url: None,
                injection: None,
                persist_profile: true,
            };
            assert!(
                validate_browser(std::path::Path::new("."), &widget, &loose).is_err(),
                "{origin} was accepted"
            );
        }
    }

    #[test]
    fn accepts_plain_ids() {
        assert!(is_safe_id("system-monitor"));
        assert!(is_safe_id("moo2"));
    }

    #[test]
    fn rejects_anything_ambiguous_as_a_label_or_url() {
        assert!(!is_safe_id(""));
        assert!(!is_safe_id("System-Monitor"));
        assert!(!is_safe_id("with space"));
        assert!(!is_safe_id("with/slash"));
        assert!(!is_safe_id("with:colon"));
        assert!(!is_safe_id(".."));
    }
}
