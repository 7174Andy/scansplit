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

#[tokio::test]
async fn migration_0004_adds_paid_by_person_id_column() {
    use sqlx::sqlite::SqlitePoolOptions;
    use sqlx::Row;

    let pool = SqlitePoolOptions::new()
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::query("PRAGMA foreign_keys = ON").execute(&pool).await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();

    // Pragma reports column metadata; the new column must be present and nullable.
    let cols = sqlx::query("PRAGMA table_info(transactions)")
        .fetch_all(&pool)
        .await
        .unwrap();
    let names: Vec<String> = cols
        .iter()
        .map(|r| r.get::<String, _>("name"))
        .collect();
    assert!(names.contains(&"paid_by_person_id".to_string()), "got {names:?}");

    let row = cols
        .iter()
        .find(|r| r.get::<String, _>("name") == "paid_by_person_id")
        .unwrap();
    let notnull: i64 = row.get("notnull");
    assert_eq!(notnull, 0, "paid_by_person_id must be nullable");
}
