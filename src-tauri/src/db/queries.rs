use base64::Engine;
use crate::db::models::{FullTransaction, Item, Person, Receipt, Transaction};
use crate::error::AppResult;
use sqlx::{Row, SqlitePool};

pub async fn insert_full(pool: &SqlitePool, full: &FullTransaction) -> AppResult<()> {
    // Decode + validate bytes for every receipt before opening the tx, so we
    // never half-write a transaction whose payload was invalid.
    let mut decoded: Vec<(usize, Vec<u8>)> = Vec::with_capacity(full.receipts.len());
    for (idx, r) in full.receipts.iter().enumerate() {
        if r.image_bytes_base64.is_empty() {
            return Err(crate::error::AppError::Other(format!(
                "receipt {} missing image bytes", r.id
            )));
        }
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(&r.image_bytes_base64)
            .map_err(|e| crate::error::AppError::Other(format!(
                "receipt {} base64 decode: {e}", r.id
            )))?;
        decoded.push((idx, bytes));
    }

    if let Some(ref pid) = full.transaction.paid_by_person_id {
        if !full.people.iter().any(|p| &p.id == pid) {
            return Err(crate::error::AppError::InvalidPayer);
        }
    }

    let mut tx = pool.begin().await?;

    sqlx::query(
        "INSERT INTO transactions (id, title, currency, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&full.transaction.id)
    .bind(&full.transaction.title)
    .bind(&full.transaction.currency)
    .bind(full.transaction.created_at)
    .bind(full.transaction.updated_at)
    .execute(&mut *tx)
    .await?;

    for p in &full.people {
        sqlx::query(
            "INSERT INTO transaction_people (id, transaction_id, name, position, paid_at)
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&p.id).bind(&p.transaction_id).bind(&p.name).bind(p.position).bind(p.paid_at)
        .execute(&mut *tx).await?;
    }

    for (idx, bytes) in &decoded {
        let r = &full.receipts[*idx];
        let mime = if r.mime.is_empty() { "image/jpeg" } else { r.mime.as_str() };
        let size = bytes.len() as i64;
        sqlx::query(
            "INSERT INTO receipts (id, transaction_id, image_path, position, scanned_at,
                                   image_bytes, mime, byte_size)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&r.id).bind(&r.transaction_id).bind(&r.image_path)
        .bind(r.position).bind(r.scanned_at)
        .bind(bytes).bind(mime).bind(size)
        .execute(&mut *tx).await?;
    }

    for it in &full.items {
        sqlx::query(
            "INSERT INTO items (id, transaction_id, receipt_id, raw_code, name,
              price_cents, kind, position)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&it.id).bind(&it.transaction_id).bind(&it.receipt_id)
        .bind(&it.raw_code).bind(&it.name).bind(it.price_cents)
        .bind(&it.kind).bind(it.position)
        .execute(&mut *tx).await?;

        for pid in &it.assigned_person_ids {
            sqlx::query(
                "INSERT INTO item_assignments (item_id, person_id) VALUES (?, ?)",
            )
            .bind(&it.id).bind(pid).execute(&mut *tx).await?;
        }
    }

    if let Some(ref pid) = full.transaction.paid_by_person_id {
        sqlx::query("UPDATE transactions SET paid_by_person_id = ? WHERE id = ?")
            .bind(pid)
            .bind(&full.transaction.id)
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;
    Ok(())
}

pub async fn replace_full(pool: &SqlitePool, full: &FullTransaction) -> AppResult<()> {
    // Snapshot existing receipt bytes so payloads that omit bytes (the edit
    // flow) preserve the original blob.
    struct ExistingBytes {
        bytes: Vec<u8>,
        mime: String,
        byte_size: i64,
    }
    let existing_rows = sqlx::query(
        "SELECT id, image_bytes, mime, byte_size FROM receipts WHERE transaction_id = ?",
    )
    .bind(&full.transaction.id)
    .fetch_all(pool).await?;
    let existing: std::collections::HashMap<String, ExistingBytes> = existing_rows
        .into_iter()
        .map(|r| (
            r.get::<String, _>("id"),
            ExistingBytes {
                bytes: r.get::<Vec<u8>, _>("image_bytes"),
                mime: r.get::<String, _>("mime"),
                byte_size: r.get::<i64, _>("byte_size"),
            },
        ))
        .collect();

    // Resolve final bytes for every receipt up front.
    let mut resolved: Vec<(Vec<u8>, String, i64)> = Vec::with_capacity(full.receipts.len());
    for r in &full.receipts {
        if r.image_bytes_base64.is_empty() {
            match existing.get(&r.id) {
                Some(prev) if !prev.bytes.is_empty() => {
                    let mime = if prev.mime.is_empty() { "image/jpeg".to_string() } else { prev.mime.clone() };
                    resolved.push((prev.bytes.clone(), mime, prev.byte_size));
                }
                _ => {
                    return Err(crate::error::AppError::Other(format!(
                        "receipt {} missing image bytes (no existing row to fall back to)", r.id
                    )));
                }
            }
        } else {
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(&r.image_bytes_base64)
                .map_err(|e| crate::error::AppError::Other(format!(
                    "receipt {} base64 decode: {e}", r.id
                )))?;
            let mime = if r.mime.is_empty() { "image/jpeg".to_string() } else { r.mime.clone() };
            let size = bytes.len() as i64;
            resolved.push((bytes, mime, size));
        }
    }

    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM items WHERE transaction_id = ?")
        .bind(&full.transaction.id).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM transaction_people WHERE transaction_id = ?")
        .bind(&full.transaction.id).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM receipts WHERE transaction_id = ?")
        .bind(&full.transaction.id).execute(&mut *tx).await?;
    sqlx::query(
        "UPDATE transactions SET title=?, currency=?, updated_at=? WHERE id=?",
    )
    .bind(&full.transaction.title).bind(&full.transaction.currency)
    .bind(full.transaction.updated_at).bind(&full.transaction.id)
    .execute(&mut *tx).await?;
    tx.commit().await?;

    let mut tx2 = pool.begin().await?;
    for p in &full.people {
        sqlx::query("INSERT INTO transaction_people (id, transaction_id, name, position, paid_at) VALUES (?, ?, ?, ?, ?)")
            .bind(&p.id).bind(&p.transaction_id).bind(&p.name).bind(p.position).bind(p.paid_at)
            .execute(&mut *tx2).await?;
    }
    for (i, r) in full.receipts.iter().enumerate() {
        let (bytes, mime, size) = &resolved[i];
        sqlx::query(
            "INSERT INTO receipts (id, transaction_id, image_path, position, scanned_at,
                                   image_bytes, mime, byte_size)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&r.id).bind(&r.transaction_id).bind(&r.image_path)
        .bind(r.position).bind(r.scanned_at)
        .bind(bytes).bind(mime).bind(size)
        .execute(&mut *tx2).await?;
    }
    for it in &full.items {
        sqlx::query("INSERT INTO items (id, transaction_id, receipt_id, raw_code, name, price_cents, kind, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(&it.id).bind(&it.transaction_id).bind(&it.receipt_id).bind(&it.raw_code)
            .bind(&it.name).bind(it.price_cents).bind(&it.kind).bind(it.position)
            .execute(&mut *tx2).await?;
        for pid in &it.assigned_person_ids {
            sqlx::query("INSERT INTO item_assignments (item_id, person_id) VALUES (?, ?)")
                .bind(&it.id).bind(pid).execute(&mut *tx2).await?;
        }
    }
    tx2.commit().await?;
    Ok(())
}

pub async fn get_full(pool: &SqlitePool, id: &str) -> AppResult<FullTransaction> {
    let row = sqlx::query(
        "SELECT id, title, currency, created_at, updated_at, paid_by_person_id
         FROM transactions WHERE id = ?",
    )
    .bind(id).fetch_optional(pool).await?;
    let row = row.ok_or(crate::error::AppError::NotFound)?;
    let transaction = Transaction {
        id: row.get("id"),
        title: row.get("title"),
        currency: row.get("currency"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
        paid_by_person_id: row.get("paid_by_person_id"),
    };

    let people: Vec<Person> = sqlx::query(
        "SELECT id, transaction_id, name, position, paid_at FROM transaction_people
         WHERE transaction_id = ? ORDER BY position",
    )
    .bind(id)
    .fetch_all(pool).await?
    .into_iter()
    .map(|r| Person {
        id: r.get("id"), transaction_id: r.get("transaction_id"),
        name: r.get("name"), position: r.get("position"),
        paid_at: r.get("paid_at"),
    })
    .collect();

    let receipts: Vec<Receipt> = sqlx::query(
        "SELECT id, transaction_id, image_path, position, scanned_at, mime, byte_size
           FROM receipts
          WHERE transaction_id = ? ORDER BY position",
    )
    .bind(id)
    .fetch_all(pool).await?
    .into_iter()
    .map(|r| Receipt {
        id: r.get("id"),
        transaction_id: r.get("transaction_id"),
        image_path: r.get("image_path"),
        position: r.get("position"),
        scanned_at: r.get("scanned_at"),
        image_bytes_base64: String::new(),
        mime: r.get("mime"),
        byte_size: r.get("byte_size"),
    })
    .collect();

    let item_rows = sqlx::query(
        "SELECT id, transaction_id, receipt_id, raw_code, name, price_cents, kind, position
         FROM items WHERE transaction_id = ? ORDER BY position",
    )
    .bind(id).fetch_all(pool).await?;

    let mut items: Vec<Item> = Vec::with_capacity(item_rows.len());
    for r in item_rows {
        let item_id: String = r.get("id");
        let assigns: Vec<String> = sqlx::query(
            "SELECT person_id FROM item_assignments WHERE item_id = ?",
        )
        .bind(&item_id).fetch_all(pool).await?
        .into_iter().map(|x| x.get("person_id")).collect();
        items.push(Item {
            id: item_id,
            transaction_id: r.get("transaction_id"),
            receipt_id: r.get("receipt_id"),
            raw_code: r.get("raw_code"),
            name: r.get("name"),
            price_cents: r.get("price_cents"),
            kind: r.get("kind"),
            position: r.get("position"),
            assigned_person_ids: assigns,
        });
    }

    Ok(FullTransaction { transaction, people, receipts, items })
}

pub async fn list_summaries(pool: &SqlitePool) -> AppResult<Vec<TransactionSummary>> {
    // Aggregate people and items in independent subqueries so the joins
    // don't multiply each other (people_count × items_count rows).
    let rows = sqlx::query(
        "SELECT t.id, t.title, t.currency, t.updated_at,
                COALESCE(p.people_count, 0) AS people_count,
                COALESCE(p.paid_count, 0)   AS paid_count,
                COALESCE(i.total_cents, 0)  AS total_cents
         FROM transactions t
         LEFT JOIN (
             SELECT transaction_id,
                    COUNT(*) AS people_count,
                    SUM(CASE WHEN paid_at IS NOT NULL THEN 1 ELSE 0 END) AS paid_count
             FROM transaction_people
             GROUP BY transaction_id
         ) p ON p.transaction_id = t.id
         LEFT JOIN (
             SELECT transaction_id, SUM(price_cents) AS total_cents
             FROM items
             GROUP BY transaction_id
         ) i ON i.transaction_id = t.id
         ORDER BY t.updated_at DESC",
    )
    .fetch_all(pool).await?;
    Ok(rows.into_iter().map(|r| TransactionSummary {
        id: r.get("id"),
        title: r.get("title"),
        currency: r.get("currency"),
        updated_at: r.get("updated_at"),
        people_count: r.get("people_count"),
        paid_count: r.get("paid_count"),
        total_cents: r.get("total_cents"),
    }).collect())
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionSummary {
    pub id: String,
    pub title: String,
    pub currency: String,
    pub updated_at: i64,
    pub people_count: i64,
    pub paid_count: i64,
    pub total_cents: i64,
}

pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<Vec<String>> {
    let paths: Vec<String> = sqlx::query(
        "SELECT image_path FROM receipts WHERE transaction_id = ?",
    )
    .bind(id).fetch_all(pool).await?
    .into_iter().map(|r| r.get("image_path")).collect();

    sqlx::query("DELETE FROM transactions WHERE id = ?")
        .bind(id).execute(pool).await?;
    Ok(paths)
}

pub async fn set_person_paid(
    pool: &SqlitePool,
    person_id: &str,
    paid: bool,
) -> AppResult<()> {
    let now_ms = chrono::Utc::now().timestamp_millis();
    let new_paid_at: Option<i64> = if paid { Some(now_ms) } else { None };

    let mut tx = pool.begin().await?;

    let result = sqlx::query(
        "UPDATE transaction_people SET paid_at = ? WHERE id = ?",
    )
    .bind(new_paid_at)
    .bind(person_id)
    .execute(&mut *tx)
    .await?;

    if result.rows_affected() == 0 {
        return Err(crate::error::AppError::NotFound);
    }

    sqlx::query(
        "UPDATE transactions SET updated_at = ?
         WHERE id = (SELECT transaction_id FROM transaction_people WHERE id = ?)",
    )
    .bind(now_ms)
    .bind(person_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(())
}
