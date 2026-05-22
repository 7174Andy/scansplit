use crate::error::{AppError, AppResult};
use crate::AppState;
use base64::Engine;
use sqlx::{Row, SqlitePool};
use tauri::State;

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiptImage {
    pub mime: String,
    pub bytes_base64: String,
    pub byte_size: i64,
}

pub async fn fetch_receipt_image(pool: &SqlitePool, receipt_id: &str) -> AppResult<ReceiptImage> {
    let row = sqlx::query(
        "SELECT mime, image_bytes, byte_size FROM receipts WHERE id = ?",
    )
    .bind(receipt_id)
    .fetch_optional(pool)
    .await?;
    let row = row.ok_or(AppError::NotFound)?;

    let bytes: Vec<u8> = row.get("image_bytes");
    let mime: String = row.get("mime");
    let byte_size: i64 = row.get("byte_size");

    let bytes_base64 = if bytes.is_empty() {
        String::new()
    } else {
        base64::engine::general_purpose::STANDARD.encode(&bytes)
    };

    Ok(ReceiptImage { mime, bytes_base64, byte_size })
}

#[tauri::command]
pub async fn get_receipt_image(
    state: State<'_, AppState>,
    receipt_id: String,
) -> AppResult<ReceiptImage> {
    fetch_receipt_image(&state.pool, &receipt_id).await
}
