pub mod commands;
pub mod db;
pub mod error;

use sqlx::SqlitePool;
use tauri::Manager;

pub struct AppState {
    pub pool: SqlitePool,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let app_dir = app.path().app_data_dir().expect("app data dir");
            let db_path = app_dir.join("scansplit.db");
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let pool = db::open_pool(&db_path).await.expect("open db");
                handle.manage(AppState { pool });
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::transactions::create_transaction,
            commands::transactions::update_transaction,
            commands::transactions::get_transaction,
            commands::transactions::list_transactions,
            commands::transactions::delete_transaction,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
