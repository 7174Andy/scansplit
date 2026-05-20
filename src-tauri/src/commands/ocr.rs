use crate::error::{AppError, AppResult};
use crate::ocr::claude::ClaudeClient;
use crate::ocr::code_expansions;
use crate::ocr::{LlmClient, ParsedReceipt};
use crate::AppState;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

#[tauri::command]
pub async fn scan_receipt(
    app: AppHandle,
    state: State<'_, AppState>,
    source_path: String,
) -> AppResult<ScanResult> {
    let bytes = std::fs::read(&source_path)?;

    let app_dir = app.path().app_data_dir().map_err(|e| AppError::Other(e.to_string()))?;
    let receipts_dir = app_dir.join("receipts");
    std::fs::create_dir_all(&receipts_dir)?;
    let ext = std::path::Path::new(&source_path)
        .extension().and_then(|s| s.to_str()).unwrap_or("img");
    let stored = receipts_dir.join(format!("{}.{}", Uuid::new_v4(), ext));
    std::fs::copy(&source_path, &stored)?;

    let key = crate::commands::settings::get_api_key().await?;
    let key = key.ok_or(AppError::MissingApiKey)?;

    let client = ClaudeClient::new();
    let mut parsed: ParsedReceipt = client.scan(&bytes, &key).await?;
    code_expansions::apply_learned(&state.pool, &mut parsed).await?;

    Ok(ScanResult {
        image_path: stored.display().to_string(),
        parsed,
    })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub image_path: String,
    pub parsed: ParsedReceipt,
}

#[tauri::command]
pub async fn record_code_corrections(
    state: State<'_, AppState>,
    merchant: Option<String>,
    corrections: Vec<(String, String)>,
) -> AppResult<()> {
    code_expansions::record_corrections(&state.pool, merchant.as_deref(), &corrections).await
}
