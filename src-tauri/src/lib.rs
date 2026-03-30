mod commands;
mod error;
mod platform;
mod reminder;
mod tray;

use std::sync::Arc;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(platform::plugin())
        .setup(|app| {
            tray::build(app.handle())?;
            reminder::start(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::file::draft_delete,
            commands::file::draft_read,
            commands::file::draft_write,
            commands::file::drafts_directory,
            commands::file::file_stat,
            commands::file::move_to_recycle_bin,
            commands::file::open_in_explorer,
            commands::file::read_text_file,
            commands::file::rename_path,
            commands::file::save_text_file,
            commands::reminder::snooze_reminder,
            commands::reminder::stop_reminder,
            commands::reminder::sync_notices,
            commands::reminder::sync_reminders,
            commands::window::set_window_to_bottom,
            commands::window::set_window_visibility
        ])
        .build(tauri::generate_context!())
        .expect("error while building DeskTime")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                if let Some(scheduler) = app.try_state::<Arc<reminder::Scheduler>>() {
                    scheduler.shutdown();
                }
            }
        });
}
