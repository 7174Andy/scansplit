use crate::error::{AppError, AppResult};
use crate::ocr::claude::ClaudeScanner;
use crate::ocr::code_expansions;
use crate::ocr::{ParsedReceipt, Scanner};
use crate::AppState;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

#[cfg(target_os = "macos")]
fn build_local_scanner(_app: &AppHandle) -> AppResult<Box<dyn Scanner>> {
    use crate::ocr::local::{apple::AppleOcr, LocalScanner};
    Ok(Box::new(LocalScanner::new(Arc::new(AppleOcr::new()))))
}

#[cfg(not(target_os = "macos"))]
fn build_local_scanner(app: &AppHandle) -> AppResult<Box<dyn Scanner>> {
    use crate::ocr::local::{tesseract::TesseractOcr, LocalScanner};
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| AppError::Other(format!("resource dir: {e}")))?;
    let tessdata = resource_dir
        .join("tessdata")
        .to_string_lossy()
        .into_owned();
    Ok(Box::new(LocalScanner::new(Arc::new(TesseractOcr::new(
        tessdata,
    )))))
}

async fn run_scan(
    app: AppHandle,
    state: State<'_, AppState>,
    source_path: String,
    scanner: Box<dyn Scanner>,
) -> AppResult<ScanResult> {
    let bytes = std::fs::read(&source_path)?;

    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Other(e.to_string()))?;
    let receipts_dir = app_dir.join("receipts");
    std::fs::create_dir_all(&receipts_dir)?;
    let ext = std::path::Path::new(&source_path)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("img");
    let stored = receipts_dir.join(format!("{}.{}", Uuid::new_v4(), ext));
    std::fs::copy(&source_path, &stored)?;

    let mut parsed: ParsedReceipt = scanner.scan(&bytes).await?;
    code_expansions::apply_learned(&state.pool, &mut parsed).await?;

    Ok(ScanResult {
        image_path: stored.display().to_string(),
        parsed,
    })
}

#[tauri::command]
pub async fn scan_receipt(
    app: AppHandle,
    state: State<'_, AppState>,
    source_path: String,
) -> AppResult<ScanResult> {
    let scanner = build_local_scanner(&app)?;
    run_scan(app, state, source_path, scanner).await
}

#[tauri::command]
pub async fn scan_receipt_with_claude(
    app: AppHandle,
    state: State<'_, AppState>,
    source_path: String,
) -> AppResult<ScanResult> {
    let key = crate::commands::settings::read_api_key()?
        .ok_or(AppError::MissingApiKey)?;
    let scanner: Box<dyn Scanner> = Box::new(ClaudeScanner::new(key));
    run_scan(app, state, source_path, scanner).await
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
