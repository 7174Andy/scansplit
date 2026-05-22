use scansplit_lib::db::backfill::backfill_legacy_image_paths;
use sqlx::{sqlite::SqlitePoolOptions, Row};
use std::io::Write;

async fn fresh_pool() -> sqlx::SqlitePool {
    let pool = SqlitePoolOptions::new()
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::query("PRAGMA foreign_keys = ON")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    pool
}

async fn insert_tx_and_receipt(
    pool: &sqlx::SqlitePool,
    receipt_id: &str,
    image_path: &str,
) {
    sqlx::query(
        "INSERT INTO transactions (id, title, currency, created_at, updated_at)
         VALUES ('t1','Dinner','USD',1,1)",
    )
    .execute(pool)
    .await
    .ok(); // first call inserts, later calls error -- ignore
    sqlx::query(
        "INSERT INTO receipts (id, transaction_id, image_path, position, scanned_at)
         VALUES (?, 't1', ?, 0, 1)",
    )
    .bind(receipt_id)
    .bind(image_path)
    .execute(pool)
    .await
    .unwrap();
}

fn write_png(path: &std::path::Path) {
    use image::{ImageBuffer, Rgb};
    let img: ImageBuffer<Rgb<u8>, Vec<u8>> =
        ImageBuffer::from_fn(100, 100, |_, _| Rgb([10, 20, 30]));
    let mut f = std::fs::File::create(path).unwrap();
    let mut buf = std::io::Cursor::new(Vec::new());
    img.write_to(&mut buf, image::ImageFormat::Png).unwrap();
    f.write_all(&buf.into_inner()).unwrap();
}

#[tokio::test]
async fn backfill_reads_file_and_clears_path() {
    let pool = fresh_pool().await;
    let dir = tempfile::tempdir().unwrap();
    let png = dir.path().join("legacy.png");
    write_png(&png);

    insert_tx_and_receipt(&pool, "r1", png.to_str().unwrap()).await;

    backfill_legacy_image_paths(&pool).await.unwrap();

    let row = sqlx::query(
        "SELECT length(image_bytes) AS n, mime, byte_size, image_path FROM receipts WHERE id = 'r1'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();

    let n: i64 = row.get("n");
    let mime: String = row.get("mime");
    let byte_size: i64 = row.get("byte_size");
    let image_path: String = row.get("image_path");

    assert!(n > 0, "image_bytes should be populated");
    assert_eq!(mime, "image/jpeg");
    assert_eq!(byte_size, n);
    assert_eq!(image_path, "legacy.png", "image_path should be basename");
    assert!(!png.exists(), "source file should be deleted");
}

#[tokio::test]
async fn backfill_skips_missing_file() {
    let pool = fresh_pool().await;
    insert_tx_and_receipt(&pool, "r2", "/definitely/not/a/real/path.jpg").await;

    backfill_legacy_image_paths(&pool).await.unwrap();

    let n: i64 = sqlx::query("SELECT length(image_bytes) AS n FROM receipts WHERE id = 'r2'")
        .fetch_one(&pool)
        .await
        .unwrap()
        .get("n");
    assert_eq!(n, 0, "image_bytes stays empty when file missing");
}

#[tokio::test]
async fn backfill_is_idempotent() {
    let pool = fresh_pool().await;
    let dir = tempfile::tempdir().unwrap();
    let png = dir.path().join("once.png");
    write_png(&png);
    insert_tx_and_receipt(&pool, "r3", png.to_str().unwrap()).await;

    backfill_legacy_image_paths(&pool).await.unwrap();
    let n1: i64 = sqlx::query("SELECT length(image_bytes) AS n FROM receipts WHERE id = 'r3'")
        .fetch_one(&pool).await.unwrap().get("n");

    backfill_legacy_image_paths(&pool).await.unwrap();
    let n2: i64 = sqlx::query("SELECT length(image_bytes) AS n FROM receipts WHERE id = 'r3'")
        .fetch_one(&pool).await.unwrap().get("n");

    assert_eq!(n1, n2);
}

#[tokio::test]
async fn backfill_does_not_touch_already_populated_rows() {
    let pool = fresh_pool().await;
    let dir = tempfile::tempdir().unwrap();
    let png = dir.path().join("legacy.png");
    write_png(&png);
    insert_tx_and_receipt(&pool, "r-race", png.to_str().unwrap()).await;

    // First run -> populates image_bytes.
    backfill_legacy_image_paths(&pool).await.unwrap();

    // Manually rewrite image_bytes to simulate "some other writer set it".
    let manual_bytes: Vec<u8> = (0..16u8).collect();
    sqlx::query(
        "UPDATE receipts
         SET image_bytes = ?, mime = 'image/png', byte_size = ?
         WHERE id = 'r-race'",
    )
    .bind(&manual_bytes)
    .bind(manual_bytes.len() as i64)
    .execute(&pool)
    .await
    .unwrap();

    // Second run -> must NOT overwrite the manual write.
    backfill_legacy_image_paths(&pool).await.unwrap();

    let row = sqlx::query(
        "SELECT image_bytes, mime FROM receipts WHERE id = 'r-race'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let bytes: Vec<u8> = row.get("image_bytes");
    let mime: String = row.get("mime");

    assert_eq!(bytes, manual_bytes, "backfill must not overwrite existing bytes");
    assert_eq!(mime, "image/png", "backfill must not overwrite existing mime");
}
