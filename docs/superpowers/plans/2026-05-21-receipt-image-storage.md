# Receipt image storage & viewer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move receipt image storage from filesystem paths into SQLite BLOBs (downsized + re-encoded), and add a "View receipt" modal on the saved-transaction page.

**Architecture:** New SQL migration adds `image_bytes BLOB`, `mime TEXT`, `byte_size INTEGER` to `receipts`. Scan path produces a resized JPEG, passes base64 to the frontend, which carries it through the wizard and into `insert_full`. A new `get_receipt_image` Tauri command serves bytes on demand. A startup backfill imports legacy on-disk images into the new columns. UI gains a `ReceiptViewerDialog` opened from `TransactionView`.

**Tech Stack:** Rust + Tauri 2, sqlx + SQLite, `image` crate (already in Cargo.toml). React + TypeScript + Zustand + shadcn/ui (Dialog already generated). Tests: Rust integration tests (`src-tauri/tests/`), Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-05-21-receipt-image-storage-design.md`

---

## Task 1: Database migration

**Files:**
- Create: `src-tauri/migrations/0002_receipt_blobs.sql`
- Test: `src-tauri/tests/migration_test.rs` (new)

- [ ] **Step 1: Write the failing test**

Create `src-tauri/tests/migration_test.rs`:

```rust
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test --test migration_test`
Expected: FAIL — assertions fail because columns don't exist yet.

- [ ] **Step 3: Add the migration**

Create `src-tauri/migrations/0002_receipt_blobs.sql`:

```sql
ALTER TABLE receipts ADD COLUMN image_bytes BLOB NOT NULL DEFAULT x'';
ALTER TABLE receipts ADD COLUMN mime TEXT NOT NULL DEFAULT 'image/jpeg';
ALTER TABLE receipts ADD COLUMN byte_size INTEGER NOT NULL DEFAULT 0;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src-tauri && cargo test --test migration_test`
Expected: PASS.

- [ ] **Step 5: Confirm no other tests regressed**

Run: `cd src-tauri && cargo test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/migrations/0002_receipt_blobs.sql src-tauri/tests/migration_test.rs
git commit -m "feat(db): add image_bytes/mime/byte_size to receipts"
```

---

## Task 2: Image processing module

**Files:**
- Create: `src-tauri/src/ocr/image_processing.rs`
- Modify: `src-tauri/src/ocr/mod.rs` (add `pub mod image_processing;`)
- Test: `src-tauri/tests/image_processing_test.rs` (new)
- Test fixture: `src-tauri/tests/fixtures/small.png` (new — created by the test setup)

- [ ] **Step 1: Write the failing test**

Create `src-tauri/tests/image_processing_test.rs`:

```rust
use image::{ImageBuffer, Rgb};
use scansplit_lib::ocr::image_processing::process_for_storage;

fn make_png(width: u32, height: u32) -> Vec<u8> {
    let img: ImageBuffer<Rgb<u8>, Vec<u8>> =
        ImageBuffer::from_fn(width, height, |_, _| Rgb([200, 150, 50]));
    let mut bytes = std::io::Cursor::new(Vec::new());
    img.write_to(&mut bytes, image::ImageFormat::Png).unwrap();
    bytes.into_inner()
}

#[test]
fn resizes_when_over_max_dim() {
    let src = make_png(3000, 2000);
    let out = process_for_storage(&src).unwrap();
    assert_eq!(out.mime, "image/jpeg");
    let decoded = image::load_from_memory(&out.bytes).unwrap();
    assert!(decoded.width() <= 2000 && decoded.height() <= 2000);
    // Aspect ratio preserved (3:2 -> 2000:~1333)
    assert_eq!(decoded.width(), 2000);
    assert_eq!(decoded.height(), 1333);
}

#[test]
fn passthrough_under_max_dim() {
    let src = make_png(800, 600);
    let out = process_for_storage(&src).unwrap();
    assert_eq!(out.mime, "image/jpeg");
    let decoded = image::load_from_memory(&out.bytes).unwrap();
    assert_eq!(decoded.width(), 800);
    assert_eq!(decoded.height(), 600);
}

#[test]
fn rejects_invalid_bytes() {
    let err = process_for_storage(b"not an image").unwrap_err();
    assert!(matches!(
        err,
        scansplit_lib::error::AppError::UnsupportedImageFormat(_)
    ));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test --test image_processing_test`
Expected: FAIL — `image_processing` module does not exist yet.

- [ ] **Step 3: Create the module**

Create `src-tauri/src/ocr/image_processing.rs`:

```rust
use crate::error::{AppError, AppResult};
use image::{codecs::jpeg::JpegEncoder, imageops::FilterType, ImageReader};
use std::io::Cursor;

const MAX_EDGE: u32 = 2000;
const JPEG_QUALITY: u8 = 80;

pub struct ProcessedImage {
    pub bytes: Vec<u8>,
    pub mime: &'static str,
}

pub fn process_for_storage(source: &[u8]) -> AppResult<ProcessedImage> {
    let reader = ImageReader::new(Cursor::new(source))
        .with_guessed_format()
        .map_err(|e| AppError::UnsupportedImageFormat(e.to_string()))?;
    let img = reader
        .decode()
        .map_err(|e| AppError::UnsupportedImageFormat(e.to_string()))?;

    let (w, h) = (img.width(), img.height());
    let resized = if w.max(h) > MAX_EDGE {
        let (nw, nh) = if w >= h {
            (MAX_EDGE, (h as f32 * MAX_EDGE as f32 / w as f32) as u32)
        } else {
            ((w as f32 * MAX_EDGE as f32 / h as f32) as u32, MAX_EDGE)
        };
        img.resize_exact(nw, nh, FilterType::Lanczos3)
    } else {
        img
    };

    let rgb = resized.to_rgb8();
    let mut out = Vec::with_capacity(rgb.len() / 4);
    let mut encoder = JpegEncoder::new_with_quality(&mut out, JPEG_QUALITY);
    encoder
        .encode(
            rgb.as_raw(),
            rgb.width(),
            rgb.height(),
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|e| AppError::Other(format!("jpeg encode: {e}")))?;

    Ok(ProcessedImage {
        bytes: out,
        mime: "image/jpeg",
    })
}
```

- [ ] **Step 4: Register the module**

Edit `src-tauri/src/ocr/mod.rs` — add at the top with the other module declarations:

```rust
pub mod claude;
pub mod code_expansions;
pub mod image_processing;
```

- [ ] **Step 5: Run tests to verify pass**

Run: `cd src-tauri && cargo test --test image_processing_test`
Expected: PASS for all three tests.

- [ ] **Step 6: Confirm no other tests regressed**

Run: `cd src-tauri && cargo test`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/ocr/image_processing.rs src-tauri/src/ocr/mod.rs src-tauri/tests/image_processing_test.rs
git commit -m "feat(ocr): add image_processing module for storage downsizing"
```

---

## Task 3: Backfill helper for legacy rows

**Files:**
- Create: `src-tauri/src/db/backfill.rs`
- Modify: `src-tauri/src/db/mod.rs` (add `pub mod backfill;`)
- Test: `src-tauri/tests/backfill_test.rs` (new)

- [ ] **Step 1: Write the failing tests**

Create `src-tauri/tests/backfill_test.rs`:

```rust
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test --test backfill_test`
Expected: FAIL — `db::backfill` module does not exist.

- [ ] **Step 3: Create the module**

Create `src-tauri/src/db/backfill.rs`:

```rust
use crate::error::AppResult;
use crate::ocr::image_processing::process_for_storage;
use sqlx::{Row, SqlitePool};
use std::path::Path;

pub async fn backfill_legacy_image_paths(pool: &SqlitePool) -> AppResult<()> {
    let rows = sqlx::query(
        "SELECT id, image_path FROM receipts WHERE length(image_bytes) = 0",
    )
    .fetch_all(pool)
    .await?;

    for row in rows {
        let id: String = row.get("id");
        let image_path: String = row.get("image_path");

        // Skip rows whose image_path is no longer an absolute file (already
        // basename'd from a prior run) or whose file is gone.
        let path = Path::new(&image_path);
        if !path.is_absolute() || !path.exists() {
            continue;
        }

        let bytes = match std::fs::read(&path) {
            Ok(b) => b,
            Err(e) => {
                tracing::warn!("backfill skip {id}: read failed: {e}");
                continue;
            }
        };
        let processed = match process_for_storage(&bytes) {
            Ok(p) => p,
            Err(e) => {
                tracing::warn!("backfill skip {id}: process failed: {e}");
                continue;
            }
        };
        let basename = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        let size = processed.bytes.len() as i64;

        sqlx::query(
            "UPDATE receipts
             SET image_bytes = ?, mime = ?, byte_size = ?, image_path = ?
             WHERE id = ?",
        )
        .bind(&processed.bytes)
        .bind(processed.mime)
        .bind(size)
        .bind(&basename)
        .bind(&id)
        .execute(pool)
        .await?;

        let _ = std::fs::remove_file(&path);
    }

    Ok(())
}
```

- [ ] **Step 4: Register the module**

Edit `src-tauri/src/db/mod.rs`. Replace the top-of-file module declarations:

```rust
pub mod backfill;
pub mod models;
pub mod queries;
```

(Add `backfill` to the existing two; keep the rest of the file unchanged.)

- [ ] **Step 5: Run tests to verify pass**

Run: `cd src-tauri && cargo test --test backfill_test`
Expected: PASS for all three tests.

- [ ] **Step 6: Confirm no other tests regressed**

Run: `cd src-tauri && cargo test`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/db/backfill.rs src-tauri/src/db/mod.rs src-tauri/tests/backfill_test.rs
git commit -m "feat(db): add backfill for legacy on-disk receipt images"
```

---

## Task 4: Receipt model + insert/replace/get queries

**Files:**
- Modify: `src-tauri/src/db/models.rs`
- Modify: `src-tauri/src/db/queries.rs`
- Modify: `src-tauri/tests/transactions_test.rs`

- [ ] **Step 1: Update the Receipt model**

In `src-tauri/src/db/models.rs`, replace the existing `Receipt` struct:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Receipt {
    pub id: String,
    pub transaction_id: String,
    pub image_path: String,
    pub position: i64,
    pub scanned_at: i64,

    #[serde(default)]
    pub image_bytes_base64: String,
    #[serde(default)]
    pub mime: String,
    #[serde(default)]
    pub byte_size: i64,
}
```

The three new fields have `#[serde(default)]` so older JSON (e.g., from
`get_transaction`, which won't include them) still deserializes cleanly.

- [ ] **Step 2: Update existing test fixture for the new fields**

In `src-tauri/tests/transactions_test.rs`, replace `sample_full`:

```rust
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
```

Also update the existing `delete_cascades` assertion — `image_path` is now
`r1.jpg` instead of `/tmp/r1.jpg`:

```rust
#[tokio::test]
async fn delete_cascades() {
    let pool = fresh_pool().await;
    queries::insert_full(&pool, &sample_full("t2")).await.unwrap();
    let paths = queries::delete(&pool, "t2").await.unwrap();
    assert_eq!(paths, vec!["r1.jpg".to_string()]);
    let err = queries::get_full(&pool, "t2").await.unwrap_err();
    assert!(matches!(err, scansplit_lib::error::AppError::NotFound));
}
```

- [ ] **Step 3: Add new test for byte persistence**

Append to `src-tauri/tests/transactions_test.rs`:

```rust
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
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd src-tauri && cargo test --test transactions_test`
Expected: FAIL — `insert_full` ignores the new fields; `replace_full` ignores them too.

- [ ] **Step 5: Update queries.rs**

Edit `src-tauri/src/db/queries.rs`. Add `use base64::Engine;` near the other imports if not present. Replace the bodies of `insert_full` and `replace_full` and add the helper.

Replace the entire `insert_full` function:

```rust
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
            "INSERT INTO transaction_people (id, transaction_id, name, position)
             VALUES (?, ?, ?, ?)",
        )
        .bind(&p.id).bind(&p.transaction_id).bind(&p.name).bind(p.position)
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

    tx.commit().await?;
    Ok(())
}
```

Replace the entire `replace_full` function:

```rust
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
        sqlx::query("INSERT INTO transaction_people (id, transaction_id, name, position) VALUES (?, ?, ?, ?)")
            .bind(&p.id).bind(&p.transaction_id).bind(&p.name).bind(p.position)
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
```

Update `get_full` so the Receipt struct gets the new fields populated (but **not** the bytes — keep the response light). Replace the receipts collection block:

```rust
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
```

- [ ] **Step 6: Run tests to verify pass**

Run: `cd src-tauri && cargo test --test transactions_test`
Expected: PASS for all tests in that file.

- [ ] **Step 7: Confirm no other tests regressed**

Run: `cd src-tauri && cargo test`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/db/models.rs src-tauri/src/db/queries.rs src-tauri/tests/transactions_test.rs
git commit -m "feat(db): persist receipt image bytes in insert/replace_full"
```

---

## Task 5: `get_receipt_image` Tauri command

**Files:**
- Create: `src-tauri/src/commands/receipts.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/tests/receipts_test.rs` (new)

- [ ] **Step 1: Write the failing tests**

Create `src-tauri/tests/receipts_test.rs`:

```rust
use scansplit_lib::commands::receipts::fetch_receipt_image;
use sqlx::sqlite::SqlitePoolOptions;

async fn fresh_pool() -> sqlx::SqlitePool {
    let pool = SqlitePoolOptions::new()
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    pool
}

async fn seed_receipt(pool: &sqlx::SqlitePool, id: &str, bytes: &[u8]) {
    sqlx::query(
        "INSERT INTO transactions (id, title, currency, created_at, updated_at)
         VALUES ('t1','x','USD',1,1)",
    )
    .execute(pool).await.ok();
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test --test receipts_test`
Expected: FAIL — `commands::receipts` does not exist.

- [ ] **Step 3: Create the command module**

Create `src-tauri/src/commands/receipts.rs`:

```rust
use crate::error::{AppError, AppResult};
use crate::AppState;
use base64::Engine;
use sqlx::{Row, SqlitePool};
use tauri::State;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiptImage {
    pub mime: String,
    pub bytes_base64: String,
    pub byte_size: i64,
}

pub async fn fetch_receipt_image(pool: &SqlitePool, receipt_id: &str) -> AppResult<ReceiptImage> {
    let row = sqlx::query(
        "SELECT mime, image_bytes, byte_size FROM receipts WHERE id = ?",
    )
    .bind(receipt_id)
    .fetch_optional(pool)
    .await?;
    let row = row.ok_or(AppError::NotFound)?;

    let bytes: Vec<u8> = row.get("image_bytes");
    let mime: String = row.get("mime");
    let byte_size: i64 = row.get("byte_size");

    let bytes_base64 = if bytes.is_empty() {
        String::new()
    } else {
        base64::engine::general_purpose::STANDARD.encode(&bytes)
    };

    Ok(ReceiptImage { mime, bytes_base64, byte_size })
}

#[tauri::command]
pub async fn get_receipt_image(
    state: State<'_, AppState>,
    receipt_id: String,
) -> AppResult<ReceiptImage> {
    fetch_receipt_image(&state.pool, &receipt_id).await
}
```

- [ ] **Step 4: Register the module and command**

Edit `src-tauri/src/commands/mod.rs`. Replace its contents:

```rust
pub mod ocr;
pub mod receipts;
pub mod settings;
pub mod transactions;
```

Edit `src-tauri/src/lib.rs`. Add to the `invoke_handler!` list (after the
other `commands::ocr::*` lines):

```rust
            commands::receipts::get_receipt_image,
```

- [ ] **Step 5: Run tests to verify pass**

Run: `cd src-tauri && cargo test --test receipts_test`
Expected: PASS for all three tests.

- [ ] **Step 6: Confirm no other tests regressed**

Run: `cd src-tauri && cargo test`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands/receipts.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs src-tauri/tests/receipts_test.rs
git commit -m "feat(commands): add get_receipt_image"
```

---

## Task 6: Scan path returns bytes; stops writing to filesystem

**Files:**
- Modify: `src-tauri/src/commands/ocr.rs`

This task has no new unit test — `scan_receipt` is not directly testable
(it requires `AppHandle`, network, and keyring). The downstream tests
written in Task 4 + Task 5 already cover the storage side. We verify
manually after Task 11 lands.

- [ ] **Step 1: Update `ScanResult` and the command body**

Replace the entire contents of `src-tauri/src/commands/ocr.rs`:

```rust
use crate::error::{AppError, AppResult};
use crate::ocr::claude::ClaudeScanner;
use crate::ocr::code_expansions;
use crate::ocr::image_processing::process_for_storage;
use crate::ocr::{ParsedReceipt, Scanner};
use crate::AppState;
use base64::Engine;
use tauri::State;

#[tauri::command]
pub async fn scan_receipt(
    state: State<'_, AppState>,
    source_path: String,
) -> AppResult<ScanResult> {
    let key = crate::commands::settings::read_api_key()?
        .ok_or(AppError::MissingApiKey)?;
    let scanner: Box<dyn Scanner> = Box::new(ClaudeScanner::new(key));

    let bytes = std::fs::read(&source_path)?;

    // Use full-resolution bytes for OCR; downsize only for storage.
    let mut parsed: ParsedReceipt = scanner.scan(&bytes).await?;
    code_expansions::apply_learned(&state.pool, &mut parsed).await?;

    let processed = process_for_storage(&bytes)?;
    let image_bytes_base64 =
        base64::engine::general_purpose::STANDARD.encode(&processed.bytes);
    let byte_size = processed.bytes.len() as i64;
    let filename = std::path::Path::new(&source_path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("receipt")
        .to_string();

    Ok(ScanResult {
        image_path: filename,
        image_bytes_base64,
        mime: processed.mime.to_string(),
        byte_size,
        parsed,
    })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub image_path: String,
    pub image_bytes_base64: String,
    pub mime: String,
    pub byte_size: i64,
    pub parsed: ParsedReceipt,
}

#[tauri::command]
pub async fn record_code_corrections(
    state: State<'_, AppState>,
    merchant: Option<String>,
    corrections: Vec<(String, String)>,
) -> AppResult<()> {
    code_expansions::record_corrections(&state.pool, merchant.as_deref(), &corrections).await
}
```

Note the parameter list of `scan_receipt` changed: `AppHandle` is no longer
needed (we no longer touch the filesystem for storage).

- [ ] **Step 2: Confirm the project still compiles and tests pass**

Run: `cd src-tauri && cargo test`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/commands/ocr.rs
git commit -m "refactor(ocr): scan_receipt returns processed bytes, no disk copy"
```

---

## Task 7: Run backfill at startup

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Spawn the backfill in setup**

Edit `src-tauri/src/lib.rs`. Replace the `.setup(...)` block with:

```rust
        .setup(|app| {
            let app_dir = app.path().app_data_dir().expect("app data dir");
            let db_path = app_dir.join("scansplit.db");
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let pool = db::open_pool(&db_path).await.expect("open db");
                handle.manage(AppState { pool: pool.clone() });
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = db::backfill::backfill_legacy_image_paths(&pool).await {
                        tracing::warn!("receipt backfill failed: {e}");
                    }
                });
            });
            Ok(())
        })
```

The backfill runs in a background task so window paint is not blocked.

- [ ] **Step 2: Confirm the project compiles**

Run: `cd src-tauri && cargo build`
Expected: Success.

- [ ] **Step 3: Confirm tests still pass**

Run: `cd src-tauri && cargo test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: run receipt backfill in background at startup"
```

---

## Task 8: Frontend types + `getReceiptImage` API

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/tauri.ts`

- [ ] **Step 1: Update types**

Edit `src/lib/types.ts`. Replace `ReceiptRecord` and `ScanResult`:

```ts
export interface ReceiptRecord {
  id: string;
  transactionId: string;
  imagePath: string;
  position: number;
  scannedAt: number;
  // present in-memory during the wizard (set by scan, sent to Rust on save).
  // absent on the response from get_transaction.
  imageBytesBase64?: string;
  mime?: string;
  byteSize?: number;
}

export interface ScanResult {
  imagePath: string;
  imageBytesBase64: string;
  mime: string;
  byteSize: number;
  parsed: ParsedReceipt;
}

export interface ReceiptImagePayload {
  mime: string;
  bytesBase64: string;
  byteSize: number;
}
```

- [ ] **Step 2: Add `getReceiptImage` to the API**

Edit `src/lib/tauri.ts`. Add `ReceiptImagePayload` to the imports:

```ts
import type {
  FullTransaction,
  TransactionSummary,
  ScanResult,
  ReceiptImagePayload,
} from "./types";
```

Add to the `TauriApi` interface:

```ts
  getReceiptImage: (receiptId: string) => Promise<ReceiptImagePayload>;
```

Add to `realApi`:

```ts
  getReceiptImage: (receiptId) =>
    invoke<ReceiptImagePayload>("get_receipt_image", { receiptId }),
```

Add to `stubApi` (a 1x1 white JPEG, ~131 bytes after decode):

```ts
  getReceiptImage: async () => ({
    mime: "image/jpeg",
    bytesBase64:
      "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/wD//2Q==",
    byteSize: 131,
  }),
```

Also extend the stub to make the saved-transaction view exercisable in E2E
by remembering the last saved transaction and returning it from
`getTransaction`. Replace the entire `stubApi` definition:

```ts
let lastSaved: FullTransaction | null = null;

const stubApi: TauriApi = {
  createTransaction: async (full) => { lastSaved = full; },
  updateTransaction: async (full) => { lastSaved = full; },
  getTransaction: async (id) => {
    if (lastSaved && lastSaved.transaction.id === id) return lastSaved;
    return {
      transaction: {
        id, title: "Stub", currency: "USD", createdAt: 0, updatedAt: 0,
      },
      people: [], receipts: [], items: [],
    };
  },
  listTransactions: async () =>
    lastSaved
      ? [{
          id: lastSaved.transaction.id,
          title: lastSaved.transaction.title,
          currency: lastSaved.transaction.currency,
          updatedAt: lastSaved.transaction.updatedAt,
          peopleCount: lastSaved.people.length,
          totalCents: lastSaved.items.reduce((s, i) => s + i.priceCents, 0),
        }]
      : [],
  deleteTransaction: async () => { lastSaved = null; },
  getApiKey: async () => "test-key",
  setApiKey: async () => {},
  deleteApiKey: async () => {},
  scanReceipt: async () => {
    throw new Error("scan_receipt is not available in test mode; use the window seed hook");
  },
  recordCodeCorrections: async () => {},
  getReceiptImage: async () => ({
    mime: "image/jpeg",
    bytesBase64:
      "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/wD//2Q==",
    byteSize: 131,
  }),
};
```

The `scanReceipt` stub still throws — E2E tests never call it directly,
they use the window seed hooks. Real callers in Tauri runtime use `realApi`.

- [ ] **Step 3: Run typecheck**

Run: `pnpm build`
Expected: Build passes — no TS errors. (`pnpm build` runs `tsc` first.)

- [ ] **Step 4: Run unit tests**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/tauri.ts
git commit -m "feat(types): add receipt image fields and getReceiptImage api"
```

---

## Task 9: Carry bytes through the wizard

**Files:**
- Modify: `src/pages/Wizard/Step1Scan.tsx`

The Zustand store already accepts arbitrary patches via `setState`. We just
update the inline patch in `scanOne` to include the new fields, and update
the test-only seed hooks so E2E receipts come with bytes.

- [ ] **Step 1: Update `scanOne` to merge bytes**

Edit `src/pages/Wizard/Step1Scan.tsx`. Replace the `useWizardStore.setState`
call inside `scanOne` (currently at lines ~69-73):

```tsx
      useWizardStore.setState((st) => ({
        receipts: st.receipts.map((r) =>
          r.id === id
            ? {
                ...r,
                imagePath: result.imagePath,
                imageBytesBase64: result.imageBytesBase64,
                mime: result.mime,
                byteSize: result.byteSize,
              }
            : r
        ),
      }));
```

- [ ] **Step 2: Update the test-mode seed hooks**

In the same file, replace the three seed hooks (`__scansplit_seed__`,
`__scansplit_seed_error__`, `__scansplit_seed_empty__`). The success and
empty seeds gain real placeholder bytes so a subsequent Save through the
stub bridge does not violate `insert_full`'s bytes-required contract (and
so the viewer has something to render in E2E):

```tsx
  if (import.meta.env.MODE === "test" && typeof window !== "undefined") {
    const PLACEHOLDER_JPEG_B64 =
      "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/wD//2Q==";
    (window as any).__scansplit_seed__ = (receiptId: string, parsed: any) => {
      const id = receiptId;
      addReceipt({
        id, transactionId: transaction.id, imagePath: "seed.jpg",
        position: receipts.length, scannedAt: 0,
        imageBytesBase64: PLACEHOLDER_JPEG_B64,
        mime: "image/jpeg",
        byteSize: 131,
      } as any);
      setScanStatus(id, "ok");
      mergeParsed(id, parsed);
    };
    (window as any).__scansplit_seed_error__ = (receiptId: string, message: string) => {
      addReceipt({
        id: receiptId, transactionId: transaction.id, imagePath: "seed.jpg",
        position: receipts.length, scannedAt: 0,
      });
      setScanStatus(receiptId, "error", message);
    };
    (window as any).__scansplit_seed_empty__ = (receiptId: string) => {
      addReceipt({
        id: receiptId, transactionId: transaction.id, imagePath: "seed.jpg",
        position: receipts.length, scannedAt: 0,
        imageBytesBase64: PLACEHOLDER_JPEG_B64,
        mime: "image/jpeg",
        byteSize: 131,
      } as any);
      setScanStatus(receiptId, "ok");
      mergeParsed(receiptId, { merchant: null, items: [] });
    };
  }
```

- [ ] **Step 3: Run unit tests**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Step 4: Run E2E**

Run: `pnpm e2e`
Expected: All Playwright tests pass. (The existing tests now exercise the
new bytes path through the stub bridge.)

- [ ] **Step 5: Commit**

```bash
git add src/pages/Wizard/Step1Scan.tsx
git commit -m "feat(wizard): carry receipt image bytes through scan flow"
```

---

## Task 10: `ReceiptViewerDialog` component

**Files:**
- Create: `src/components/ReceiptViewerDialog.tsx`
- Test: `src/components/ReceiptViewerDialog.test.tsx` (new)

- [ ] **Step 1: Write the failing tests**

Create `src/components/ReceiptViewerDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ReceiptViewerDialog } from "./ReceiptViewerDialog";
import type { ReceiptRecord } from "@/lib/types";

vi.mock("@/lib/tauri", () => ({
  api: {
    getReceiptImage: vi.fn(),
  },
}));

import { api } from "@/lib/tauri";

const receipts: ReceiptRecord[] = [
  { id: "r1", transactionId: "t1", imagePath: "first.jpg", position: 0, scannedAt: 0 },
  { id: "r2", transactionId: "t1", imagePath: "second.jpg", position: 1, scannedAt: 0 },
];

beforeEach(() => {
  vi.mocked(api.getReceiptImage).mockReset();
});

describe("ReceiptViewerDialog", () => {
  it("renders image with data url after fetch", async () => {
    vi.mocked(api.getReceiptImage).mockResolvedValue({
      mime: "image/jpeg",
      bytesBase64: "AAAA",
      byteSize: 3,
    });
    render(
      <ReceiptViewerDialog
        receipts={receipts}
        initialIndex={0}
        open={true}
        onOpenChange={() => {}}
      />,
    );
    await waitFor(() => {
      const img = screen.getByRole("img", { name: /first\.jpg/i });
      expect((img as HTMLImageElement).src).toBe("data:image/jpeg;base64,AAAA");
    });
  });

  it("cycles to the next receipt and fetches its image", async () => {
    vi.mocked(api.getReceiptImage)
      .mockResolvedValueOnce({ mime: "image/jpeg", bytesBase64: "AAAA", byteSize: 3 })
      .mockResolvedValueOnce({ mime: "image/jpeg", bytesBase64: "BBBB", byteSize: 3 });
    render(
      <ReceiptViewerDialog
        receipts={receipts}
        initialIndex={0}
        open={true}
        onOpenChange={() => {}}
      />,
    );
    await waitFor(() => screen.getByRole("img", { name: /first\.jpg/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => {
      const img = screen.getByRole("img", { name: /second\.jpg/i });
      expect((img as HTMLImageElement).src).toBe("data:image/jpeg;base64,BBBB");
    });
    expect(api.getReceiptImage).toHaveBeenCalledTimes(2);
  });

  it("shows unavailable message when bytes are empty", async () => {
    vi.mocked(api.getReceiptImage).mockResolvedValue({
      mime: "image/jpeg",
      bytesBase64: "",
      byteSize: 0,
    });
    render(
      <ReceiptViewerDialog
        receipts={[receipts[0]]}
        initialIndex={0}
        open={true}
        onOpenChange={() => {}}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText(/image no longer available/i)).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/components/ReceiptViewerDialog.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the component**

Create `src/components/ReceiptViewerDialog.tsx`:

```tsx
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/tauri";
import type { ReceiptRecord } from "@/lib/types";

interface Props {
  receipts: ReceiptRecord[];
  initialIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CacheEntry {
  dataUrl: string | null;
  loading: boolean;
  error: string | null;
}

export function ReceiptViewerDialog({ receipts, initialIndex, open, onOpenChange }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [cache, setCache] = useState<Record<string, CacheEntry>>({});

  // Reset index when re-opened.
  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [open, initialIndex]);

  const active = receipts[index];

  // Fetch on first display of each receipt.
  useEffect(() => {
    if (!open || !active) return;
    if (cache[active.id]) return;

    setCache((c) => ({ ...c, [active.id]: { dataUrl: null, loading: true, error: null } }));
    api
      .getReceiptImage(active.id)
      .then((res) => {
        if (!res.bytesBase64) {
          setCache((c) => ({
            ...c,
            [active.id]: { dataUrl: null, loading: false, error: "Image no longer available" },
          }));
          return;
        }
        const dataUrl = `data:${res.mime};base64,${res.bytesBase64}`;
        setCache((c) => ({ ...c, [active.id]: { dataUrl, loading: false, error: null } }));
      })
      .catch((e) => {
        const msg = String(e?.message ?? e);
        setCache((c) => ({
          ...c,
          [active.id]: { dataUrl: null, loading: false, error: msg },
        }));
      });
  }, [open, active, cache]);

  // Keyboard nav.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      else if (e.key === "ArrowRight") setIndex((i) => Math.min(receipts.length - 1, i + 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, receipts.length]);

  if (!active) return null;
  const entry = cache[active.id];
  const filename = active.imagePath || "receipt";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogTitle className="text-base">{filename}</DialogTitle>
        <div className="flex min-h-[40vh] items-center justify-center bg-muted/30 p-2">
          {entry?.loading && (
            <div className="text-muted-foreground">Loading…</div>
          )}
          {entry?.error && (
            <div className="text-destructive">{entry.error}</div>
          )}
          {entry?.dataUrl && (
            <img
              src={entry.dataUrl}
              alt={filename}
              className="max-h-[70vh] max-w-full object-contain"
            />
          )}
        </div>
        {receipts.length > 1 && (
          <div className="mt-2 flex items-center justify-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous"
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="text-sm text-muted-foreground">
              {index + 1} / {receipts.length}
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next"
              disabled={index === receipts.length - 1}
              onClick={() => setIndex((i) => Math.min(receipts.length - 1, i + 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/components/ReceiptViewerDialog.test.tsx`
Expected: PASS — all three cases.

- [ ] **Step 5: Confirm no other tests regressed**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/ReceiptViewerDialog.tsx src/components/ReceiptViewerDialog.test.tsx
git commit -m "feat(ui): add ReceiptViewerDialog component"
```

---

## Task 11: Wire viewer into `TransactionView`

**Files:**
- Modify: `src/pages/TransactionView.tsx`

- [ ] **Step 1: Add state and button**

Edit `src/pages/TransactionView.tsx`. Replace the whole file:

```tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Copy as CopyIcon, Image as ImageIcon, Pencil, Trash2 } from "lucide-react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { api } from "@/lib/tauri";
import { computeSplit } from "@/lib/splitMath";
import { SplitTotalsTable } from "@/components/SplitTotalsTable";
import { ReceiptViewerDialog } from "@/components/ReceiptViewerDialog";
import { formatCents } from "@/lib/formatCurrency";
import { useWizardStore } from "@/store/wizardStore";
import { Button } from "@/components/ui/button";
import type { FullTransaction } from "@/lib/types";

export default function TransactionView() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [full, setFull] = useState<FullTransaction | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ open: boolean; index: number }>({
    open: false,
    index: 0,
  });
  const loadFrom = useWizardStore((s) => s.loadFrom);

  useEffect(() => {
    api.getTransaction(id).then(setFull).catch((e) => setErr(String(e?.message ?? e)));
  }, [id]);

  const split = useMemo(() => {
    if (!full) return null;
    return computeSplit(
      full.items.map((i) => ({
        id: i.id, name: i.name, priceCents: i.priceCents,
        kind: i.kind, assignedPersonIds: i.assignedPersonIds,
      })),
      full.people.map((p) => ({ id: p.id, name: p.name }))
    );
  }, [full]);

  if (err) return <div className="p-6 text-destructive">Error: {err}</div>;
  if (!full || !split) return <div className="p-6 text-muted-foreground">Loading…</div>;

  const personNames = Object.fromEntries(full.people.map((p) => [p.id, p.name]));
  const itemNames = Object.fromEntries(full.items.map((i) => [i.id, i.name]));

  async function copy() {
    if (!full || !split) return;
    const lines = [
      full.transaction.title,
      ...split.perPerson.map((p) => {
        const name = personNames[p.personId] ?? "?";
        const detail = p.itemBreakdown
          .map((b) => itemNames[b.itemId] ?? b.itemId).join(", ");
        return `${name}: ${formatCents(p.totalCents, full.transaction.currency)} (${detail})`;
      }),
      `Total: ${formatCents(split.totalCents, full.transaction.currency)}`,
    ];
    try {
      await writeText(lines.join("\n"));
    } catch {
      // ignore in test mode
    }
  }

  async function del() {
    if (!confirm("Delete this transaction? This cannot be undone.")) return;
    try {
      await api.deleteTransaction(id);
      navigate("/");
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  }

  function edit() {
    if (!full) return;
    loadFrom(full);
    navigate("/transaction/new");
  }

  const hasReceipts = full.receipts.length > 0;
  const viewLabel = full.receipts.length > 1 ? "View receipts" : "View receipt";

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Button variant="ghost" onClick={() => navigate("/")}>
        <ArrowLeft className="size-4" /> Home
      </Button>
      <h1 className="mt-4 text-3xl font-bold">{full.transaction.title}</h1>
      <div className="mb-4 flex gap-2">
        <Button variant="outline" onClick={copy}>
          <CopyIcon className="size-4" /> Copy
        </Button>
        {hasReceipts && (
          <Button variant="outline" onClick={() => setViewer({ open: true, index: 0 })}>
            <ImageIcon className="size-4" /> {viewLabel}
          </Button>
        )}
        <Button variant="outline" onClick={edit}>
          <Pencil className="size-4" /> Edit
        </Button>
        <Button variant="destructive" onClick={del}>
          <Trash2 className="size-4" /> Delete
        </Button>
      </div>
      <SplitTotalsTable
        split={split}
        personNames={personNames}
        itemNames={itemNames}
        currency={full.transaction.currency}
      />

      <ReceiptViewerDialog
        receipts={full.receipts}
        initialIndex={viewer.index}
        open={viewer.open}
        onOpenChange={(o) => setViewer((v) => ({ ...v, open: o }))}
      />
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck and unit tests**

Run: `pnpm build && pnpm test`
Expected: Both pass.

- [ ] **Step 3: Commit**

```bash
git add src/pages/TransactionView.tsx
git commit -m "feat(ui): add View receipt button to transaction page"
```

---

## Task 12: E2E test for the viewer

**Files:**
- Modify: `src/test/e2e/wizard.spec.ts` (append a new test)

- [ ] **Step 1: Write the E2E test**

Append to `src/test/e2e/wizard.spec.ts`. The wizard flow mirrors the
existing "happy path" test in that file, then continues into Save and the
saved-transaction view:

```ts
test("view receipt button opens the receipt image in a modal", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New Split" }).click();

  await page.evaluate(() => {
    (window as any).__scansplit_seed__("r-viewer", {
      merchant: "Trader Joe's",
      items: [
        { raw: "MILK", name: "Milk", priceCents: 349, kind: "item" },
      ],
    });
  });

  // Step 1 -> 2
  await page.getByRole("button", { name: "Next" }).click();
  // Step 2 -> 3
  await page.getByRole("button", { name: "Next" }).click();
  // Step 3: add one person
  await page.getByPlaceholder("Name").fill("Alice");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  // Step 4 -> 5
  await page.getByRole("button", { name: "Next" }).click();

  // Step 5: Save -> navigates to /transaction/:id
  await page.getByRole("button", { name: /^Save/ }).click();
  await page.waitForURL(/\/transaction\/[^/]+$/);

  // View receipt button visible (1 receipt -> singular label).
  const viewBtn = page.getByRole("button", { name: /^View receipt$/ });
  await expect(viewBtn).toBeVisible();
  await viewBtn.click();

  const img = page.getByRole("img", { name: /seed\.jpg/i });
  await expect(img).toBeVisible();
  const src = await img.getAttribute("src");
  expect(src ?? "").toMatch(/^data:image\/jpeg;base64,/);

  // ESC closes.
  await page.keyboard.press("Escape");
  await expect(img).not.toBeVisible();
});
```

If the Save button's accessible name in Step5 differs from `^Save` (e.g.,
"Save & view"), adjust the regex to match. To confirm, search for the
button text in `src/pages/Wizard/Step5Result.tsx`:

```bash
grep -n "Save" src/pages/Wizard/Step5Result.tsx
```

The current text is `"Save"` (toggled to `"Saving…"` while in flight), so
`/^Save/` matches either state.

- [ ] **Step 2: Run the E2E test**

Run: `pnpm e2e`
Expected: PASS — viewer opens, image has a `data:image/jpeg;base64,…` src,
ESC dismisses it.

- [ ] **Step 3: Commit**

```bash
git add src/test/e2e/wizard.spec.ts
git commit -m "test(e2e): view receipt button opens modal with image"
```

---

## Final verification

- [ ] **Run the full Rust suite**

Run: `cd src-tauri && cargo test`
Expected: All tests pass.

- [ ] **Run the full frontend unit suite**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Run E2E**

Run: `pnpm e2e`
Expected: All tests pass.

- [ ] **Manual smoke test**

Run: `pnpm tauri:dev`
- Scan a real receipt photo; confirm it produces a split.
- Save the transaction.
- Open the saved transaction from the home list.
- Click "View receipt"; confirm the image renders in the modal and ESC
  closes it.
- Restart the app; reopen the same transaction; confirm the image still
  loads (it now lives in the DB).

- [ ] **Legacy migration smoke test (optional, only if you have pre-upgrade data)**

- Place a real on-disk `<app_data_dir>/receipts/<uuid>.jpg` referenced by an
  existing `receipts.image_path` row before launching.
- Launch the app; wait a few seconds; reopen the affected transaction.
- Confirm "View receipt" shows the image and the on-disk file has been
  removed.
