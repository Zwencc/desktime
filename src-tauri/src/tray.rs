use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};

/// The one tray icon, by id, so [`rebuild`] can find it rather than make another.
const TRAY_ID: &str = "desktime-tray";

/// The right-click menu, in the language currently configured.
///
/// Built fresh each time rather than by keeping three `MenuItem` handles and
/// setting their text: it is three items and a separator, and a rebuilt menu
/// cannot get out of step with itself.
fn menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let text = crate::i18n::strings(app);
    let show = MenuItem::with_id(app, "show_all", text.show_all, true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide_all", text.hide_all, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", text.quit, true, None::<&str>)?;

    Menu::with_items(
        app,
        &[&show, &hide, &PredefinedMenuItem::separator(app)?, &quit],
    )
}

/// Builds the system tray icon and its right-click menu (show / hide / quit).
///
/// Called once, at startup. A language change goes through [`rebuild`], which
/// deliberately does not come back here.
pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let menu = menu(app)?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("DeskTime")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show_all" => set_all_visibility(app, true),
            "hide_all" => set_all_visibility(app, false),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                set_all_visibility(tray.app_handle(), true);
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder.build(app)?;
    Ok(())
}

/// Puts the tray menu into the language the frontend just switched to.
///
/// The tray is created before the frontend has said anything, so on the very
/// first run it carries whatever `config.json` held — and the moment the user
/// picks a different language, this puts the menu in it without a restart.
///
/// **Only the menu is replaced.** This used to hide the existing icon and build
/// a second one, and hiding a tray icon is not removing it: every language
/// change left another DeskTime sitting in the notification area, so trying a
/// few of them in one session ended with a row of identical icons. The icon
/// itself never needs to change — three strings inside it do.
pub fn rebuild<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        // Nothing to update yet, which can only mean the tray has not been
        // built. Building it is then exactly the right answer.
        return build(app);
    };

    // The handler installed by `build` matches on the item ids, and those are
    // unchanged, so swapping the menu does not disturb it.
    tray.set_menu(Some(menu(app)?))
}

// Derived from the live window list rather than a hard-coded one, so a new
// widget joins show-all / hide-all without touching the tray.
fn set_all_visibility<R: Runtime>(app: &AppHandle<R>, visible: bool) {
    for (label, window) in app.webview_windows() {
        if crate::platform::is_app_driven(&label) {
            continue;
        }
        if let Err(error) = crate::platform::set_window_visibility(&window, visible) {
            eprintln!("failed to set {label} visibility from tray: {error}");
        }
    }
}
