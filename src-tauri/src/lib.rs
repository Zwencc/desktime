mod activity;
pub mod api;
mod commands;
mod config;
pub mod core;
mod desktop;
mod devmode;
mod error;
mod i18n;
pub mod ipc;
mod llm;
pub mod note;
pub mod logging;
mod platform;
mod plugin;
mod reminder;
#[cfg(windows)]
pub mod service;
mod shortcuts;
pub mod storage;
mod startup;
mod tray;
pub mod vault;

use std::sync::Arc;

use tauri::Manager;

/// Puts every widget back on screen. Used by the tray and by a second launch.
fn show_all_widgets<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    for (label, window) in app.webview_windows() {
        if platform::is_app_driven(&label) {
            continue;
        }
        let _ = platform::set_window_visibility(&window, true);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be first: the point of it is to run before anything else has had
        // a chance to touch state the original instance owns.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // A second launch — from the Start Menu while the autostart copy is
            // already running, most often. Two of these would fight over one
            // config file and one WebView2 data folder, so the second one hands
            // its intent to the first and exits: show what is already there.
            show_all_widgets(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            // Marks the launch as automatic so the UI can tell "Windows started
            // me" from "the user asked for me".
            Some(vec!["--autostart"]),
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(platform::plugin())
        // Serves plugin pages; see plugin::protocol_handler for the three things
        // that are settled there and nowhere else.
        .register_uri_scheme_protocol("plugin", |_app, request| plugin::protocol_handler(request))
        .setup(|app| {
            app.manage(devmode::detect());
            app.manage(Arc::new(ipc::client::CoreClient::new(Arc::new(
                ipc::transport::NamedPipeTransport::default(),
            ))));
            app.manage(Arc::new(plugin::browser::BrowserRegistry::default()));
            app.manage(commands::note::MigrationPlans::default());
            app.manage(Arc::new(vault::controller::VaultController::new(
                vault::store::VaultPaths::from_data_root(&devmode::root_dir()),
            )));
            // Drafts, activity days and the API key, copied out of %APPDATA%
            // once. The config file itself never lived there — it is new with
            // this move, and the frontend seeds it from localStorage instead.
            config::migrate_legacy_data(app.handle());

            let config = config::Config::load();
            // DTCore is the only background owner. Starting it is idempotent:
            // the service may already have launched one for this session.
            let _ = core::ensure_running();
            app.manage(core::mark_ui_running());
            // Geometry before the first frame. The windows are still hidden, so
            // this is what stops the widget appearing at the config's
            // coordinates and then jumping to the user's.
            startup::restore_geometry(app.handle(), &config);
            app.manage(config);

            // After the widgets: a plugin window is a window like any other,
            // and the geometry pass above has already run for the built-in ones.
            plugin::start(app.handle());

            tray::build(app.handle())?;
            reminder::start(app.handle());
            // The menu, settings, launcher and devtools windows, built once the
            // widgets have had the machine to themselves for a moment.
            startup::spawn_deferred_windows(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::activity::activity_config,
            commands::activity::activity_summaries,
            commands::activity::clear_activity,
            commands::activity::resolve_app_names,
            commands::activity::sync_activity_config,
            commands::browser::browser_widget_control,
            commands::browser::browser_widget_status,
            commands::config::read_config,
            commands::config::write_config,
            commands::core::core_request,
            commands::desktop::desktop_entries,
            commands::desktop::launch_path,
            commands::desktop::launcher_index,
            commands::dev::activity_debug_snapshot,
            commands::dev::is_dev_mode,
            commands::dev::runtime_status,
            commands::dev::window_diagnostics,
            commands::file::move_to_recycle_bin,
            commands::file::open_in_explorer,
            commands::file::rename_path,
            commands::framework::framework_status,
            commands::llm::has_llm_key,
            commands::llm::llm_classify,
            commands::llm::llm_line,
            commands::llm::set_llm_key,
            commands::note::draft_delete,
            commands::note::draft_read,
            commands::note::draft_write,
            commands::note::drafts_directory,
            commands::note::note_container_status,
            commands::note::note_create,
            commands::note::note_migration_execute,
            commands::note::note_migration_scan,
            commands::note::note_open,
            commands::note::note_relocate,
            commands::note::note_save,
            commands::plugin::plugin_call,
            commands::plugin::plugin_list,
            commands::plugin::plugin_locale,
            commands::plugin::plugin_log,
            commands::plugin::plugin_now,
            commands::plugin::plugin_reload,
            commands::plugin::plugin_set_enabled,
            commands::plugin::plugin_settings,
            commands::plugin::plugin_settings_set,
            commands::plugin::plugin_storage_get,
            commands::plugin::plugin_storage_set,
            commands::plugin::plugin_theme,
            commands::plugin::plugin_window,
            commands::plugin::plugins_directory,
            commands::reminder::snooze_reminder,
            commands::reminder::stop_reminder,
            commands::reminder::sync_notices,
            commands::reminder::sync_reminders,
            commands::service::background_status,
            commands::service::repair_background_service,
            commands::template::template_delete,
            commands::template::template_list,
            commands::template::template_write,
            commands::template::templates_directory,
            commands::window::ensure_window,
            commands::window::refresh_tray,
            commands::window::set_window_to_bottom,
            commands::window::set_window_visibility,
            commands::window::sync_shortcuts,
            commands::vault::vault_create,
            commands::vault::vault_create_folder,
            commands::vault::vault_create_note,
            commands::vault::vault_rename,
            commands::vault::vault_write_backup,
            commands::vault::vault_delete,
            commands::vault::vault_export,
            commands::vault::vault_import,
            commands::vault::vault_list,
            commands::vault::vault_lock,
            commands::vault::vault_move,
            commands::vault::vault_read,
            commands::vault::vault_reset_password,
            commands::vault::vault_status,
            commands::vault::vault_unlock_password,
            commands::vault::vault_unlock_recovery,
            commands::vault::vault_write
        ])
        .build(tauri::generate_context!())
        .expect("error while building DeskTime")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                if let Some(scheduler) = app.try_state::<Arc<reminder::Scheduler>>() {
                    scheduler.shutdown();
                }
                // Backends are child processes; leaving them behind would put
                // a stray python in the task manager after DeskTime is gone.
                plugin::shutdown(app);
            }
        });
}
