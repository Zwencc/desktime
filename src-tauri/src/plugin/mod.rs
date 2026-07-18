//! Third-party widgets.
//!
//! The shape of this is borrowed rather than invented — each piece from whoever
//! has already had to live with the consequences:
//!
//! | piece | borrowed from | why that one |
//! |---|---|---|
//! | `plugin.json` with `contributes` | VSCode extensions | the host can list, disable and lazily activate a *declaration*; it can do none of that to startup code |
//! | `permissions` shown at enable time | Chrome extensions | one clear moment, rather than a prompt per action that everyone learns to click through |
//! | `plugin://` origin per plugin | `chrome-extension://` | path escapes and CSP get exactly one place to be wrong |
//! | JSON-RPC over stdio | LSP | every language already has the library |
//!
//! # The trust boundary, stated plainly
//!
//! A plugin's **webview** is confined: its capability grants the window controls
//! and `plugin_*` commands and nothing else, so a plugin page cannot call
//! `note_open`, cannot reach the activity data, cannot use the LLM key.
//!
//! A plugin's **backend** is not confined. It is a process started as the user,
//! with the user's rights. Real confinement would mean an AppContainer or a
//! separate account, which is a great deal of machinery for a single-user
//! desktop widget host — so instead the limitation is stated, the backend is
//! listed in the UI, and it does not start until one of the plugin's windows is
//! shown. **Installing a plugin with a backend is running a program**, and the
//! interface says so rather than implying a sandbox that is not there.
//!
//! # Failure is data
//!
//! Nothing here can stop the app from starting. A malformed manifest, a missing
//! entry file, a backend that will not spawn — each becomes a `PluginState` with
//! a reason attached, shown in the settings list. The alternative, silently
//! skipping the folder, produces the single worst bug report a plugin host can
//! get: "I put it in the folder and nothing happened."

mod backend;
pub mod browser;
mod geometry;
pub mod manifest;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime};

pub use manifest::{Activation, Manifest};

use backend::{BackendProcess, MAX_RESTARTS};

/// Window label prefix. `plugin:<id>:<widget key>`.
pub const LABEL_PREFIX: &str = "plugin:";

pub fn label_belongs_to(label: &str, id: &str) -> bool {
    [LABEL_PREFIX, browser::BROWSER_LABEL_PREFIX]
        .into_iter()
        .any(|prefix| label.starts_with(&format!("{prefix}{id}:")))
}

fn is_plugin_label(label: &str) -> bool {
    label.starts_with(LABEL_PREFIX) || label.starts_with(browser::BROWSER_LABEL_PREFIX)
}

pub fn dir() -> PathBuf {
    crate::devmode::root_dir().join("plugins")
}

/// Where a browser widget's cookies and logins live.
///
/// One folder per widget, never the one DeskTime's own windows use. A shared
/// profile would mean a site could read what another plugin — or the app —
/// stored, and it would mean "log out of Bilibili" had no obvious meaning.
/// Both halves of the name come from ids the manifest loader has already
/// restricted to lowercase letters, digits and hyphens.
fn profile_dir(id: &str, key: &str) -> PathBuf {
    crate::devmode::root_dir()
        .join("browser-profiles")
        .join(format!("{id}.{key}"))
}

pub fn log_path(id: &str) -> PathBuf {
    crate::devmode::root_dir().join("logs").join("plugins").join(format!("{id}.log"))
}

/// One plugin as the settings window sees it.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginState {
    /// Folder name — present even when the manifest could not be read.
    pub id: String,
    pub manifest: Option<Manifest>,
    /// Why it is not usable, if it is not.
    pub error: Option<String>,
    pub backend_running: bool,
    /// Set once restarts have been given up on; see [`MAX_RESTARTS`].
    pub backend_failed: bool,
    /// Off means no window and no backend. Filled in by [`states`], which is the
    /// only reader with a `Config` to ask; `discover` works from the folder
    /// alone and leaves it at the default.
    pub enabled: bool,
}

#[derive(Default)]
struct Running {
    process: Option<BackendProcess>,
    restarts: u32,
    failed: bool,
}

pub struct Plugins {
    /// Load order is folder order; kept as a Vec so the list is stable.
    states: Mutex<Vec<PluginState>>,
    running: Mutex<HashMap<String, Running>>,
}

impl Plugins {
    pub fn snapshot(&self) -> Vec<PluginState> {
        let running = self.running.lock().ok();
        self.states
            .lock()
            .map(|states| {
                states
                    .iter()
                    .map(|state| {
                        let live = running.as_ref().and_then(|map| map.get(&state.id));
                        PluginState {
                            backend_running: live.is_some_and(|entry| entry.process.is_some()),
                            backend_failed: live.is_some_and(|entry| entry.failed),
                            ..state.clone()
                        }
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Swaps in a freshly discovered set. Used by [`reload`].
    fn replace(&self, states: Vec<PluginState>) {
        if let Ok(mut held) = self.states.lock() {
            *held = states;
        }
        // Every restart counter and every "given up on" flag goes with it: a
        // reload is the user saying "try again", and a plugin that failed
        // because of the manifest they just fixed must not stay marked failed.
        if let Ok(mut running) = self.running.lock() {
            running.clear();
        }
    }

    fn manifest_of(&self, id: &str) -> Option<Manifest> {
        self.states
            .lock()
            .ok()?
            .iter()
            .find(|state| state.id == id)?
            .manifest
            .clone()
    }
}

/// Reads every plugin folder. Never fails: an unreadable plugin becomes a state
/// with a reason.
pub fn discover() -> Vec<PluginState> {
    let root = dir();
    if std::fs::create_dir_all(&root).is_err() {
        return Vec::new();
    }

    let Ok(entries) = std::fs::read_dir(&root) else {
        return Vec::new();
    };

    let mut states = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let id = entry.file_name().to_string_lossy().into_owned();
        // `_template` ships with the app as something to copy, and is not itself
        // a plugin. The underscore is not a legal id, so it is skipped anyway;
        // this just avoids listing it as an error.
        if id.starts_with('_') {
            continue;
        }

        states.push(match Manifest::load(&path) {
            Ok(manifest) => PluginState {
                id,
                manifest: Some(manifest),
                error: None,
                backend_running: false,
                backend_failed: false,
                enabled: true,
            },
            Err(error) => PluginState {
                id,
                manifest: None,
                error: Some(error),
                backend_running: false,
                backend_failed: false,
                enabled: true,
            },
        });
    }

    states
}

/// The plugin list with each plugin's on/off switch filled in.
///
/// `Plugins::snapshot` cannot do this itself: it knows the folder and the
/// running processes, and the switch lives in `Config`, which only a caller with
/// an `AppHandle` can reach.
pub fn states<R: Runtime>(app: &AppHandle<R>) -> Vec<PluginState> {
    let config = app.try_state::<crate::config::Config>();

    app.try_state::<Arc<Plugins>>()
        .map(|plugins| plugins.snapshot())
        .unwrap_or_default()
        .into_iter()
        .map(|state| PluginState {
            enabled: config
                .as_ref()
                .map(|config| config.plugin_enabled(&state.id))
                .unwrap_or(true),
            ..state
        })
        .collect()
}

/// Whether this plugin should have a window and a backend at all.
fn enabled<R: Runtime>(app: &AppHandle<R>, id: &str) -> bool {
    app.try_state::<crate::config::Config>()
        .map(|config| config.plugin_enabled(id))
        .unwrap_or(true)
}

/// Loads the plugins and creates their windows (hidden).
pub fn start<R: Runtime>(app: &AppHandle<R>) {
    let states = discover();
    let plugins = Arc::new(Plugins {
        states: Mutex::new(states.clone()),
        running: Mutex::new(HashMap::new()),
    });
    app.manage(Arc::clone(&plugins));
    geometry::start(app);

    for state in &states {
        let Some(manifest) = &state.manifest else {
            continue;
        };
        // A plugin switched off costs nothing at all: no window is built, so no
        // WebView2 instance is created, and no backend can be started because
        // there is nothing on screen to ask for one.
        if !enabled(app, &manifest.id) {
            continue;
        }

        for widget in &manifest.contributes.widgets {
            create_window(app, manifest, widget);
        }

        if manifest.activation() == Activation::OnStartup {
            let _ = ensure_backend(app, &manifest.id);
        }
    }
}

/// Switches a plugin on or off: window and backend, together.
///
/// Off tears both down rather than hiding the window, which is what "stop using
/// this plugin" has to mean — a hidden WebView2 instance is still a process's
/// worth of memory, and a backend nobody can see is the one you least want left
/// running.
pub fn set_enabled<R: Runtime>(app: &AppHandle<R>, id: &str, on: bool) -> Result<(), String> {
    let config = app
        .try_state::<crate::config::Config>()
        .ok_or_else(|| "config is not loaded".to_owned())?;

    config
        .apply(vec![crate::config::ConfigEntry {
            key: format!("{}{id}", crate::config::PLUGIN_ENABLED_PREFIX),
            value: Some(on.to_string()),
        }])
        .map_err(|error| error.to_string())?;

    if on {
        let state = states(app).into_iter().find(|state| state.id == id);
        post_rebuild(app, state.into_iter().collect());
        return Ok(());
    }

    stop_backend(app, id);
    for (label, window) in app.webview_windows() {
        if label_belongs_to(&label, id) {
            let _ = window.destroy();
        }
    }

    Ok(())
}

/// Stops one plugin's backend and forgets its restart counters.
fn stop_backend<R: Runtime>(app: &AppHandle<R>, id: &str) {
    let Some(plugins) = app.try_state::<Arc<Plugins>>() else {
        return;
    };
    let plugins = plugins.inner().clone();

    let Ok(mut running) = plugins.running.lock() else {
        return;
    };
    if let Some(mut entry) = running.remove(id) {
        if let Some(process) = entry.process.as_mut() {
            process.shutdown();
        }
    }
}

/// Builds the windows a set of plugins describes, off the current call stack.
///
/// Posted rather than run inline for the reason spelled out in [`reload`]: a
/// window created from inside a WebView2 callback never finishes being created,
/// and any queued `destroy` has not been processed yet either, so the labels
/// would still be taken.
fn post_rebuild<R: Runtime>(app: &AppHandle<R>, states: Vec<PluginState>) {
    let handle = app.clone();
    let wanted: Vec<String> = states
        .iter()
        .filter_map(|state| state.manifest.as_ref())
        .flat_map(|manifest| {
            manifest
                .contributes
                .widgets
                .iter()
                .map(|widget| window_label(&manifest.id, widget))
        })
        .collect();

    std::thread::spawn(move || {
        // Wait for the queued destroys to actually land, which posting alone does
        // not guarantee.
        //
        // `destroy` puts a message on the event-loop queue; the window does not
        // leave Tauri's registry until the OS has sent `WM_DESTROY` back and the
        // loop has turned *that* into a `Destroyed` event — a second queue, and
        // nothing orders it against the first. Rebuilding too early finds the
        // label still taken, `create_window` returns early, and the widget never
        // comes back. Intermittently, because it is a race: reloading with a
        // plugin on screen lost it most of the time.
        for _ in 0..100 {
            if wanted
                .iter()
                .all(|label| handle.get_webview_window(label).is_none())
            {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }

        let _ = handle.clone().run_on_main_thread(move || {
            for state in &states {
                let Some(manifest) = &state.manifest else {
                    continue;
                };
                if !state.enabled {
                    continue;
                }

                for widget in &manifest.contributes.widgets {
                    // A window that is gone from the new manifest simply does not
                    // come back, which is the honest answer to "I deleted that
                    // widget".
                    create_window(&handle, manifest, widget);
                }

                if manifest.activation() == Activation::OnStartup {
                    let _ = ensure_backend(&handle, &manifest.id);
                }
            }
        });
    });
}

/// Reads every plugin folder again and rebuilds what it describes.
///
/// This is what the settings page's "reload" button does, and until it existed
/// that button only re-read a snapshot taken at startup — so editing a
/// `plugin.json` and pressing it appeared to do nothing at all, which is the
/// one thing a plugin host must never do to somebody who is writing a plugin.
///
/// Everything is rebuilt rather than diffed. A manifest can change the window's
/// size, its entry file, its widgets, the backend command and the permissions
/// at once, and reconciling those against live windows would be a second, more
/// delicate copy of `start`. Tearing down is a few frames of the settings
/// window; getting the reconciliation subtly wrong is a plugin that behaves
/// differently after a reload than after a restart.
///
/// Only the teardown happens on the calling thread. The rebuild is posted onto
/// the event loop instead, for the reason spelled out where it is posted.
pub fn reload<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let plugins = app
        .try_state::<Arc<Plugins>>()
        .ok_or_else(|| "plugins are not loaded".to_owned())?
        .inner()
        .clone();

    // Nothing is recorded about what was on screen: `create_window` reads the
    // same stored flags the settings page writes, so a widget that was showing
    // comes back showing without this having to remember anything. A reload is a
    // developer action taken while looking at the widget, and sweeping the
    // desktop clean each time would make it useless for the thing it is for.

    // Backends first, and all of them: the command that starts one is in the
    // manifest being re-read, so even an unchanged-looking plugin may need a
    // different process.
    shutdown(app);

    // Old windows have to go before the new ones are built: `create_window`
    // returns early for a label that already exists, so skipping this would
    // leave every plugin showing its previous page.
    for (label, window) in app.webview_windows() {
        if is_plugin_label(&label) {
            let _ = window.destroy();
        }
    }

    discover_into(&plugins);

    // The rebuild cannot happen here, and that is the whole of the second bug in
    // this button.
    //
    // `destroy` above does not destroy: it queues a message for the event loop,
    // which cannot run until this command returns. So every old label is still
    // taken at this point and `create_window` would skip all of them. Then on
    // the *next* reload, with the labels finally free, it would build a WebView2
    // window from inside the settings window's own WebView2 callback — and
    // WebView2 does not deliver a creation callback while another callback is on
    // the stack, so that call never returns and the entire main thread stops.
    post_rebuild(app, states(app));

    Ok(())
}

/// Re-reads the folder into the live plugin list.
fn discover_into(plugins: &Arc<Plugins>) {
    plugins.replace(discover());
}

/// Ordinary and browser widgets use different label namespaces so capabilities
/// cannot accidentally merge.
fn window_label(id: &str, widget: &manifest::WidgetContribution) -> String {
    let prefix = if widget.browser.is_some() {
        browser::BROWSER_LABEL_PREFIX
    } else {
        LABEL_PREFIX
    };
    format!("{prefix}{id}:{}", widget.key)
}

/// Builds one plugin window, in the state the user last left it.
///
/// The two flags are read here rather than passed in, and that is the fix for a
/// pair of bugs that looked unrelated. Windows were always built hidden and the
/// settings page kept its own record of which ones should be showing, so on
/// every launch the switches said "shown" over windows that were not — and
/// nothing the user clicked could reconcile them, because clicking a switch that
/// already reads `true` turns it off. Reading `desktime.visible.<label>` and
/// `desktime.pinned.<label>` — the *same* two keys a built-in widget uses —
/// makes the window and the switch the same fact.
fn create_window<R: Runtime>(
    app: &AppHandle<R>,
    manifest: &Manifest,
    widget: &manifest::WidgetContribution,
) {
    let label = window_label(&manifest.id, widget);
    if app.get_webview_window(&label).is_some() {
        return;
    }

    let config = app.try_state::<crate::config::Config>();
    // Never recorded means: hidden, and on top. A plugin window nobody has asked
    // for should not appear on the desktop, and everything is built on top.
    let visible = config
        .as_ref()
        .and_then(|config| config.window_visible(&label))
        .unwrap_or(false);
    let pinned = config
        .as_ref()
        .and_then(|config| config.window_pinned(&label))
        .unwrap_or(true);

    // `plugin://<id>/<entry>` rather than a file path: it gives each plugin its
    // own origin (so localStorage and CSP are per-plugin) and puts every path
    // check in the protocol handler. A browser widget starts on the site it
    // declared instead, and its own page is what it falls back to.
    let url = match widget.browser.as_ref().and_then(|browser| browser.initial_url.clone()) {
        Some(initial) => initial,
        None => format!("plugin://{}/{}", manifest.id, widget.entry.replace('\\', "/")),
    };
    let Ok(parsed) = url.parse() else {
        return;
    };

    let registry = app
        .try_state::<Arc<browser::BrowserRegistry>>()
        .map(|state| Arc::clone(&state));
    let browser_token = widget.browser.as_ref().zip(registry.as_ref()).and_then(
        |(browser, registry)| {
            registry
                .register(&label, browser.allowed_origins.clone())
                .ok()
        },
    );
    let injection = widget
        .browser
        .as_ref()
        .and_then(|browser| browser.injection.as_deref())
        .and_then(|relative| manifest::resolve_inside(&dir().join(&manifest.id), relative))
        .and_then(|path| std::fs::read_to_string(path).ok());

    let mut builder =
        tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::External(parsed))
            .title(&widget.name)
            .inner_size(widget.size.width, widget.size.height)
            // Always built hidden, whatever the caller wants in the end: the
            // stored geometry can only be applied once the window exists, and a
            // window shown first would appear at the manifest's coordinates and
            // then jump to the user's. Same reasoning as `startup::restore_geometry`.
            .visible(false)
            .resizable(widget.resizable)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .always_on_top(pinned)
            .skip_taskbar(true)
            .initialization_script(&init_script(
                manifest,
                widget,
                browser_token.as_deref(),
                injection.as_deref(),
            ))
            .additional_browser_args(crate::startup::BROWSER_ARGS);

    if let Some(min) = widget.min_size {
        builder = builder.min_inner_size(min.width, min.height);
    }

    if let Some((browser, registry)) = widget.browser.as_ref().zip(registry.clone()) {
        let profile = profile_dir(&manifest.id, &widget.key);
        // "Not persistent" still means isolated: the folder is cleared rather
        // than shared with anything else.
        if !browser.persist_profile {
            let _ = std::fs::remove_dir_all(&profile);
        }
        builder = builder.data_directory(profile);

        // The check that actually keeps the window on the sites it declared.
        // The bridge below covers navigations the page *asks* for; this one
        // covers the ones it simply performs — a link, a redirect, a
        // `location =` — which is most of them.
        let watched = label.clone();
        builder = builder.on_navigation(move |url| registry.permits_navigation(&watched, url));
    }

    let Ok(window) = builder.build() else {
        return;
    };

    geometry::restore(app, &window);

    // "Unpinned" is behind everything, not merely not-on-top — the same two
    // steps `applyPanelPin` takes for a built-in widget.
    if !pinned {
        let _ = window.set_always_on_bottom(true);
        let _ = crate::platform::set_window_to_bottom(&window);
    }

    // Watched from here because a plugin page cannot do it: a built-in widget
    // saves its own position from `App.tsx`, and this window is running somebody
    // else's HTML.
    let handle = app.clone();
    let watched = label.clone();
    window.on_window_event(move |event| match event {
        tauri::WindowEvent::Moved(position) => {
            geometry::remember_position(&handle, &watched, position)
        }
        tauri::WindowEvent::Resized(size) => geometry::remember_size(&handle, &watched, size),
        // The token dies with the window. A label can be reused by the next
        // window under the same name, and it must not inherit the last one's
        // authority.
        tauri::WindowEvent::Destroyed => {
            if let Some(registry) = handle.try_state::<Arc<browser::BrowserRegistry>>() {
                registry.unregister(&watched);
            }
        }
        _ => {}
    });

    if visible {
        show(&window);
    }
}

/// Shows a plugin window whether or not the visibility policy has claimed it yet.
///
/// The policy registers a window on `on_webview_ready`, and whether that has
/// happened by the time a caller wants the window on screen is a race not worth
/// depending on. Registered: it has to be told before the OS call or it rejects
/// the show, which is the whole point of it. Not registered: nothing intercepts
/// anything and a plain show is exactly right.
fn show<R: Runtime>(window: &tauri::WebviewWindow<R>) {
    if crate::platform::set_window_visibility(window, true).is_err() {
        let _ = window.show();
    }
}

/// Starts a plugin's backend if it has one and it is not already up.
pub fn ensure_backend<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<(), String> {
    let plugins = app
        .try_state::<Arc<Plugins>>()
        .ok_or_else(|| "plugins are not loaded".to_owned())?
        .inner()
        .clone();

    let manifest = plugins
        .manifest_of(id)
        .ok_or_else(|| format!("no plugin called {id}"))?;
    if manifest.backend.is_none() {
        return Ok(());
    }

    let mut running = plugins
        .running
        .lock()
        .map_err(|_| "plugin state poisoned".to_owned())?;
    let entry = running.entry(id.to_owned()).or_default();

    if entry.failed {
        return Err("backend has failed too many times".to_owned());
    }
    // A process that has exited leaves its handle behind; treat that as absent.
    if entry.process.as_mut().is_some_and(|process| !process.has_exited()) {
        return Ok(());
    }

    if entry.process.is_some() {
        entry.restarts += 1;
        if entry.restarts > MAX_RESTARTS {
            entry.failed = true;
            entry.process = None;
            return Err("backend has failed too many times".to_owned());
        }
    }

    let handle = app.clone();
    let plugin_dir = dir().join(id);
    let process = BackendProcess::spawn(&manifest, &plugin_dir, log_path(id), move |event| {
        // Delivered straight into that plugin's own windows rather than emitted
        // app-wide. Isolation then costs nothing and depends on nothing: a
        // plugin is not asked to ignore other plugins' events, it never receives
        // them. The SDK turns this into `sdk.on(name, handler)`.
        let detail = serde_json::json!({
            "plugin": event.plugin,
            "name": event.name,
            "payload": event.payload,
        });
        let script = format!(
            "window.dispatchEvent(new CustomEvent('desktime-plugin-event',{{detail:{detail}}}))"
        );

        for (label, window) in handle.webview_windows() {
            if label_belongs_to(&label, &event.plugin) {
                let _ = window.eval(&script);
            }
        }
    })?;

    entry.process = Some(process);
    Ok(())
}

/// Routes one call from a plugin's webview to that plugin's backend.
pub fn call<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    ensure_backend(app, id)?;

    let plugins = app
        .try_state::<Arc<Plugins>>()
        .ok_or_else(|| "plugins are not loaded".to_owned())?
        .inner()
        .clone();

    let mut running = plugins
        .running
        .lock()
        .map_err(|_| "plugin state poisoned".to_owned())?;
    let process = running
        .get_mut(id)
        .and_then(|entry| entry.process.as_mut())
        .ok_or_else(|| format!("{id} has no backend running"))?;

    // Namespaced so a plugin method can never collide with `initialize` or
    // `shutdown`, whoever writes the backend.
    process.call(&format!("plugin/{method}"), params)
}

/// Stops every backend. Called on exit.
pub fn shutdown<R: Runtime>(app: &AppHandle<R>) {
    let Some(plugins) = app.try_state::<Arc<Plugins>>() else {
        return;
    };
    // Cloned out of the state guard: holding the guard across the shutdown would
    // keep a borrow of `app` alive for the whole of it.
    let plugins = plugins.inner().clone();

    let Ok(mut running) = plugins.running.lock() else {
        return;
    };

    for entry in running.values_mut() {
        if let Some(process) = entry.process.as_mut() {
            process.shutdown();
        }
    }
    running.clear();
}

/// Serves `plugin://<id>/<path>` out of that plugin's folder.
///
/// Registered on the builder, so it is the only way a plugin page can reach a
/// file. Three things are settled here and nowhere else:
///
/// 1. **Escapes.** Every path goes through `resolve_inside`, which canonicalises
///    and then proves the result is still under the plugin folder. `../` and a
///    symlink both look ordinary as text and both leave the directory.
/// 2. **Identity.** The host is the plugin id, so each plugin gets its own
///    origin — and with it its own localStorage, which `file://` would not give.
/// 3. **Content type.** Guessed from the extension; a stylesheet served as
///    `application/octet-stream` is simply ignored by the webview, with no error
///    anywhere.
pub fn protocol_handler(request: tauri::http::Request<Vec<u8>>) -> tauri::http::Response<Vec<u8>> {
    fn not_found() -> tauri::http::Response<Vec<u8>> {
        tauri::http::Response::builder()
            .status(404)
            .body(Vec::new())
            .unwrap_or_default()
    }

    let uri = request.uri();
    let Some(id) = uri.host() else {
        return not_found();
    };
    if !manifest::is_safe_id(id) {
        return not_found();
    }

    let relative = uri.path().trim_start_matches('/');
    let Some(path) = manifest::resolve_inside(&dir().join(id), relative) else {
        return not_found();
    };

    let Ok(body) = std::fs::read(&path) else {
        return not_found();
    };

    let content_type = match path.extension().and_then(|kind| kind.to_str()) {
        Some("html") => "text/html; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("js") => "text/javascript; charset=utf-8",
        Some("json") => "application/json; charset=utf-8",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("woff2") => "font/woff2",
        _ => "application/octet-stream",
    };

    tauri::http::Response::builder()
        .header("Content-Type", content_type)
        .body(body)
        .unwrap_or_else(|_| not_found())
}

/// The JS injected into every plugin window before its own scripts run.
///
/// Injected rather than shipped as a file the plugin imports: a plugin cannot
/// then forget it, cannot load an old copy, and cannot pretend to be a different
/// plugin — `pluginId` is baked in here by the host, per window. The chrome
/// switches ride along for the same reason: a page cannot give itself a shell
/// its manifest did not ask for.
/// What runs before anything on the page does.
///
/// A browser widget gets a different script from an ordinary one, and that is
/// the point rather than an optimisation: the SDK calls `plugin_*` commands
/// that a `plugin-browser:*` window is not granted, so shipping it to a remote
/// page would only teach that page the names of commands it cannot call.
fn init_script(
    manifest: &Manifest,
    widget: &manifest::WidgetContribution,
    browser_token: Option<&str>,
    injection: Option<&str>,
) -> String {
    match browser_token {
        Some(token) => browser_script(token, injection.unwrap_or_default()),
        None => sdk_script(manifest, widget),
    }
}

/// The bridge, and the plugin's own script, inside one closure.
///
/// **The top-frame guard is load-bearing.** An initialisation script runs in
/// every frame WebView2 creates, including third-party advertising iframes, so
/// without the first line the token would be handed to whatever an ad network
/// decided to embed today. Returning before anything is defined leaves those
/// frames with no bridge and no plugin script at all.
fn browser_script(token: &str, injection: &str) -> String {
    let quoted = serde_json::to_string(token).unwrap_or_else(|_| "\"\"".to_owned());
    format!(
        "(function(){{\n\
         if (window.top !== window) return;\n\
         const token = {quoted};\n\
         Object.defineProperty(window, 'desktimeBrowser', {{ value: Object.freeze({{\n\
           control: (action, payload, url) => window.__TAURI_INTERNALS__.invoke('browser_widget_control', {{ request: {{ token, action, url: url ?? null, payload: payload ?? null }} }})\n\
         }}), writable: false, configurable: false }});\n\
         try {{\n{injection}\n}} catch (error) {{ console.error('[desktime] plugin script failed', error); }}\n\
         }})();"
    )
}

fn sdk_script(
    manifest: &Manifest,
    widget: &manifest::WidgetContribution,
) -> String {
    // A plain substitution rather than `format!`: the SDK is real JavaScript
    // that has to stay readable and lintable, and every brace in it would need
    // doubling to survive a format string.
    let quoted = serde_json::to_string(&manifest.id).unwrap_or_else(|_| "\"\"".to_owned());
    let chrome = serde_json::json!({
        "drag": widget.chrome.drag,
        // Resolved here rather than in the SDK: a grip on a window the manifest
        // declared fixed is a handle that does nothing, and the two facts live
        // in the same file, so they are reconciled where they are both known.
        "resize": widget.chrome.resize && widget.resizable,
        "close": widget.chrome.close,
        "pin": widget.chrome.pin,
    });

    include_str!("sdk.js")
        .replace("__PLUGIN_ID__", &quoted)
        .replace("__PLUGIN_CHROME__", &chrome.to_string())
}

#[cfg(test)]
mod tests {
    use std::str::FromStr;

    use tauri::utils::acl::RemoteUrlPattern;
    use tauri::Url;

    /// The capability has to name the URL a plugin page is *on*, which is not
    /// the URL it was given.
    ///
    /// WebView2 cannot register a non-standard scheme, so wry rewrites one:
    /// `<scheme>://` becomes `http://<scheme>.`, and it is reversed again before
    /// the request reaches our protocol handler
    /// (`wry::custom_protocol_workaround`). The handler therefore sees exactly
    /// what it expects and the page loads — but the *page* keeps the rewritten
    /// URL, and Tauri reads that one to decide whether an IPC call is local or
    /// remote. `http://plugin.system-monitor/...` is neither the app URL nor
    /// `<something>.localhost`, so every plugin page is remote, and a capability
    /// that does not say so refuses every command it makes.
    ///
    /// That failure is invisible from the Rust side: nothing logs, nothing
    /// panics, the widget simply sits there while the console says "not allowed
    /// by ACL". Hence a test rather than a comment.
    #[test]
    fn the_capability_covers_the_url_a_plugin_page_really_has() {
        for url in [
            // What the window is actually on, on Windows.
            "http://plugin.system-monitor/web/index.html",
            "https://plugin.system-monitor/web/index.html",
            // And what it would be if that workaround ever went away.
            "plugin://system-monitor/web/index.html",
        ] {
            assert!(
                matches_remote(include_str!("../../capabilities/plugins.json"), url),
                "nothing in the plugin capability's remote urls matches {url}"
            );
        }
    }

    /// A browser widget can fall back to its own page — a failed navigation, or
    /// a manifest with no `initialUrl` — and on that page it still has to be
    /// able to reach the bridge.
    #[test]
    fn the_browser_capability_covers_the_plugins_own_page_too() {
        let capability = include_str!("../../capabilities/plugin-browser.json");
        for url in [
            "http://plugin.video-player/web/index.html",
            "https://plugin.video-player/web/index.html",
            "plugin://video-player/web/index.html",
        ] {
            assert!(matches_remote(capability, url), "{url} is not covered");
        }
    }

    /// The bridge is granted to the sites the plugin exists for, and to nothing
    /// else it is merely allowed to visit.
    ///
    /// Logging in has to work, so `accounts.google.com` is in the manifest's
    /// navigation allowlist — but a login provider has no business being able
    /// to resize or move a DeskTime window, so it is deliberately absent here.
    #[test]
    fn a_login_provider_can_be_visited_and_cannot_call_anything() {
        let capability = include_str!("../../capabilities/plugin-browser.json");
        assert!(matches_remote(capability, "https://www.bilibili.com/video/BV1"));
        assert!(!matches_remote(capability, "https://accounts.google.com/signin"));
        assert!(!matches_remote(capability, "https://passport.bilibili.com/login"));
        // And nothing outside either list.
        assert!(!matches_remote(capability, "https://example.test/"));
    }

    fn matches_remote(capability: &str, url: &str) -> bool {
        let capability: serde_json::Value =
            serde_json::from_str(capability).expect("the capability is valid JSON");
        let patterns: Vec<RemoteUrlPattern> = capability["remote"]["urls"]
            .as_array()
            .expect("the capability declares remote urls")
            .iter()
            .map(|url| {
                RemoteUrlPattern::from_str(url.as_str().expect("a string"))
                    .expect("a valid url pattern")
            })
            .collect();

        let parsed = Url::parse(url).expect("a valid url");
        patterns.iter().any(|pattern| pattern.test(&parsed))
    }
}
