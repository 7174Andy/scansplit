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

#[tokio::test]
async fn migration_0005_adds_date_column() {
    let pool = SqlitePoolOptions::new()
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::query("PRAGMA foreign_keys = ON").execute(&pool).await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();

    let cols = sqlx::query("PRAGMA table_info(transactions)")
        .fetch_all(&pool)
        .await
        .unwrap();
    let names: Vec<String> = cols.iter().map(|r| r.get::<String, _>("name")).collect();
    assert!(names.contains(&"date".to_string()), "got {names:?}");

    let row = cols
        .iter()
        .find(|r| r.get::<String, _>("name") == "date")
        .unwrap();
    let notnull: i64 = row.get("notnull");
    assert_eq!(notnull, 0, "date must be nullable (added via ALTER TABLE)");
}

#[tokio::test]
async fn migration_0005_backfills_date_from_created_at() {
    // Build the pre-0005 transactions schema, insert a legacy row, then run the
    // exact 0005 statements and assert the date column is populated with a
    // YYYY-MM-DD string (tz-safe: we assert the length/shape, not an exact value).
    let pool = SqlitePoolOptions::new()
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::query(
        "CREATE TABLE transactions (
           id TEXT PRIMARY KEY, title TEXT NOT NULL, currency TEXT NOT NULL,
           created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
         )",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO transactions (id, title, currency, created_at, updated_at)
         VALUES ('old', 'Legacy', 'USD', 1600000000, 1600000000)",
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query("ALTER TABLE transactions ADD COLUMN date TEXT")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE transactions SET date = date(created_at, 'unixepoch', 'localtime')")
        .execute(&pool)
        .await
        .unwrap();

    let row = sqlx::query("SELECT date FROM transactions WHERE id = 'old'")
        .fetch_one(&pool)
        .await
        .unwrap();
    let date: Option<String> = row.get("date");
    let date = date.expect("date backfilled");
    assert_eq!(date.len(), 10, "expected YYYY-MM-DD, got {date:?}");
}
