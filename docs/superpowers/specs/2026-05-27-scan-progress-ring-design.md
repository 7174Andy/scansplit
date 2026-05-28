# Scan progress ring — design

## Goal

Show a circular progress ring around the X (remove) button on a receipt thumbnail while the receipt is being scanned, so the user can see scan progress instead of a static "scanning…" label. The ring snaps to discrete fill levels as the scan moves through real backend stages.

## User-visible behavior

- When a scan starts, the receipt thumbnail's X button is wrapped by an SVG circular progress ring. The X stays clickable (clicking it cancels the receipt the same way it does today).
- The ring has three fill states tied to real scan stages:
  - **25%** — image prepared locally (file read, HEIC decoded, downsized if needed). Visible from the moment `scanReceipt` is invoked.
  - **75%** — Anthropic API call returned.
  - **100%** — post-processing done (`apply_learned`, `process_for_storage`, base64 encode). Visible briefly before status flips to `ok` and the check mark replaces the ring.
- The current `"scanning…"` text under the thumbnail is replaced with a stage label:
  - `"Preparing…"` (stage `prepare`)
  - `"Analyzing receipt…"` (stage `anthropic`)
  - `"Finalizing…"` (stage `finalize`)
- Fill snaps between levels via a 300 ms CSS transition on `stroke-dashoffset` so transitions feel smooth rather than instant.
- On success: ring is replaced by the existing `Check` icon + `"✓ Scanned in X.X s"` line. On error: ring is replaced by the existing `AlertCircle` + error treatment.

## Why this shape

The Anthropic API call dominates total scan time (~80% of 3–10 s) and gives no progress signal back. A determinate ring that fakes within-stage progress would mislead; an indeterminate spinner would hide the real structure of the work. Discrete snaps to honest stage boundaries — image prep / API / post-process — are the most accurate representation we can show.

## Architecture

```
Step1Scan.tsx              wizardStore                Rust scan_receipt
─────────────────────────  ─────────────────────────  ──────────────────────────
pickFiles() → scanOne(id)
                           setScanStage(id,"prepare")
                           (set on scan start, no event)
api.scanReceipt(path,id)  ───────────────────────────► reads file
                                                       prepares image
                                                       emit "scan-progress"
                           setScanStage(id,"anthropic")←  { receiptId, stage:"anthropic" }
                                                       POSTs to Anthropic
                                                       (3–10s wait, no events)
                                                       emit "scan-progress"
                           setScanStage(id,"finalize") ←  { receiptId, stage:"finalize" }
                                                       apply_learned + process_for_storage
                                                       returns ScanResult
                           setScanStatus(id,"ok")←   scanOne resolves
                           (clears scanStage[id])
```

**Key decisions:**

- The frontend assigns the `receiptId` before calling `scanReceipt` (already does today) and passes it as a new arg so Rust can include it in every emitted event.
- Tauri's global event channel carries `scan-progress` events. One `listen()` is registered at `Step1Scan` mount and cleaned up on unmount. The frontend filters by `receiptId` in the payload.
- The `prepare` stage has no Rust event — the frontend sets it itself when `scanOne` starts. This avoids a useless event for a stage that fires within microseconds.
- `scanStage` lives in `wizardStore` alongside `scanStatus`, keyed by `receiptId`. Cleared automatically when status reaches `"ok"` or `"error"`.

## Frontend changes

### New component: `src/components/ScanProgressRing.tsx`

```ts
interface Props {
  stage: "prepare" | "anthropic" | "finalize";
  onRemove: () => void;
}
```

- SVG circle (32 px diameter, 3 px stroke) with two concentric arcs: a faint background ring (`muted` token) and a foreground arc (`primary` token) whose `stroke-dashoffset` is computed from `stage`:
  - `prepare` → 25%
  - `anthropic` → 75%
  - `finalize` → 100%
- CSS `transition: stroke-dashoffset 300ms ease-out` on the foreground arc.
- Lucide `X` icon centered inside, wired as the remove button (calls `onRemove`). Same accessibility treatment as the existing X button.

### `src/components/ReceiptThumbnail.tsx`

Add a new optional prop:

```ts
stage?: "prepare" | "anthropic" | "finalize";
```

When `status === "scanning"`:

- Replace the bare X button with `<ScanProgressRing stage={stage ?? "prepare"} onRemove={onRemove} />`.
- Replace the `"scanning…"` text with the appropriate stage label.

When `status` is anything else, render unchanged.

### `src/pages/Wizard/Step1Scan.tsx`

- In a `useEffect` on mount, register `listen<ScanProgressEvent>("scan-progress", e => setScanStage(e.payload.receiptId, e.payload.stage))`. Return its `unlisten` from the effect.
- In `scanOne`, call `setScanStage(id, "prepare")` before `await api.scanReceipt(...)`.
- Pass `receiptId` to `api.scanReceipt(sourcePath, receiptId)`.
- Pass `stage={scanStage[r.id]}` to each `<ReceiptThumbnail>`.

### `src/store/wizardStore.ts`

- New state: `scanStage: Record<string, "prepare" | "anthropic" | "finalize">`.
- New action: `setScanStage(id, stage)`.
- Existing `setScanStatus`: when the new status is `"ok"` or `"error"`, also clear `scanStage[id]`.
- Persisted via the existing `persist` middleware (sessionStorage, key `scansplit-wizard`).

### `src/lib/tauri.ts`

- `scanReceipt` signature becomes `scanReceipt(sourcePath: string, receiptId: string)`.
- The `stubApi` test implementation accepts the new arg and ignores it.

### `src/lib/types.ts`

- Add `ScanStage = "prepare" | "anthropic" | "finalize"`.
- Add `ScanProgressEvent = { receiptId: string; stage: ScanStage }`.

## Rust changes

### `src-tauri/src/commands/ocr.rs`

`scan_receipt` gains two parameters:

```rust
#[tauri::command]
pub async fn scan_receipt(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    source_path: String,
    receipt_id: String,
) -> AppResult<ScanResult> {
    let key = crate::commands::settings::read_api_key()?
        .ok_or(AppError::MissingApiKey)?;
    let scanner: Box<dyn Scanner> = Box::new(ClaudeScanner::new(key));

    let bytes = std::fs::read(&source_path)?;
    let (prepared, media_type) = crate::ocr::claude::prepare_image(&bytes)?;
    emit_progress(&app, &receipt_id, "anthropic");

    let mut parsed: ParsedReceipt = scanner.scan_prepared(&prepared, media_type).await?;
    emit_progress(&app, &receipt_id, "finalize");

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

    Ok(ScanResult { /* unchanged */ })
}

fn emit_progress(app: &tauri::AppHandle, receipt_id: &str, stage: &str) {
    use tauri::Emitter;
    let _ = app.emit("scan-progress", serde_json::json!({
        "receiptId": receipt_id,
        "stage": stage,
    }));
}
```

`emit` failures are intentionally ignored — a missed event isn't worth aborting a scan over.

### `src-tauri/src/ocr/mod.rs` and `src-tauri/src/ocr/claude.rs`

The `Scanner` trait gains a second method so the command can split image prep from the API call (the prep step must happen before the `anthropic` event is emitted).

```rust
#[async_trait::async_trait]
pub trait Scanner {
    async fn scan_prepared(
        &self,
        prepared_bytes: &[u8],
        media_type: &'static str,
    ) -> AppResult<ParsedReceipt>;

    // Default: prep + scan_prepared. Existing callers keep working.
    async fn scan(&self, image_bytes: &[u8]) -> AppResult<ParsedReceipt> {
        let (prepared, media_type) = crate::ocr::claude::prepare_image(image_bytes)?;
        self.scan_prepared(&prepared, media_type).await
    }
}
```

`ClaudeScanner::scan` is removed; its body (everything after `prepare_image`) becomes `ClaudeScanner::scan_prepared`. `ClaudeScanner` is currently the only `impl Scanner` in the codebase, so no other implementations need migration.

### Tauri capabilities

The existing `src-tauri/capabilities/default.json` already grants `core:default`, which in Tauri v2 includes the event listen/emit permissions. No capability changes are needed.

## Error handling

| Scenario | Behavior |
| --- | --- |
| `app.emit` fails | Ignored. Ring stays at previous stage until next event or final result. |
| `scanReceipt` errors mid-stage | Existing `setScanStatus(id, "error", msg)` path. Store clears `scanStage[id]` when status becomes `"error"`. Ring disappears, existing error treatment shows. |
| `listen("scan-progress")` registration fails | Caught and logged. Scan still completes; ring stays at initial 25% until success/error. |
| Events arrive for a removed receipt | `setScanStage` writes to the store; nothing renders for that id. Harmless. |
| Events arrive out of order | Tauri delivers events in emission order on the same channel; in the unlikely case of reordering, ring snaps briefly backward. Not worth special-casing. |
| User clicks X mid-scan | Preexisting behavior: `removeReceipt(id)` removes the receipt; in-flight `await` still resolves but writes to a non-existent id. Not modified by this change. |

No new error codes are added to `AppError`.

## Testing

### Frontend unit tests (Vitest, jsdom)

- `ScanProgressRing.test.tsx`: render at each stage, assert the foreground arc's `stroke-dashoffset` reflects 25% / 75% / 100% of the circumference. Assert clicking the inner X calls `onRemove`.
- `wizardStore.test.ts` (extend existing): assert `setScanStage` writes to the map. Assert `setScanStatus(id, "ok")` and `setScanStatus(id, "error")` both clear the stage entry for that id.
- `ReceiptThumbnail.test.tsx` (extend or add): when `status === "scanning"` and `stage === "anthropic"`, the stage label reads `"Analyzing receipt…"` and `ScanProgressRing` is rendered instead of the bare X.

### Rust tests (`cargo test`)

- `ocr/claude.rs`: add a test that calls `ClaudeScanner::scan_prepared` with already-prepared JPEG bytes and verifies it does not re-run `prepare_image` (no resize, no re-encode).
- Existing `prepare_image_*` tests cover prep in isolation — no new tests needed there.
- `scan_receipt` itself remains hard to unit-test (requires `AppHandle`, `AppState`, real API key); existing integration coverage via `ocr_test.rs` plus manual `pnpm tauri:dev` verification continues to apply.

### E2E (Playwright)

The existing seed hooks (`__scansplit_seed__`, `__scansplit_seed_error__`, `__scansplit_seed_empty__`) flip `pending → ok` instantly and never expose a scanning state. To test the ring, add:

```ts
__scansplit_seed_scanning__(receiptId, stage)
```

…which sets `scanStatus` to `"scanning"` and `scanStage` to the given stage. A new E2E case in `wizard.spec.ts` walks: seed at `prepare` (assert ring 25%), transition to `anthropic` (assert 75%), transition to `finalize` (assert 100%), seed `ok` (assert check mark replaces ring).

### What is NOT tested

The Tauri `listen`/`emit` round trip itself. Tauri's event system is a framework primitive — verified manually via `pnpm tauri:dev` before merge.

## Out of scope

- Cancelling an in-flight Anthropic request when the user clicks X. (Current behavior leaves the request running in the background; not changing it here.)
- Faked sub-progress inside the Anthropic stage.
- Per-stage error reporting (which stage failed). Existing single-error UX is sufficient.
- Progress for HEIC decode taking unusually long; it falls under `prepare` and is bounded by image size limits.
