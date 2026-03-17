use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};

const PANELS: [&str; 3] = ["clock", "note", "schedule"];

/// Builds the system tray icon and its right-click menu (show / hide / quit).
pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show_all", "显示全部", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide_all", "隐藏全部", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出 DeskTime", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[&show, &hide, &PredefinedMenuItem::separator(app)?, &quit],
    )?;

    let mut builder = TrayIconBuilder::with_id("desktime-tray")
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

fn set_all_visibility<R: Runtime>(app: &AppHandle<R>, visible: bool) {
    for label in PANELS {
        let Some(window) = app.get_webview_window(label) else {
            continue;
        };
        if let Err(error) = crate::platform::set_window_visibility(&window, visible) {
            eprintln!("failed to set {label} visibility from tray: {error}");
        }
    }
}
