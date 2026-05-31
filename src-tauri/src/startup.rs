//! Window geometry at startup.
//!
//! Every widget window used to place itself from the frontend, in an effect
//! that could only run once WebView2 had initialised, the bundle had loaded,
//! `hydrateConfig()` had made its round trip and React had mounted. Until then
//! the window sat at whatever `tauri.conf.json` said — so every launch showed
//! the widget appear at the config's coordinates in the config's size and then
//! jump to the user's. The gap was long enough to see on every single start.
//!
//! The values were available the whole time: `config.json` is a mirror of
//! localStorage, so the backend already holds `desktime.windowPosition.<label>`
//! and `desktime.windowSize.<label>` after `Config::load()`. Applying them here
//! costs nothing and happens while the window is still hidden, which is what
//! makes it invisible — widget windows are created with `visible: false` and
//! are shown by the frontend once it is ready.
//!
//! What stays in the frontend is the first run, which has no stored geometry
//! and needs the work area of the monitor the window landed on to resolve an
//! anchor into coordinates. That is a question about screens, not about config.

use std::time::Duration;

use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

use crate::config::Config;

pub const LAUNCHER_LABEL: &str = "launcher";
pub const MENU_LABEL: &str = "menu";

/// WebView2 instances that share a user-data folder must be launched with
/// identical browser arguments, and setting the field at all overrides Tauri's
/// own defaults — so those are repeated here. One constant rather than a copy
/// per window: the requirement is byte equality, and ten hand-kept copies of a
/// long string is a typo waiting to become a window that will not load.
///
/// **The three background-throttling switches are deliberately not here.**
/// `--disable-background-timer-throttling`, `--disable-renderer-backgrounding`
/// and `--disable-backgrounding-occluded-windows` kept every hidden and
/// covered window running its timers at full rate, which is most of them most
/// of the time. Nothing needs that any more: the reminders that once did are
/// scheduled in Rust precisely because a webview cannot be trusted to keep
/// time, and the two frontend clocks that survive a throttled window — the
/// vault's idle lock and the earnings counter — each recompute from a
/// timestamp rather than adding up their own ticks. A throttled window loses
/// smoothness there and never correctness. Putting these back would cost nine
/// windows' worth of CPU to buy something no caller asks for.
pub const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";

/// How long after the widgets are up before the rest are built. Long enough that
/// the two do not compete for the disk and the CPU, short enough that a user who
/// goes straight for the settings button still finds the window waiting.
const DEFER_BY: Duration = Duration::from_secs(2);

/// A window that is not needed to show a desktop widget.
///
/// These used to be declared in tauri.conf.json alongside the widgets, which
/// meant ten WebView2 instances all loading the same bundle at once on every
/// launch — while the only windows anyone was waiting to see were the four
/// widgets. Most of these are never opened at all in a given session.
///
/// The reminder window is deliberately **not** here. It is shown by the backend
/// at a moment nobody chose, and a Tauri event emitted at a webview that has not
/// finished mounting is simply lost — so it keeps its place in the config and is
/// alive before the first reminder can possibly fire.
struct Deferred {
    label: &'static str,
    title: &'static str,
    width: f64,
    height: f64,
    min_size: Option<(f64, f64)>,
    resizable: bool,
    center: bool,
    /// Whether to build this one shortly after launch rather than waiting for
    /// somebody to ask for it.
    ///
    /// The line is the one `panels.ts` already draws for closing: a window that
    /// has to appear the instant it is asked for cannot afford to be built
    /// then. The menu answers a right click and the launcher answers a global
    /// hotkey, and a WebView2 taking a moment to come up would be read as the
    /// click having missed. Settings and DevTools are opened deliberately, are
    /// destroyed rather than hidden when closed, and are the two biggest
    /// windows in the app — so they are built when wanted and cost nothing in
    /// the sessions, which are most of them, where nobody opens either.
    eager: bool,
}

const DEFERRED: &[Deferred] = &[
    Deferred {
        label: MENU_LABEL,
        title: "DeskTime Menu",
        width: 220.0,
        height: 260.0,
        min_size: None,
        resizable: false,
        center: false,
        eager: true,
    },
    Deferred {
        label: "settings",
        title: "DeskTime Settings",
        width: 900.0,
        height: 800.0,
        min_size: Some((640.0, 360.0)),
        resizable: true,
        center: false,
        eager: false,
    },
    Deferred {
        label: LAUNCHER_LABEL,
        title: "DeskTime Launcher",
        width: 560.0,
        height: 420.0,
        min_size: None,
        resizable: false,
        center: true,
        eager: true,
    },
    Deferred {
        label: "devtools",
        title: "DeskTime DevTools",
        width: 560.0,
        height: 760.0,
        min_size: Some((440.0, 400.0)),
        resizable: true,
        center: false,
        eager: false,
    },
];

/// Builds the *eager* deferred windows once the widgets have had the machine
/// to themselves for a moment.
///
/// Nothing depends on this having finished: every path that opens one of these
/// windows goes through [`ensure_window`], which builds it on the spot if the
/// timer has not got there yet. This only makes the common case free.
///
/// The windows left out of it — settings and DevTools — are not built until
/// somebody opens one. They are the two biggest in the app, and a WebView2 that
/// nobody has asked for is a renderer process holding a hundred megabytes to
/// show a page nobody is looking at.
pub fn spawn_deferred_windows<R: Runtime>(app: &AppHandle<R>) {
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(DEFER_BY);
        // Windows are created on the thread that owns the event loop; building
        // one from this thread is undefined behaviour waiting to be observed.
        let _ = handle.clone().run_on_main_thread(move || {
            for spec in DEFERRED.iter().filter(|spec| spec.eager) {
                if handle.get_webview_window(spec.label).is_none() {
                    build(&handle, spec);
                }
            }
        });
    });
}

/// The window with this label, building it first if it does not exist yet.
///
/// Callers must go through this rather than `get_webview_window`: for an eager
/// window "not there" lasts the first couple of seconds of a run, and for
/// settings and DevTools it is the normal state — they are built when opened
/// and destroyed when closed, so a null from `get_webview_window` means the
/// window has not been made yet, never that the label is wrong.
pub fn ensure_window<R: Runtime>(app: &AppHandle<R>, label: &str) -> Option<WebviewWindow<R>> {
    if let Some(window) = app.get_webview_window(label) {
        return Some(window);
    }

    let spec = DEFERRED.iter().find(|spec| spec.label == label)?;
    build(app, spec)
}

fn build<R: Runtime>(app: &AppHandle<R>, spec: &Deferred) -> Option<WebviewWindow<R>> {
    let url = WebviewUrl::App(format!("/?panel={}", spec.label).into());
    let mut builder = WebviewWindowBuilder::new(app, spec.label, url)
        .title(spec.title)
        .inner_size(spec.width, spec.height)
        .visible(false)
        .focused(false)
        .resizable(spec.resizable)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .additional_browser_args(BROWSER_ARGS);

    if let Some((width, height)) = spec.min_size {
        builder = builder.min_inner_size(width, height);
    }
    if spec.center {
        builder = builder.center();
    }

    builder.build().ok()
}

/// Restores every widget window's last position and size before it is shown.
///
/// App-driven windows (menu, reminder, settings, launcher, devtools) are skipped
/// for the same reason they are skipped everywhere else: they are opened by the
/// app at a moment and a place of its choosing, and none of them persist
/// geometry, so there is nothing to restore.
pub fn restore_geometry<R: Runtime>(app: &AppHandle<R>, config: &Config) {
    let island = config.island_geometry();

    for (label, window) in app.webview_windows() {
        if crate::platform::is_app_driven(&label) {
            continue;
        }

        // The moo clock in its island shape places itself and is left out of
        // ordinary position persistence, so its geometry is stored whole and
        // restored whole. Falling through to the window keys instead would put
        // the strip back at the floating window's corner and size.
        if label == "moo" {
            if let Some(geometry) = &island {
                // The strip is far shorter than the floating widget's minimum,
                // and a minimum a window cannot satisfy is silently clamped —
                // which would restore a 300px-tall invisible band across the top
                // of the screen, swallowing clicks. The frontend clears this too,
                // on entering the shape; it has to be gone before the resize.
                let _ = window.set_min_size(None::<PhysicalSize<u32>>);
                let _ = window.set_size(PhysicalSize::new(geometry.width, geometry.height));
                let _ = window.set_position(PhysicalPosition::new(geometry.x, geometry.y));
                continue;
            }
        }

        // Size before position, matching the frontend's order: on Windows a
        // resize can nudge a window that would otherwise overhang a monitor
        // edge, so the position has to be applied to the final size.
        if let Some(size) = config.window_size(&label) {
            let _ = window.set_size(PhysicalSize::new(size.width, size.height));
        }

        if let Some(position) = config.window_position(&label) {
            let _ = window.set_position(PhysicalPosition::new(position.x, position.y));
        }
    }
}
