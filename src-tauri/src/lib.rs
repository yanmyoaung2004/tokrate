mod commands;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_hardware_info,
            save_run,
            list_runs,
            delete_run,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
