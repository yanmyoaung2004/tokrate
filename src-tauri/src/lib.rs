mod commands;
mod proxy;

use commands::*;
use proxy::ProxyState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(ProxyState::new())
        .invoke_handler(tauri::generate_handler![
            get_hardware_info,
            save_run,
            list_runs,
            delete_run,
            proxy_start,
            proxy_stop,
            proxy_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
