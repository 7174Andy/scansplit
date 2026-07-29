<div align="center">

<img src="site/logo.svg" alt="ScanSplit logo" width="96" height="96" />

# ScanSplit

**Split receipts fairly. Locally.**

[Download for macOS · Windows · Linux →](https://7174andy.github.io/scansplit/)

</div>

A single-user desktop app that turns receipt images into a per-person cost split. Snap or upload one or more receipts, let Claude extract the line items, assign items to people, and ScanSplit produces a fair split with tax, tip, and discounts allocated proportionally.

No accounts. No server. The only outbound network call is to `api.anthropic.com` for OCR.

## Features

- **Multi-receipt transactions** — combine several receipts into one shared bill (e.g. dinner + drinks tab).
- **AI-powered line-item extraction** — Anthropic's `claude-sonnet-4-6` reads the photo and returns structured items, tax, tip, and discounts.
- **Per-person assignment** — toggle who had what; an empty assignment defaults to "everyone".
- **Fair-share math** — items split with largest-remainder allocation; tax/tip/discounts allocated proportionally to each person's item subtotal. All math is in integer cents — totals always sum exactly.
- **Learned code expansions** — when you correct a cryptic SKU once (`ITEM 4823` → `Caesar Salad`), ScanSplit remembers it for next time and biases toward the same merchant.
- **Edit and re-save** — every saved transaction is editable; open it and you re-enter the wizard at Step 2.
- **Local-first storage** — SQLite database in your OS app-data directory; nothing leaves your machine except the OCR request.
- **Automatic image preprocessing** — large photos are downscaled to fit Anthropic's 5 MB image cap, and the media type is detected from the file's magic bytes (not the extension).

## Installing the App

Grab the build for your platform from the [releases page](https://7174andy.github.io/scansplit/). On first run, open **Settings** and paste your Anthropic API key — it's stored in your OS keychain, never on disk or any server.

> **Heads up:** ScanSplit's releases aren't yet code-signed or notarized, so your OS will warn you the first time you open it. This is expected for an unsigned app — here's how to get past it.

### First launch on macOS

The downloaded `.dmg` isn't notarized by Apple, so Gatekeeper blocks it on first open with *"ScanSplit can't be opened because Apple cannot check it for malicious software."* To run it anyway:

1. Download `ScanSplit-macos-universal.dmg` — one build runs on both Apple Silicon and Intel — then drag **ScanSplit** into your **Applications** folder.
2. **macOS 14 (Sonoma) and earlier:** right-click (or Control-click) ScanSplit in Applications → **Open** → **Open** in the dialog. macOS remembers the choice, so later launches are normal.
3. **macOS 15 (Sequoia) and later:** double-click once and dismiss the warning, then go to **System Settings → Privacy & Security**, scroll to the message naming ScanSplit, and click **Open Anyway**.

### First launch on Windows

SmartScreen shows *"Windows protected your PC"* for the unsigned installer. Click **More info → Run anyway** to install. The default download is the `-setup.exe` (NSIS) installer; an `.msi` is also published in each release if you need it.

### First launch on Linux

The `.AppImage` and `.deb` are unsigned; mark the AppImage executable (`chmod +x`) or install the `.deb` with your package manager as usual.

## Tech Stack

| Layer              | Tech                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Shell              | [Tauri 2](https://v2.tauri.app/) (Rust + system webview)                                                                  |
| Frontend           | React 18 + TypeScript, [Zustand](https://github.com/pmndrs/zustand) (with `sessionStorage` persist), React Router v6      |
| UI                 | Tailwind CSS, [shadcn/ui](https://ui.shadcn.com/) (new-york style, slate base), [lucide-react](https://lucide.dev/) icons |
| Build / dev server | Vite 5 (port 1420, `strictPort: true`)                                                                                    |
| Backend            | Rust, async via Tokio, HTTP via `reqwest` (rustls), JSON via `serde`                                                      |
| Database           | SQLite via `sqlx` 0.8 with compile-time migrations                                                                        |
| Secret storage     | OS keychain via the `keyring` crate (Apple Keychain / Windows Credential Manager / Secret Service)                        |
| Image handling     | `image` crate (JPEG/PNG/GIF/WebP), `base64` for transport                                                                 |
| Testing            | Vitest + jsdom (frontend unit), Playwright (E2E), `cargo test` (Rust unit + integration)                                  |
| Package manager    | pnpm                                                                                                                      |

## Getting Started

### Prerequisites

- **Node.js** ≥ 18 and **pnpm** (`npm install -g pnpm`)
- **Rust** stable toolchain (`rustup` recommended)
- **Tauri 2 system deps** — see the [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/) (Xcode CLT on macOS; WebView2 + MSVC on Windows; GTK + WebKitGTK on Linux)
- An **Anthropic API key** (you'll enter it in Settings on first run)

### Install

```bash
pnpm install
```

### Run

| Task                                           | Command                                  |
| ---------------------------------------------- | ---------------------------------------- |
| Run the desktop app (dev)                      | `pnpm tauri:dev`                         |
| Build a distributable bundle                   | `pnpm tauri:build`                       |
| Vite-only (browser, no Tauri — IPC calls fail) | `pnpm dev`                               |
| Vite in **test mode** (stubs the Tauri bridge) | `pnpm dev:test`                          |
| Frontend unit tests                            | `pnpm test`                              |
| Watch unit tests                               | `pnpm test:watch`                        |
| Single unit test                               | `pnpm test -- src/lib/splitMath.test.ts` |
| E2E tests (Playwright, auto-starts `dev:test`) | `pnpm e2e`                               |
| Rust unit + integration tests                  | `cd src-tauri && cargo test`             |
| Typecheck + frontend build                     | `pnpm build`                             |

The Tauri shell drives Vite via `beforeDevCommand`, so use `tauri:dev` for real app development. `pnpm dev` alone only serves the frontend in a browser, where `@tauri-apps/api` calls will fail unless you use the test-mode stubs.

## Architecture

### Boundary Discipline

The split between Rust and the frontend is intentional and load-bearing:

- **Rust owns** the Anthropic API key, the SQLite pool, file I/O for receipt images, and the network call to Claude.
- **Frontend owns** all wizard state and the split math. Money totals update instantly on every assignment toggle — `src/lib/splitMath.ts` is TypeScript, not Rust, so there's no IPC round-trip per click.
- **Database writes happen only at "Save"**, not per keystroke. The wizard mutates a Zustand store; one `create_transaction` / `update_transaction` call writes the whole graph in a single SQL transaction.

### Frontend (`src/`)

- **Routes** (`App.tsx`): `/`, `/settings`, `/transaction/new`, `/transaction/:id`. Editing a saved transaction calls `loadFrom(full)` on the wizard store and drops you into Step 2.
- **`store/wizardStore.ts`** — Zustand store with `persist` to `sessionStorage` (key `scansplit-wizard`) so a reload during the wizard doesn't lose work. Holds `transaction`, `receipts`, `items`, `people`, `scanStatus`, `step`. `toFull()` produces the payload sent to Rust.
- **`pages/Wizard/`** — five steps: Step1Scan → Step2Items → Step3People → Step4Assign → Step5Result. `index.tsx` is the shell.
- **`lib/tauri.ts`** — single typed wrapper around `invoke()`. In `MODE === "test"` it swaps to `stubApi` so Vitest/Playwright don't need a real Tauri runtime.
- **`lib/splitMath.ts`** — pure functions. **Pass 1:** items use largest-remainder allocation across assignees (empty `assignedPersonIds` means everyone). **Pass 2:** tax/tip/discount allocate proportionally to each person's item subtotal, also largest-remainder. Everything is integer cents to avoid float drift.
- **`lib/types.ts`** — shared shapes between frontend and the Tauri bridge. Wire format is `camelCase` (Rust uses `#[serde(rename_all = "camelCase")]`).

### Backend (`src-tauri/src/`)

- **`lib.rs`** — Tauri builder. On startup, opens `<app_data_dir>/scansplit.db`, runs `sqlx::migrate!("./migrations")`, and stores the pool in `AppState`. All commands are registered in the `invoke_handler!` macro.
- **`commands/`** — thin `#[tauri::command]` handlers; most delegate to `db::queries` or `ocr`.
- **`db/queries.rs`** — `insert_full` / `replace_full` write the whole transaction graph in one SQL transaction. `replace_full` deletes children then re-inserts (the wizard already holds the authoritative state).
- **`ocr/mod.rs`** — `LlmClient` trait abstracts the HTTP call so tests can inject a fake.
- **`ocr/claude.rs`** — the real Anthropic client. `prepare_image()` sniffs magic bytes for media type, downscales oversize images to 1568 px on the long edge, and re-encodes as JPEG quality 85 if needed.
- **`ocr/code_expansions.rs`** — learned mapping `(raw_code, store_hint) → learned_name` in SQLite. `apply_learned()` post-processes a parsed receipt to fill in blank names; store-specific entries beat generic ones. `record_corrections()` upserts after you save.
- **`error.rs`** — `AppError` enum with a custom `Serialize` that emits `{ code, message }` so the frontend gets stable error codes (`MISSING_API_KEY`, `INVALID_API_KEY`, `OCR_PARSE`, `UNSUPPORTED_IMAGE_FORMAT`, …) regardless of source.

### Receipt Scan Flow

1. User picks files via `@tauri-apps/plugin-dialog`. Frontend calls `api.scanReceipt(sourcePath)`.
2. Rust copies the file into `<app_data_dir>/receipts/<uuid>.<ext>`, decodes + resizes if needed, base64-encodes, and `POST`s to `https://api.anthropic.com/v1/messages` with a strict JSON-only prompt.
3. Response goes through `strip_fences` → `serde_json` → `apply_learned` → returned to the frontend.
4. Frontend merges parsed items into the wizard store via `mergeParsed(receiptId, parsed)`.

### Data Model (SQLite)

Migrations are append-only files in `src-tauri/migrations/`, run automatically by `sqlx::migrate!` on startup. Tables: `transactions`, `transaction_people`, `receipts`, `items`, `item_assignments`, `code_expansions`. Foreign keys are enabled. `items.kind` is constrained to `'item' | 'tax' | 'tip' | 'discount'`. Prices are integer cents; discounts use negative values.

## Conventions

- **Money is always integer cents.** Never `number` dollars in shared types or DB; convert at the input/display boundary (`formatCurrency.ts`).
- **Bridge wire format is camelCase.** Rust structs that cross the bridge use `#[serde(rename_all = "camelCase")]`; frontend types match.
- **Empty `assignedPersonIds` means "everyone"** at split time. Don't pre-fill with all person IDs.
- **TypeScript is strict** with `noUnusedLocals` / `noUnusedParameters` — prefix unused vars with `_` or remove them.

## License

All rights reserved. This project does not currently carry an open-source license; do not redistribute without permission from the author.
