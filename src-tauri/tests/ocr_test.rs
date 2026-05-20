use scansplit_lib::ocr::claude::parse_response_text;
use scansplit_lib::ocr::code_expansions;
use scansplit_lib::ocr::{ParsedItem, ParsedReceipt};
use sqlx::sqlite::SqlitePoolOptions;

#[test]
fn parses_fixture() {
    let raw = std::fs::read_to_string("tests/fixtures/sample_response.json").unwrap();
    let r = parse_response_text(&raw).unwrap();
    assert_eq!(r.items.len(), 4);
    assert_eq!(r.items[0].name.as_deref(), Some("Whole Milk 2%"));
    assert!(r.items[2].name.is_none());
    assert_eq!(r.items[3].kind, "tax");
}

async fn fresh_pool() -> sqlx::SqlitePool {
    let pool = SqlitePoolOptions::new()
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::query("PRAGMA foreign_keys = ON").execute(&pool).await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    pool
}

#[tokio::test]
async fn learned_expansion_fills_in_blank_name() {
    let pool = fresh_pool().await;
    code_expansions::record_corrections(
        &pool,
        Some("Trader Joe's"),
        &[("MISC".into(), "Generic Snack".into())],
    ).await.unwrap();

    let mut r = ParsedReceipt {
        merchant: Some("Trader Joe's".into()),
        items: vec![ParsedItem {
            raw: "MISC".into(), name: None, price_cents: 499, kind: "item".into(),
        }],
    };
    code_expansions::apply_learned(&pool, &mut r).await.unwrap();
    assert_eq!(r.items[0].name.as_deref(), Some("Generic Snack"));
}

#[tokio::test]
async fn store_specific_overrides_generic() {
    let pool = fresh_pool().await;
    code_expansions::record_corrections(&pool, None, &[("GV".into(), "Generic".into())]).await.unwrap();
    code_expansions::record_corrections(&pool, Some("Walmart"), &[("GV".into(), "Great Value".into())]).await.unwrap();

    let mut r = ParsedReceipt {
        merchant: Some("Walmart".into()),
        items: vec![ParsedItem { raw: "GV".into(), name: None, price_cents: 100, kind: "item".into() }],
    };
    code_expansions::apply_learned(&pool, &mut r).await.unwrap();
    assert_eq!(r.items[0].name.as_deref(), Some("Great Value"));
}
