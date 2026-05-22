use crate::error::{AppError, AppResult};
use crate::ocr::claude::ClaudeScanner;
use crate::ocr::code_expansions;
use crate::ocr::image_processing::process_for_storage;
use crate::ocr::{ParsedReceipt, Scanner};
use crate::AppState;
use base64::Engine;
use tauri::State;

#[tauri::command]
pub async fn scan_receipt(
    state: State<'_, AppState>,
    source_path: String,
) -> AppResult<ScanResult> {
    let key = crate::commands::settings::read_api_key()?
        .ok_or(AppError::MissingApiKey)?;
    let scanner: Box<dyn Scanner> = Box::new(ClaudeScanner::new(key));

    let bytes = std::fs::read(&source_path)?;

    // Use full-resolution bytes for OCR; downsize only for storage.
    let mut parsed: ParsedReceipt = scanner.scan(&bytes).await?;
    code_expansions::apply_learned(&state.pool, &mut parsed).await?;

    let processed = process_for_storage(&bytes)?;
    let image_bytes_base64 =
        base64::engine::general_purpose::STANDARD.encode(&processed.bytes);
    let byte_size = processed.bytes.len() as i64;
    let filename = std::path::Path::new(&source_path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("receipt")
        .to_string();

    Ok(ScanResult {
        image_path: filename,
        image_bytes_base64,
        mime: processed.mime.to_string(),
        byte_size,
        parsed,
    })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub image_path: String,
    pub image_bytes_base64: String,
    pub mime: String,
    pub byte_size: i64,
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
