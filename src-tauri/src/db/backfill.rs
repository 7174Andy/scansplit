use crate::error::AppResult;
use crate::ocr::image_processing::process_for_storage;
use sqlx::{Row, SqlitePool};
use std::path::Path;

pub async fn backfill_legacy_image_paths(pool: &SqlitePool) -> AppResult<()> {
    let rows = sqlx::query(
        "SELECT id, image_path FROM receipts WHERE length(image_bytes) = 0",
    )
    .fetch_all(pool)
    .await?;

    for row in rows {
        let id: String = row.get("id");
        let image_path: String = row.get("image_path");

        // Skip rows whose image_path is no longer an absolute file (already
        // basename'd from a prior run) or whose file is gone.
        let path = Path::new(&image_path);
        if !path.is_absolute() || !path.exists() {
            continue;
        }

        let bytes = match std::fs::read(&path) {
            Ok(b) => b,
            Err(e) => {
                tracing::warn!("backfill skip {id}: read failed: {e}");
                continue;
            }
        };
        let processed = match process_for_storage(&bytes) {
            Ok(p) => p,
            Err(e) => {
                tracing::warn!("backfill skip {id}: process failed: {e}");
                continue;
            }
        };
        let basename = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        let size = processed.bytes.len() as i64;

        sqlx::query(
            "UPDATE receipts
             SET image_bytes = ?, mime = ?, byte_size = ?, image_path = ?
             WHERE id = ? AND length(image_bytes) = 0",
        )
        .bind(&processed.bytes)
        .bind(processed.mime)
        .bind(size)
        .bind(&basename)
        .bind(&id)
        .execute(pool)
        .await?;

        let _ = std::fs::remove_file(&path);
    }

    Ok(())
}
