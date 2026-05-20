use crate::error::AppResult;
use crate::ocr::ParsedReceipt;
use sqlx::{Row, SqlitePool};

/// Apply learned expansions: for any item where `name` is None, look up
/// (raw, store_hint) in code_expansions and fill in the learned_name if present.
pub async fn apply_learned(pool: &SqlitePool, receipt: &mut ParsedReceipt) -> AppResult<()> {
    for it in &mut receipt.items {
        if it.name.is_some() {
            continue;
        }
        let row = sqlx::query(
            "SELECT learned_name FROM code_expansions
             WHERE raw_code = ? AND (store_hint = ? OR store_hint IS NULL)
             ORDER BY (store_hint IS NULL) ASC, usage_count DESC
             LIMIT 1",
        )
        .bind(&it.raw)
        .bind(&receipt.merchant)
        .fetch_optional(pool)
        .await?;
        if let Some(r) = row {
            it.name = Some(r.get("learned_name"));
        }
    }
    Ok(())
}

/// Record corrections from a user-edited list of items.
/// For each item with both raw code and a confirmed name, upsert the mapping.
pub async fn record_corrections(
    pool: &SqlitePool,
    merchant: Option<&str>,
    items: &[(String, String)],
) -> AppResult<()> {
    let now = chrono::Utc::now().timestamp();
    let mut tx = pool.begin().await?;
    for (raw, name) in items {
        sqlx::query(
            "INSERT INTO code_expansions (raw_code, store_hint, learned_name, usage_count, last_used_at)
             VALUES (?, ?, ?, 1, ?)
             ON CONFLICT(raw_code, store_hint) DO UPDATE SET
               learned_name = excluded.learned_name,
               usage_count = code_expansions.usage_count + 1,
               last_used_at = excluded.last_used_at",
        )
        .bind(raw)
        .bind(merchant)
        .bind(name)
        .bind(now)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}
