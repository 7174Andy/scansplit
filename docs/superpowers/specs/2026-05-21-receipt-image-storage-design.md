# Receipt image storage & viewer

**Date:** 2026-05-21
**Status:** Design

## Motivation

Today, receipt images are copied into `<app_data_dir>/receipts/<uuid>.<ext>` at
scan time and the absolute path is recorded in `receipts.image_path`. The image
is never surfaced again in the UI: once a transaction is saved, the receipt
detail page shows the split but offers no way to view the source receipt.

Two failure modes also make the current storage fragile:

1. **App data directory drift.** If the user restores `scansplit.db` to a new
   machine without bringing the `receipts/` folder, every saved row points at a
   path that does not resolve.
2. **External file deletion.** Nothing prevents the user (or a cleanup tool)
   from deleting `<app_data_dir>/receipts/<uuid>.jpg`. The DB row survives, the
   image does not, the viewer would break.

The fix: store the receipt image bytes inside SQLite, and expose them through a
modal viewer on the transaction detail page.

## Goals

- Receipt image bytes persist with the transaction in `scansplit.db`. A
  single-file backup of the DB is sufficient to restore both the split and the
  source image.
- From the saved-transaction view, the user can click "View receipt" to see
  the original image(s) without leaving the page.
- DB growth stays bounded: typical receipt photo (3-5 MB raw) is downsized
  and re-encoded so the stored blob is ~200-400 KB.
- Existing saved transactions are migrated transparently on next startup.
- No regression in scan latency. The image is processed alongside (not
  serially after) the existing Anthropic round-trip where possible.

## Non-goals

- Zoom / pan inside the viewer. Native browser rendering is adequate at the
  stored resolution.
- Image rotation controls or automatic EXIF-orientation handling. The image
  is rendered in whatever orientation the source JPEG/PNG encodes; if a phone
  photo appears sideways, the user can rotate before scanning. Auto-rotate
  can be added later if it becomes a pain point.
- Download / export of the receipt image. May be added later.
- Multi-resolution storage (thumbnail + full). One stored resolution is
  enough for this use case.

## High-level architecture

```
Scan path:
  picker file
    -> commands::ocr::scan_receipt (Rust)
         -> Anthropic API (parsed receipt JSON)
         -> image crate: decode, resize (max 2000px), re-encode JPEG q80
         -> returns { imagePath (filename only), imageBytesBase64, mime,
                      byteSize, parsed }
    -> wizardStore: ReceiptRecord now holds imageBytesBase64 + mime
                    in-memory until Save

Save path:
  wizardStore.toFull() -> FullTransaction
    -> commands::transactions::create_transaction / update_transaction
       -> queries::insert_full / replace_full
          -> base64 decode -> INSERT into receipts.image_bytes

View path:
  TransactionView mounts -> api.getTransaction(id)
    (does NOT include image bytes; light payload)
  User clicks "View receipt"
    -> ReceiptViewerDialog opens
    -> on first display of a given receipt:
         api.getReceiptImage(receiptId)
           -> commands::receipts::get_receipt_image
              -> SELECT mime, image_bytes FROM receipts WHERE id = ?
         -> data:${mime};base64,${bytesBase64}
         -> cached in the dialog so prev/next is instant
```

## Data model

### Migration `src-tauri/migrations/0002_receipt_blobs.sql`

```sql
ALTER TABLE receipts ADD COLUMN image_bytes BLOB NOT NULL DEFAULT x'';
ALTER TABLE receipts ADD COLUMN mime TEXT NOT NULL DEFAULT 'image/jpeg';
ALTER TABLE receipts ADD COLUMN byte_size INTEGER NOT NULL DEFAULT 0;
```

Notes:

- `image_path` stays, but its meaning changes: it now carries only the
  original filename (for display in the viewer caption). It is no longer a
  load-bearing pointer to a file on disk. Reads never touch the filesystem.
- `byte_size` is cheap to record at insert and useful for diagnostics; not
  used for any branching logic today.

### One-shot backfill (startup)

After `sqlx::migrate!` runs, the app enters a backfill pass:

```
For each row in receipts WHERE length(image_bytes) = 0:
  if file exists at image_path:
    bytes = read_file(image_path)
    processed = resize_and_reencode(bytes)
    UPDATE receipts SET image_bytes = ?, mime = 'image/jpeg',
                       byte_size = ?, image_path = basename(image_path)
        WHERE id = ?
    delete file at image_path
  else:
    leave row as image_bytes = x''  -- viewer treats as "image unavailable"
```

The pass is idempotent: subsequent startups find no rows with empty bytes
and exit immediately. Cost is O(rows-with-files) on first startup after the
migration; acceptable because this is a single-user local app and the user
will typically have at most a few hundred receipts.

The `receipts/` folder is left in place after backfill (empty), since
removing user-managed directories on app startup is more surprising than
useful. The folder will simply stop being written to.

### Frontend types

`src/lib/types.ts` `ReceiptRecord` gains:

```ts
interface ReceiptRecord {
  // existing fields...
  imagePath: string;          // now: filename only (or absolute path,
                              // during the wizard before save)
  imageBytesBase64?: string;  // present only in-memory during the wizard
  mime?: string;              // present only in-memory during the wizard
}
```

The optional fields are populated by the scan path and consumed by the save
path. They are deliberately absent from `get_transaction`'s response so the
detail page load stays light.

## Backend changes

### Image processing (`src-tauri/src/ocr/image_processing.rs`, new)

A small, focused module:

```rust
pub struct ProcessedImage {
    pub bytes: Vec<u8>,
    pub mime: &'static str,  // always "image/jpeg" today
}

pub fn process_for_storage(source: &[u8]) -> AppResult<ProcessedImage>;
```

Implementation:

1. Decode via the `image` crate (auto-detects format from the bytes; supports
   JPEG, PNG, WebP; HEIC support depends on platform decoders and is
   best-effort — if decode fails, return `AppError::Other` and let the
   frontend surface a friendly message).
2. If `max(width, height) > 2000`, resize via `image::imageops::resize` with
   `Lanczos3`, preserving aspect ratio.
3. Encode JPEG quality 80 with `image::codecs::jpeg::JpegEncoder`.

Unit-tested independently with a tiny test PNG.

### `commands/ocr.rs` updates

`ScanResult` changes:

```rust
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub image_path: String,        // filename only
    pub image_bytes_base64: String,
    pub mime: String,
    pub byte_size: i64,
    pub parsed: ParsedReceipt,
}
```

`scan_receipt` flow:

1. Read source bytes from `source_path`.
2. Run `process_for_storage(&source_bytes)`.
3. POST to Anthropic with the **original** bytes (parse quality is better
   from full-resolution input — the resize is for storage only).
4. Apply `code_expansions::apply_learned`.
5. Base64-encode the processed bytes, return them in `ScanResult`.
6. **Do not** copy the source file to `<app_data_dir>/receipts/`. The bytes
   live in the wizard state, then in the DB after Save.

`image_path` in `ScanResult` is the basename of `source_path` — purely for
display in the viewer's caption.

### `commands/receipts.rs` (new file)

```rust
#[tauri::command]
pub async fn get_receipt_image(
    state: State<'_, AppState>,
    receipt_id: String,
) -> AppResult<ReceiptImage>;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiptImage {
    pub mime: String,
    pub bytes_base64: String,   // "" if row exists but image_bytes is x''
    pub byte_size: i64,
}
```

- Single SELECT against the row by id.
- Returns `AppError::NotFound` if no row.
- An empty-blob row returns `bytesBase64 = ""`; the frontend renders the
  "image unavailable" state.

Registered in `lib.rs` `invoke_handler!`.

### Save path (`db/queries.rs`)

Both `insert_full` and `replace_full` need to write `image_bytes`. The
payload field is the base64 string from the frontend.

`insert_full` (new transaction):

- Every receipt in `full.receipts` must carry `imageBytesBase64` and `mime`.
- Decode base64 once per receipt; bind the resulting `Vec<u8>` to
  `image_bytes` and the string to `mime`. Compute `byte_size` from the
  decoded length.
- If any receipt is missing bytes, return `AppError::Other("receipt missing
  image bytes")`. This indicates a wizard state corruption (e.g., sessionStorage
  was cleared mid-flow) and should not silently produce phantom rows.

`replace_full` (edit-and-save existing):

- For each receipt:
  - If `imageBytesBase64` is present: write a full row, including bytes.
  - If absent: the user did not re-scan this receipt; preserve the existing
    bytes from the DB. Implementation: before the existing `DELETE FROM
    receipts WHERE transaction_id = ?`, fetch the old `(id -> image_bytes,
    mime, byte_size)` map. When re-inserting, fall back to the old values
    for receipts whose payload omits bytes.

This is the load-bearing detail that makes "edit without re-scanning" work
without forcing the frontend to round-trip the bytes through `getTransaction`.

### Startup backfill (`db/mod.rs` or `lib.rs`)

After `sqlx::migrate!`, call a `backfill_legacy_image_paths(&pool).await`
helper that performs the loop described under "One-shot backfill". Errors
are logged but do not block startup — a partially-backfilled DB is still
fully functional; remaining rows will retry next startup as long as their
files still exist.

## Frontend changes

### `src/lib/tauri.ts`

Add:

```ts
async getReceiptImage(receiptId: string): Promise<{
  mime: string;
  bytesBase64: string;
  byteSize: number;
}>
```

In test mode (`MODE === "test"`), the stub returns a tiny built-in
placeholder JPEG (base64 literal in the stub module) so E2E and unit tests
can assert the viewer renders.

### `src/store/wizardStore.ts`

`ReceiptRecord` already carries the new optional `imageBytesBase64` and
`mime` fields. No store API changes are needed beyond plumbing those fields
through the scan handler in `Step1Scan.tsx`:

```ts
// Step1Scan.tsx, inside scanOne after a successful api.scanReceipt
useWizardStore.setState((st) => ({
  receipts: st.receipts.map((r) =>
    r.id === id
      ? {
          ...r,
          imagePath: result.imagePath,
          imageBytesBase64: result.imageBytesBase64,
          mime: result.mime,
        }
      : r,
  ),
}));
```

`toFull()` passes the new fields through to the Rust bridge.

### `src/components/ReceiptViewerDialog.tsx` (new)

shadcn `Dialog` primitive (run `pnpm dlx shadcn@latest add dialog` if not
already generated). Props:

```ts
interface Props {
  receipts: ReceiptRecord[];
  initialIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

Internals:

- `const [index, setIndex] = useState(initialIndex)` — reset when `open`
  flips from false to true.
- `const [cache, setCache] = useState<Record<string, CacheEntry>>({})` where
  `CacheEntry = { dataUrl: string | null; loading: boolean; error: string | null }`.
- Effect: whenever `open && receipts[index]` and that id isn't in the cache,
  call `api.getReceiptImage(id)`. On success, build
  `data:${mime};base64,${bytesBase64}` and store. On empty bytes, store
  `{ dataUrl: null, error: "Image no longer available", loading: false }`.
- Layout: header with filename (`receipts[index].imagePath`), large `<img>`
  (`max-h-[80vh] max-w-[80vw] object-contain`), prev/next arrows + `index +
  1 / receipts.length` indicator (shown only when `receipts.length > 1`).
- Keyboard: ESC handled by Dialog primitive; `←` / `→` to step through.

### `src/pages/TransactionView.tsx`

- New state `const [viewer, setViewer] = useState<{ open: boolean; index: number }>({ open: false, index: 0 })`.
- New button `View receipt` (singular) / `View receipts` (plural) in the
  action row beside Copy / Edit / Delete. Hidden when
  `full.receipts.length === 0`.
- Clicking opens at `index: 0`.
- Renders `<ReceiptViewerDialog receipts={full.receipts} initialIndex={viewer.index} open={viewer.open} onOpenChange={(o) => setViewer({ ...viewer, open: o })} />`.

## Error handling

| Condition | Behaviour |
|---|---|
| `scan_receipt` fails to decode (corrupt / unsupported HEIC) | `AppError::Other` propagates to the existing scan-error dialog. User can retry or remove. |
| Save payload omits bytes for a brand-new receipt | `insert_full` returns `AppError::Other("receipt missing image bytes")`. Frontend surfaces the message. |
| `get_receipt_image` invoked with unknown id | `AppError::NotFound`, surfaced inside the viewer as an error caption. |
| Viewer gets `bytesBase64 = ""` (backfill couldn't find file) | "Image no longer available" rendered in place of the image. |
| Backfill encounters an unreadable file | Logged, row remains empty, startup continues. |

## Testing

### Rust (`src-tauri/tests/`)

- `image_processing_test.rs`:
  - `resizes_when_over_max_dim` — encode a 3000x2000 PNG, run through
    `process_for_storage`, assert decoded result is <= 2000 on max edge.
  - `passthrough_under_max_dim` — small image still gets re-encoded as JPEG
    (consistent mime) but dimensions unchanged.
  - `rejects_invalid_bytes` — random bytes return `Err`.
- `receipts_test.rs`:
  - `get_receipt_image_round_trips` — insert a row with known bytes, call
    `get_receipt_image`, assert base64 decodes back to the same bytes.
  - `get_receipt_image_empty_blob` — row with `image_bytes = x''` returns
    `bytesBase64 = ""`.
  - `get_receipt_image_unknown_id` — returns `NotFound`.
- `transactions_test.rs` additions:
  - `insert_full_persists_image_bytes` — payload with base64 lands in DB.
  - `insert_full_rejects_missing_bytes` — payload omitting bytes errors.
  - `replace_full_preserves_existing_bytes` — edit-and-save without bytes
    in payload keeps original blob.
- `backfill_test.rs`:
  - `backfill_reads_file_and_clears_path` — given a legacy row + temp file,
    backfill writes bytes to row and removes file.
  - `backfill_skips_missing_file` — legacy row whose file doesn't exist
    is left with empty bytes; no error.

### Frontend (`src/`)

- `lib/tauri.test.ts`: stub `getReceiptImage` is wired and returns the
  placeholder.
- `components/ReceiptViewerDialog.test.tsx`:
  - renders an `<img>` with a `data:` URL after the stubbed fetch resolves.
  - prev/next cycles index and triggers a second fetch.
  - empty-bytes response shows "Image no longer available".

### E2E (`src/test/e2e/`)

New scenario in `wizard.spec.ts` or a new spec file:

- Seed a transaction via the existing `__scansplit_seed__` hook.
- Save it, navigate to `/transaction/:id`.
- Assert "View receipt" button is visible.
- Click it; assert dialog opens and contains an `<img>` whose `src` starts
  with `data:image/jpeg;base64,`.
- Close with ESC; assert dialog dismisses.

## Migration & rollout

- Single migration file, append-only as the codebase already does.
- The first launch after upgrade runs migration `0002_receipt_blobs.sql`
  (instant — DDL only). The backfill runs in a background `tokio::spawn`
  kicked off from the setup hook, so the window paints immediately. While
  the backfill is mid-flight, the viewer renders "image unavailable" for
  any row whose bytes haven't been written yet; the next time the user
  opens that transaction (or restarts the app) the row will be ready.
  Errors during backfill are logged; they do not abort startup.
- No feature flag. The viewer simply renders the new button once the
  receipt rows are present.

## Open questions

None at present. Will revisit if implementation surfaces anything.
