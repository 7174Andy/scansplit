use scansplit_lib::db::{models::*, queries};
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::Row;

async fn fresh_pool() -> sqlx::SqlitePool {
    let pool = SqlitePoolOptions::new()
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::query("PRAGMA foreign_keys = ON").execute(&pool).await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    pool
}

fn sample_full(id: &str) -> FullTransaction {
    // Tiny base64-encoded 1x1 white JPEG -- valid bytes for round-trip tests.
    let jpeg_b64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/wD//2Q==";
    FullTransaction {
        transaction: Transaction {
            id: id.into(),
            title: "Dinner".into(),
            currency: "USD".into(),
            created_at: 1,
            updated_at: 1,
        },
        people: vec![
            Person { id: "p1".into(), transaction_id: id.into(), name: "Alice".into(), position: 0 },
            Person { id: "p2".into(), transaction_id: id.into(), name: "Bob".into(), position: 1 },
        ],
        receipts: vec![Receipt {
            id: "r1".into(), transaction_id: id.into(),
            image_path: "r1.jpg".into(), position: 0, scanned_at: 1,
            image_bytes_base64: jpeg_b64.into(),
            mime: "image/jpeg".into(),
            byte_size: 0, // will be set from decoded length
        }],
        items: vec![Item {
            id: "i1".into(), transaction_id: id.into(),
            receipt_id: Some("r1".into()),
            raw_code: Some("WHL MLK".into()),
            name: "Whole Milk".into(), price_cents: 349,
            kind: "item".into(), position: 0,
            assigned_person_ids: vec!["p1".into(), "p2".into()],
        }],
    }
}

#[tokio::test]
async fn create_then_get_roundtrips() {
    let pool = fresh_pool().await;
    let f = sample_full("t1");
    queries::insert_full(&pool, &f).await.unwrap();
    let got = queries::get_full(&pool, "t1").await.unwrap();
    assert_eq!(got.transaction.title, "Dinner");
    assert_eq!(got.items.len(), 1);
    assert_eq!(got.items[0].assigned_person_ids.len(), 2);
}

#[tokio::test]
async fn delete_cascades() {
    let pool = fresh_pool().await;
    queries::insert_full(&pool, &sample_full("t2")).await.unwrap();
    let paths = queries::delete(&pool, "t2").await.unwrap();
    assert_eq!(paths, vec!["r1.jpg".to_string()]);
    let err = queries::get_full(&pool, "t2").await.unwrap_err();
    assert!(matches!(err, scansplit_lib::error::AppError::NotFound));
}

#[tokio::test]
async fn replace_overwrites_children() {
    let pool = fresh_pool().await;
    let mut f = sample_full("t3");
    queries::insert_full(&pool, &f).await.unwrap();
    f.items[0].name = "Skim Milk".into();
    queries::replace_full(&pool, &f).await.unwrap();
    let got = queries::get_full(&pool, "t3").await.unwrap();
    assert_eq!(got.items[0].name, "Skim Milk");
    assert_eq!(got.items.len(), 1);
}

#[tokio::test]
async fn insert_full_persists_image_bytes() {
    use base64::Engine;
    let pool = fresh_pool().await;
    let f = sample_full("t-bytes");
    queries::insert_full(&pool, &f).await.unwrap();

    let row = sqlx::query(
        "SELECT length(image_bytes) AS n, mime FROM receipts WHERE id = 'r1'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let n: i64 = row.get("n");
    let mime: String = row.get("mime");

    let expected_len = base64::engine::general_purpose::STANDARD
        .decode(&f.receipts[0].image_bytes_base64)
        .unwrap()
        .len() as i64;
    assert_eq!(n, expected_len);
    assert_eq!(mime, "image/jpeg");
}

#[tokio::test]
async fn insert_full_rejects_missing_bytes() {
    let pool = fresh_pool().await;
    let mut f = sample_full("t-missing");
    f.receipts[0].image_bytes_base64 = String::new();
    let err = queries::insert_full(&pool, &f).await.unwrap_err();
    assert!(matches!(err, scansplit_lib::error::AppError::Other(_)));
}

#[tokio::test]
async fn replace_full_preserves_existing_bytes_when_payload_omits_them() {
    let pool = fresh_pool().await;
    let f1 = sample_full("t-edit");
    queries::insert_full(&pool, &f1).await.unwrap();

    let n_before: i64 = sqlx::query(
        "SELECT length(image_bytes) AS n FROM receipts WHERE id = 'r1'",
    )
    .fetch_one(&pool).await.unwrap().get("n");

    // Simulate the edit-and-save flow: payload omits bytes.
    let mut f2 = f1.clone();
    f2.receipts[0].image_bytes_base64 = String::new();
    f2.items[0].name = "Skim Milk".into();
    queries::replace_full(&pool, &f2).await.unwrap();

    let row = sqlx::query(
        "SELECT length(image_bytes) AS n, mime FROM receipts WHERE id = 'r1'",
    )
    .fetch_one(&pool).await.unwrap();
    let n_after: i64 = row.get("n");
    let mime_after: String = row.get("mime");
    assert_eq!(n_after, n_before, "bytes preserved across replace");
    assert_eq!(mime_after, "image/jpeg");

    let got = queries::get_full(&pool, "t-edit").await.unwrap();
    assert_eq!(got.items[0].name, "Skim Milk");
}

#[tokio::test]
async fn replace_full_overwrites_when_payload_includes_bytes() {
    let pool = fresh_pool().await;
    let f1 = sample_full("t-rescan");
    queries::insert_full(&pool, &f1).await.unwrap();

    // New scan: shorter byte payload to detect the overwrite.
    let mut f2 = f1.clone();
    f2.receipts[0].image_bytes_base64 = "AAAA".into(); // 3 bytes after decode
    queries::replace_full(&pool, &f2).await.unwrap();

    let n: i64 = sqlx::query(
        "SELECT length(image_bytes) AS n FROM receipts WHERE id = 'r1'",
    )
    .fetch_one(&pool).await.unwrap().get("n");
    assert_eq!(n, 3);
}
