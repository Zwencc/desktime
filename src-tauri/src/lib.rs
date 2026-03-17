mod commands;
mod error;
mod platform;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(platform::plugin())
        .invoke_handler(tauri::generate_handler![
            commands::file::save_text_file,
            commands::window::set_window_to_bottom,
            commands::window::set_window_visibility
        ])
        .run(tauri::generate_context!())
        .expect("error while running DeskTime");
}
