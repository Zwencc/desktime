//! Global shortcut registration.
//!
//! A global hotkey belongs to the *process*, not to a window, so it can only be
//! registered once. That used to be arranged by giving the job to one window and
//! agreeing the others would keep their hands off — and the window chosen was
//! the launcher, because it was the one that had to be alive for its own hotkey
//! to mean anything.
//!
//! The cost of that arrangement was hidden until startup was measured: it made
//! the launcher a window that could never be created lazily, and creating it
//! eagerly means a whole extra WebView2 instance loading the bundle while the
//! widgets are still trying to appear. Registration therefore lives here now,
//! and the launcher is created on demand like every other app-driven window.
//!
//! **What did not move is the table.** Which shortcuts exist, what they default
//! to, how a recorded key is spelled and which two of them clash are questions
//! about the interface, and they stay in `shortcuts.ts`. The frontend resolves
//! all of that and hands over a finished list; this module registers it, carries
//! it out, and says which ones the OS refused. It is the same split as the
//! reminder scheduler: the frontend owns the plan, the backend owns the
//! mechanism.
//!
//! # Why the *action* is here as well
//!
//! Registration alone was not enough. A press used to be broadcast to the
//! webview that had agreed to run the actions, which meant every hotkey went
//! through a WebView2 instance that had usually been hidden and idle for hours -
//! and WebView2 suspends those. The symptom was exactly the one reported: the
//! shortcut for a widget nobody had touched all afternoon did nothing, or
//! answered seconds later.
//!
//! This is the same trap `reminder/` was pulled out of, for the same reason, so
//! it gets the same answer. The window is shown, hidden or pinned from here,
//! against state read out of `config.json` - which the frontend mirrors
//! everything into anyway. The webviews are still told what happened, but only
//! so their own copy of the state catches up; nothing waits for them, and a
//! suspended one now costs a stale checkbox rather than a dead key.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::config::{PINNED_PREFIX, VISIBLE_PREFIX};

/// The one action handled entirely in the backend. Everything else needs widget
/// state that only the frontend has.
pub const LAUNCHER_ID: &str = "launcher";

/// Carries the id of the action whose key was pressed. Broadcast rather than
/// addressed, so this module does not need to know which window has agreed to
/// run them — see `SHORTCUT_HOST` in App.tsx.
const FIRE_EVENT: &str = "shortcut://fire";

#[derive(Deserialize)]
pub struct ShortcutBinding {
    pub id: String,
    pub accelerator: String,
    /// What to do when it fires. Absent for the launcher, which this module
    /// answers itself, and for anything the frontend has not taught it yet.
    #[serde(default)]
    pub action: Option<Action>,
}

/// One widget as an action refers to it.
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WidgetRef {
    /// Window label.
    pub label: String,
    /// The state to assume when `config.json` has never recorded one.
    ///
    /// It travels with the action because it is the *registry's* default - see
    /// `defaultVisible` and `defaultPinned` in widgets.ts - and the registry is
    /// a frontend file. A widget that starts hidden is only distinguishable
    /// from one that has never been written down by asking the side that knows.
    pub fallback: bool,
}

/// The actions a hotkey can carry out. Deliberately a closed set: these are the
/// two the shortcut table offers, and a general "run this" would put the
/// frontend in charge of what the backend does to windows.
#[derive(Deserialize, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Action {
    /// Flip one widget between always-on-top and sunk-to-the-bottom.
    Pin { widget: WidgetRef },
    /// Bring on the first of these that is hidden, and hide the others.
    ///
    /// The list is a mutex group from the registry, in the order the frontend
    /// wants them cycled - which is why "neither is on screen" lands on the
    /// first entry rather than needing a rule of its own.
    Swap { widgets: Vec<WidgetRef> },
}

/// A `desktime.*` key and its new value, for the frontend to mirror back into
/// localStorage. The action has already happened by the time this is sent.
#[derive(Clone, Serialize)]
pub struct StateChange {
    pub key: String,
    pub value: String,
}


/// Carries the state the backend just changed. Named apart from `shortcut://fire`
/// because it is not a request to do anything - the doing is finished.
const APPLIED_EVENT: &str = "shortcut://applied";

/// Replaces the whole registration and returns the ids that did not take.
///
/// A full replace rather than a diff, for the same reason `sync_reminders` is:
/// the frontend already knows the complete list, and reconciling two of them
/// here would be a second place for the truth to live. It is also what makes
/// "stand down while the settings window records a key" a plain call with an
/// empty list — a registered hotkey never reaches the webview that is waiting
/// to hear it.
///
/// Failure is reported, never logged and forgotten: registration fails when
/// another application already owns the key, and the symptom is a shortcut that
/// silently does nothing forever.
pub fn sync<R: Runtime>(app: &AppHandle<R>, bindings: Vec<ShortcutBinding>) -> Vec<String> {
    let manager = app.global_shortcut();
    let _ = manager.unregister_all();

    let mut failed = Vec::new();
    let mut taken: Vec<String> = Vec::new();

    for binding in bindings {
        if binding.accelerator.is_empty() {
            continue;
        }

        // Two actions on one key: the OS would accept the second registration
        // and hand the press to whichever handler it liked, so the duplicate is
        // refused here instead.
        if taken.contains(&binding.accelerator) {
            failed.push(binding.id);
            continue;
        }

        let id = binding.id.clone();
        let action = binding.action.clone();
        let handle = app.clone();
        let bound = manager.on_shortcut(binding.accelerator.as_str(), move |_app, _key, event| {
            // Both edges are reported; acting on both would run every action
            // twice, which for a toggle means not at all.
            if event.state() == ShortcutState::Pressed {
                fire(&handle, &id, action.as_ref());
            }
        });

        match bound {
            Ok(()) => taken.push(binding.accelerator),
            Err(_) => failed.push(binding.id),
        }
    }

    failed
}

fn fire<R: Runtime>(app: &AppHandle<R>, id: &str, action: Option<&Action>) {
    if id == LAUNCHER_ID {
        show_launcher(app);
        return;
    }

    let Some(action) = action else {
        // No action attached: an older frontend, or one that has not synced
        // since this was added. Broadcasting is what it expects, and it still
        // knows how to run the shortcut itself.
        let _ = app.emit(FIRE_EVENT, id);
        return;
    };

    let changes = apply(app, action);
    if changes.is_empty() {
        return;
    }

    // Written here rather than left to the frontend to write back: the file is
    // what the next launch restores from, and a suspended webview must not be
    // able to lose the change that has already happened on screen.
    remember(app, &changes);
    let _ = app.emit(APPLIED_EVENT, changes);
}

/// Carries out one action and answers with the state it changed.
fn apply<R: Runtime>(app: &AppHandle<R>, action: &Action) -> Vec<StateChange> {
    match action {
        Action::Pin { widget } => {
            let next = !flag(app, PINNED_PREFIX, widget);
            if set_pinned(app, &widget.label, next).is_none() {
                return Vec::new();
            }

            vec![StateChange {
                key: format!("{PINNED_PREFIX}{}", widget.label),
                value: next.to_string(),
            }]
        }

        Action::Swap { widgets } => {
            // The first one that is off screen is the one being asked for. With
            // a pair that is the plain swap; with none of them showing it is the
            // first, which is the frontend's own choice of where to start.
            let target = widgets
                .iter()
                .position(|widget| !flag(app, VISIBLE_PREFIX, widget))
                .unwrap_or(0);

            let mut changes = Vec::new();
            // Shown before the others are hidden, so a swap never leaves the
            // desktop briefly empty - the same order `requestVisibility` uses.
            for (index, widget) in widgets
                .iter()
                .enumerate()
                .filter(|(index, _)| *index == target)
                .chain(widgets.iter().enumerate().filter(|(index, _)| *index != target))
            {
                let visible = index == target;
                if flag(app, VISIBLE_PREFIX, widget) == visible {
                    continue;
                }
                let Some(window) = app.get_webview_window(&widget.label) else {
                    continue;
                };
                if crate::platform::set_window_visibility(&window, visible).is_err() {
                    continue;
                }

                changes.push(StateChange {
                    key: format!("{VISIBLE_PREFIX}{}", widget.label),
                    value: visible.to_string(),
                });
            }

            changes
        }
    }
}

/// Pinned and unpinned are two active modes, not on and off: an unpinned widget
/// is pushed behind other applications so it behaves like a desktop gadget.
/// Mirrors `applyPanelPin` in panels.ts, which is still the path the UI uses.
fn set_pinned<R: Runtime>(app: &AppHandle<R>, label: &str, pinned: bool) -> Option<()> {
    let window = app.get_webview_window(label)?;

    if pinned {
        let _ = window.set_always_on_bottom(false);
        let _ = window.set_always_on_top(true);
        return Some(());
    }

    let _ = window.set_always_on_top(false);
    let _ = window.set_always_on_bottom(true);
    let _ = crate::platform::set_window_to_bottom(&window);
    Some(())
}

/// One boolean out of the config mirror, or the registry default the frontend
/// sent along when the file has never held it.
fn flag<R: Runtime>(app: &AppHandle<R>, prefix: &str, widget: &WidgetRef) -> bool {
    let Some(config) = app.try_state::<crate::config::Config>() else {
        return widget.fallback;
    };

    match config.raw(&format!("{prefix}{}", widget.label)) {
        // Stored by the frontend as `String(boolean)`, and read back the way it
        // reads it: anything that is not the word "false" counts as true.
        Some(raw) => raw != "false",
        None => widget.fallback,
    }
}

fn remember<R: Runtime>(app: &AppHandle<R>, changes: &[StateChange]) {
    let Some(config) = app.try_state::<crate::config::Config>() else {
        return;
    };

    let _ = config.apply(
        changes
            .iter()
            .map(|change| crate::config::ConfigEntry {
                key: change.key.clone(),
                value: Some(change.value.clone()),
            })
            .collect(),
    );
}

/// The launcher is app-driven and created on demand, so the hotkey has to be
/// able to summon a window that may not exist yet.
///
/// **Off this thread, and that is the whole point of the spawn.**
/// `global-hotkey` dispatches `WM_HOTKEY` straight from the window procedure of
/// a message window it builds during plugin setup — on the main thread. Calling
/// `ensure_window` from there would build a WebView2 inside the event loop
/// callback, which wedges every webview's IPC until it finishes. The window
/// only has to be built at all in the first seconds of a run, before the
/// deferred pass reaches it, so the cost of the thread is paid almost never and
/// the hang it avoids would look like the whole app freezing. See
/// `commands::window::ensure_window` for the same reason written out in full.
fn show_launcher<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    std::thread::spawn(move || {
        let Some(window) = crate::startup::ensure_window(&app, crate::startup::LAUNCHER_LABEL)
        else {
            return;
        };

        let _ = window.show();
        let _ = window.set_focus();
    });
}
