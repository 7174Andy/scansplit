use crate::db::models::FullTransaction;
use crate::db::queries::{self, TransactionSummary};
use crate::error::AppResult;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn create_transaction(
    state: State<'_, AppState>,
    full: FullTransaction,
) -> AppResult<()> {
    queries::insert_full(&state.pool, &full).await
}

#[tauri::command]
pub async fn update_transaction(
    state: State<'_, AppState>,
    full: FullTransaction,
) -> AppResult<()> {
    queries::replace_full(&state.pool, &full).await
}

#[tauri::command]
pub async fn get_transaction(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<FullTransaction> {
    queries::get_full(&state.pool, &id).await
}

#[tauri::command]
pub async fn list_transactions(
    state: State<'_, AppState>,
) -> AppResult<Vec<TransactionSummary>> {
    queries::list_summaries(&state.pool).await
}

#[tauri::command]
pub async fn delete_transaction(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<()> {
    let image_paths = queries::delete(&state.pool, &id).await?;
    for p in image_paths {
        let _ = std::fs::remove_file(&p);
    }
    Ok(())
}
