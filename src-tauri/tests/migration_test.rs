use sqlx::sqlite::SqlitePoolOptions;
use sqlx::Row;

#[tokio::test]
async fn receipts_table_has_blob_columns() {
    let pool = SqlitePoolOptions::new()
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();

    let rows = sqlx::query("PRAGMA table_info(receipts)")
        .fetch_all(&pool)
        .await
        .unwrap();
    let cols: Vec<(String, String)> = rows
        .into_iter()
        .map(|r| (r.get::<String, _>("name"), r.get::<String, _>("type")))
        .collect();

    assert!(cols.iter().any(|(n, t)| n == "image_bytes" && t == "BLOB"));
    assert!(cols.iter().any(|(n, t)| n == "mime" && t == "TEXT"));
    assert!(cols.iter().any(|(n, t)| n == "byte_size" && t == "INTEGER"));
}
