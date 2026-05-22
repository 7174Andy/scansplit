use scansplit_lib::commands::receipts::fetch_receipt_image;
use sqlx::sqlite::SqlitePoolOptions;

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

async fn seed_receipt(pool: &sqlx::SqlitePool, id: &str, bytes: &[u8]) {
    sqlx::query(
        "INSERT OR IGNORE INTO transactions (id, title, currency, created_at, updated_at)
         VALUES ('t1','x','USD',1,1)",
    )
    .execute(pool).await.unwrap();
    sqlx::query(
        "INSERT INTO receipts (id, transaction_id, image_path, position, scanned_at,
                               image_bytes, mime, byte_size)
         VALUES (?, 't1', 'name.jpg', 0, 1, ?, 'image/jpeg', ?)",
    )
    .bind(id)
    .bind(bytes)
    .bind(bytes.len() as i64)
    .execute(pool).await.unwrap();
}

#[tokio::test]
async fn fetch_round_trips_bytes() {
    use base64::Engine;
    let pool = fresh_pool().await;
    let bytes: Vec<u8> = (0..32u8).collect();
    seed_receipt(&pool, "r1", &bytes).await;

    let got = fetch_receipt_image(&pool, "r1").await.unwrap();
    assert_eq!(got.mime, "image/jpeg");
    assert_eq!(got.byte_size, 32);
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(&got.bytes_base64).unwrap();
    assert_eq!(decoded, bytes);
}

#[tokio::test]
async fn fetch_empty_blob_returns_empty_string() {
    let pool = fresh_pool().await;
    seed_receipt(&pool, "r2", &[]).await;
    let got = fetch_receipt_image(&pool, "r2").await.unwrap();
    assert_eq!(got.bytes_base64, "");
    assert_eq!(got.byte_size, 0);
}

#[tokio::test]
async fn fetch_unknown_id_returns_not_found() {
    let pool = fresh_pool().await;
    let err = fetch_receipt_image(&pool, "nope").await.unwrap_err();
    assert!(matches!(err, scansplit_lib::error::AppError::NotFound));
}
