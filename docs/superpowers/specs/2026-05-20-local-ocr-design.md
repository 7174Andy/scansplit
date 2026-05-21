# Local OCR — Design Spec

**Status:** Draft for v1
**Date:** 2026-05-20
**Owner:** Andrew Park
**Supersedes (partial):** The "Receipt scan flow" section of `2026-05-19-scansplit-design.md`

## Summary

Replace the always-on Claude API call in the scan flow with an **on-device OCR + heuristic parser** that runs locally on the user's machine. Claude is kept as an **opt-in fallback** the user can trigger per receipt when local results look uncertain.

The motivation is cost: the current design forces every user to set up an Anthropic API key and pay per scan. Most receipts are legible printed text; in-box platform OCR engines now read them well enough that we should not be paying an LLM to OCR a Trader Joe's receipt.

## Goals

1. **Zero per-receipt cost** in the default flow. The user never spends API credits unless they explicitly choose to.
2. **Offline scanning.** No outbound network call in the default path.
3. **Tolerate imperfect parsing** by surfacing low-confidence rows to the user in the existing wizard, riding on the project's already-established "user corrects, system learns" loop (`code_expansions`).
4. **Keep Claude available** as a rescan affordance for users who set their own API key and want better quality on tricky receipts.
5. **Cross-platform parity.** macOS, Windows, and Linux all get a working scan flow, even if quality varies.

## Non-goals

- Beating Claude on receipt-parsing quality. We expect the local parser to be measurably worse on complex retail receipts (IKEA, Costco) and accept this — the confidence model and user-review UX compensate.
- Training a custom model. We use platform-provided OCR and bundled Tesseract.
- Removing the API key code. The Claude path stays as opt-in, including its keychain wiring and Settings UI (with revised copy).
- Bounding-box overlays or visual receipt highlighting in v1.
- Multi-language receipts beyond English (the engines support more, but parser keywords are English-only).

## Decisions (committed)

These were settled during brainstorming and drive every detail below.

| Question | Decision |
|---|---|
| Where does OCR run? | **Fully local on the user's machine.** No backend service. |
| Which OCR engine? | **Apple Vision on macOS, Tesseract 5 on Windows + Linux.** Simpler than three engines, and the Windows in-box OCR is not measurably better than Tesseract for receipts. |
| How smart is the parser? | **Heuristic — layout rules + regex + keyword classification.** Confidence flags surface uncertain rows to the user. |
| Fate of the Claude path? | **Kept as opt-in fallback** for low-confidence receipts. Settings copy updated; key UX unchanged. |
| Single PR vs phased? | **Single PR.** Early-stage development; the diff is large but the change is coherent. |

## Architecture

The current scan flow:

```text
Step1Scan → api.scanReceipt → ClaudeClient.scan → ParsedReceipt
```

The new shape introduces a `Scanner` trait with two implementations and a thin command router.

```text
                              ┌─► LocalScanner ─► PlatformOcr ─► HeuristicParser ─► ParsedReceipt+confidence
Step1Scan ─► api.scanReceipt ─┤
                              └─► (only if user clicks "Rescan with Claude")
                                  api.scanReceiptWithClaude ─► ClaudeScanner ─► ParsedReceipt
```

### Backend module shape (`src-tauri/src/ocr/`)

```text
ocr/
├── mod.rs                ← exports `Scanner` trait, `ParsedReceipt`, confidence types
├── claude.rs             ← existing client, now implements Scanner (LlmClient → Scanner rename)
├── code_expansions.rs    ← unchanged, still post-processes any ParsedReceipt
└── local/
    ├── mod.rs            ← LocalScanner: orchestrates platform OCR + parser (returns raw ParsedReceipt; apply_learned runs at the command layer)
    ├── parser.rs         ← heuristic line classifier; pure function, fully unit-testable
    ├── apple.rs          ← #[cfg(target_os = "macos")] Apple Vision via objc2-vision
    └── tesseract.rs      ← #[cfg(not(target_os = "macos"))] Tesseract via leptess
```

### Platform OCR contract

Each platform adapter implements `NativeOcr`:

```rust
pub struct BBox {
    pub x_min: f32, pub y_min: f32,
    pub x_max: f32, pub y_max: f32,
}

pub struct OcrLine {
    pub text: String,
    pub bbox: BBox,            // normalized 0.0-1.0 in image space
    pub confidence: f32,       // 0.0-1.0 — engine-reported; used as a soft hint only
}

pub trait NativeOcr {
    fn recognize(&self, image_bytes: &[u8]) -> AppResult<Vec<OcrLine>>;
}
```

`OcrLine` is the parser's only input; the parser does not know which engine produced it.

### macOS — `apple.rs`

- `objc2` + `objc2-vision` bindings to `Vision.framework`.
- `VNRecognizeTextRequest` with `recognitionLevel = .accurate`, `usesLanguageCorrection = true`, `recognitionLanguages = ["en-US"]`.
- Per-observation confidence comes from `topCandidates(1).first.confidence`.
- Vision's coordinate system has origin at bottom-left; we flip `y` to top-left in the adapter so the parser is engine-agnostic.
- Calls run inside `tokio::task::spawn_blocking` (Vision is synchronous).
- macOS 13+ required (Tauri 2 baseline). No bundle bloat — Vision ships with the OS.

### Windows + Linux — `tesseract.rs`

- `leptess` crate (Rust binding to Tesseract via Leptonica).
- Tesseract 5.x with LSTM, `eng.traineddata` (default-or-best).
- Per-word confidence (0-100) averaged per line, normalized to 0-1.
- `eng.traineddata` (~15 MB) ships as a Tauri resource — users don't need a system install of language packs.

**Build-time requirements:**
- Linux: `tesseract-ocr libtesseract-dev libleptonica-dev` system packages.
- Windows: Tesseract DLL vendored into the Tauri bundle (built via vcpkg in CI). Bundle the DLL alongside the binary.

### Empirical baseline

Validated by running Apple Vision against a real 20 MB phone-photo IKEA receipt (`IMG_4387.png`):

- 74 OCR lines extracted in **672 ms** end-to-end.
- 72 of 74 lines reported `confidence = 1.00`; the 2 lower-confidence lines were decorative (logo blur at top, garbled trailing text at bottom).
- All Swedish item names (DRONA, CITRONHÄJ, PÄRKLA, STORSINT) read correctly.

**Vision's confidence score is effectively binary** (almost always 1.0, occasionally 0.5). This matches independent research and was confirmed on the test image. The parser therefore **does not threshold on engine confidence** — it derives confidence from parser-level structural signals (see below).

## Heuristic parser

Pure function: `parse(lines: Vec<OcrLine>) -> ParsedReceipt`. Six pipeline stages.

### Stage 1 — Layout normalization

Sort lines by `bbox.y_min`. **Do not y-cluster yet.** Real receipts (IKEA, Costco) have multiple OCR rows per logical item, so clustering this early would either over-merge or under-merge. Grouping happens in stage 4.

### Stage 2 — Price-column detection

Detect the dominant price column rather than chasing the receipt's right edge. Different lines on a receipt right-align to different columns (header text often reaches further right than the prices).

```rust
let price_lines: Vec<&OcrLine> = lines.iter()
    .filter(|l| price_regex().is_match(&l.text))
    .collect();
let price_col = mode_of(price_lines.iter().map(|l| l.bbox.x_max));
let line_height = median(lines.iter().map(|l| l.bbox.height));
```

A line is **in the price column** if `|l.bbox.x_max - price_col| < line_height`. This self-calibrates per receipt: on the IKEA photo it resolves to ~0.60; on a tightly-cropped restaurant receipt it resolves closer to 1.0.

`price_regex()` matches `(-?\$?\s*\d+[\.,]\d{2})` — single capture group for the price token.

### Stage 3 — Region boundaries

- **Body start.** The earliest priced line followed by another priced line within 0.1 in y. (This dodges "header has a stray-looking price-shaped string" false starts.)
- **Body end.** First line matching `\b(SUBTOTAL|NET\s+TOTAL|TOTAL|BALANCE|AMOUNT\s+DUE)\b`.
- **Header.** Everything above body start.
- **Footer.** Everything from body end onward — used only for the totals sanity check (stage 6).

### Stage 4 — Price-anchored item grouping

The grouping rule that makes multi-line items work:

```text
for each priced line P in [body_start, body_end):
    create an Item anchored at P
    sweep lines within ±(2 × line_height) of P that are not themselves priced
    pick item name = longest left-text line that doesn't match
        ^Article\s+\d+$    (article-number rows → store in raw_code)
        ^\(.*               (parenthetical rows → see stage 5)
    set raw = full untrimmed left text (preserves what was on the receipt)
    stop sweeping when we hit another priced line
```

**Documented limitation:** v1 is tuned for single-line restaurant/cafe receipts. Multi-row retail receipts (IKEA, Costco) may misgroup satellite lines, particularly the article number that sits exactly one line-height above the price (right on the window edge). These items get flagged Low confidence and lean on the user-review loop.

### Stage 5 — Row classification

Precedence order:

| Match | Action |
|---|---|
| Item's left text starts with `(` **and** the price text ends with `)` | **Suppress** — this is a per-item discount allocation, not a real adjustment |
| Keyword `TAX\|GST\|HST\|VAT` | `kind = tax` |
| Keyword `TIP\|GRATUITY\|SVC\|SERVICE\s+CHG` | `kind = tip` |
| Keyword `DISCOUNT\|PROMO\|COUPON\|SAVINGS\|OFF` near a negative price | `kind = discount` |
| Negative price with no DISCOUNT keyword | `kind = discount` |
| Keyword `SUBTOTAL\|NET\s+TOTAL\|TOTAL\|BALANCE\|AMOUNT\s+DUE` | *skip entirely* (used only for sanity check) |
| Otherwise | `kind = item` |

The parenthetical suppression rule handles IKEA's `(US S&S $10 off  -0.34)` per-item allocation lines: the left text opens with `(`, the priced right text ends with `)`. The real `-10.00` adjustment line (`US S&S $10 off  -10.00`) lacks both — no parens — so it survives as a real discount.

### Stage 6 — Priceless-item tolerance and sanity check

**Priceless items:** body-region groups that have a name + article number but no priced satellite **are kept** as items with `priceCents = 0` and `confidence = Low`. The wizard surfaces them flagged so the user can type the missing price. Silently dropping them would hide real items from the user.

**Sanity check:** if the footer contains a `TOTAL`, compare against `sum(items) + sum(tax) + sum(tip) + sum(discount)`:

- mismatch ≤ 1¢ → ignore (rounding noise)
- mismatch ≤ 5% of total → set `receipt.totalsReconciled = false`, each item picks up 1 demerit
- mismatch > 5% → set the flag and raise a wizard-level banner ("we couldn't verify totals — consider rescanning")

### Confidence model

```rust
fn score(item: &Item, receipt: &ReceiptContext) -> Confidence {
    let mut demerits = 0;
    if item.price_cents == 0                                    { demerits += 2; }
    if !item.price_in_price_column                              { demerits += 1; }
    if item.text_has_ambiguous_chars                            { demerits += 1; }
    if item.kind == Kind::Item && item.name_is_mostly_digits    { demerits += 1; }
    if item.merged_from_multiple_lines                          { demerits += 1; }
    if !receipt.totals_reconciled                               { demerits += 1; }
    match demerits {
        0 => High,
        1 => Medium,
        _ => Low,
    }
}
```

`text_has_ambiguous_chars` triggers on OCR-confusing pairs (`0/O`, `1/I/l`, `rn/m`) adjacent to digits in the price.

A priceless item starts at 2 demerits → guaranteed Low → guaranteed surfaced.

### `apply_learned` integration

The existing `code_expansions::apply_learned()` post-step runs against the parser output exactly as it does against Claude output today. Items with a `raw_code` matching a learned entry get their `name` filled in. The user-correction → `record_corrections` loop is unchanged.

## Data model

### Frontend types (`src/lib/types.ts`)

```ts
type Confidence = "high" | "medium" | "low";

type LineItem = {
  // ... existing fields ...
  confidence: Confidence;              // NEW — defaults to "high" for manually-added items
  confidenceReasons: string[];         // NEW — short human-readable reasons, one per demerit
};

type ParsedReceipt = {
  // ... existing fields ...
  totalsReconciled: boolean;           // NEW — drives Step 1 banner
  parsedTotalCents?: number;           // NEW — what the parser thought TOTAL was (for the banner copy)
};
```

### Backend types (`src-tauri/src/ocr/mod.rs`)

`ParsedItem` and `ParsedReceipt` gain the matching fields with `#[serde(rename_all = "camelCase")]`. Confidence is serialized as a string enum (`"high" | "medium" | "low"`) to match the frontend.

### SQLite schema

**No migration.** Confidence is a derived signal of the scan moment; it isn't useful after the user has reviewed and saved. It lives only in the wizard store, not in the database.

## Tauri commands

`src-tauri/src/commands/ocr.rs`:

- `scan_receipt(source_path: String) → ScanResult` — uses `LocalScanner`. Same name, same return shape (plus new fields).
- `scan_receipt_with_claude(source_path: String) → ScanResult` — **new**. Uses `ClaudeScanner`. Returns `MISSING_API_KEY` if no key set in keychain.

Both run `code_expansions::apply_learned` before returning. Both copy the source file into `<app_data_dir>/receipts/<uuid>.<ext>` exactly as today.

## UI surface

### Step 1 — Scan

```text
┌──────────────────────────────────────────────┐
│  Receipt — IMG_4387.png                      │
│  ✓ Scanned in 0.7 s                          │
│  9 items detected — 4 need a price, totals   │
│  don't match (see Step 2)                    │
│  [ Rescan with Claude (uses your API key) ]  │  ← shown only when key is set
└──────────────────────────────────────────────┘
```

- Replace the scanning spinner's terminal state with elapsed-time text on success.
- Replace the `ScanError` dialog's "needs API key" copy — local OCR doesn't need one.
- **Rescan-with-Claude** button appears when (a) `has_api_key()` is true **and** (b) at least one item is `confidence !== "high"` **or** `totalsReconciled === false`. Clicking calls `api.scanReceiptWithClaude(sourcePath)` for that receipt and overwrites the local result via `mergeParsed`.

### Step 2 — Items

```text
●  DRONA NN box 13x15x1     $4.99   [A][B]
●  PÄRKLA stor case 21      $2.99   [A][B]
●  ALEX cstr 2" black      $10.00   [A][B]
●  CITRONHÄJ s&p shakrs     $0.00   [A][B]    ← red dot
   ⚠ price missing
●  IKEA 365+ mug 12oz       $0.00   [A][B]    ← red dot
   ⚠ price missing
●  ALEX draw unt 14 1/8    $95.00   [A][B]    ← amber dot
   ⚠ receipt totals don't reconcile

Tax                       $10.53
Discount  US S&S $10 off ―$10.00
```

- 6 px left-edge dot per row: **green** (High), **amber** (Medium), **red** (Low). Tailwind semantic palette, no raw hex.
- Inline reason line under low/medium rows — one line, muted text, plain string from `confidenceReasons`.
- Hovering the dot shows the full reason list as a tooltip (informational; non-blocking).
- Editing a row's name or price (existing affordance) sets `confidence = "high"` and clears `confidenceReasons`. The user just told us it's right.

### Settings

- API key card heading: `Anthropic API Key` → **`Optional: Claude rescan (advanced)`**.
- Help text: *"ScanSplit reads receipts locally and works offline. You only need a Claude key if you want a fallback for unusually messy receipts. Most users won't need this."*
- Storage path unchanged (keychain via `keyring`).

### Wizard store

`mergeParsed(receiptId, parsed)` seeds `confidence` and `confidenceReasons` per item from the parser result and stores the receipt-level `totalsReconciled` / `parsedTotalCents` on the receipt record.

`editItemName(id, name)` and `editItemPrice(id, cents)` set `confidence = "high"` and clear `confidenceReasons`.

Manually-added items (via "Add item" in Step 2) default to `confidence = "high"` with empty reasons.

### Test-mode seam

The existing `__scansplit_seed__` hook accepts the new fields naturally. One new hook:

- `__scansplit_seed_low_confidence__(receiptId, parsed)` — same as `__scansplit_seed__` but stamps every item as `confidence = "low"` and sets `totalsReconciled = false`, so Playwright can verify the banner + dots render.

## Image preprocessing

The existing `prepare_image()` downscales to 1568 px max edge and re-encodes as JPEG when needed — that exists to fit Anthropic's 5 MB input cap.

For the local path we pass **original bytes** (after the magic-byte + supported-format check) to `LocalScanner`. Apple Vision and Tesseract both benefit from higher resolution and have no equivalent size cap. The 26 MB IKEA photo finished in 672 ms unprocessed.

`prepare_image()` only runs on the Claude rescan path.

## Implementation phasing

Single PR, but commits stay sequenced for review clarity:

1. **Backend swap:** `Scanner` trait rename, `LocalScanner` + parser + `apple.rs` + `tesseract.rs`, new `scan_receipt_with_claude` command, switch `scan_receipt` to delegate to `LocalScanner`. Tests for the parser. Confidence fields plumbed through; frontend ignores them (defaults to High).
2. **UI confidence surface:** types update, Step 1 elapsed-time + rescan button, Step 2 dots + reason lines, Settings copy, wizard-store + component + E2E tests.
3. **Build / CI / bundling:** Linux CI installs Tesseract system packages, Windows CI vendors the Tesseract DLL via vcpkg, `eng.traineddata` resource bundled on non-macOS. Verify `pnpm tauri:build` on each platform.

## Testing

| Layer | Coverage |
|---|---|
| `parser.rs` unit | 7+ synthetic-`OcrLine` cases: clean restaurant receipt, IKEA-style multi-row item, parenthetical discount suppression, priceless item flagged Low, totals-mismatch downgrade, negative price classified as discount, rotated/skewed receipt where geometry detection self-calibrates |
| `apple.rs` integration | `#[cfg(target_os = "macos")]` test against a checked-in receipt PNG fixture, asserts ≥ N lines and known strings present |
| `tesseract.rs` integration | Same shape for non-macOS targets |
| Full local pipeline | `tests/local_ocr_test.rs`: Apple Vision → parser, asserts merchant, item count, tax present, totals-reconciled state matches expectation. Uses the IKEA fixture (4 priceless items, 5.4% mismatch) and one clean restaurant fixture |
| `wizardStore.test.ts` | `mergeParsed` populates confidence; edits reset confidence to High |
| Step 2 component test | Dot color matches confidence; reason line renders when present |
| Playwright E2E | Existing scan happy-path updated for new confidence fields; new test exercises `__scansplit_seed_low_confidence__` → dots visible, banner visible, edit clears the dot |

## Risks

1. **Tesseract on Windows.** No system package equivalent to Linux. Vendor the DLL via vcpkg in CI; verify it ships correctly in the Tauri bundle. Worth a spike before locking the approach.
2. **`objc2-vision` maturity.** Newer than `objc2-foundation`. Fallback is hand-rolled `objc2` message sends to `VNRecognizeTextRequest` — uglier but always available.
3. **EXIF rotation.** Phone photos arrive with EXIF orientation tags. `image::load_from_memory` should respect these — verify, and add an explicit rotation pass if not.
4. **First-run Vision model warmup.** First scan after launch may be ~1.5 s; subsequent scans ~600 ms. Surfacing elapsed-time in Step 1 prevents users from misreading the first-scan latency as a bug.
5. **Multi-line item misgrouping on retail receipts.** Documented limitation; confidence model surfaces affected items to the user.

## Rollback

If the local path needs to be disabled after merge: revert just the change in `commands/ocr.rs` that switches `scan_receipt` to `LocalScanner`. Everything else (the new types, the UI, the Claude rescan button) keeps working — the frontend gracefully handles `confidence === undefined` as High.

## Future work (explicitly deferred)

- Bounding-box overlays on the receipt image in Step 2 (visual association between rows and pixel regions).
- Multi-language parser keywords (tax/tip/etc. in non-English).
- Smarter satellite grouping for multi-row retail receipts (e.g. "next Article line ends current item").
- A local small LLM as a second-tier fallback before paid Claude (PaddleOCR or a quantized vision-text model).
- Per-merchant parser profiles tuned from `code_expansions` history.
