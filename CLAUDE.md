# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

ScanSplit is a single-user Tauri 2 desktop app that turns receipt images into a per-person cost split. React + TypeScript frontend, Rust backend, local SQLite, Anthropic Messages API for OCR. No accounts, no server — only outbound call is to `api.anthropic.com`.

## Commands

Package manager is **pnpm**. The Tauri shell launches Vite via `beforeDevCommand`, so for real app development use the `tauri:*` commands rather than `dev` alone (`dev` only serves the frontend in a browser, where `@tauri-apps/api` calls will fail outside test mode).

| Task | Command |
| --- | --- |
| Run desktop app (dev) | `pnpm tauri:dev` |
| Build desktop bundle | `pnpm tauri:build` |
| Vite-only dev (browser, no Tauri) | `pnpm dev` |
| Vite in **test mode** (stubs `invoke`) | `pnpm dev:test` |
| Frontend unit tests | `pnpm test` (Vitest, jsdom) |
| Watch unit tests | `pnpm test:watch` |
| Single unit test | `pnpm test -- src/lib/splitMath.test.ts` |
| E2E (Playwright, auto-starts `dev:test`) | `pnpm e2e` |
| Rust unit + integration tests | `cd src-tauri && cargo test` |
| Single Rust test | `cd src-tauri && cargo test --test ocr_test learned_expansion_fills_in_blank_name` |
| Typecheck + frontend build | `pnpm build` |

Dev server runs on port **1420** with `strictPort: true`; Playwright's `baseURL` and Tauri's `devUrl` both point there.

## Architecture

### Boundary discipline (the load-bearing rule)

- **Rust owns:** the Anthropic API key (OS keychain via `keyring`), the SQLite pool, file I/O for receipt images, and the network call to Claude. The key never crosses the bridge.
- **Frontend owns:** all wizard UI state and the split math. Money totals must update instantly on every assignment toggle, so `src/lib/splitMath.ts` is TS, not Rust — no round-trip per click.
- **DB writes are committed only at "Save"**, not per keystroke. The wizard mutates Zustand; one `create_transaction` / `update_transaction` call writes the whole graph in a SQL transaction.

### Frontend (`src/`)

- Routes (`App.tsx`): `/`, `/settings`, `/transaction/new`, `/transaction/:id`. Editing a saved transaction calls `loadFrom(full)` on the wizard store and drops the user into Step 2.
- `store/wizardStore.ts` — Zustand store with `persist` to `sessionStorage` (key `scansplit-wizard`) so a reload during the wizard doesn't lose work. Holds `transaction`, `receipts`, `items`, `people`, `scanStatus`, `step`. `toFull()` produces the `FullTransaction` payload sent to Rust.
- `pages/Wizard/` — five steps: `Step1Scan` → `Step2Items` → `Step3People` → `Step4Assign` → `Step5Result`. `index.tsx` is the shell; each step is its own file.
- `lib/tauri.ts` — single typed wrapper around `invoke()`. **`MODE === "test"` swaps to `stubApi`** so Vitest/Playwright don't need a real Tauri runtime.
- `lib/splitMath.ts` — pure functions. Pass 1: items use largest-remainder allocation across assignees (empty `assignedPersonIds` means everyone). Pass 2: tax/tip/discount allocate **proportionally to each person's item subtotal**, also largest-remainder. All math in integer cents to avoid float drift; sums are exact.
- `lib/types.ts` — shared shapes between frontend and Tauri bridge. Wire format is `camelCase` (Rust uses `#[serde(rename_all = "camelCase")]`).
- Path alias `@/*` → `src/*` (set in both `vite.config.ts` and `tsconfig.json`).
- shadcn/ui is configured (`components.json`, style "new-york", `slate` base). Reusable primitives live in `src/components/ui/`.

### Backend (`src-tauri/src/`)

- `lib.rs` — Tauri builder. On startup, opens `<app_data_dir>/scansplit.db`, runs `sqlx::migrate!("./migrations")`, and stores the pool in `AppState`. All commands are registered in the `invoke_handler!` macro here.
- `commands/` — `#[tauri::command]` handlers. Thin: most delegate to `db::queries` or `ocr`.
- `db/queries.rs` — `insert_full` / `replace_full` write the whole transaction graph in one SQL transaction. `replace_full` deletes children then re-inserts (the wizard already holds the authoritative state).
- `ocr/mod.rs` — `LlmClient` trait abstracts the HTTP call so tests can inject a fake. `claude.rs` is the real impl; `strip_fences` and `parse_response_text` are factored out and unit-tested directly.
- `ocr/code_expansions.rs` — learned mapping `(raw_code, store_hint) -> learned_name` in SQLite. `apply_learned` post-processes a `ParsedReceipt` to fill in blank names; store-specific entries beat generic ones (`ORDER BY (store_hint IS NULL) ASC, usage_count DESC`). `record_corrections` upserts after the user saves.
- `error.rs` — `AppError` enum with a custom `Serialize` that emits `{ code, message }` so the frontend gets stable error codes (`MISSING_API_KEY`, `INVALID_API_KEY`, `OCR_PARSE`, …) regardless of source.
- API key lives in the OS keychain via `keyring` crate. Service `"ScanSplit"`, account `"anthropic_api_key"`. Never written to SQLite.

### Receipt scan flow

1. User picks files via `@tauri-apps/plugin-dialog`. Frontend calls `api.scanReceipt(sourcePath)`.
2. Rust copies the file into `<app_data_dir>/receipts/<uuid>.<ext>`, base64-encodes, POSTs to `https://api.anthropic.com/v1/messages` with a strict JSON-only prompt (model: `claude-sonnet-4-6`).
3. Response goes through `strip_fences` → `serde_json` → `apply_learned` → returned to frontend.
4. Frontend merges parsed items into the wizard store via `mergeParsed(receiptId, parsed)`. The local `imagePath` is then updated to the copied path (Rust returned it in `ScanResult`).

### Test-mode seam (important for E2E)

Playwright cannot call the real `scan_receipt`. `Step1Scan` registers three `window` hooks **only when `import.meta.env.MODE === "test"`**:

- `__scansplit_seed__(receiptId, parsed)` — inject a successful scan.
- `__scansplit_seed_error__(receiptId, message)` — simulate a failed scan.
- `__scansplit_seed_empty__(receiptId)` — empty receipt for "user adds items by hand" flow.

E2E tests in `src/test/e2e/wizard.spec.ts` use these via `page.evaluate(...)`. If you add another OCR path, add a matching seed hook or the tests can't reach it.

## Data model (SQLite)

Migrations are append-only files in `src-tauri/migrations/`, run automatically by `sqlx::migrate!` on startup. Schema in `0001_init.sql`: `transactions`, `transaction_people`, `receipts`, `items`, `item_assignments`, `code_expansions`. Foreign keys are enabled (`PRAGMA foreign_keys = ON` in test setup; `.foreign_keys(true)` in `db/mod.rs`). `items.kind` is constrained to `'item' | 'tax' | 'tip' | 'discount'`. Prices are integer cents; discounts use negative values.

## Conventions

- **Money is always integer cents.** Never `number` dollars in shared types or DB; convert at the input/display boundary (`formatCurrency.ts`).
- **Bridge wire format is camelCase.** Rust structs that cross the bridge use `#[serde(rename_all = "camelCase")]`; frontend types match.
- **Empty `assignedPersonIds` means "everyone"** at split time (see `splitMath.ts`). Don't pre-fill with all person IDs.
- **TypeScript is strict** with `noUnusedLocals` / `noUnusedParameters` — prefix unused vars with `_` or remove them.
- **Reference design docs**: `docs/superpowers/specs/2026-05-19-scansplit-design.md` is the source of truth for product intent and architectural decisions. Read it before significant changes.

## CI

`.github/workflows/ci.yml` runs three jobs on PRs to `main`: `frontend` (`pnpm test`), `rust` (`cargo test` inside `src-tauri`, after installing GTK/WebKit deps), and `e2e` (Playwright with chromium). All three must pass.
