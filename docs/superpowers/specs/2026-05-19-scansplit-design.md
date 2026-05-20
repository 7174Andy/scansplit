# ScanSplit — Design Spec

**Status:** Draft for v1
**Date:** 2026-05-19
**Owner:** Andrew Park

## Summary

ScanSplit is a single-user cross-platform desktop app that turns one or more receipt images into a fair per-person cost split. The user imports receipt images (no live camera), the app uses Claude's vision API to extract line items, the user corrects any OCR mistakes and assigns each item to one or more people, and the app outputs a per-person breakdown ready to paste into iMessage or Slack.

The target user is the person at the table who paid the bill and now has to figure out who owes what. The app removes the calculator step.

## Goals

1. **Multi-receipt input.** Drop one or many receipts into a single transaction; items are merged into one bill before splitting.
2. **Fix OCR mistakes inline.** Every parsed line is editable (name, price, kind).
3. **Per-item assignment.** Each item can be split evenly by all N people, or by a chosen subset of n < N.
4. **Proportional tax/tip.** Tax and tip distribute to each person in proportion to their share of the subtotal.
5. **Local-only persistence.** Past transactions, receipt images, and learned code expansions live in a local SQLite database. No accounts, no server.
6. **Plain-text output.** One click copies a clean summary to the clipboard.

## Non-goals (v1)

- **Live camera capture.** Users import existing images or PDFs.
- **Multi-user / shared groups / settle-up tracking.** Single-user app; sharing happens via clipboard text.
- **Reusable people groups.** Skipped to keep v1 lean; can be added later without schema rewrite.
- **Payment links** (Venmo / PayPal deep links).
- **Multi-currency conversion.** A transaction has one currency; whatever's on the receipt.
- **Bounding-box highlights** on the receipt image (deferred to v2).
- **Telemetry / crash reporting.** Errors stay on the user's machine.

## Architecture

ScanSplit is a Tauri 2 desktop app with a React + TypeScript frontend and a Rust backend, communicating via Tauri's `invoke` command bridge. All user data lives in a local SQLite database; the only network call is to Anthropic's Messages API for receipt OCR.

```text
┌─────────────────────────────────────────────────┐
│  Tauri Frontend (React + TS)                    │
│  - Wizard UI (5 steps)                          │
│  - Local state per active transaction (Zustand) │
│  - Renders receipt previews, items, people      │
└──────────────┬──────────────────────────────────┘
               │ invoke()
┌──────────────▼──────────────────────────────────┐
│  Tauri Backend (Rust)                           │
│  ┌──────────┐  ┌─────────┐  ┌────────────────┐  │
│  │ commands │  │   db    │  │ ocr (Claude)   │  │
│  │  layer   │→ │ sqlx +  │  │ reqwest +      │  │
│  │          │  │ SQLite  │  │ base64 image   │  │
│  └──────────┘  └─────────┘  └────────────────┘  │
└─────────────────────────────────────────────────┘
                       │
                       ▼ HTTPS
            api.anthropic.com (Claude vision)
```

Why this split:

- Rust holds the API key, DB connection, and file I/O — never exposed to frontend JS.
- Frontend stays focused on UI and ephemeral wizard state.
- DB writes happen at well-defined commit points (when the user finishes a wizard, when they edit a saved transaction) — not on every keystroke.

## Components

### Frontend (`src/`)

| Module | Purpose |
| --- | --- |
| `App.tsx` | Router shell. Two top-level routes: `/` (transaction list / home) and `/transaction/:id` (wizard or view). |
| `pages/Home.tsx` | List of saved transactions, "New Split" button. |
| `pages/Wizard/` | The 5 wizard steps, each its own file: `Step1Scan`, `Step2Items`, `Step3People`, `Step4Assign`, `Step5Result`. |
| `pages/Settings.tsx` | Anthropic API key entry (stored in OS keychain via backend). |
| `components/` | Reusable bits: `ReceiptThumbnail`, `ItemRow`, `PersonChip`, `SplitTotalsTable`, `CurrencyInput`. |
| `store/wizardStore.ts` | Zustand store holding the in-progress transaction. Single source of truth across wizard steps. Persists to `sessionStorage` so a reload doesn't lose work. |
| `lib/tauri.ts` | Thin typed wrapper around Tauri `invoke()` calls — one function per backend command. |
| `lib/splitMath.ts` | Pure functions for computing per-person totals (proportional tax/tip allocation). Heavily unit-tested. |

### Backend (`src-tauri/src/`)

| Module | Purpose |
| --- | --- |
| `main.rs` | Tauri setup, command registration, DB pool init, runs `sqlx::migrate!` on startup against `migrations/`. |
| `commands/mod.rs` | Re-exports all `#[tauri::command]` handlers. |
| `commands/transactions.rs` | `create_transaction`, `update_transaction`, `list_transactions`, `delete_transaction`, `get_transaction`. |
| `commands/ocr.rs` | `scan_receipt(image_path) -> ParsedReceipt`. Reads the file, base64-encodes, calls Claude, parses JSON response. |
| `commands/settings.rs` | `get_api_key`, `set_api_key`. Key stored in OS keychain via `keyring` crate, never in SQLite. |
| `db/mod.rs` | SQLite pool, migration loader. |
| `db/models.rs` | Rust structs for `Transaction`, `Receipt`, `Item`, `Person`, plus `serde` derives for the bridge. |
| `ocr/claude.rs` | HTTP client for Anthropic API, prompt template, response parsing into `ParsedReceipt`. The HTTP layer is behind a `LlmClient` trait so tests can inject a fake. |
| `error.rs` | Single `AppError` enum with `serde::Serialize` so errors cross the bridge cleanly. |

**Boundary discipline:** the frontend never touches the API key — it calls `scan_receipt`, and Rust reads the key from keychain. The math lives in `lib/splitMath.ts` (TS, not Rust) because the wizard renders running totals on every assignment toggle — avoiding a round-trip per click. The same TS code runs from a `splitMath.test.ts` unit suite.

## User Flow — the 5 wizard steps

### Step 1 — Drop receipts

- User drags one or more files (jpg, png, heic, webp, pdf) onto a drop zone. Multi-page PDFs split into one image per page.
- For each file, the frontend calls `invoke('scan_receipt', { path })`. Rust copies the file into the app data dir, base64-encodes it, and POSTs to `api.anthropic.com/v1/messages` asking for structured JSON.
- Per-thumbnail spinner while scanning. "Next" is disabled until all scans either succeed or are explicitly removed by the user.

### Step 2 — Confirm items (fix OCR mistakes)

- All items from all receipts merged into one editable table. Each row carries `receipt_id` so the user can tell which receipt it came from.
- Inline edit on name and price. Add row, delete row, change `kind` between `item` / `tax` / `tip` / `discount`.
- For receipts with cryptic codes (e.g., `GV WHL MLK 2%`), each row shows the readable name on top and the raw code in dim secondary text. User edits the readable name freely; raw code stays as a reference.
- Wizard state lives entirely in Zustand. Nothing written to DB yet.

### Step 3 — Add people

- Type names of people in the split. Names get UUIDs internally.
- Order doesn't matter for the math, but is preserved in the UI.

### Step 4 — Assign items

- For each line item, the user toggles which people share it. Default = all people (the N case). Toggle individuals to get the n<N case.
- Tax, tip, and discount rows are NOT directly assignable — they auto-allocate proportionally to each person's share of the subtotal.
- Running per-person totals update on every toggle (pure function in `splitMath.ts`, instant).

### Step 5 — Result + share

- Per-person totals with itemized breakdown.
- An editable title field at the top, defaulting to `Split — <today's date>`. The user can rename it to something like "Dinner at Trattoria" before saving.
- "Copy" formats the result as plain text and writes to the clipboard:

```text
Dinner at Trattoria — May 19
Alice: $24.50 (pasta, wine 1/3)
Bob:   $18.10 (tiramisu, wine 1/3)
Cara:  $12.80 (wine 1/3)
Total: $55.40
```

- "Save" writes the entire transaction to SQLite in one DB transaction (the only write of the whole flow). After save, the user lands on the saved-transaction view (see below).

## Saved Transaction Lifecycle

Opening `/transaction/:id` from the home list shows the transaction in **view mode**: the same layout as Step 5 (per-person totals, itemized breakdown, copy button), with the title shown read-only and an "Edit" button in the header.

Clicking **Edit** pre-loads the entire transaction back into the wizard store and drops the user into Step 2 (the items list). They can edit items, change assignments, add/remove people, even drop additional receipts (which kicks off OCR for the new ones only). Save again writes back to the same `transaction_id` — no duplicate row.

Clicking **Delete** in the header removes the transaction; `ON DELETE CASCADE` handles the children. Receipt images on disk are deleted in the same Rust command.

The home list (`/`) shows saved transactions sorted by `updated_at` desc, with title, total, person count, and date. A "New Split" button starts a fresh wizard at Step 1.

## Receipt Code Handling

Receipts — grocery receipts especially — print cryptic codes (`GV WHL MLK 2%`, `ORG BAN`) instead of full names. ScanSplit handles this in four layers:

1. **Claude expands in the same OCR pass.** The structured-output prompt asks for two fields per line: `raw` (exactly as printed) and `name` (best-guess readable expansion). Same API cost; richer schema.
2. **UI shows readable name + raw code.** Step 2 row layout: readable name on top (editable), raw code below in dim text (pinned reference). User can override the expansion freely.
3. **Unsure → blank expansion.** If Claude can't confidently expand a code (`MISC`, `ITEM 4823`, store-specific SKUs), it returns the `raw` field only and leaves `name` empty. UI shows the raw code as the editable name with a subtle "?" marker.
4. **Learn from corrections (local).** SQLite holds a `code_expansions` table: `(raw_code, store_hint, learned_name)`. When the user edits a name and saves a transaction, the mapping is recorded. On future receipts, the OCR post-processor pre-applies learned mappings before showing the user. The app gets smarter with use, with zero cloud cost.

## Data Model

```sql
-- A split session
CREATE TABLE transactions (
  id           TEXT PRIMARY KEY,           -- UUID
  title        TEXT NOT NULL,              -- "Dinner at Trattoria"
  currency     TEXT NOT NULL DEFAULT 'USD',
  created_at   INTEGER NOT NULL,           -- unix seconds
  updated_at   INTEGER NOT NULL
);

-- People as they appeared in this specific transaction (snapshot)
CREATE TABLE transaction_people (
  id             TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  position       INTEGER NOT NULL
);

-- Source receipt images (copied into app data dir on import)
CREATE TABLE receipts (
  id             TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  image_path     TEXT NOT NULL,
  position       INTEGER NOT NULL,
  scanned_at     INTEGER NOT NULL
);

-- Line items (after user confirmation in Step 2)
CREATE TABLE items (
  id             TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  receipt_id     TEXT REFERENCES receipts(id) ON DELETE SET NULL,
  raw_code       TEXT,                     -- as printed, e.g. "GV WHL MLK"
  name           TEXT NOT NULL,            -- user-confirmed readable name
  price_cents    INTEGER NOT NULL,         -- integer cents to avoid float drift
  kind           TEXT NOT NULL DEFAULT 'item' CHECK
                 (kind IN ('item','tax','tip','discount')),
  position       INTEGER NOT NULL
);

-- Which people share each item
CREATE TABLE item_assignments (
  item_id        TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  person_id      TEXT NOT NULL REFERENCES transaction_people(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, person_id)
);

-- Learned expansions for cryptic codes
CREATE TABLE code_expansions (
  raw_code       TEXT NOT NULL,
  store_hint     TEXT,                     -- nullable; detected merchant name
  learned_name   TEXT NOT NULL,
  usage_count    INTEGER NOT NULL DEFAULT 1,
  last_used_at   INTEGER NOT NULL,
  PRIMARY KEY (raw_code, store_hint)
);

CREATE INDEX idx_items_transaction ON items(transaction_id);
CREATE INDEX idx_receipts_transaction ON receipts(transaction_id);
CREATE INDEX idx_assignments_item ON item_assignments(item_id);
```

Key decisions:

- **Prices as integer cents.** Avoids floating-point drift in proportional math. Currency formatting happens at the UI edge only.
- **Snapshot people per transaction.** Editing a person's name in a past transaction does not retroactively rewrite history elsewhere — there is no `people` master table.
- **Empty `item_assignments` for an item = shared by everyone** at compute time. Sensible default, less write churn.
- **`code_expansions.store_hint`** is optional. If Claude detects a merchant name, store it — the same raw code may map differently per store.

## Split Math

All math is in `lib/splitMath.ts` (pure functions, no I/O).

**Inputs:** list of items (kind, price, assigned person IDs), list of people IDs.

**Algorithm:**

1. Separate items by kind: `item`, `tax`, `tip`, `discount`.
2. For each `item`, compute per-person share: `price_cents / count(assigned_people)`, integer division with remainder.
3. Compute each person's pre-allocation subtotal by summing their item shares.
4. For each `tax` / `tip` / `discount` row: allocate proportionally to each person — `person_allocation = round(person_subtotal / total_subtotal * row.price_cents)`. Discounts are stored as negative values.
5. Distribute integer-division remainders using the largest-remainder method (deterministic — same input always produces the same output).
6. Output: per-person total in cents, plus an itemized list of what they're paying for.

Invariant tested in unit tests: sum of per-person totals equals the sum of all item prices (including tax, tip, discount). No money invented or lost.

## Error Handling

A single `AppError` enum in Rust, serialized across the bridge as `{ code, message, details? }`. Frontend switches on `code`.

### OCR failures

| Failure | Behavior |
| --- | --- |
| No internet / Anthropic unreachable | Per-thumbnail badge: "Couldn't reach Claude — Retry". User retries one file at a time. Other queued files keep going. |
| Invalid API key (401) | Inline panel blocking the wizard: "Add your Anthropic API key in Settings." One click opens settings. |
| Rate limited (429) | Auto-retry with exponential backoff (1s, 2s, 4s). After three failures, same UI as network failure. |
| Malformed JSON from Claude | "Couldn't read this receipt — try again, or enter items manually." User can skip to Step 2 with empty items and add lines by hand. |
| Image unreadable (Claude returns no items) | Treated as success with `items: []`. Step 2 shows empty list with a hint to add items manually. |

No receipt is ever silently dropped. Every failed scan stays in the queue with a retry affordance until the user removes it.

### Validation errors (frontend, synchronous)

- Step 2: at least one `kind='item'` row required, all prices ≥ 0. Next disabled with tooltip.
- Step 3: at least one person required.
- Step 4: every item has at least one assigned person (empty assignment defaults to "all" automatically).

### Database errors

- All writes happen in a single SQLite transaction at "Save" in Step 5. Failure surfaces as a non-blocking toast; wizard state stays in memory for retry.
- Migration failure on app startup is fatal: blocking error screen with migration error text and a button to open the data folder for backup.

### File errors

- Unsupported extension or > 20 MB: rejected at drop time with a toast.
- Multi-page PDF: rendered to one image per page, queued separately with preserved order.

### Cross-cutting

- No silent retries on user-edited data. If Save fails after the user has fixed Step 2 manually, they click Retry themselves — we never replay a save automatically.
- Frontend has a global error boundary. Uncaught promise rejections trigger a "Reload" UI that preserves Zustand state via `sessionStorage`.

## Testing

### `splitMath.ts` (highest risk — bad math means wrong money)

Heavy unit suite, `vitest`. Cases:

- Even N-way split of one item — sum equals price, no drift.
- Subset split (item assigned to 2 of 3).
- Proportional tax allocation — sum of allocations equals tax row.
- Rounding — largest-remainder distribution is deterministic.
- Discount handling — never produces negative person totals.
- Tip on top of tax — both proportional against the same subtotal base.
- Edge cases: single person, single item, zero-price items, all items assigned to one person.

### OCR module (Rust, integration with recorded fixtures)

- No live Claude calls in CI.
- `src-tauri/tests/fixtures/` holds anonymized receipt images + recorded JSON responses.
- The `ocr` module sits behind a `LlmClient` trait; tests inject a `FakeLlmClient` returning recorded JSON.
- Verifies the parsing layer: malformed JSON, missing fields, non-numeric prices, blank expansions.
- `bin/record-ocr.rs` helper re-records fixtures when the prompt changes (manual, env-gated, not in CI).

### Tauri commands (Rust, in-memory SQLite)

- Each command exercised against a fresh in-memory DB using the real migrations.
- Boundary checks: create → list → get → update → delete with cascade verification.
- `code_expansions`: write a mapping, read it back via the OCR post-processor, confirm override applied.

### Frontend end-to-end (Playwright, ~5 scenarios)

Tauri's headless test mode with stubbed Rust backend:

1. Happy path: drop fixture receipt → 5-step wizard → clipboard text matches snapshot.
2. Fix OCR mistake: edit name and price in Step 2 → totals reflect the edit.
3. Subset assignment: assign one item to only 2 of 3 people → third person's total excludes it.
4. Empty OCR: Claude returns no items → Step 2 empty-state → user adds two items manually → flow completes.
5. OCR retry: simulated network error → retry button → second attempt succeeds.

### What we explicitly don't test

- Visual regression / snapshot tests (too brittle).
- Live Claude calls in CI (flaky, costly, slow; recorded fixtures cover parsing).
- Performance benchmarks (premature for v1).

### Tooling

- `vitest` (TS unit), `cargo test` (Rust unit + integration), `playwright` (e2e).
- CI: GitHub Actions, three parallel jobs. All green = mergeable.

## Open Questions for v1

None at spec time. Items flagged for v2:

- Reusable groups (saved people lists).
- Payment links (Venmo / PayPal deep-linking).
- Bounding-box highlighting on receipt images.
- Multi-currency.

## Glossary

- **Transaction.** One split session, potentially across multiple receipts, settled together.
- **Receipt.** One image (or one PDF page) imported during the transaction.
- **Item.** One line of the bill — food, drink, tax, tip, or discount.
- **Assignment.** The mapping from an item to the people who share it.
- **N-way split.** An item shared by all N people in the transaction.
- **n<N split.** An item shared by some subset n of the N people.
- **Raw code.** The cryptic abbreviation printed on the receipt (e.g., `GV WHL MLK 2%`).
- **Learned expansion.** A user-corrected readable name for a raw code, stored locally and auto-applied to future receipts.
