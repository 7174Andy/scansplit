use scansplit_lib::db::{models::*, queries};
use sqlx::sqlite::SqlitePoolOptions;

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
            image_path: "/tmp/r1.jpg".into(), position: 0, scanned_at: 1,
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
    assert_eq!(paths, vec!["/tmp/r1.jpg".to_string()]);
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
