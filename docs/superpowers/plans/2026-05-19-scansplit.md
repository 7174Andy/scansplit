# ScanSplit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Tauri 2 cross-platform desktop app that imports receipt images, uses Claude's vision API to extract line items, lets the user fix mistakes and assign items to people, and outputs a clipboard-ready per-person split.

**Architecture:** Tauri 2 with a React + TypeScript frontend and a Rust backend bridged by `invoke`. Local SQLite for persistence. Anthropic Messages API for OCR. Pure-TS math module for splits.

**Tech Stack:**
- Frontend: React 18, TypeScript 5, Vite 5, react-router 6, Zustand 4
- Backend: Rust (stable), Tauri 2, sqlx 0.8 (sqlite), tokio, reqwest 0.12, base64 0.22, keyring 3, thiserror 1, anyhow 1, uuid 1, serde 1, serde_json 1, chrono 0.4
- Tests: vitest, cargo test, Playwright
- Package manager: pnpm

**Spec reference:** `docs/superpowers/specs/2026-05-19-scansplit-design.md`

---

## Task 1: Bootstrap Tauri 2 project

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml` (optional), `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `.gitignore`
- Create: `src/main.tsx`, `src/App.tsx`, `src/index.css`
- Create: `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/build.rs`, `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`
- Create: `src-tauri/icons/` (Tauri requires these — use the default Tauri icon set for now)

- [ ] **Step 1: Initialize git**

```bash
cd "/Users/andrewpark/Personal Project/scansplit"
git init
```

- [ ] **Step 2: Create root `package.json`**

```json
{
  "name": "scansplit",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.0.0",
    "@tauri-apps/plugin-dialog": "^2.0.0",
    "@tauri-apps/plugin-clipboard-manager": "^2.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0",
    "zustand": "^4.5.4"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "@playwright/test": "^1.46.0",
    "typescript": "^5.5.3",
    "vite": "^5.4.0",
    "vitest": "^2.0.0",
    "jsdom": "^25.0.0"
  }
}
```

- [ ] **Step 3: Create `vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
});
```

- [ ] **Step 4: Create `tsconfig.json` and `tsconfig.node.json`**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ScanSplit</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create initial `src/main.tsx`, `src/App.tsx`, `src/index.css`**

`src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

`src/App.tsx`:

```tsx
export default function App() {
  return <div style={{ padding: 24 }}>ScanSplit — bootstrap OK</div>;
}
```

`src/index.css`:

```css
:root { font-family: system-ui, sans-serif; }
body { margin: 0; background: #1a1a1a; color: #eee; }
```

- [ ] **Step 7: Create `.gitignore`**

```gitignore
node_modules
dist
.vite
src-tauri/target
src-tauri/Cargo.lock
.superpowers
.DS_Store
*.log
```

- [ ] **Step 8: Create `src-tauri/Cargo.toml`**

```toml
[package]
name = "scansplit"
version = "0.1.0"
edition = "2021"
description = "ScanSplit desktop app"

[lib]
name = "scansplit_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
tauri-plugin-clipboard-manager = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "1"
anyhow = "1"
tokio = { version = "1", features = ["full"] }
sqlx = { version = "0.8", features = ["runtime-tokio", "sqlite", "macros", "chrono", "migrate"] }
reqwest = { version = "0.12", default-features = false, features = ["rustls-tls", "json"] }
base64 = "0.22"
keyring = "3"
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
async-trait = "0.1"
tracing = "0.1"

[dev-dependencies]
tokio = { version = "1", features = ["full", "test-util"] }
tempfile = "3"
```

- [ ] **Step 9: Create `src-tauri/build.rs`**

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 10: Create `src-tauri/tauri.conf.json`**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "ScanSplit",
  "version": "0.1.0",
  "identifier": "com.scansplit.app",
  "build": {
    "beforeDevCommand": "pnpm dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "pnpm build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      { "title": "ScanSplit", "width": 1100, "height": 760, "resizable": true }
    ],
    "security": { "csp": null }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": ["icons/icon.png"]
  },
  "plugins": {}
}
```

- [ ] **Step 11: Create minimal `src-tauri/src/main.rs` and `src-tauri/src/lib.rs`**

`src-tauri/src/main.rs`:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    scansplit_lib::run();
}
```

`src-tauri/src/lib.rs`:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 12: Drop in a Tauri default icon set**

Tauri requires at least `src-tauri/icons/icon.png`. For v1, run:

```bash
cd src-tauri && mkdir -p icons
curl -L -o icons/icon.png https://github.com/tauri-apps/tauri/raw/dev/crates/tauri-cli/templates/app/src-tauri/icons/icon.png
```

(Or copy any 512×512 PNG named `icon.png`. We'll polish branding later.)

- [ ] **Step 13: Install and build**

```bash
pnpm install
pnpm tauri:dev
```

Expected: a window opens showing "ScanSplit — bootstrap OK". Close it (Cmd-Q).

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "feat: bootstrap Tauri 2 project skeleton"
```

---

## Task 2: Configure Vitest and Playwright

**Files:**
- Create: `vitest.config.ts`, `playwright.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/lib/splitMath.test.ts` (smoke test only — full TDD starts Task 3)

- [ ] **Step 1: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
```

- [ ] **Step 2: Create `src/test/setup.ts`**

```typescript
// Vitest setup: stubs/mocks shared across tests.
// Tauri's `invoke` is mocked per-test as needed; nothing global yet.
```

- [ ] **Step 3: Create `playwright.config.ts`**

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./src/test/e2e",
  fullyParallel: false,
  reporter: "list",
  use: {
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
```

- [ ] **Step 4: Create smoke test `src/lib/splitMath.test.ts`**

```typescript
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("vitest runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run tests to verify infra works**

```bash
pnpm test
```

Expected: 1 passing test.

- [ ] **Step 6: Install Playwright browsers**

```bash
pnpm exec playwright install chromium
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test: configure vitest and playwright"
```

---

## Task 3: splitMath — types and even N-way split

**Files:**
- Create: `src/lib/types.ts`
- Modify: `src/lib/splitMath.ts`, `src/lib/splitMath.test.ts`

- [ ] **Step 1: Create `src/lib/types.ts`**

```typescript
export type ItemKind = "item" | "tax" | "tip" | "discount";

export interface Person {
  id: string;
  name: string;
}

export interface LineItem {
  id: string;
  name: string;
  rawCode?: string;
  priceCents: number; // can be negative for discounts
  kind: ItemKind;
  assignedPersonIds: string[]; // empty array = "everyone" at compute time
  receiptId?: string;
}

export interface PersonTotal {
  personId: string;
  totalCents: number;
  itemBreakdown: Array<{ itemId: string; shareCents: number }>;
}

export interface SplitResult {
  perPerson: PersonTotal[];
  totalCents: number;
}
```

- [ ] **Step 2: Write failing test — even N-way split**

Replace `src/lib/splitMath.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { computeSplit } from "./splitMath";
import type { LineItem, Person } from "./types";

const people = (...names: string[]): Person[] =>
  names.map((n, i) => ({ id: `p${i}`, name: n }));

const item = (
  overrides: Partial<LineItem> & Pick<LineItem, "id" | "priceCents">
): LineItem => ({
  name: "Item",
  kind: "item",
  assignedPersonIds: [],
  ...overrides,
});

describe("computeSplit — even N-way", () => {
  it("splits one item evenly across all people when assignment is empty", () => {
    const result = computeSplit(
      [item({ id: "i1", priceCents: 1500 })],
      people("A", "B", "C")
    );
    expect(result.totalCents).toBe(1500);
    expect(result.perPerson.map((p) => p.totalCents)).toEqual([500, 500, 500]);
  });

  it("returns one person owing zero when there are no items", () => {
    const result = computeSplit([], people("A"));
    expect(result.totalCents).toBe(0);
    expect(result.perPerson[0].totalCents).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm test
```

Expected: FAIL — `computeSplit` is not exported.

- [ ] **Step 4: Write minimal implementation in `src/lib/splitMath.ts`**

```typescript
import type { LineItem, Person, PersonTotal, SplitResult } from "./types";

export function computeSplit(items: LineItem[], people: Person[]): SplitResult {
  const totals = new Map<string, PersonTotal>(
    people.map((p) => [p.id, { personId: p.id, totalCents: 0, itemBreakdown: [] }])
  );

  for (const item of items) {
    if (item.kind !== "item") continue;
    const sharers = item.assignedPersonIds.length === 0
      ? people.map((p) => p.id)
      : item.assignedPersonIds;
    const share = Math.floor(item.priceCents / sharers.length);
    for (const pid of sharers) {
      const t = totals.get(pid)!;
      t.totalCents += share;
      t.itemBreakdown.push({ itemId: item.id, shareCents: share });
    }
  }

  const totalCents = Array.from(totals.values()).reduce(
    (s, t) => s + t.totalCents,
    0
  );
  return { perPerson: people.map((p) => totals.get(p.id)!), totalCents };
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test
```

Expected: both tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib
git commit -m "feat(splitMath): even N-way item splitting"
```

---

## Task 4: splitMath — subset assignment (n<N)

**Files:**
- Modify: `src/lib/splitMath.test.ts`, `src/lib/splitMath.ts`

- [ ] **Step 1: Write failing test**

Append to `src/lib/splitMath.test.ts`:

```typescript
describe("computeSplit — subset assignment", () => {
  it("only assigned people pay; others owe zero for that item", () => {
    const ps = people("A", "B", "C");
    const result = computeSplit(
      [{ ...item({ id: "i1", priceCents: 900 }), assignedPersonIds: ["p0", "p1"] }],
      ps
    );
    expect(result.perPerson[0].totalCents).toBe(450); // A
    expect(result.perPerson[1].totalCents).toBe(450); // B
    expect(result.perPerson[2].totalCents).toBe(0);   // C
  });
});
```

- [ ] **Step 2: Run test**

```bash
pnpm test
```

Expected: test passes already (implementation in Task 3 already handles subsets). If it fails, fix the implementation; the test is the spec.

- [ ] **Step 3: Commit**

```bash
git add src/lib/splitMath.test.ts
git commit -m "test(splitMath): subset assignment coverage"
```

---

## Task 5: splitMath — proportional tax & tip

**Files:**
- Modify: `src/lib/splitMath.test.ts`, `src/lib/splitMath.ts`

- [ ] **Step 1: Write failing test**

Append to `src/lib/splitMath.test.ts`:

```typescript
describe("computeSplit — proportional tax & tip", () => {
  it("allocates tax proportionally to each person's item subtotal", () => {
    // A eats $20, B eats $10. Tax = $3. A pays $2, B pays $1.
    const ps = people("A", "B");
    const result = computeSplit(
      [
        { ...item({ id: "i1", priceCents: 2000 }), assignedPersonIds: ["p0"] },
        { ...item({ id: "i2", priceCents: 1000 }), assignedPersonIds: ["p1"] },
        item({ id: "tax", priceCents: 300, kind: "tax" }),
      ],
      ps
    );
    expect(result.perPerson[0].totalCents).toBe(2200);
    expect(result.perPerson[1].totalCents).toBe(1100);
    expect(result.totalCents).toBe(3300);
  });

  it("allocates tip the same way as tax", () => {
    const ps = people("A", "B");
    const result = computeSplit(
      [
        { ...item({ id: "i1", priceCents: 2000 }), assignedPersonIds: ["p0"] },
        { ...item({ id: "i2", priceCents: 1000 }), assignedPersonIds: ["p1"] },
        item({ id: "tip", priceCents: 600, kind: "tip" }),
      ],
      ps
    );
    expect(result.perPerson[0].totalCents).toBe(2400);
    expect(result.perPerson[1].totalCents).toBe(1200);
  });
});
```

- [ ] **Step 2: Run test**

```bash
pnpm test
```

Expected: FAIL — tax/tip not yet allocated.

- [ ] **Step 3: Update `src/lib/splitMath.ts` to handle proportional allocation**

Replace the function with:

```typescript
import type { LineItem, Person, PersonTotal, SplitResult } from "./types";

export function computeSplit(items: LineItem[], people: Person[]): SplitResult {
  const totals = new Map<string, PersonTotal>(
    people.map((p) => [p.id, { personId: p.id, totalCents: 0, itemBreakdown: [] }])
  );

  // Pass 1: items
  for (const it of items) {
    if (it.kind !== "item") continue;
    const sharers = it.assignedPersonIds.length === 0
      ? people.map((p) => p.id)
      : it.assignedPersonIds;
    const share = Math.floor(it.priceCents / sharers.length);
    for (const pid of sharers) {
      const t = totals.get(pid)!;
      t.totalCents += share;
      t.itemBreakdown.push({ itemId: it.id, shareCents: share });
    }
  }

  const subtotalByPerson = new Map<string, number>(
    Array.from(totals.values()).map((t) => [t.personId, t.totalCents])
  );
  const subtotalTotal = Array.from(subtotalByPerson.values()).reduce(
    (s, n) => s + n,
    0
  );

  // Pass 2: tax / tip / discount allocated proportionally to person subtotal
  for (const it of items) {
    if (it.kind === "item") continue;
    if (subtotalTotal === 0) continue;
    for (const pid of subtotalByPerson.keys()) {
      const ps = subtotalByPerson.get(pid)!;
      const share = Math.floor((ps * it.priceCents) / subtotalTotal);
      const t = totals.get(pid)!;
      t.totalCents += share;
      t.itemBreakdown.push({ itemId: it.id, shareCents: share });
    }
  }

  const totalCents = Array.from(totals.values()).reduce(
    (s, t) => s + t.totalCents,
    0
  );
  return { perPerson: people.map((p) => totals.get(p.id)!), totalCents };
}
```

- [ ] **Step 4: Run test**

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib
git commit -m "feat(splitMath): proportional tax and tip allocation"
```

---

## Task 6: splitMath — largest-remainder rounding

The current implementation `Math.floor`s every share, which can lose cents (sum < expected total). Distribute the remainder to the people with the largest fractional remainders.

**Files:**
- Modify: `src/lib/splitMath.test.ts`, `src/lib/splitMath.ts`

- [ ] **Step 1: Write failing test**

Append to `src/lib/splitMath.test.ts`:

```typescript
describe("computeSplit — rounding invariant", () => {
  it("sum of per-person totals equals sum of input prices (no money lost)", () => {
    // $10.00 split 3 ways: 333 + 333 + 334 = 1000
    const ps = people("A", "B", "C");
    const result = computeSplit([item({ id: "i1", priceCents: 1000 })], ps);
    expect(result.totalCents).toBe(1000);
    expect(result.perPerson.map((p) => p.totalCents).sort()).toEqual([333, 333, 334]);
  });

  it("is deterministic across calls", () => {
    const ps = people("A", "B", "C");
    const r1 = computeSplit([item({ id: "i1", priceCents: 1000 })], ps);
    const r2 = computeSplit([item({ id: "i1", priceCents: 1000 })], ps);
    expect(r1.perPerson.map((p) => p.totalCents)).toEqual(
      r2.perPerson.map((p) => p.totalCents)
    );
  });
});
```

- [ ] **Step 2: Run test**

```bash
pnpm test
```

Expected: FAIL — sum is 999, not 1000.

- [ ] **Step 3: Replace `src/lib/splitMath.ts` with the rounding-aware version**

```typescript
import type { LineItem, Person, PersonTotal, SplitResult } from "./types";

/**
 * Split `amountCents` among `sharerIds` using the largest-remainder method.
 * Returns a map from personId to integer-cent share. Sum equals amountCents exactly.
 * Deterministic: same input always yields same output (sharerIds order is the tiebreaker).
 */
function allocate(
  amountCents: number,
  sharerIds: string[]
): Map<string, number> {
  const n = sharerIds.length;
  const sign = amountCents < 0 ? -1 : 1;
  const absAmount = Math.abs(amountCents);
  const base = Math.floor(absAmount / n);
  const remainder = absAmount - base * n; // 0..n-1 cents to distribute
  const out = new Map<string, number>();
  for (const id of sharerIds) out.set(id, sign * base);
  for (let i = 0; i < remainder; i++) {
    const id = sharerIds[i];
    out.set(id, out.get(id)! + sign);
  }
  return out;
}

/**
 * Allocate `amountCents` proportionally to each person's `weight`.
 * Largest-remainder rounding: floor everyone, distribute the leftover cents
 * to the people with the largest fractional remainders (ties broken by id order).
 */
function allocateProportional(
  amountCents: number,
  weights: Map<string, number>
): Map<string, number> {
  const totalWeight = Array.from(weights.values()).reduce((s, w) => s + w, 0);
  if (totalWeight === 0) {
    const z = new Map<string, number>();
    for (const id of weights.keys()) z.set(id, 0);
    return z;
  }
  const sign = amountCents < 0 ? -1 : 1;
  const absAmount = Math.abs(amountCents);
  const exact = new Map<string, number>();
  const floor = new Map<string, number>();
  for (const [id, w] of weights) {
    const e = (w * absAmount) / totalWeight;
    exact.set(id, e);
    floor.set(id, Math.floor(e));
  }
  let allocated = Array.from(floor.values()).reduce((s, n) => s + n, 0);
  let remainder = absAmount - allocated;
  // Sort by fractional remainder desc, then by id asc for determinism.
  const order = Array.from(weights.keys()).sort((a, b) => {
    const fa = exact.get(a)! - floor.get(a)!;
    const fb = exact.get(b)! - floor.get(b)!;
    if (fa !== fb) return fb - fa;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  for (let i = 0; i < remainder; i++) {
    const id = order[i];
    floor.set(id, floor.get(id)! + 1);
  }
  const out = new Map<string, number>();
  for (const [id, v] of floor) out.set(id, sign * v);
  return out;
}

export function computeSplit(
  items: LineItem[],
  people: Person[]
): SplitResult {
  const totals = new Map<string, PersonTotal>(
    people.map((p) => [
      p.id,
      { personId: p.id, totalCents: 0, itemBreakdown: [] },
    ])
  );

  // Pass 1: items, exact-sum allocation.
  for (const it of items) {
    if (it.kind !== "item") continue;
    const sharers =
      it.assignedPersonIds.length === 0
        ? people.map((p) => p.id)
        : it.assignedPersonIds;
    const shares = allocate(it.priceCents, sharers);
    for (const [pid, share] of shares) {
      const t = totals.get(pid)!;
      t.totalCents += share;
      t.itemBreakdown.push({ itemId: it.id, shareCents: share });
    }
  }

  const subtotalByPerson = new Map<string, number>(
    Array.from(totals.values()).map((t) => [t.personId, t.totalCents])
  );

  // Pass 2: tax / tip / discount, proportional to person subtotal.
  for (const it of items) {
    if (it.kind === "item") continue;
    const shares = allocateProportional(it.priceCents, subtotalByPerson);
    for (const [pid, share] of shares) {
      const t = totals.get(pid)!;
      t.totalCents += share;
      t.itemBreakdown.push({ itemId: it.id, shareCents: share });
    }
  }

  const totalCents = Array.from(totals.values()).reduce(
    (s, t) => s + t.totalCents,
    0
  );
  return { perPerson: people.map((p) => totals.get(p.id)!), totalCents };
}
```

- [ ] **Step 4: Run all tests**

```bash
pnpm test
```

Expected: all tests pass, including the new rounding-invariant test.

- [ ] **Step 5: Commit**

```bash
git add src/lib
git commit -m "feat(splitMath): largest-remainder rounding for exact-sum splits"
```

---

## Task 7: splitMath — discount handling

**Files:**
- Modify: `src/lib/splitMath.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/lib/splitMath.test.ts`:

```typescript
describe("computeSplit — discounts", () => {
  it("allocates a discount proportionally as a negative amount", () => {
    // Subtotal $30: A=$20, B=$10. Discount of $3.
    // A keeps $20 - $2 = $18, B keeps $10 - $1 = $9. Total $27.
    const ps = people("A", "B");
    const result = computeSplit(
      [
        { ...item({ id: "i1", priceCents: 2000 }), assignedPersonIds: ["p0"] },
        { ...item({ id: "i2", priceCents: 1000 }), assignedPersonIds: ["p1"] },
        item({ id: "d1", priceCents: -300, kind: "discount" }),
      ],
      ps
    );
    expect(result.perPerson[0].totalCents).toBe(1800);
    expect(result.perPerson[1].totalCents).toBe(900);
    expect(result.totalCents).toBe(2700);
  });

  it("does not produce negative per-person totals on small discounts", () => {
    const ps = people("A");
    const result = computeSplit(
      [
        item({ id: "i1", priceCents: 1000 }),
        item({ id: "d1", priceCents: -100, kind: "discount" }),
      ],
      ps
    );
    expect(result.perPerson[0].totalCents).toBe(900);
  });
});
```

- [ ] **Step 2: Run test**

```bash
pnpm test
```

Expected: PASS (already handled by `allocateProportional` accepting negative amounts).

- [ ] **Step 3: Commit**

```bash
git add src/lib/splitMath.test.ts
git commit -m "test(splitMath): discount handling coverage"
```

---

## Task 8: Error type + migrations + DB pool

**Files:**
- Create: `src-tauri/src/error.rs`
- Create: `src-tauri/migrations/0001_init.sql`
- Create: `src-tauri/src/db/mod.rs`, `src-tauri/src/db/models.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create `src-tauri/src/error.rs`**

```rust
use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("database error: {0}")]
    Db(#[from] sqlx::Error),

    #[error("migrate error: {0}")]
    Migrate(#[from] sqlx::migrate::MigrateError),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("keyring error: {0}")]
    Keyring(#[from] keyring::Error),

    #[error("api key missing — set it in Settings")]
    MissingApiKey,

    #[error("invalid api key (401)")]
    InvalidApiKey,

    #[error("rate limited after {0} attempts")]
    RateLimited(u32),

    #[error("ocr parse error: {0}")]
    OcrParse(String),

    #[error("not found")]
    NotFound,

    #[error("{0}")]
    Other(String),
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut o = s.serialize_struct("AppError", 2)?;
        o.serialize_field("code", &error_code(self))?;
        o.serialize_field("message", &self.to_string())?;
        o.end()
    }
}

fn error_code(e: &AppError) -> &'static str {
    match e {
        AppError::Db(_) => "DB",
        AppError::Migrate(_) => "MIGRATE",
        AppError::Io(_) => "IO",
        AppError::Http(_) => "HTTP",
        AppError::Keyring(_) => "KEYRING",
        AppError::MissingApiKey => "MISSING_API_KEY",
        AppError::InvalidApiKey => "INVALID_API_KEY",
        AppError::RateLimited(_) => "RATE_LIMITED",
        AppError::OcrParse(_) => "OCR_PARSE",
        AppError::NotFound => "NOT_FOUND",
        AppError::Other(_) => "OTHER",
    }
}

pub type AppResult<T> = Result<T, AppError>;
```

- [ ] **Step 2: Create `src-tauri/migrations/0001_init.sql`**

```sql
CREATE TABLE transactions (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'USD',
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE transaction_people (
  id             TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  position       INTEGER NOT NULL
);

CREATE TABLE receipts (
  id             TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  image_path     TEXT NOT NULL,
  position       INTEGER NOT NULL,
  scanned_at     INTEGER NOT NULL
);

CREATE TABLE items (
  id             TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  receipt_id     TEXT REFERENCES receipts(id) ON DELETE SET NULL,
  raw_code       TEXT,
  name           TEXT NOT NULL,
  price_cents    INTEGER NOT NULL,
  kind           TEXT NOT NULL DEFAULT 'item' CHECK
                 (kind IN ('item','tax','tip','discount')),
  position       INTEGER NOT NULL
);

CREATE TABLE item_assignments (
  item_id        TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  person_id      TEXT NOT NULL REFERENCES transaction_people(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, person_id)
);

CREATE TABLE code_expansions (
  raw_code       TEXT NOT NULL,
  store_hint     TEXT,
  learned_name   TEXT NOT NULL,
  usage_count    INTEGER NOT NULL DEFAULT 1,
  last_used_at   INTEGER NOT NULL,
  PRIMARY KEY (raw_code, store_hint)
);

CREATE INDEX idx_items_transaction ON items(transaction_id);
CREATE INDEX idx_receipts_transaction ON receipts(transaction_id);
CREATE INDEX idx_assignments_item ON item_assignments(item_id);
```

- [ ] **Step 3: Create `src-tauri/src/db/models.rs`**

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transaction {
    pub id: String,
    pub title: String,
    pub currency: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Person {
    pub id: String,
    pub transaction_id: String,
    pub name: String,
    pub position: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Receipt {
    pub id: String,
    pub transaction_id: String,
    pub image_path: String,
    pub position: i64,
    pub scanned_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: String,
    pub transaction_id: String,
    pub receipt_id: Option<String>,
    pub raw_code: Option<String>,
    pub name: String,
    pub price_cents: i64,
    pub kind: String,
    pub position: i64,
    pub assigned_person_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FullTransaction {
    pub transaction: Transaction,
    pub people: Vec<Person>,
    pub receipts: Vec<Receipt>,
    pub items: Vec<Item>,
}
```

- [ ] **Step 4: Create `src-tauri/src/db/mod.rs`**

```rust
pub mod models;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::path::Path;
use std::str::FromStr;

use crate::error::AppResult;

pub async fn open_pool(db_path: &Path) -> AppResult<SqlitePool> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let url = format!("sqlite://{}", db_path.display());
    let opts = SqliteConnectOptions::from_str(&url)?
        .create_if_missing(true)
        .foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(4)
        .connect_with(opts)
        .await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    Ok(pool)
}
```

Note: `sqlx::Error` for the connect-options parse needs handling — `SqliteConnectOptions::from_str` returns `Result<_, sqlx::Error>` which converts via `?` thanks to `From<sqlx::Error>` on `AppError`.

- [ ] **Step 5: Wire DB into `src-tauri/src/lib.rs`**

Replace `src-tauri/src/lib.rs`:

```rust
pub mod db;
pub mod error;

use sqlx::SqlitePool;
use tauri::Manager;

pub struct AppState {
    pub pool: SqlitePool,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let app_dir = app.path().app_data_dir().expect("app data dir");
            let db_path = app_dir.join("scansplit.db");
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let pool = db::open_pool(&db_path).await.expect("open db");
                handle.manage(AppState { pool });
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 6: Build to verify Rust compiles**

```bash
cd src-tauri && cargo build
```

Expected: builds clean. (May download many crates first time; takes a few minutes.)

- [ ] **Step 7: Commit**

```bash
cd ..
git add -A
git commit -m "feat: error type, sqlite migrations, db pool init"
```

---

## Task 9: transactions commands — create, get, list

**Files:**
- Create: `src-tauri/src/commands/mod.rs`, `src-tauri/src/commands/transactions.rs`
- Create: `src-tauri/src/db/queries.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create `src-tauri/src/db/queries.rs`**

```rust
use crate::db::models::{FullTransaction, Item, Person, Receipt, Transaction};
use crate::error::AppResult;
use sqlx::{Row, SqlitePool};

pub async fn insert_full(pool: &SqlitePool, full: &FullTransaction) -> AppResult<()> {
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

    for r in &full.receipts {
        sqlx::query(
            "INSERT INTO receipts (id, transaction_id, image_path, position, scanned_at)
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&r.id).bind(&r.transaction_id).bind(&r.image_path)
        .bind(r.position).bind(r.scanned_at)
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

pub async fn replace_full(pool: &SqlitePool, full: &FullTransaction) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    // Delete children explicitly so foreign-key cascades fire predictably.
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

    // Re-insert children with a fresh transaction (keeps insert_full reusable).
    let mut tx2 = pool.begin().await?;
    for p in &full.people {
        sqlx::query("INSERT INTO transaction_people (id, transaction_id, name, position) VALUES (?, ?, ?, ?)")
            .bind(&p.id).bind(&p.transaction_id).bind(&p.name).bind(p.position)
            .execute(&mut *tx2).await?;
    }
    for r in &full.receipts {
        sqlx::query("INSERT INTO receipts (id, transaction_id, image_path, position, scanned_at) VALUES (?, ?, ?, ?, ?)")
            .bind(&r.id).bind(&r.transaction_id).bind(&r.image_path).bind(r.position).bind(r.scanned_at)
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
        "SELECT id, title, currency, created_at, updated_at FROM transactions WHERE id = ?",
    )
    .bind(id).fetch_optional(pool).await?;
    let row = row.ok_or(crate::error::AppError::NotFound)?;
    let transaction = Transaction {
        id: row.get("id"),
        title: row.get("title"),
        currency: row.get("currency"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    };

    let people: Vec<Person> = sqlx::query(
        "SELECT id, transaction_id, name, position FROM transaction_people
         WHERE transaction_id = ? ORDER BY position",
    )
    .bind(id)
    .fetch_all(pool).await?
    .into_iter()
    .map(|r| Person {
        id: r.get("id"), transaction_id: r.get("transaction_id"),
        name: r.get("name"), position: r.get("position"),
    })
    .collect();

    let receipts: Vec<Receipt> = sqlx::query(
        "SELECT id, transaction_id, image_path, position, scanned_at FROM receipts
         WHERE transaction_id = ? ORDER BY position",
    )
    .bind(id)
    .fetch_all(pool).await?
    .into_iter()
    .map(|r| Receipt {
        id: r.get("id"), transaction_id: r.get("transaction_id"),
        image_path: r.get("image_path"), position: r.get("position"),
        scanned_at: r.get("scanned_at"),
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
    let rows = sqlx::query(
        "SELECT t.id, t.title, t.currency, t.updated_at,
                COUNT(DISTINCT tp.id) AS people_count,
                COALESCE(SUM(i.price_cents), 0) AS total_cents
         FROM transactions t
         LEFT JOIN transaction_people tp ON tp.transaction_id = t.id
         LEFT JOIN items i ON i.transaction_id = t.id
         GROUP BY t.id
         ORDER BY t.updated_at DESC",
    )
    .fetch_all(pool).await?;
    Ok(rows.into_iter().map(|r| TransactionSummary {
        id: r.get("id"),
        title: r.get("title"),
        currency: r.get("currency"),
        updated_at: r.get("updated_at"),
        people_count: r.get("people_count"),
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
    pub total_cents: i64,
}

pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<Vec<String>> {
    // Return image paths so the caller can delete files on disk.
    let paths: Vec<String> = sqlx::query(
        "SELECT image_path FROM receipts WHERE transaction_id = ?",
    )
    .bind(id).fetch_all(pool).await?
    .into_iter().map(|r| r.get("image_path")).collect();

    sqlx::query("DELETE FROM transactions WHERE id = ?")
        .bind(id).execute(pool).await?;
    Ok(paths)
}
```

Also add the `queries` module entry to `src-tauri/src/db/mod.rs`:

```rust
pub mod models;
pub mod queries;
```

(Insert that line at the top of the file — keep the rest unchanged.)

- [ ] **Step 2: Create `src-tauri/src/commands/mod.rs`**

```rust
pub mod transactions;
```

- [ ] **Step 3: Create `src-tauri/src/commands/transactions.rs`**

```rust
use crate::db::models::FullTransaction;
use crate::db::queries::{self, TransactionSummary};
use crate::error::AppResult;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn create_transaction(
    state: State<'_, AppState>,
    full: FullTransaction,
) -> AppResult<()> {
    queries::insert_full(&state.pool, &full).await
}

#[tauri::command]
pub async fn update_transaction(
    state: State<'_, AppState>,
    full: FullTransaction,
) -> AppResult<()> {
    queries::replace_full(&state.pool, &full).await
}

#[tauri::command]
pub async fn get_transaction(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<FullTransaction> {
    queries::get_full(&state.pool, &id).await
}

#[tauri::command]
pub async fn list_transactions(
    state: State<'_, AppState>,
) -> AppResult<Vec<TransactionSummary>> {
    queries::list_summaries(&state.pool).await
}

#[tauri::command]
pub async fn delete_transaction(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<()> {
    let image_paths = queries::delete(&state.pool, &id).await?;
    for p in image_paths {
        let _ = std::fs::remove_file(&p); // best-effort
    }
    Ok(())
}
```

- [ ] **Step 4: Register commands in `src-tauri/src/lib.rs`**

Update the existing `pub fn run()` body's `tauri::Builder::default()` chain to add `.invoke_handler(...)` before `.run(...)`:

```rust
pub mod commands;
pub mod db;
pub mod error;

use sqlx::SqlitePool;
use tauri::Manager;

pub struct AppState {
    pub pool: SqlitePool,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let app_dir = app.path().app_data_dir().expect("app data dir");
            let db_path = app_dir.join("scansplit.db");
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let pool = db::open_pool(&db_path).await.expect("open db");
                handle.manage(AppState { pool });
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::transactions::create_transaction,
            commands::transactions::update_transaction,
            commands::transactions::get_transaction,
            commands::transactions::list_transactions,
            commands::transactions::delete_transaction,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5: Write Rust integration test**

Create `src-tauri/tests/transactions_test.rs`:

```rust
use scansplit_lib::db::{models::*, queries};
use sqlx::sqlite::SqlitePoolOptions;

async fn fresh_pool() -> sqlx::SqlitePool {
    let pool = SqlitePoolOptions::new()
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::query("PRAGMA foreign_keys = ON").execute(&pool).await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    pool
}

fn sample_full(id: &str) -> FullTransaction {
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
            image_path: "/tmp/r1.jpg".into(), position: 0, scanned_at: 1,
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

#[tokio::test]
async fn create_then_get_roundtrips() {
    let pool = fresh_pool().await;
    let f = sample_full("t1");
    queries::insert_full(&pool, &f).await.unwrap();
    let got = queries::get_full(&pool, "t1").await.unwrap();
    assert_eq!(got.transaction.title, "Dinner");
    assert_eq!(got.items.len(), 1);
    assert_eq!(got.items[0].assigned_person_ids.len(), 2);
}

#[tokio::test]
async fn delete_cascades() {
    let pool = fresh_pool().await;
    queries::insert_full(&pool, &sample_full("t2")).await.unwrap();
    let paths = queries::delete(&pool, "t2").await.unwrap();
    assert_eq!(paths, vec!["/tmp/r1.jpg".to_string()]);
    let err = queries::get_full(&pool, "t2").await.unwrap_err();
    assert!(matches!(err, scansplit_lib::error::AppError::NotFound));
}

#[tokio::test]
async fn replace_overwrites_children() {
    let pool = fresh_pool().await;
    let mut f = sample_full("t3");
    queries::insert_full(&pool, &f).await.unwrap();
    f.items[0].name = "Skim Milk".into();
    queries::replace_full(&pool, &f).await.unwrap();
    let got = queries::get_full(&pool, "t3").await.unwrap();
    assert_eq!(got.items[0].name, "Skim Milk");
    assert_eq!(got.items.len(), 1);
}
```

- [ ] **Step 6: Run Rust tests**

```bash
cd src-tauri && cargo test
```

Expected: 3 tests pass.

- [ ] **Step 7: Commit**

```bash
cd ..
git add -A
git commit -m "feat: transactions commands + integration tests"
```

---

## Task 10: Settings command — API key in keychain

**Files:**
- Create: `src-tauri/src/commands/settings.rs`
- Modify: `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`

- [ ] **Step 1: Create `src-tauri/src/commands/settings.rs`**

```rust
use crate::error::{AppError, AppResult};
use keyring::Entry;

const SERVICE: &str = "ScanSplit";
const ACCOUNT: &str = "anthropic_api_key";

fn entry() -> AppResult<Entry> {
    Ok(Entry::new(SERVICE, ACCOUNT)?)
}

#[tauri::command]
pub async fn get_api_key() -> AppResult<Option<String>> {
    let e = entry()?;
    match e.get_password() {
        Ok(s) => Ok(Some(s)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(AppError::Keyring(err)),
    }
}

#[tauri::command]
pub async fn set_api_key(key: String) -> AppResult<()> {
    let e = entry()?;
    e.set_password(&key)?;
    Ok(())
}

#[tauri::command]
pub async fn delete_api_key() -> AppResult<()> {
    let e = entry()?;
    match e.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(AppError::Keyring(err)),
    }
}
```

- [ ] **Step 2: Update `src-tauri/src/commands/mod.rs`**

```rust
pub mod settings;
pub mod transactions;
```

- [ ] **Step 3: Register commands in `lib.rs`**

In `src-tauri/src/lib.rs`, extend the `invoke_handler!` list:

```rust
.invoke_handler(tauri::generate_handler![
    commands::transactions::create_transaction,
    commands::transactions::update_transaction,
    commands::transactions::get_transaction,
    commands::transactions::list_transactions,
    commands::transactions::delete_transaction,
    commands::settings::get_api_key,
    commands::settings::set_api_key,
    commands::settings::delete_api_key,
])
```

- [ ] **Step 4: Build to verify**

```bash
cd src-tauri && cargo build
```

Expected: clean build. (Keychain is not tested in CI — it requires interactive user approval on first access; manual smoke test in Task 19.)

- [ ] **Step 5: Commit**

```bash
cd ..
git add -A
git commit -m "feat: settings commands for api key in os keychain"
```

---

## Task 11: OCR — LlmClient trait, FakeLlmClient, ParsedReceipt parsing

**Files:**
- Create: `src-tauri/src/ocr/mod.rs`, `src-tauri/src/ocr/claude.rs`
- Create: `src-tauri/tests/fixtures/sample_response.json`
- Create: `src-tauri/tests/ocr_test.rs`

- [ ] **Step 1: Create `src-tauri/src/ocr/mod.rs`**

```rust
pub mod claude;
pub mod code_expansions;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ParsedItem {
    pub raw: String,
    pub name: Option<String>,
    pub price_cents: i64,
    pub kind: String, // "item" | "tax" | "tip" | "discount"
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ParsedReceipt {
    pub merchant: Option<String>,
    pub items: Vec<ParsedItem>,
}

#[async_trait::async_trait]
pub trait LlmClient: Send + Sync {
    async fn scan(&self, image_bytes: &[u8], api_key: &str) -> crate::error::AppResult<ParsedReceipt>;
}
```

- [ ] **Step 2: Create `src-tauri/src/ocr/claude.rs`** (HTTP + parsing)

```rust
use crate::error::{AppError, AppResult};
use crate::ocr::{LlmClient, ParsedItem, ParsedReceipt};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::Deserialize;
use serde_json::json;

pub struct ClaudeClient {
    http: reqwest::Client,
    model: String,
}

impl ClaudeClient {
    pub fn new() -> Self {
        Self {
            http: reqwest::Client::new(),
            model: "claude-sonnet-4-6".to_string(),
        }
    }
}

const PROMPT: &str = r#"You are extracting line items from a receipt image.
Return ONLY valid JSON matching this schema (no prose, no markdown fences):

{
  "merchant": "<store name if visible, or null>",
  "items": [
    {
      "raw": "<exact text as printed>",
      "name": "<readable expansion if confident, or null>",
      "priceCents": <integer cents, e.g. 349 for $3.49>,
      "kind": "item" | "tax" | "tip" | "discount"
    }
  ]
}

Rules:
- One object per line item on the receipt.
- Use negative priceCents for discounts.
- Mark tax/tip/discount rows with kind accordingly; everything else is "item".
- If a code is too ambiguous to expand (MISC, ITEM 4823, generic SKUs), set name=null.
- Do NOT include subtotal/total rows — only individual lines plus tax/tip/discount adjustments."#;

#[derive(Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicBlock>,
}

#[derive(Deserialize)]
struct AnthropicBlock {
    #[serde(rename = "type")]
    block_type: String,
    text: Option<String>,
}

#[async_trait::async_trait]
impl LlmClient for ClaudeClient {
    async fn scan(&self, image_bytes: &[u8], api_key: &str) -> AppResult<ParsedReceipt> {
        let b64 = B64.encode(image_bytes);
        let body = json!({
            "model": self.model,
            "max_tokens": 2048,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64}},
                    {"type": "text", "text": PROMPT}
                ]
            }]
        });

        let res = self.http
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await?;

        if res.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(AppError::InvalidApiKey);
        }
        if !res.status().is_success() {
            return Err(AppError::Other(format!(
                "anthropic status {}: {}",
                res.status(),
                res.text().await.unwrap_or_default()
            )));
        }

        let parsed: AnthropicResponse = res.json().await?;
        let text = parsed.content.into_iter()
            .find(|b| b.block_type == "text")
            .and_then(|b| b.text)
            .ok_or_else(|| AppError::OcrParse("no text block".into()))?;

        // Strip accidental fences if Claude added them despite the prompt.
        let cleaned = strip_fences(&text);
        let receipt: ParsedReceipt = serde_json::from_str(&cleaned)
            .map_err(|e| AppError::OcrParse(format!("{e}: payload was: {cleaned}")))?;
        Ok(receipt)
    }
}

pub fn strip_fences(s: &str) -> String {
    let trimmed = s.trim();
    if trimmed.starts_with("```") {
        let after = trimmed.trim_start_matches("```json").trim_start_matches("```");
        let end = after.rfind("```").unwrap_or(after.len());
        after[..end].trim().to_string()
    } else {
        trimmed.to_string()
    }
}

pub fn parse_response_text(text: &str) -> AppResult<ParsedReceipt> {
    let cleaned = strip_fences(text);
    serde_json::from_str::<ParsedReceipt>(&cleaned)
        .map_err(|e| AppError::OcrParse(format!("{e}: payload was: {cleaned}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_fences_removes_json_fence() {
        let s = "```json\n{\"merchant\":null,\"items\":[]}\n```";
        assert_eq!(strip_fences(s), "{\"merchant\":null,\"items\":[]}");
    }

    #[test]
    fn strip_fences_passthrough() {
        let s = "{\"merchant\":null,\"items\":[]}";
        assert_eq!(strip_fences(s), s);
    }

    #[test]
    fn parse_response_text_ok() {
        let raw = r#"{"merchant":"Trattoria","items":[
            {"raw":"PASTA","name":"Pasta","priceCents":1400,"kind":"item"}
        ]}"#;
        let r = parse_response_text(raw).unwrap();
        assert_eq!(r.merchant.as_deref(), Some("Trattoria"));
        assert_eq!(r.items.len(), 1);
        assert_eq!(r.items[0].price_cents, 1400);
    }

    #[test]
    fn parse_response_text_malformed_returns_ocr_parse() {
        let r = parse_response_text("not json");
        assert!(matches!(r, Err(crate::error::AppError::OcrParse(_))));
    }
}
```

- [ ] **Step 3: Create a fixture response**

`src-tauri/tests/fixtures/sample_response.json`:

```json
{
  "merchant": "Trader Joe's",
  "items": [
    {"raw": "GV WHL MLK 2%", "name": "Whole Milk 2%", "priceCents": 349, "kind": "item"},
    {"raw": "ORG BAN", "name": "Organic Bananas", "priceCents": 199, "kind": "item"},
    {"raw": "MISC", "name": null, "priceCents": 499, "kind": "item"},
    {"raw": "TAX", "name": null, "priceCents": 45, "kind": "tax"}
  ]
}
```

- [ ] **Step 4: Create integration test using `parse_response_text`**

`src-tauri/tests/ocr_test.rs`:

```rust
use scansplit_lib::ocr::claude::parse_response_text;

#[test]
fn parses_fixture() {
    let raw = std::fs::read_to_string("tests/fixtures/sample_response.json").unwrap();
    let r = parse_response_text(&raw).unwrap();
    assert_eq!(r.items.len(), 4);
    assert_eq!(r.items[0].name.as_deref(), Some("Whole Milk 2%"));
    assert!(r.items[2].name.is_none()); // MISC stays unexpanded
    assert_eq!(r.items[3].kind, "tax");
}
```

- [ ] **Step 5: Wire `ocr` module into `lib.rs`**

In `src-tauri/src/lib.rs`, add `pub mod ocr;` near the other `pub mod` lines.

- [ ] **Step 6: Run all Rust tests**

```bash
cd src-tauri && cargo test
```

Expected: previous tests + 4 new unit tests in `claude` + 1 integration test = pass.

- [ ] **Step 7: Commit**

```bash
cd ..
git add -A
git commit -m "feat: ocr claude client + parsing + fixture tests"
```

---

## Task 12: OCR — code_expansions post-processor

**Files:**
- Create: `src-tauri/src/ocr/code_expansions.rs`
- Append: `src-tauri/tests/ocr_test.rs`

- [ ] **Step 1: Create `src-tauri/src/ocr/code_expansions.rs`**

```rust
use crate::error::AppResult;
use crate::ocr::ParsedReceipt;
use sqlx::{Row, SqlitePool};

/// Apply learned expansions: for any item where `name` is None, look up
/// (raw, store_hint) in code_expansions and fill in the learned_name if present.
/// `store_hint` falls back to None when there's no merchant detected.
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
    items: &[(String, String)], // (raw_code, learned_name)
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
```

- [ ] **Step 2: Append test to `src-tauri/tests/ocr_test.rs`**

```rust
use scansplit_lib::ocr::code_expansions;
use scansplit_lib::ocr::{ParsedItem, ParsedReceipt};
use sqlx::sqlite::SqlitePoolOptions;

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
```

- [ ] **Step 3: Run tests**

```bash
cd src-tauri && cargo test
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
cd ..
git add -A
git commit -m "feat: learned code expansions with store-specific override"
```

---

## Task 13: OCR — scan_receipt command

**Files:**
- Create: `src-tauri/src/commands/ocr.rs`
- Modify: `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`

- [ ] **Step 1: Create `src-tauri/src/commands/ocr.rs`**

```rust
use crate::error::{AppError, AppResult};
use crate::ocr::claude::ClaudeClient;
use crate::ocr::code_expansions;
use crate::ocr::{LlmClient, ParsedReceipt};
use crate::AppState;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

/// Read the image at `source_path`, copy it into app_data/receipts/ with a uuid name,
/// call Claude, apply learned expansions, and return the parsed receipt.
/// Returns the local image path the app should store with the transaction.
#[tauri::command]
pub async fn scan_receipt(
    app: AppHandle,
    state: State<'_, AppState>,
    source_path: String,
) -> AppResult<ScanResult> {
    let bytes = std::fs::read(&source_path)?;

    let app_dir = app.path().app_data_dir().map_err(|e| AppError::Other(e.to_string()))?;
    let receipts_dir = app_dir.join("receipts");
    std::fs::create_dir_all(&receipts_dir)?;
    let ext = std::path::Path::new(&source_path)
        .extension().and_then(|s| s.to_str()).unwrap_or("img");
    let stored = receipts_dir.join(format!("{}.{}", Uuid::new_v4(), ext));
    std::fs::copy(&source_path, &stored)?;

    let key = crate::commands::settings::get_api_key().await?;
    let key = key.ok_or(AppError::MissingApiKey)?;

    let client = ClaudeClient::new();
    let mut parsed: ParsedReceipt = client.scan(&bytes, &key).await?;
    code_expansions::apply_learned(&state.pool, &mut parsed).await?;

    Ok(ScanResult {
        image_path: stored.display().to_string(),
        parsed,
    })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub image_path: String,
    pub parsed: ParsedReceipt,
}

/// Record user corrections after a transaction is saved/updated.
/// Items where the user typed a name on top of an unexpanded raw code feed back into code_expansions.
#[tauri::command]
pub async fn record_code_corrections(
    state: State<'_, AppState>,
    merchant: Option<String>,
    corrections: Vec<(String, String)>,
) -> AppResult<()> {
    code_expansions::record_corrections(&state.pool, merchant.as_deref(), &corrections).await
}
```

- [ ] **Step 2: Update `src-tauri/src/commands/mod.rs`**

```rust
pub mod ocr;
pub mod settings;
pub mod transactions;
```

- [ ] **Step 3: Register the new commands in `lib.rs`**

Add to the `generate_handler!` list:

```rust
commands::ocr::scan_receipt,
commands::ocr::record_code_corrections,
```

- [ ] **Step 4: Build**

```bash
cd src-tauri && cargo build
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
cd ..
git add -A
git commit -m "feat: scan_receipt + record_code_corrections commands"
```

---

## Task 14: Frontend — typed tauri wrappers

**Files:**
- Create: `src/lib/tauri.ts`, `src/lib/formatCurrency.ts`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Extend `src/lib/types.ts`** with backend-mirroring types

Append:

```typescript
export interface TransactionMeta {
  id: string;
  title: string;
  currency: string;
  createdAt: number;
  updatedAt: number;
}

export interface ReceiptRecord {
  id: string;
  transactionId: string;
  imagePath: string;
  position: number;
  scannedAt: number;
}

export interface PersonRecord {
  id: string;
  transactionId: string;
  name: string;
  position: number;
}

export interface ItemRecord {
  id: string;
  transactionId: string;
  receiptId?: string | null;
  rawCode?: string | null;
  name: string;
  priceCents: number;
  kind: "item" | "tax" | "tip" | "discount";
  position: number;
  assignedPersonIds: string[];
}

export interface FullTransaction {
  transaction: TransactionMeta;
  people: PersonRecord[];
  receipts: ReceiptRecord[];
  items: ItemRecord[];
}

export interface TransactionSummary {
  id: string;
  title: string;
  currency: string;
  updatedAt: number;
  peopleCount: number;
  totalCents: number;
}

export interface ParsedItem {
  raw: string;
  name: string | null;
  priceCents: number;
  kind: "item" | "tax" | "tip" | "discount";
}

export interface ParsedReceipt {
  merchant: string | null;
  items: ParsedItem[];
}

export interface ScanResult {
  imagePath: string;
  parsed: ParsedReceipt;
}

export interface AppErrorPayload {
  code: string;
  message: string;
}
```

- [ ] **Step 2: Create `src/lib/tauri.ts`**

```typescript
import { invoke } from "@tauri-apps/api/core";
import type {
  FullTransaction,
  TransactionSummary,
  ScanResult,
} from "./types";

export const api = {
  createTransaction: (full: FullTransaction) =>
    invoke<void>("create_transaction", { full }),

  updateTransaction: (full: FullTransaction) =>
    invoke<void>("update_transaction", { full }),

  getTransaction: (id: string) =>
    invoke<FullTransaction>("get_transaction", { id }),

  listTransactions: () =>
    invoke<TransactionSummary[]>("list_transactions"),

  deleteTransaction: (id: string) =>
    invoke<void>("delete_transaction", { id }),

  getApiKey: () => invoke<string | null>("get_api_key"),
  setApiKey: (key: string) => invoke<void>("set_api_key", { key }),
  deleteApiKey: () => invoke<void>("delete_api_key"),

  scanReceipt: (sourcePath: string) =>
    invoke<ScanResult>("scan_receipt", { sourcePath }),

  recordCodeCorrections: (
    merchant: string | null,
    corrections: Array<[string, string]>
  ) => invoke<void>("record_code_corrections", { merchant, corrections }),
};
```

- [ ] **Step 3: Create `src/lib/formatCurrency.ts`**

```typescript
export function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export function parseCurrencyToCents(input: string): number | null {
  const cleaned = input.replace(/[^\d.-]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number.parseFloat(cleaned);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100);
}
```

- [ ] **Step 4: Add a unit test for currency parsing**

Create `src/lib/formatCurrency.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { formatCents, parseCurrencyToCents } from "./formatCurrency";

describe("formatCents", () => {
  it("formats USD with two decimals", () => {
    expect(formatCents(349)).toBe("$3.49");
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(-100)).toMatch(/-\$1\.00/);
  });
});

describe("parseCurrencyToCents", () => {
  it("parses common inputs", () => {
    expect(parseCurrencyToCents("3.49")).toBe(349);
    expect(parseCurrencyToCents("$3.49")).toBe(349);
    expect(parseCurrencyToCents("0")).toBe(0);
    expect(parseCurrencyToCents("-1.00")).toBe(-100);
    expect(parseCurrencyToCents("abc")).toBeNull();
  });
});
```

- [ ] **Step 5: Run tests**

```bash
pnpm test
```

Expected: previous tests pass + 2 new suites pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib
git commit -m "feat(frontend): typed tauri wrappers + currency formatting"
```

---

## Task 15: Zustand wizard store

**Files:**
- Create: `src/store/wizardStore.ts`
- Create: `src/store/wizardStore.test.ts`

- [ ] **Step 1: Write the store**

`src/store/wizardStore.ts`:

```typescript
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  FullTransaction,
  ItemRecord,
  ParsedReceipt,
  PersonRecord,
  ReceiptRecord,
  TransactionMeta,
} from "../lib/types";

export type WizardStep = 1 | 2 | 3 | 4 | 5;

interface WizardState {
  transaction: TransactionMeta;
  receipts: ReceiptRecord[];
  scanStatus: Record<string, "pending" | "scanning" | "ok" | "error">;
  scanErrors: Record<string, string>;
  items: ItemRecord[];
  people: PersonRecord[];
  step: WizardStep;
  detectedMerchant: string | null;

  reset: (id?: string) => void;
  loadFrom: (full: FullTransaction) => void;
  setStep: (s: WizardStep) => void;

  addReceipt: (r: ReceiptRecord) => void;
  setScanStatus: (id: string, status: WizardState["scanStatus"][string], err?: string) => void;
  mergeParsed: (receiptId: string, parsed: ParsedReceipt) => void;
  removeReceipt: (id: string) => void;

  setItem: (id: string, patch: Partial<ItemRecord>) => void;
  addItem: (it: ItemRecord) => void;
  removeItem: (id: string) => void;

  setPeople: (people: PersonRecord[]) => void;
  addPerson: (name: string) => void;
  removePerson: (id: string) => void;

  toggleAssignment: (itemId: string, personId: string) => void;
  setTitle: (t: string) => void;

  toFull: () => FullTransaction;
}

function newId(): string {
  return crypto.randomUUID();
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function emptyMeta(id?: string): TransactionMeta {
  const t = now();
  return {
    id: id ?? newId(),
    title: "Split — " + new Date().toLocaleDateString(),
    currency: "USD",
    createdAt: t,
    updatedAt: t,
  };
}

export const useWizardStore = create<WizardState>()(
  persist(
    (set, get) => ({
      transaction: emptyMeta(),
      receipts: [],
      scanStatus: {},
      scanErrors: {},
      items: [],
      people: [],
      step: 1,
      detectedMerchant: null,

      reset: (id) => set({
        transaction: emptyMeta(id),
        receipts: [],
        scanStatus: {},
        scanErrors: {},
        items: [],
        people: [],
        step: 1,
        detectedMerchant: null,
      }),

      loadFrom: (full) => set({
        transaction: full.transaction,
        receipts: full.receipts,
        scanStatus: Object.fromEntries(full.receipts.map((r) => [r.id, "ok"])),
        scanErrors: {},
        items: full.items,
        people: full.people,
        step: 2,
        detectedMerchant: null,
      }),

      setStep: (s) => set({ step: s }),

      addReceipt: (r) => set((st) => ({
        receipts: [...st.receipts, r],
        scanStatus: { ...st.scanStatus, [r.id]: "pending" },
      })),

      setScanStatus: (id, status, err) => set((st) => ({
        scanStatus: { ...st.scanStatus, [id]: status },
        scanErrors: err ? { ...st.scanErrors, [id]: err } : st.scanErrors,
      })),

      mergeParsed: (receiptId, parsed) => set((st) => {
        const baseIndex = st.items.filter((i) => i.receiptId === receiptId).length;
        const newItems: ItemRecord[] = parsed.items.map((p, idx) => ({
          id: newId(),
          transactionId: st.transaction.id,
          receiptId,
          rawCode: p.raw,
          name: p.name ?? p.raw,
          priceCents: p.priceCents,
          kind: p.kind,
          position: st.items.length + baseIndex + idx,
          assignedPersonIds: [],
        }));
        return {
          items: [...st.items, ...newItems],
          detectedMerchant: st.detectedMerchant ?? parsed.merchant ?? null,
        };
      }),

      removeReceipt: (id) => set((st) => {
        const { [id]: _, ...remStatus } = st.scanStatus;
        const { [id]: __, ...remErrors } = st.scanErrors;
        return {
          receipts: st.receipts.filter((r) => r.id !== id),
          items: st.items.filter((i) => i.receiptId !== id),
          scanStatus: remStatus,
          scanErrors: remErrors,
        };
      }),

      setItem: (id, patch) => set((st) => ({
        items: st.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
      })),

      addItem: (it) => set((st) => ({ items: [...st.items, it] })),

      removeItem: (id) => set((st) => ({
        items: st.items.filter((i) => i.id !== id),
      })),

      setPeople: (people) => set({ people }),

      addPerson: (name) => set((st) => ({
        people: [
          ...st.people,
          { id: newId(), transactionId: st.transaction.id, name, position: st.people.length },
        ],
      })),

      removePerson: (id) => set((st) => ({
        people: st.people.filter((p) => p.id !== id),
        items: st.items.map((i) => ({
          ...i,
          assignedPersonIds: i.assignedPersonIds.filter((p) => p !== id),
        })),
      })),

      toggleAssignment: (itemId, personId) => set((st) => ({
        items: st.items.map((i) => {
          if (i.id !== itemId) return i;
          const has = i.assignedPersonIds.includes(personId);
          return {
            ...i,
            assignedPersonIds: has
              ? i.assignedPersonIds.filter((p) => p !== personId)
              : [...i.assignedPersonIds, personId],
          };
        }),
      })),

      setTitle: (t) => set((st) => ({
        transaction: { ...st.transaction, title: t, updatedAt: now() },
      })),

      toFull: (): FullTransaction => {
        const st = get();
        return {
          transaction: { ...st.transaction, updatedAt: now() },
          people: st.people,
          receipts: st.receipts,
          items: st.items,
        };
      },
    }),
    {
      name: "scansplit-wizard",
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
```

- [ ] **Step 2: Test for the store**

`src/store/wizardStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { useWizardStore } from "./wizardStore";

describe("wizardStore", () => {
  beforeEach(() => {
    useWizardStore.getState().reset();
  });

  it("mergeParsed creates items with default empty assignment", () => {
    const rid = "r1";
    useWizardStore.getState().addReceipt({
      id: rid, transactionId: "t", imagePath: "/x", position: 0, scannedAt: 0,
    });
    useWizardStore.getState().mergeParsed(rid, {
      merchant: "Trattoria",
      items: [
        { raw: "PASTA", name: "Pasta", priceCents: 1400, kind: "item" },
        { raw: "TAX", name: null, priceCents: 100, kind: "tax" },
      ],
    });
    const items = useWizardStore.getState().items;
    expect(items.length).toBe(2);
    expect(items[0].assignedPersonIds).toEqual([]);
    expect(items[1].kind).toBe("tax");
    expect(useWizardStore.getState().detectedMerchant).toBe("Trattoria");
  });

  it("toggleAssignment adds and removes person ids", () => {
    const store = useWizardStore.getState();
    store.addPerson("Alice");
    store.addItem({
      id: "i1", transactionId: "t", name: "Pasta", priceCents: 1400,
      kind: "item", position: 0, assignedPersonIds: [],
    });
    const aliceId = useWizardStore.getState().people[0].id;
    useWizardStore.getState().toggleAssignment("i1", aliceId);
    expect(useWizardStore.getState().items[0].assignedPersonIds).toEqual([aliceId]);
    useWizardStore.getState().toggleAssignment("i1", aliceId);
    expect(useWizardStore.getState().items[0].assignedPersonIds).toEqual([]);
  });

  it("removePerson cascades to item assignments", () => {
    const s = useWizardStore.getState();
    s.addPerson("Alice");
    s.addPerson("Bob");
    const [alice, bob] = useWizardStore.getState().people;
    s.addItem({
      id: "i1", transactionId: "t", name: "Wine", priceCents: 3000,
      kind: "item", position: 0,
      assignedPersonIds: [alice.id, bob.id],
    });
    useWizardStore.getState().removePerson(alice.id);
    expect(useWizardStore.getState().items[0].assignedPersonIds).toEqual([bob.id]);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
pnpm test
```

Expected: all passing.

- [ ] **Step 4: Commit**

```bash
git add src/store
git commit -m "feat(frontend): wizard store with sessionStorage persistence"
```

---

## Task 16: App shell — routing, ErrorBoundary, Home, Settings

**Files:**
- Create: `src/components/ErrorBoundary.tsx`
- Create: `src/pages/Home.tsx`, `src/pages/Settings.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/components/ErrorBoundary.tsx`**

```tsx
import React from "react";

interface State {
  err: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidCatch(err: Error, info: React.ErrorInfo) {
    console.error("UI error:", err, info);
  }

  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 32 }}>
          <h2>Something broke</h2>
          <pre style={{ background: "#222", padding: 12 }}>{this.state.err.message}</pre>
          <button onClick={() => location.reload()}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 2: Create `src/pages/Home.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/tauri";
import { formatCents } from "../lib/formatCurrency";
import type { TransactionSummary } from "../lib/types";
import { useWizardStore } from "../store/wizardStore";

export default function Home() {
  const [rows, setRows] = useState<TransactionSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();
  const resetWizard = useWizardStore((s) => s.reset);

  useEffect(() => {
    api.listTransactions().then(setRows).catch((e) => setErr(String(e)));
  }, []);

  return (
    <div style={{ padding: 32, maxWidth: 800, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>ScanSplit</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to="/settings">Settings</Link>
          <button
            onClick={() => {
              resetWizard();
              navigate("/transaction/new");
            }}
          >
            + New Split
          </button>
        </div>
      </div>

      {err && <p style={{ color: "#e07a7a" }}>{err}</p>}
      {rows === null && <p>Loading…</p>}
      {rows && rows.length === 0 && <p>No saved splits yet. Click "New Split" to start.</p>}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {rows?.map((r) => (
          <li
            key={r.id}
            style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #333" }}
          >
            <Link to={`/transaction/${r.id}`}>{r.title}</Link>
            <span>
              {formatCents(r.totalCents, r.currency)} · {r.peopleCount} people
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/pages/Settings.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/tauri";

export default function Settings() {
  const [key, setKey] = useState("");
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.getApiKey().then((k) => setHasKey(!!k));
  }, []);

  async function save() {
    setErr(null);
    try {
      await api.setApiKey(key);
      setSaved(true);
      setHasKey(true);
      setKey("");
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  }

  async function remove() {
    try {
      await api.deleteApiKey();
      setHasKey(false);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  }

  return (
    <div style={{ padding: 32, maxWidth: 600, margin: "0 auto" }}>
      <Link to="/">← Back</Link>
      <h1>Settings</h1>

      <h3>Anthropic API key</h3>
      <p style={{ color: "#888" }}>
        Stored in your OS keychain. Used for receipt OCR via Claude.
      </p>
      <p>{hasKey === null ? "Checking…" : hasKey ? "✅ Key configured" : "❌ No key set"}</p>

      <input
        type="password"
        placeholder="sk-ant-…"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        style={{ width: "100%", padding: 8, marginBottom: 8 }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={save} disabled={!key}>Save</button>
        {hasKey && <button onClick={remove}>Remove key</button>}
      </div>
      {saved && <p style={{ color: "#6ec96e" }}>Saved.</p>}
      {err && <p style={{ color: "#e07a7a" }}>{err}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Update `src/App.tsx`** with routes

```tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Home from "./pages/Home";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/transaction/new" element={<div>Wizard coming in Task 17–21</div>} />
          <Route path="/transaction/:id" element={<div>Saved transaction view coming in Task 22</div>} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
```

- [ ] **Step 5: Run dev to verify the shell renders**

```bash
pnpm tauri:dev
```

Expected: window opens at Home page, can navigate to Settings.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(frontend): app shell, routes, home, settings"
```

---

## Task 17: Wizard Step 1 — drop receipts

**Files:**
- Create: `src/pages/Wizard/index.tsx`, `src/pages/Wizard/Step1Scan.tsx`
- Create: `src/components/ReceiptThumbnail.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/components/ReceiptThumbnail.tsx`**

```tsx
import type { ReceiptRecord } from "../lib/types";

interface Props {
  receipt: ReceiptRecord;
  status: "pending" | "scanning" | "ok" | "error";
  error?: string;
  onRemove: () => void;
  onRetry?: () => void;
}

export function ReceiptThumbnail({ receipt, status, error, onRemove, onRetry }: Props) {
  return (
    <div style={{
      width: 90, padding: 8, background: "#222", borderRadius: 6,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
      border: status === "error" ? "1px solid #e07a7a" : "1px solid #333",
    }}>
      <div style={{ fontSize: 28 }}>🧾</div>
      <div style={{ fontSize: 10, color: "#888", textAlign: "center" }}>
        {receipt.imagePath.split("/").pop()}
      </div>
      {status === "scanning" && <div style={{ fontSize: 10 }}>scanning…</div>}
      {status === "ok" && <div style={{ fontSize: 10, color: "#6ec96e" }}>✓ done</div>}
      {status === "error" && (
        <div style={{ fontSize: 10, color: "#e07a7a", textAlign: "center" }}>
          {error}
          {onRetry && <div><button style={{ fontSize: 10 }} onClick={onRetry}>Retry</button></div>}
        </div>
      )}
      <button style={{ fontSize: 10 }} onClick={onRemove}>Remove</button>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/pages/Wizard/Step1Scan.tsx`**

```tsx
import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useWizardStore } from "../../store/wizardStore";
import { ReceiptThumbnail } from "../../components/ReceiptThumbnail";
import { api } from "../../lib/tauri";

function newId(): string {
  return crypto.randomUUID();
}

export function Step1Scan({ onNext }: { onNext: () => void }) {
  const {
    transaction, receipts, scanStatus, scanErrors,
    addReceipt, setScanStatus, mergeParsed, removeReceipt,
  } = useWizardStore();

  const [picking, setPicking] = useState(false);

  async function pickFiles() {
    setPicking(true);
    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: "Receipt", extensions: ["jpg", "jpeg", "png", "heic", "webp", "pdf"] }],
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      for (const p of paths) {
        const id = newId();
        addReceipt({
          id, transactionId: transaction.id, imagePath: p,
          position: receipts.length, scannedAt: Math.floor(Date.now() / 1000),
        });
        scanOne(id, p);
      }
    } finally {
      setPicking(false);
    }
  }

  async function scanOne(id: string, sourcePath: string) {
    setScanStatus(id, "scanning");
    try {
      const result = await api.scanReceipt(sourcePath);
      // Update receipt's imagePath to the app-data-stored copy.
      useWizardStore.setState((st) => ({
        receipts: st.receipts.map((r) =>
          r.id === id ? { ...r, imagePath: result.imagePath } : r
        ),
      }));
      mergeParsed(id, result.parsed);
      setScanStatus(id, "ok");
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setScanStatus(id, "error", msg);
    }
  }

  const allDone = receipts.length > 0 && receipts.every((r) => scanStatus[r.id] === "ok");

  return (
    <div style={{ padding: 24 }}>
      <h2>Step 1 of 5 — Drop receipts</h2>
      <button onClick={pickFiles} disabled={picking}>+ Add receipt files</button>
      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        {receipts.map((r) => (
          <ReceiptThumbnail
            key={r.id}
            receipt={r}
            status={scanStatus[r.id] ?? "pending"}
            error={scanErrors[r.id]}
            onRemove={() => removeReceipt(r.id)}
            onRetry={() => scanOne(r.id, r.imagePath)}
          />
        ))}
      </div>
      <div style={{ marginTop: 24 }}>
        <button disabled={!allDone} onClick={onNext}>Next →</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/pages/Wizard/index.tsx`** (wizard step router)

```tsx
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../../store/wizardStore";
import { Step1Scan } from "./Step1Scan";

export default function Wizard() {
  const step = useWizardStore((s) => s.step);
  const setStep = useWizardStore((s) => s.setStep);
  const navigate = useNavigate();

  return (
    <div>
      <button onClick={() => navigate("/")}>← Cancel</button>
      {step === 1 && <Step1Scan onNext={() => setStep(2)} />}
      {step === 2 && <div>Step 2 (next task)</div>}
      {step === 3 && <div>Step 3 (next task)</div>}
      {step === 4 && <div>Step 4 (next task)</div>}
      {step === 5 && <div>Step 5 (next task)</div>}
    </div>
  );
}
```

- [ ] **Step 4: Update `App.tsx`** to render the wizard on `/transaction/new`

In `src/App.tsx`, replace the `/transaction/new` route line:

```tsx
<Route path="/transaction/new" element={<Wizard />} />
```

…and add the import at the top:

```tsx
import Wizard from "./pages/Wizard";
```

- [ ] **Step 5: Smoke test in dev**

```bash
pnpm tauri:dev
```

Expected: Home → New Split → Step 1 renders. (Picking files will fail until an API key is set, but the UI should render and show an error per thumbnail.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(wizard): step 1 — drop and scan receipts"
```

---

## Task 18: Wizard Step 2 — items table

**Files:**
- Create: `src/pages/Wizard/Step2Items.tsx`
- Create: `src/components/ItemRow.tsx`
- Modify: `src/pages/Wizard/index.tsx`

- [ ] **Step 1: Create `src/components/ItemRow.tsx`**

```tsx
import type { ItemRecord } from "../lib/types";
import { parseCurrencyToCents, formatCents } from "../lib/formatCurrency";

interface Props {
  item: ItemRecord;
  onChange: (patch: Partial<ItemRecord>) => void;
  onRemove: () => void;
}

export function ItemRow({ item, onChange, onRemove }: Props) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr 120px 120px 30px",
      gap: 8, padding: "6px 0",
      borderBottom: "1px solid #2a2a2a", alignItems: "center",
    }}>
      <div>
        <input
          value={item.name}
          onChange={(e) => onChange({ name: e.target.value })}
          style={{ width: "100%", padding: 4 }}
        />
        {item.rawCode && item.rawCode !== item.name && (
          <div style={{ fontSize: 11, color: "#666" }}>{item.rawCode}</div>
        )}
      </div>
      <input
        defaultValue={formatCents(item.priceCents).replace(/[^\d.-]/g, "")}
        onBlur={(e) => {
          const c = parseCurrencyToCents(e.target.value);
          if (c !== null) onChange({ priceCents: c });
        }}
        style={{ width: "100%", padding: 4 }}
      />
      <select
        value={item.kind}
        onChange={(e) => onChange({ kind: e.target.value as ItemRecord["kind"] })}
      >
        <option value="item">item</option>
        <option value="tax">tax</option>
        <option value="tip">tip</option>
        <option value="discount">discount</option>
      </select>
      <button onClick={onRemove} title="Remove">✕</button>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/pages/Wizard/Step2Items.tsx`**

```tsx
import { useWizardStore } from "../../store/wizardStore";
import { ItemRow } from "../../components/ItemRow";

function newId(): string {
  return crypto.randomUUID();
}

export function Step2Items({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { items, transaction, setItem, removeItem, addItem } = useWizardStore();

  const hasItem = items.some((i) => i.kind === "item" && i.priceCents >= 0);

  return (
    <div style={{ padding: 24 }}>
      <h2>Step 2 of 5 — Confirm items</h2>
      <p style={{ color: "#888" }}>
        Fix any OCR mistakes. Edit names and prices, mark tax/tip rows, delete things you don't want.
      </p>

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 120px 120px 30px",
        gap: 8, padding: "6px 0",
        color: "#4a9eff", fontWeight: 600,
      }}>
        <span>Item</span><span>Price</span><span>Kind</span><span></span>
      </div>

      {items.map((it) => (
        <ItemRow
          key={it.id}
          item={it}
          onChange={(patch) => setItem(it.id, patch)}
          onRemove={() => removeItem(it.id)}
        />
      ))}

      <button
        onClick={() =>
          addItem({
            id: newId(),
            transactionId: transaction.id,
            name: "",
            priceCents: 0,
            kind: "item",
            position: items.length,
            assignedPersonIds: [],
          })
        }
        style={{ marginTop: 12 }}
      >
        + Add row
      </button>

      <div style={{ marginTop: 24, display: "flex", gap: 8 }}>
        <button onClick={onBack}>← Back</button>
        <button disabled={!hasItem} onClick={onNext}>Next →</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire Step 2 into `src/pages/Wizard/index.tsx`**

Replace contents of the file:

```tsx
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../../store/wizardStore";
import { Step1Scan } from "./Step1Scan";
import { Step2Items } from "./Step2Items";

export default function Wizard() {
  const step = useWizardStore((s) => s.step);
  const setStep = useWizardStore((s) => s.setStep);
  const navigate = useNavigate();

  return (
    <div>
      <button onClick={() => navigate("/")} style={{ margin: 16 }}>← Cancel</button>
      {step === 1 && <Step1Scan onNext={() => setStep(2)} />}
      {step === 2 && <Step2Items onBack={() => setStep(1)} onNext={() => setStep(3)} />}
      {step === 3 && <div>Step 3 (next task)</div>}
      {step === 4 && <div>Step 4 (next task)</div>}
      {step === 5 && <div>Step 5 (next task)</div>}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(wizard): step 2 — editable items table with kind selector"
```

---

## Task 19: Wizard Step 3 — add people

**Files:**
- Create: `src/pages/Wizard/Step3People.tsx`, `src/components/PersonChip.tsx`
- Modify: `src/pages/Wizard/index.tsx`

- [ ] **Step 1: Create `src/components/PersonChip.tsx`**

```tsx
interface Props {
  name: string;
  onRemove?: () => void;
  active?: boolean;
  onClick?: () => void;
}

export function PersonChip({ name, onRemove, active, onClick }: Props) {
  return (
    <span
      onClick={onClick}
      style={{
        padding: "5px 10px",
        background: active ? "#4a9eff" : "#2a2a2a",
        color: active ? "white" : "inherit",
        borderRadius: 16,
        border: "1px solid " + (active ? "#4a9eff" : "#3a3a3a"),
        fontSize: 13,
        display: "inline-flex",
        gap: 6,
        alignItems: "center",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      {name}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}
        >
          ✕
        </button>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Create `src/pages/Wizard/Step3People.tsx`**

```tsx
import { useState } from "react";
import { useWizardStore } from "../../store/wizardStore";
import { PersonChip } from "../../components/PersonChip";

export function Step3People({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { people, addPerson, removePerson } = useWizardStore();
  const [name, setName] = useState("");

  function commit() {
    const n = name.trim();
    if (!n) return;
    addPerson(n);
    setName("");
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Step 3 of 5 — Add people</h2>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
          placeholder="Name"
          style={{ padding: 6 }}
        />
        <button onClick={commit}>+ Add</button>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        {people.map((p) => (
          <PersonChip key={p.id} name={p.name} onRemove={() => removePerson(p.id)} />
        ))}
      </div>

      <div style={{ marginTop: 24, display: "flex", gap: 8 }}>
        <button onClick={onBack}>← Back</button>
        <button disabled={people.length === 0} onClick={onNext}>Next →</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire Step 3 into the wizard router**

Update `src/pages/Wizard/index.tsx`:

```tsx
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../../store/wizardStore";
import { Step1Scan } from "./Step1Scan";
import { Step2Items } from "./Step2Items";
import { Step3People } from "./Step3People";

export default function Wizard() {
  const step = useWizardStore((s) => s.step);
  const setStep = useWizardStore((s) => s.setStep);
  const navigate = useNavigate();

  return (
    <div>
      <button onClick={() => navigate("/")} style={{ margin: 16 }}>← Cancel</button>
      {step === 1 && <Step1Scan onNext={() => setStep(2)} />}
      {step === 2 && <Step2Items onBack={() => setStep(1)} onNext={() => setStep(3)} />}
      {step === 3 && <Step3People onBack={() => setStep(2)} onNext={() => setStep(4)} />}
      {step === 4 && <div>Step 4 (next task)</div>}
      {step === 5 && <div>Step 5 (next task)</div>}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(wizard): step 3 — add people"
```

---

## Task 20: Wizard Step 4 — assign items + live totals

**Files:**
- Create: `src/pages/Wizard/Step4Assign.tsx`
- Modify: `src/pages/Wizard/index.tsx`

- [ ] **Step 1: Create `src/pages/Wizard/Step4Assign.tsx`**

```tsx
import { useMemo } from "react";
import { useWizardStore } from "../../store/wizardStore";
import { computeSplit } from "../../lib/splitMath";
import { formatCents } from "../../lib/formatCurrency";
import { PersonChip } from "../../components/PersonChip";
import type { LineItem } from "../../lib/types";

export function Step4Assign({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { items, people, transaction, toggleAssignment } = useWizardStore();

  const split = useMemo(() => {
    const lineItems: LineItem[] = items.map((i) => ({
      id: i.id,
      name: i.name,
      rawCode: i.rawCode ?? undefined,
      priceCents: i.priceCents,
      kind: i.kind,
      assignedPersonIds: i.assignedPersonIds,
      receiptId: i.receiptId ?? undefined,
    }));
    return computeSplit(lineItems, people.map((p) => ({ id: p.id, name: p.name })));
  }, [items, people]);

  return (
    <div style={{ padding: 24 }}>
      <h2>Step 4 of 5 — Assign items</h2>
      <p style={{ color: "#888" }}>
        Click a person to toggle. Empty = shared by everyone. Tax/tip/discount auto-allocate proportionally.
      </p>

      {items.filter((i) => i.kind === "item").map((it) => (
        <div key={it.id} style={{
          display: "grid",
          gridTemplateColumns: "1fr 80px 2fr",
          gap: 12, padding: "10px 0", borderBottom: "1px solid #2a2a2a",
        }}>
          <div>
            <div>{it.name}</div>
            <div style={{ color: "#888", fontSize: 12 }}>{formatCents(it.priceCents, transaction.currency)}</div>
          </div>
          <div style={{ color: "#666", fontSize: 12 }}>
            {it.assignedPersonIds.length === 0 ? "All" : `${it.assignedPersonIds.length}/${people.length}`}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {people.map((p) => (
              <PersonChip
                key={p.id}
                name={p.name}
                active={
                  it.assignedPersonIds.length === 0 ||
                  it.assignedPersonIds.includes(p.id)
                }
                onClick={() => toggleAssignment(it.id, p.id)}
              />
            ))}
          </div>
        </div>
      ))}

      <div style={{ marginTop: 24, padding: "12px 0", borderTop: "1px solid #444" }}>
        <strong>Running totals</strong>
        <div style={{ display: "flex", gap: 16, marginTop: 6, flexWrap: "wrap" }}>
          {split.perPerson.map((p) => {
            const name = people.find((x) => x.id === p.personId)?.name ?? "?";
            return (
              <span key={p.personId}>
                {name}: {formatCents(p.totalCents, transaction.currency)}
              </span>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 24, display: "flex", gap: 8 }}>
        <button onClick={onBack}>← Back</button>
        <button onClick={onNext}>Next →</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire Step 4 into the wizard router**

Update `src/pages/Wizard/index.tsx`:

```tsx
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../../store/wizardStore";
import { Step1Scan } from "./Step1Scan";
import { Step2Items } from "./Step2Items";
import { Step3People } from "./Step3People";
import { Step4Assign } from "./Step4Assign";

export default function Wizard() {
  const step = useWizardStore((s) => s.step);
  const setStep = useWizardStore((s) => s.setStep);
  const navigate = useNavigate();

  return (
    <div>
      <button onClick={() => navigate("/")} style={{ margin: 16 }}>← Cancel</button>
      {step === 1 && <Step1Scan onNext={() => setStep(2)} />}
      {step === 2 && <Step2Items onBack={() => setStep(1)} onNext={() => setStep(3)} />}
      {step === 3 && <Step3People onBack={() => setStep(2)} onNext={() => setStep(4)} />}
      {step === 4 && <Step4Assign onBack={() => setStep(3)} onNext={() => setStep(5)} />}
      {step === 5 && <div>Step 5 (next task)</div>}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(wizard): step 4 — assign items with live totals"
```

---

## Task 21: Wizard Step 5 — result, copy, save

**Files:**
- Create: `src/pages/Wizard/Step5Result.tsx`, `src/components/SplitTotalsTable.tsx`
- Modify: `src/pages/Wizard/index.tsx`

- [ ] **Step 1: Create `src/components/SplitTotalsTable.tsx`**

```tsx
import type { SplitResult } from "../lib/splitMath";
import { formatCents } from "../lib/formatCurrency";

interface Props {
  split: SplitResult;
  personNames: Record<string, string>;
  itemNames: Record<string, string>;
  currency: string;
}

export function SplitTotalsTable({ split, personNames, itemNames, currency }: Props) {
  return (
    <div>
      {split.perPerson.map((p) => (
        <details key={p.personId} style={{ borderBottom: "1px solid #2a2a2a", padding: "8px 0" }}>
          <summary style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{personNames[p.personId] ?? "?"}</span>
            <strong>{formatCents(p.totalCents, currency)}</strong>
          </summary>
          <ul style={{ margin: "8px 0 0 16px", color: "#aaa", fontSize: 13 }}>
            {p.itemBreakdown.map((b, i) => (
              <li key={i}>
                {itemNames[b.itemId] ?? b.itemId}: {formatCents(b.shareCents, currency)}
              </li>
            ))}
          </ul>
        </details>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12, color: "#888" }}>
        <span>Total</span>
        <span>{formatCents(split.totalCents, currency)}</span>
      </div>
    </div>
  );
}
```

Add an export for `SplitResult` in `src/lib/splitMath.ts` (it's already exported as a type from `types.ts` — re-export here for the import path used above):

```typescript
// at top of splitMath.ts, just under the imports:
export type { SplitResult } from "./types";
```

- [ ] **Step 2: Create `src/pages/Wizard/Step5Result.tsx`**

```tsx
import { useMemo, useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../../store/wizardStore";
import { computeSplit } from "../../lib/splitMath";
import { SplitTotalsTable } from "../../components/SplitTotalsTable";
import { formatCents } from "../../lib/formatCurrency";
import { api } from "../../lib/tauri";

export function Step5Result({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const store = useWizardStore();
  const { items, people, transaction, detectedMerchant, setTitle } = store;

  const split = useMemo(() => {
    const lineItems = items.map((i) => ({
      id: i.id, name: i.name, priceCents: i.priceCents,
      kind: i.kind, assignedPersonIds: i.assignedPersonIds,
    }));
    return computeSplit(lineItems, people.map((p) => ({ id: p.id, name: p.name })));
  }, [items, people]);

  const personNames = Object.fromEntries(people.map((p) => [p.id, p.name]));
  const itemNames = Object.fromEntries(items.map((i) => [i.id, i.name]));

  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function copy() {
    const lines = [
      transaction.title,
      ...split.perPerson.map((p) => {
        const name = personNames[p.personId] ?? "?";
        const detail = p.itemBreakdown
          .map((b) => itemNames[b.itemId] ?? b.itemId).join(", ");
        return `${name}: ${formatCents(p.totalCents, transaction.currency)} (${detail})`;
      }),
      `Total: ${formatCents(split.totalCents, transaction.currency)}`,
    ];
    await writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const full = store.toFull();
      await api.createTransaction(full);

      // Record corrections: items where the user typed a name on top of a raw code.
      const corrections: Array<[string, string]> = items
        .filter((i) => i.rawCode && i.name && i.rawCode !== i.name)
        .map((i) => [i.rawCode!, i.name]);
      if (corrections.length > 0) {
        await api.recordCodeCorrections(detectedMerchant, corrections);
      }
      navigate(`/transaction/${transaction.id}`);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Step 5 of 5 — Result</h2>
      <label style={{ display: "block", marginBottom: 12 }}>
        Title:&nbsp;
        <input
          value={transaction.title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ padding: 6, width: 320 }}
        />
      </label>

      <SplitTotalsTable
        split={split}
        personNames={personNames}
        itemNames={itemNames}
        currency={transaction.currency}
      />

      <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
        <button onClick={onBack}>← Back</button>
        <button onClick={copy}>{copied ? "Copied ✓" : "📋 Copy"}</button>
        <button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      </div>
      {err && <p style={{ color: "#e07a7a" }}>{err}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Wire Step 5**

Final `src/pages/Wizard/index.tsx`:

```tsx
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../../store/wizardStore";
import { Step1Scan } from "./Step1Scan";
import { Step2Items } from "./Step2Items";
import { Step3People } from "./Step3People";
import { Step4Assign } from "./Step4Assign";
import { Step5Result } from "./Step5Result";

export default function Wizard() {
  const step = useWizardStore((s) => s.step);
  const setStep = useWizardStore((s) => s.setStep);
  const navigate = useNavigate();

  return (
    <div>
      <button onClick={() => navigate("/")} style={{ margin: 16 }}>← Cancel</button>
      {step === 1 && <Step1Scan onNext={() => setStep(2)} />}
      {step === 2 && <Step2Items onBack={() => setStep(1)} onNext={() => setStep(3)} />}
      {step === 3 && <Step3People onBack={() => setStep(2)} onNext={() => setStep(4)} />}
      {step === 4 && <Step4Assign onBack={() => setStep(3)} onNext={() => setStep(5)} />}
      {step === 5 && <Step5Result onBack={() => setStep(4)} />}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(wizard): step 5 — result, copy to clipboard, save to db"
```

---

## Task 22: Saved transaction view + edit mode

**Files:**
- Create: `src/pages/TransactionView.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/pages/TransactionView.tsx`**

```tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { api } from "../lib/tauri";
import { computeSplit } from "../lib/splitMath";
import { SplitTotalsTable } from "../components/SplitTotalsTable";
import { formatCents } from "../lib/formatCurrency";
import { useWizardStore } from "../store/wizardStore";
import type { FullTransaction } from "../lib/types";

export default function TransactionView() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [full, setFull] = useState<FullTransaction | null>(null);
  const [err, setErr] = useState<string | null>(null);
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

  if (err) return <div style={{ padding: 24, color: "#e07a7a" }}>Error: {err}</div>;
  if (!full || !split) return <div style={{ padding: 24 }}>Loading…</div>;

  const personNames = Object.fromEntries(full.people.map((p) => [p.id, p.name]));
  const itemNames = Object.fromEntries(full.items.map((i) => [i.id, i.name]));

  async function copy() {
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
    await writeText(lines.join("\n"));
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
    loadFrom(full);
    navigate("/transaction/new");
  }

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: "0 auto" }}>
      <Link to="/">← Home</Link>
      <h1>{full.transaction.title}</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={copy}>📋 Copy</button>
        <button onClick={edit}>Edit</button>
        <button onClick={del}>Delete</button>
      </div>
      <SplitTotalsTable
        split={split}
        personNames={personNames}
        itemNames={itemNames}
        currency={full.transaction.currency}
      />
    </div>
  );
}
```

- [ ] **Step 2: Update routes in `src/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Home from "./pages/Home";
import Settings from "./pages/Settings";
import Wizard from "./pages/Wizard";
import TransactionView from "./pages/TransactionView";

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/transaction/new" element={<Wizard />} />
          <Route path="/transaction/:id" element={<TransactionView />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
```

- [ ] **Step 3: Manual smoke test in dev**

```bash
pnpm tauri:dev
```

Walk: Home → New Split → drop a sample image (need an Anthropic API key set; or skip OCR by clicking "Next" with an empty items list and manually adding items in Step 2) → finish through Step 5 → Save → land on saved-transaction view → Edit → land back in wizard Step 2 with state preloaded → Save again → returns to the same transaction.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: saved transaction view + edit mode + delete"
```

---

## Task 23: Use `update_transaction` when editing an existing record

The wizard always calls `createTransaction` in Task 21. When the user came from Edit (existing id), we need `updateTransaction` instead. The distinguishing signal: the `transaction.id` was preloaded — `loadFrom` already set it from the DB.

**Files:**
- Modify: `src/pages/Wizard/Step5Result.tsx`, `src/store/wizardStore.ts`

- [ ] **Step 1: Add a flag to the store**

In `src/store/wizardStore.ts`, add to the `WizardState` interface:

```typescript
  isExisting: boolean;
```

In the initial state and in `reset`, set `isExisting: false`. In `loadFrom`, set `isExisting: true`. The block in `loadFrom` becomes:

```typescript
loadFrom: (full) => set({
  transaction: full.transaction,
  receipts: full.receipts,
  scanStatus: Object.fromEntries(full.receipts.map((r) => [r.id, "ok"])),
  scanErrors: {},
  items: full.items,
  people: full.people,
  step: 2,
  detectedMerchant: null,
  isExisting: true,
}),
```

And in `reset`:

```typescript
reset: (id) => set({
  transaction: emptyMeta(id),
  receipts: [],
  scanStatus: {},
  scanErrors: {},
  items: [],
  people: [],
  step: 1,
  detectedMerchant: null,
  isExisting: false,
}),
```

- [ ] **Step 2: Switch `save()` in Step 5 to use update when editing**

In `src/pages/Wizard/Step5Result.tsx`, replace the body of `save()` to branch on `store.isExisting`:

```typescript
async function save() {
  setSaving(true);
  setErr(null);
  try {
    const full = store.toFull();
    if (store.isExisting) {
      await api.updateTransaction(full);
    } else {
      await api.createTransaction(full);
    }
    const corrections: Array<[string, string]> = items
      .filter((i) => i.rawCode && i.name && i.rawCode !== i.name)
      .map((i) => [i.rawCode!, i.name]);
    if (corrections.length > 0) {
      await api.recordCodeCorrections(detectedMerchant, corrections);
    }
    navigate(`/transaction/${transaction.id}`);
  } catch (e: any) {
    setErr(String(e?.message ?? e));
  } finally {
    setSaving(false);
  }
}
```

- [ ] **Step 3: Smoke test edit path** in `pnpm tauri:dev`:

1. Open a saved transaction.
2. Click Edit → land in Step 2.
3. Change an item name.
4. Step through to Step 5 → Save.
5. Confirm the transaction has been updated (not duplicated): go back to Home, only one row should exist.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: distinguish create vs update on Save"
```

---

## Task 24: Playwright e2e — happy path

We can't easily inject a `FakeLlmClient` into the running Rust binary without code changes that bloat production. Instead, the e2e tests work around live OCR by **skipping the file picker** and seeding the wizard store directly via a window-level test hook that we mount only in `import.meta.env.MODE === "test"` builds.

**Files:**
- Modify: `src/pages/Wizard/Step1Scan.tsx` (add test hook)
- Create: `src/test/e2e/wizard.spec.ts`
- Create: `src/test/e2e/fixtures/sample.json`

- [ ] **Step 1: Add a window-level seed hook to `Step1Scan.tsx`**

Append, inside the component body, just before the `return`:

```typescript
if (import.meta.env.MODE === "test" && typeof window !== "undefined") {
  (window as any).__scansplit_seed__ = (receiptId: string, parsed: any) => {
    const id = receiptId;
    addReceipt({
      id, transactionId: transaction.id, imagePath: "/test/seed.jpg",
      position: receipts.length, scannedAt: 0,
    });
    setScanStatus(id, "ok");
    mergeParsed(id, parsed);
  };
}
```

- [ ] **Step 2: Create the fixture**

`src/test/e2e/fixtures/sample.json`:

```json
{
  "merchant": "Trattoria",
  "items": [
    {"raw": "PASTA", "name": "Pasta", "priceCents": 1400, "kind": "item"},
    {"raw": "WINE", "name": "House Red", "priceCents": 3200, "kind": "item"},
    {"raw": "TAX", "name": null, "priceCents": 414, "kind": "tax"}
  ]
}
```

- [ ] **Step 3: Write the happy-path test**

`src/test/e2e/wizard.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import sample from "./fixtures/sample.json";

test("happy path: scan → confirm → people → assign → copy", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ New Split" }).click();
  await expect(page.getByRole("heading", { name: /Step 1 of 5/ })).toBeVisible();

  // Seed a receipt via test hook (bypasses file picker + live OCR).
  await page.evaluate((parsed) => {
    (window as any).__scansplit_seed__("r-test-1", parsed);
  }, sample);

  await page.getByRole("button", { name: "Next →" }).click();
  await expect(page.getByRole("heading", { name: /Step 2 of 5/ })).toBeVisible();
  await page.getByRole("button", { name: "Next →" }).click();

  // Step 3: add people.
  await page.getByPlaceholder("Name").fill("Alice");
  await page.getByRole("button", { name: "+ Add" }).click();
  await page.getByPlaceholder("Name").fill("Bob");
  await page.getByRole("button", { name: "+ Add" }).click();
  await page.getByRole("button", { name: "Next →" }).click();

  // Step 4: default = everyone, go through.
  await page.getByRole("button", { name: "Next →" }).click();

  // Step 5: copy and verify clipboard.
  await page.getByRole("button", { name: /Copy/ }).click();
  await expect(page.getByRole("button", { name: /Copied ✓/ })).toBeVisible();

  // Spot-check totals: $14 + $32 = $46 subtotal + $4.14 tax = $50.14 split 2 = $25.07 each.
  await expect(page.getByText(/Alice/)).toBeVisible();
  await expect(page.getByText(/\$25\.07/)).toBeVisible();
});
```

- [ ] **Step 4: Add a `--mode test` build target to Vite**

Update `package.json` `scripts`:

```json
"dev:test": "vite --mode test",
"e2e": "vite --mode test & wait-on http://localhost:1420 && playwright test"
```

Add `wait-on` to devDependencies:

```bash
pnpm add -D wait-on
```

And tweak `playwright.config.ts` to use the test-mode dev server (replace `command`):

```typescript
webServer: {
  command: "pnpm dev:test",
  url: "http://localhost:1420",
  reuseExistingServer: !process.env.CI,
  timeout: 30_000,
},
```

- [ ] **Step 5: Run the test**

```bash
pnpm exec playwright test --reporter=list
```

Expected: 1 passing.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test(e2e): happy-path wizard flow via test hook"
```

---

## Task 25: Playwright e2e — fix OCR mistake + subset assignment

**Files:**
- Append: `src/test/e2e/wizard.spec.ts`

- [ ] **Step 1: Add fix-OCR test**

Append to `src/test/e2e/wizard.spec.ts`:

```typescript
test("fix OCR mistake: edit a name and price in step 2", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ New Split" }).click();
  await page.evaluate((parsed) => {
    (window as any).__scansplit_seed__("r-test-2", parsed);
  }, {
    merchant: "Trader Joe's",
    items: [
      { raw: "GV WHL MLK 2%", name: null, priceCents: 349, kind: "item" },
    ],
  });
  await page.getByRole("button", { name: "Next →" }).click();

  // Step 2: edit the name (it currently equals the raw code since name was null).
  const nameInput = page.locator("input").first();
  await nameInput.fill("Whole Milk 2%");
  // Edit price.
  const priceInput = page.locator("input").nth(1);
  await priceInput.fill("4.00");
  await priceInput.blur();

  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByPlaceholder("Name").fill("Alice");
  await page.getByRole("button", { name: "+ Add" }).click();
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByRole("button", { name: "Next →" }).click();

  await expect(page.getByText(/\$4\.00/)).toBeVisible();
});

test("subset assignment: one person excluded from an item", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ New Split" }).click();
  await page.evaluate((parsed) => {
    (window as any).__scansplit_seed__("r-test-3", parsed);
  }, {
    merchant: null,
    items: [
      { raw: "WINE", name: "Wine", priceCents: 3000, kind: "item" },
    ],
  });
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByPlaceholder("Name").fill("Alice");
  await page.getByRole("button", { name: "+ Add" }).click();
  await page.getByPlaceholder("Name").fill("Bob");
  await page.getByRole("button", { name: "+ Add" }).click();
  await page.getByPlaceholder("Name").fill("Cara");
  await page.getByRole("button", { name: "+ Add" }).click();
  await page.getByRole("button", { name: "Next →" }).click();

  // Step 4: Cara is currently "active" via the empty-assignment default.
  // Click Cara twice: first click adds her to the explicit list (with Alice and Bob),
  // second click removes her.
  // To exclude Cara cleanly, click Alice and Bob to make assignment explicit, then ensure Cara is not active.
  await page.getByText("Alice", { exact: true }).first().click(); // explicit [Alice]
  await page.getByText("Bob", { exact: true }).first().click();   // explicit [Alice, Bob]
  // Cara should now NOT be in the assignment because the list is non-empty.

  await page.getByRole("button", { name: "Next →" }).click();

  // Wine $30 split 2 = $15 each for Alice and Bob; Cara owes $0.
  await expect(page.getByText("Alice")).toBeVisible();
  await expect(page.getByText(/\$15\.00/)).toBeVisible();
  // Cara should owe $0.
  // The Step5 view shows totals; Cara's total is $0.00.
  // We use a regex that matches "Cara" followed by $0.00 within a few characters.
  const cara = page.locator("summary", { hasText: /^Cara/ });
  await expect(cara).toContainText(/\$0\.00/);
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm e2e
```

Expected: 3 passing.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(e2e): fix-OCR and subset assignment scenarios"
```

---

## Task 26: Playwright e2e — empty OCR and OCR retry

**Files:**
- Append: `src/test/e2e/wizard.spec.ts`
- Modify: `src/pages/Wizard/Step1Scan.tsx` (add a test-mode hook for simulating retry)

- [ ] **Step 1: Add a failure-simulation hook to Step1Scan.tsx**

Append, in the same `if (import.meta.env.MODE === "test")` block:

```typescript
  (window as any).__scansplit_seed_error__ = (receiptId: string, message: string) => {
    addReceipt({
      id: receiptId, transactionId: transaction.id, imagePath: "/test/seed.jpg",
      position: receipts.length, scannedAt: 0,
    });
    setScanStatus(receiptId, "error", message);
  };
  (window as any).__scansplit_seed_empty__ = (receiptId: string) => {
    addReceipt({
      id: receiptId, transactionId: transaction.id, imagePath: "/test/seed.jpg",
      position: receipts.length, scannedAt: 0,
    });
    setScanStatus(receiptId, "ok");
    mergeParsed(receiptId, { merchant: null, items: [] });
  };
```

- [ ] **Step 2: Add tests**

Append to `src/test/e2e/wizard.spec.ts`:

```typescript
test("empty OCR: user adds items by hand", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ New Split" }).click();
  await page.evaluate(() => (window as any).__scansplit_seed_empty__("r-empty"));
  await page.getByRole("button", { name: "Next →" }).click();

  // Step 2 is empty. Add a row.
  await page.getByRole("button", { name: "+ Add row" }).click();
  const inputs = page.locator("input");
  await inputs.first().fill("Manual item");
  await inputs.nth(1).fill("10.00");
  await inputs.nth(1).blur();

  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByPlaceholder("Name").fill("Alice");
  await page.getByRole("button", { name: "+ Add" }).click();
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByRole("button", { name: "Next →" }).click();

  await expect(page.getByText(/\$10\.00/)).toBeVisible();
});

test("OCR retry: failed scan can be retried", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ New Split" }).click();
  await page.evaluate(() =>
    (window as any).__scansplit_seed_error__("r-fail", "network unreachable")
  );

  // Error visible, Next disabled.
  await expect(page.getByText(/network unreachable/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Next →" })).toBeDisabled();

  // Simulate retry succeeding: re-seed as ok via the success hook on the same id.
  await page.evaluate(() => {
    (window as any).__scansplit_seed_empty__("r-fail-retry");
  });
  // Remove the failed one.
  await page.getByText(/network unreachable/).locator("..").getByRole("button", { name: "Remove" }).click();
  await page.getByRole("button", { name: "Next →" }).click();
  await expect(page.getByRole("heading", { name: /Step 2 of 5/ })).toBeVisible();
});
```

- [ ] **Step 3: Run all e2e**

```bash
pnpm e2e
```

Expected: 5 passing.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(e2e): empty OCR and OCR retry scenarios"
```

---

## Task 27: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Add the workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test

  rust:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
        with: { workspaces: "src-tauri" }
      - name: Install system deps
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
      - run: cd src-tauri && cargo test

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm e2e
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "ci: add github actions for frontend, rust, and e2e"
```

---

## Self-Review

Checked against the spec section-by-section:

- **Goals (multi-receipt, fix OCR, subset assign, proportional tax/tip, local persistence, plain-text output)** — covered by Tasks 17, 18, 20, 5–7, 8–9, 21.
- **Non-goals** — nothing in the plan implements them.
- **Architecture** (Tauri 2 + React/TS + Rust + SQLite + Anthropic) — Task 1, 8, 10, 11.
- **Components table** — every module from the spec appears in some task (Task 14, 15, 16, 17–22 frontend; Task 8, 9, 10, 11–13 backend).
- **5 wizard steps** — Tasks 17–21, one per step.
- **Saved transaction lifecycle** — Task 22 covers view/edit/delete; Task 23 wires update path.
- **Receipt code handling (4 layers)** — Task 11 (LLM expansion in same pass + null on unsure), Task 18 (UI shows raw code below name), Task 12 (learned expansions + post-processor), Task 13 (scan_receipt applies learned + records corrections in Task 21).
- **Data model** — Task 8 migration matches spec schema exactly.
- **Split math (proportional + integer cents + largest-remainder)** — Tasks 3–7 with full TDD cycle including the determinism + invariant tests.
- **Error handling** — Task 8 (AppError enum) covers Db/Io/Http/Keyring/MissingApiKey/InvalidApiKey/RateLimited/OcrParse/NotFound; Task 17 surfaces them per thumbnail with retry; Tasks 16 (Settings) + 11 (401 mapping) cover the API-key error path.
- **Testing (vitest + cargo + playwright)** — Tasks 3–7 (vitest), Tasks 9, 11, 12 (cargo), Tasks 24–26 (playwright).
- **CI** — Task 27.

**Type consistency check:**

- `LineItem` (math types in `src/lib/types.ts`) vs `ItemRecord` (DB-mirroring types): two distinct types, intentional. Math operates on `LineItem`; storage uses `ItemRecord`. Each call site converts (Task 20 `Step4Assign`, Task 21 `Step5Result`, Task 22 `TransactionView`) — verified consistent.
- `assignedPersonIds: string[]` everywhere (`LineItem`, `ItemRecord`, `Item` rust struct). ✓
- `kind` is `"item" | "tax" | "tip" | "discount"` everywhere. ✓
- `priceCents: number` in TS, `i64` in Rust. ✓
- Tauri command names match string keys in `lib/tauri.ts` and `generate_handler!` in `lib.rs`. ✓

**Placeholder scan:** searched for "TBD", "TODO", "fill in", "appropriate" — none present in code blocks. The one `pub mod` re-export in Task 9 is noted explicitly with "(Insert that line at the top of the file — keep the rest unchanged.)" rather than left as a placeholder.

**Known follow-ups (not failures, just acknowledged):**
- Tauri default icon download in Task 1 relies on the upstream URL; replace with a custom icon before any release.
- The e2e tests use a window-mounted seed hook gated by `import.meta.env.MODE === "test"`. This is acceptable for v1 — the alternative (compiling a `FakeLlmClient` into the binary via a cargo feature flag) is documented as v2 work.
- Manual smoke-testing of the OCR path with a real Anthropic API key is intentionally not in the plan — the engineer should do this in Task 21 step 4 with their own key.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-19-scansplit.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
