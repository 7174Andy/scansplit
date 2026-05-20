# Dark-mode UI overhaul — shadcn/ui Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Apply the dark-mode UI redesign described in `docs/superpowers/specs/2026-05-19-dark-mode-ui-design.md` using **shadcn/ui** + Tailwind CSS + `lucide-react` icons. Replaces the v1 plan that hand-rolled CSS variables and a custom Button component.

**Architecture:** Add Tailwind + shadcn CLI scaffolding. Use shadcn `Button` and `Input` primitives across all pages. Use `lucide-react` for icons (replaces the v1 inline-SVG `<Icon>`). Build the Wizard `<Stepper>` ourselves (no shadcn primitive) using Tailwind utility classes. No business-logic changes. The Settings "Save & Back" UX guard from v1 is preserved.

**Tech Stack:** React 18 + TypeScript + Vite + Tauri 2. Adds: `tailwindcss`, `postcss`, `autoprefixer`, `tailwindcss-animate`, shadcn-scaffolded `button` and `input`, `lucide-react`, `@radix-ui/*` (pulled in by shadcn).

**Spec:** `docs/superpowers/specs/2026-05-19-dark-mode-ui-design.md`

**Variant mapping (spec → shadcn):**
| Spec variant | shadcn variant |
|---|---|
| primary | `default` |
| secondary | `outline` |
| ghost | `ghost` |
| danger | `destructive` |
| icon-only | `size="icon"` |

**Color token mapping:**
| Spec token | shadcn token | Notes |
|---|---|---|
| `--bg` | `--background` | dark default |
| `--text` | `--foreground` | |
| `--text-muted` | `--muted-foreground` | |
| `--surface` | `--card` | |
| `--surface-2` | `--accent` (background) | for input bg/hover |
| `--border` | `--border` | |
| `--accent` | `--primary` | |
| `--danger` | `--destructive` | |
| `--success` | custom (extend) | shadcn doesn't ship a success token; add one |

**Branch state:** `feat/dark-mode-ui` is at `b89c560` (keyring fix). The earlier UI commits were reset — this plan starts from a clean slate aside from the keyring fix and the docs.

---

## Task 1: Tailwind + shadcn bootstrap

Set up the entire UI toolchain. This is the largest task — once done, everything else is just consumption.

**Files:**
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Create: `src/globals.css` (replaces `src/index.css`)
- Create: `components.json`
- Create: `src/lib/utils.ts`
- Create: `src/components/ui/button.tsx` (from shadcn CLI)
- Create: `src/components/ui/input.tsx` (from shadcn CLI)
- Modify: `package.json` (deps), `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `src/main.tsx`
- Delete: `src/index.css`

- [ ] **Step 1: Install dev and runtime deps**

```bash
cd "/Users/andrewpark/Personal Project/scansplit"
pnpm add -D tailwindcss@^3 postcss autoprefixer @types/node
pnpm add tailwindcss-animate class-variance-authority clsx tailwind-merge lucide-react
```

Expected: `package.json` updated, `pnpm-lock.yaml` updated.

- [ ] **Step 2: Initialize Tailwind config**

```bash
pnpm exec tailwindcss init -p
```

This creates `tailwind.config.js` and `postcss.config.js`. Rename `tailwind.config.js` → `tailwind.config.ts` and replace its contents with:

```ts
import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [animate],
};
export default config;
```

Confirm `postcss.config.js` exists with the standard plugins block (tailwindcss + autoprefixer).

- [ ] **Step 3: Path aliases**

Edit `tsconfig.json` — add a `paths` entry under `compilerOptions`:

```json
{
  "compilerOptions": {
    /* ...existing options... */
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  /* ...existing include/exclude... */
}
```

Edit `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

(Preserve any existing config options — adapt rather than replace if the current file has more.)

- [ ] **Step 4: Create `src/globals.css`**

Create `src/globals.css` with shadcn's dark theme + our custom `--success` token:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 240 10% 4%;
    --foreground: 240 6% 95%;
    --card: 240 6% 11%;
    --card-foreground: 240 6% 95%;
    --popover: 240 6% 11%;
    --popover-foreground: 240 6% 95%;
    --primary: 217 91% 68%;
    --primary-foreground: 0 0% 100%;
    --secondary: 240 5% 16%;
    --secondary-foreground: 240 6% 95%;
    --muted: 240 5% 16%;
    --muted-foreground: 240 5% 70%;
    --accent: 240 5% 16%;
    --accent-foreground: 240 6% 95%;
    --destructive: 0 84% 70%;
    --destructive-foreground: 0 0% 100%;
    --success: 135 50% 60%;
    --success-foreground: 0 0% 100%;
    --border: 240 5% 22%;
    --input: 240 5% 22%;
    --ring: 217 91% 68%;
    --radius: 0.5rem;
  }

  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-feature-settings: "rlig" 1, "calt" 1;
  }
}
```

Delete `src/index.css` (it's superseded). Update `src/main.tsx` to import `./globals.css` instead of `./index.css`.

- [ ] **Step 5: Force dark mode**

Edit `index.html` — add `class="dark"` to the `<html>` element so Tailwind's `darkMode: "class"` is always active.

- [ ] **Step 6: Create `src/lib/utils.ts`** (shadcn convention)

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 7: Create `components.json`** (shadcn config — needed for the CLI)

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/globals.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

- [ ] **Step 8: Add Button and Input components via shadcn CLI**

```bash
pnpm dlx shadcn@latest add button input --yes
```

If the CLI prompts despite `--yes`, accept defaults. Expected output: creates `src/components/ui/button.tsx` and `src/components/ui/input.tsx`.

If the CLI fails (network or version mismatch), fall back to copying the canonical files from https://ui.shadcn.com/docs/components/button and https://ui.shadcn.com/docs/components/input. Report BLOCKED if neither works.

- [ ] **Step 9: Type-check and sanity-build**

```bash
pnpm tsc --noEmit
pnpm build
```

Both must succeed. `pnpm build` is heavier but it'll catch Tailwind compilation issues (e.g., `@apply border-border` failing if the border color isn't registered).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(ui): bootstrap Tailwind + shadcn/ui + lucide-react

Adds Tailwind v3, shadcn config (button + input scaffolded), and
lucide-react. Replaces src/index.css with src/globals.css containing
the shadcn dark theme + a custom --success token. Forces dark mode
via class on <html>. Adds @/* path alias."
```

---

## Task 2: Stepper component (Tailwind, no .css file)

shadcn doesn't ship a Stepper. We build it with Tailwind utility classes — one component file, no separate CSS.

**Files:**
- Create: `src/components/Stepper.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { Fragment } from "react";
import { cn } from "@/lib/utils";

interface Props {
  steps: string[];
  current: number; // 1-based
}

export function Stepper({ steps, current }: Props) {
  return (
    <nav aria-label="Progress" className="flex items-center py-2 pb-6">
      {steps.map((label, i) => {
        const n = i + 1;
        const state =
          n < current ? "done" :
          n === current ? "current" : "upcoming";
        return (
          <Fragment key={label}>
            <div
              className="flex min-w-[80px] flex-col items-center gap-1.5"
              aria-current={state === "current" ? "step" : undefined}
            >
              <div
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors",
                  state === "done" && "border-primary bg-primary text-primary-foreground",
                  state === "current" && "border-primary bg-primary text-primary-foreground ring-4 ring-primary/30",
                  state === "upcoming" && "border-border bg-background text-muted-foreground",
                )}
              >
                {n}
              </div>
              <span
                className={cn(
                  "text-[13px]",
                  state === "upcoming" ? "text-muted-foreground" : "text-foreground",
                  state === "current" && "font-semibold",
                )}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "mx-1 mb-[22px] h-0.5 flex-1",
                  n < current ? "bg-primary" : "bg-border",
                )}
              />
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Stepper.tsx
git commit -m "feat(ui): add Stepper component using Tailwind classes"
```

---

## Task 3: Refactor `Home.tsx`

**Files:**
- Modify: `src/pages/Home.tsx`

- [ ] **Step 1: Replace contents**

```tsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Gear, Plus } from "lucide-react";
import { api } from "@/lib/tauri";
import { formatCents } from "@/lib/formatCurrency";
import type { TransactionSummary } from "@/lib/types";
import { useWizardStore } from "@/store/wizardStore";
import { Button } from "@/components/ui/button";

export default function Home() {
  const [rows, setRows] = useState<TransactionSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();
  const resetWizard = useWizardStore((s) => s.reset);

  useEffect(() => {
    api.listTransactions().then(setRows).catch((e) => setErr(String(e)));
  }, []);

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">ScanSplit</h1>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => navigate("/settings")}>
            <Gear className="size-4" /> Settings
          </Button>
          <Button
            onClick={() => {
              resetWizard();
              navigate("/transaction/new");
            }}
          >
            <Plus className="size-4" /> New Split
          </Button>
        </div>
      </div>

      {err && <p className="text-destructive">{err}</p>}
      {rows === null && <p className="text-muted-foreground">Loading…</p>}
      {rows && rows.length === 0 && (
        <p className="text-muted-foreground">
          No saved splits yet. Click "New Split" to start.
        </p>
      )}

      <ul className="m-0 list-none p-0">
        {rows?.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between border-b border-border py-3.5"
          >
            <Link to={`/transaction/${r.id}`} className="text-primary hover:underline">
              {r.title}
            </Link>
            <span className="text-sm text-muted-foreground">
              {formatCents(r.totalCents, r.currency)} · {r.peopleCount} people
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Note: **`lucide-react` does not export `Gear`** — the correct name is `Settings` (which clashes with our React component name) or `Cog`. Use `Cog` here (`import { Cog, Plus } from "lucide-react"`) and replace `<Gear ...>` with `<Cog ...>` in the JSX.

- [ ] **Step 2: Fix the icon name**

In the file you just wrote, replace `Gear` with `Cog` (both in the import and in the JSX). The icon name `Gear` does not exist in lucide-react v0.x.

- [ ] **Step 3: Type-check**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/Home.tsx
git commit -m "feat(ui): Home uses shadcn Button + lucide icons"
```

---

## Task 4: Refactor `Settings.tsx` (with Save & Back guard preserved)

**Files:**
- Modify: `src/pages/Settings.tsx`

- [ ] **Step 1: Replace contents**

```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, X, Trash2, Pencil } from "lucide-react";
import { api } from "@/lib/tauri";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Settings() {
  const navigate = useNavigate();
  const [key, setKey] = useState("");
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.getApiKey().then((k) => setHasKey(!!k));
  }, []);

  async function save(): Promise<boolean> {
    setErr(null);
    try {
      await api.setApiKey(key);
      setSaved(true);
      setHasKey(true);
      setKey("");
      return true;
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      return false;
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

  async function backOrSaveAndBack() {
    if (key.length > 0) {
      const ok = await save();
      if (!ok) return;
    }
    navigate("/");
  }

  const dirty = key.length > 0;

  return (
    <div className="mx-auto max-w-xl p-8">
      <Button
        variant={dirty ? "default" : "ghost"}
        onClick={backOrSaveAndBack}
      >
        {dirty ? <Check className="size-4" /> : <ArrowLeft className="size-4" />}
        {dirty ? "Save & Back" : "Back"}
      </Button>

      <h1 className="mt-6 text-3xl font-bold">Settings</h1>

      <h3 className="mt-4 text-lg font-semibold">Anthropic API key</h3>
      <p className="text-muted-foreground">
        Stored in your OS keychain. Used for receipt OCR via Claude.
      </p>
      <p className="my-2 inline-flex items-center gap-1.5">
        {hasKey === null ? (
          <span className="text-muted-foreground">Checking…</span>
        ) : hasKey ? (
          <span className="inline-flex items-center gap-1.5 text-success">
            <Check className="size-4" /> Key configured
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <X className="size-4" /> No key set
          </span>
        )}
      </p>

      <Input
        type="password"
        placeholder="sk-ant-…"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        className="mb-2"
      />

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={!key}>
          <Check className="size-4" /> Save
        </Button>
        {hasKey && (
          <Button variant="destructive" onClick={remove}>
            <Trash2 className="size-4" /> Remove key
          </Button>
        )}
        {dirty && (
          <span className="inline-flex items-center gap-1 text-[13px] text-muted-foreground">
            <Pencil className="size-3.5" /> Unsaved
          </span>
        )}
        {saved && !dirty && (
          <span className="inline-flex items-center gap-1 text-[13px] text-success">
            <Check className="size-3.5" /> Saved
          </span>
        )}
      </div>
      {err && <p className="mt-2 text-destructive">{err}</p>}
    </div>
  );
}
```

Note: the `text-success` Tailwind class works because Task 1 registers `success` as a color in `tailwind.config.ts`.

- [ ] **Step 2: Type-check**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/Settings.tsx
git commit -m "feat(ui): Settings uses shadcn Button + Input with Save & Back guard"
```

---

## Task 5: Wizard shell + Stepper integration

**Files:**
- Modify: `src/pages/Wizard/index.tsx`

- [ ] **Step 1: Replace contents**

```tsx
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useWizardStore } from "@/store/wizardStore";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/Stepper";
import { Step1Scan } from "./Step1Scan";
import { Step2Items } from "./Step2Items";
import { Step3People } from "./Step3People";
import { Step4Assign } from "./Step4Assign";
import { Step5Result } from "./Step5Result";

const STEP_LABELS = ["Scan", "Items", "People", "Assign", "Result"];

export default function Wizard() {
  const step = useWizardStore((s) => s.step);
  const setStep = useWizardStore((s) => s.setStep);
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Button variant="ghost" onClick={() => navigate("/")}>
        <ArrowLeft className="size-4" /> Cancel
      </Button>
      <Stepper steps={STEP_LABELS} current={step} />

      {step === 1 && <Step1Scan onNext={() => setStep(2)} />}
      {step === 2 && <Step2Items onBack={() => setStep(1)} onNext={() => setStep(3)} />}
      {step === 3 && <Step3People onBack={() => setStep(2)} onNext={() => setStep(4)} />}
      {step === 4 && <Step4Assign onBack={() => setStep(3)} onNext={() => setStep(5)} />}
      {step === 5 && <Step5Result onBack={() => setStep(4)} />}
    </div>
  );
}
```

- [ ] **Step 2: Type-check, commit**

```bash
pnpm tsc --noEmit
git add src/pages/Wizard/index.tsx
git commit -m "feat(ui): Wizard shell uses shadcn Button + Stepper"
```

---

## Task 6: Step1Scan

**Files:**
- Modify: `src/pages/Wizard/Step1Scan.tsx`

- [ ] **Step 1: Add new imports after the existing ones**

```tsx
import { Plus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
```

- [ ] **Step 2: Replace the `return (...)` block (~lines 87-107)**

```tsx
  return (
    <div>
      <p className="text-muted-foreground">
        Drop receipts to extract line items.
      </p>
      <Button onClick={pickFiles} disabled={picking}>
        <Plus className="size-4" /> Add receipt files
      </Button>
      <div className="mt-4 flex flex-wrap gap-2">
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
      <div className="mt-6">
        <Button disabled={!allDone} onClick={onNext}>
          Next <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
```

Critical: keep the test-mode seed hooks (`__scansplit_seed__`, `__scansplit_seed_error__`, `__scansplit_seed_empty__`) intact above the return block — they're consumed by Playwright e2e tests.

- [ ] **Step 3: Type-check, commit**

```bash
pnpm tsc --noEmit
git add src/pages/Wizard/Step1Scan.tsx
git commit -m "feat(ui): Step1Scan uses shadcn Button + lucide icons"
```

---

## Task 7: Step2Items

**Files:**
- Modify: `src/pages/Wizard/Step2Items.tsx`

- [ ] **Step 1: Add imports**

```tsx
import { Plus, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
```

- [ ] **Step 2: Replace the `return (...)` block**

```tsx
  return (
    <div>
      <p className="text-muted-foreground">
        Fix any OCR mistakes. Edit names and prices, mark tax/tip rows, delete things you don't want.
      </p>

      <div className="grid grid-cols-[1fr_120px_120px_30px] gap-2 py-1.5 font-semibold text-primary">
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

      <Button
        variant="outline"
        className="mt-3"
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
      >
        <Plus className="size-4" /> Add row
      </Button>

      <div className="mt-6 flex gap-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        <Button disabled={!hasItem} onClick={onNext}>
          Next <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
```

- [ ] **Step 3: Type-check, commit**

```bash
pnpm tsc --noEmit
git add src/pages/Wizard/Step2Items.tsx
git commit -m "feat(ui): Step2Items uses shadcn Button + lucide icons"
```

---

## Task 8: Step3People

**Files:**
- Modify: `src/pages/Wizard/Step3People.tsx`

- [ ] **Step 1: Add imports**

```tsx
import { UserPlus, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
```

- [ ] **Step 2: Replace the `return (...)` block**

```tsx
  return (
    <div>
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
          placeholder="Name"
        />
        <Button onClick={commit}>
          <UserPlus className="size-4" /> Add
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {people.map((p) => (
          <PersonChip key={p.id} name={p.name} onRemove={() => removePerson(p.id)} />
        ))}
      </div>

      <div className="mt-6 flex gap-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        <Button disabled={people.length === 0} onClick={onNext}>
          Next <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
```

- [ ] **Step 3: Type-check, commit**

```bash
pnpm tsc --noEmit
git add src/pages/Wizard/Step3People.tsx
git commit -m "feat(ui): Step3People uses shadcn Button + Input"
```

---

## Task 9: Step4Assign

**Files:**
- Modify: `src/pages/Wizard/Step4Assign.tsx`

- [ ] **Step 1: Add imports**

```tsx
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
```

- [ ] **Step 2: Replace the `return (...)` block**

```tsx
  return (
    <div>
      <p className="text-muted-foreground">
        Click a person to toggle. Empty = shared by everyone. Tax/tip/discount auto-allocate proportionally.
      </p>

      {items.filter((i) => i.kind === "item").map((it) => (
        <div key={it.id} className="grid grid-cols-[1fr_80px_2fr] gap-3 border-b border-border py-2.5">
          <div>
            <div>{it.name}</div>
            <div className="text-[13px] text-muted-foreground">
              {formatCents(it.priceCents, transaction.currency)}
            </div>
          </div>
          <div className="text-[13px] text-muted-foreground">
            {it.assignedPersonIds.length === 0 ? "All" : `${it.assignedPersonIds.length}/${people.length}`}
          </div>
          <div className="flex flex-wrap gap-1.5">
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

      <div className="mt-6 border-t border-border py-3">
        <strong>Running totals</strong>
        <div className="mt-1.5 flex flex-wrap gap-4">
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

      <div className="mt-6 flex gap-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        <Button onClick={onNext}>
          Next <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
```

- [ ] **Step 3: Type-check, commit**

```bash
pnpm tsc --noEmit
git add src/pages/Wizard/Step4Assign.tsx
git commit -m "feat(ui): Step4Assign uses shadcn Button + Tailwind grids"
```

---

## Task 10: Step5Result

**Files:**
- Modify: `src/pages/Wizard/Step5Result.tsx`

- [ ] **Step 1: Add imports**

```tsx
import { ArrowLeft, Copy as CopyIcon, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
```

- [ ] **Step 2: Replace the `return (...)` block**

```tsx
  return (
    <div>
      <label className="mb-3 block">
        Title:&nbsp;
        <Input
          value={transaction.title}
          onChange={(e) => setTitle(e.target.value)}
          className="inline-block w-80"
        />
      </label>

      <SplitTotalsTable
        split={split}
        personNames={personNames}
        itemNames={itemNames}
        currency={transaction.currency}
      />

      <div className="mt-6 flex gap-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        <Button variant="outline" onClick={copy}>
          {copied ? <Check className="size-4" /> : <CopyIcon className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button onClick={save} disabled={saving}>
          <Check className="size-4" /> {saving ? "Saving…" : "Save"}
        </Button>
      </div>
      {err && <p className="mt-2 text-destructive">{err}</p>}
    </div>
  );
```

(`Copy` is imported as `CopyIcon` to avoid shadowing the `copy` local function.)

- [ ] **Step 3: Type-check, commit**

```bash
pnpm tsc --noEmit
git add src/pages/Wizard/Step5Result.tsx
git commit -m "feat(ui): Step5Result uses shadcn Button + Input"
```

---

## Task 11: TransactionView

**Files:**
- Modify: `src/pages/TransactionView.tsx`

- [ ] **Step 1: Replace imports and JSX**

```tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Copy as CopyIcon, Pencil, Trash2 } from "lucide-react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { api } from "@/lib/tauri";
import { computeSplit } from "@/lib/splitMath";
import { SplitTotalsTable } from "@/components/SplitTotalsTable";
import { formatCents } from "@/lib/formatCurrency";
import { useWizardStore } from "@/store/wizardStore";
import { Button } from "@/components/ui/button";
import type { FullTransaction } from "@/lib/types";
```

(`Link` is removed from `react-router-dom`.)

Then replace the JSX returns:

```tsx
  if (err) return <div className="p-6 text-destructive">Error: {err}</div>;
  if (!full || !split) return <div className="p-6 text-muted-foreground">Loading…</div>;
```

And the main return:

```tsx
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
    </div>
  );
```

- [ ] **Step 2: Type-check, commit**

```bash
pnpm tsc --noEmit
git add src/pages/TransactionView.tsx
git commit -m "feat(ui): TransactionView uses shadcn Button + lucide icons"
```

---

## Task 12: ReceiptThumbnail

**Files:**
- Modify: `src/components/ReceiptThumbnail.tsx`

- [ ] **Step 1: Replace the file**

```tsx
import { Receipt, Check, RefreshCw, X } from "lucide-react";
import type { ReceiptRecord } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  receipt: ReceiptRecord;
  status: "pending" | "scanning" | "ok" | "error";
  error?: string;
  onRemove: () => void;
  onRetry?: () => void;
}

export function ReceiptThumbnail({ receipt, status, error, onRemove, onRetry }: Props) {
  return (
    <div
      className={cn(
        "relative flex w-28 flex-col items-center gap-1.5 rounded-lg border bg-card p-2.5",
        status === "error" ? "border-destructive" : "border-border",
      )}
    >
      <Receipt className="size-8" />
      <div className="break-all text-center text-[11px] text-muted-foreground">
        {receipt.imagePath.split("/").pop()}
      </div>
      {status === "scanning" && (
        <div className="text-xs text-muted-foreground">scanning…</div>
      )}
      {status === "ok" && (
        <div className="inline-flex items-center gap-1 text-xs text-success">
          <Check className="size-3" /> done
        </div>
      )}
      {status === "error" && (
        <div className="text-center text-[11px] text-destructive">
          {error}
          {onRetry && (
            <Button variant="ghost" size="icon" aria-label="Retry scan" onClick={onRetry}>
              <RefreshCw className="size-3.5" />
            </Button>
          )}
        </div>
      )}
      <Button variant="ghost" size="icon" aria-label="Remove receipt" onClick={onRemove}>
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Type-check, commit**

```bash
pnpm tsc --noEmit
git add src/components/ReceiptThumbnail.tsx
git commit -m "feat(ui): ReceiptThumbnail uses lucide icons + shadcn Button"
```

---

## Task 13: ItemRow

**Files:**
- Modify: `src/components/ItemRow.tsx`

- [ ] **Step 1: Replace the file**

```tsx
import { Trash2 } from "lucide-react";
import type { ItemRecord } from "@/lib/types";
import { parseCurrencyToCents, formatCents } from "@/lib/formatCurrency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  item: ItemRecord;
  onChange: (patch: Partial<ItemRecord>) => void;
  onRemove: () => void;
}

export function ItemRow({ item, onChange, onRemove }: Props) {
  return (
    <div className="grid grid-cols-[1fr_120px_120px_40px] items-center gap-2 border-b border-border py-2">
      <div>
        <Input
          value={item.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        {item.rawCode && item.rawCode !== item.name && (
          <div className="mt-0.5 text-xs text-muted-foreground">{item.rawCode}</div>
        )}
      </div>
      <Input
        defaultValue={formatCents(item.priceCents).replace(/[^\d.-]/g, "")}
        onBlur={(e) => {
          const c = parseCurrencyToCents(e.target.value);
          if (c !== null) onChange({ priceCents: c });
        }}
      />
      <select
        value={item.kind}
        onChange={(e) => onChange({ kind: e.target.value as ItemRecord["kind"] })}
        className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="item">item</option>
        <option value="tax">tax</option>
        <option value="tip">tip</option>
        <option value="discount">discount</option>
      </select>
      <Button variant="ghost" size="icon" aria-label="Remove row" onClick={onRemove}>
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
```

(shadcn doesn't ship a `<Select>` by default; the native `<select>` styled with Tailwind utility classes is fine.)

- [ ] **Step 2: Type-check, commit**

```bash
pnpm tsc --noEmit
git add src/components/ItemRow.tsx
git commit -m "feat(ui): ItemRow uses shadcn Input + Button + lucide"
```

---

## Task 14: PersonChip

**Files:**
- Modify: `src/components/PersonChip.tsx`

- [ ] **Step 1: Replace the file**

```tsx
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

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
      className={cn(
        "inline-flex select-none items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-secondary text-foreground",
        onClick ? "cursor-pointer" : "cursor-default",
      )}
    >
      {name}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          aria-label={`Remove ${name}`}
          className="inline-flex cursor-pointer items-center border-0 bg-transparent p-0 text-current"
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Type-check, commit**

```bash
pnpm tsc --noEmit
git add src/components/PersonChip.tsx
git commit -m "feat(ui): PersonChip uses Tailwind classes + lucide X"
```

---

## Task 15: Verification

- [ ] **Step 1: Unit test suite**

```bash
pnpm test
```
Expected: PASS. Logic tests (splitMath, formatCurrency) should be unaffected.

- [ ] **Step 2: e2e suite**

```bash
pnpm e2e
```
If Playwright selectors used literal `+ Add receipt files` / `← Back` / `Next →`, the visible text is now without those characters (the `+` and arrows are lucide icons, not text). Update affected selectors to match new visible text. Commit selector updates as `test(e2e): update selectors for icon-prefix removal`.

- [ ] **Step 3: Full Tauri build sanity check**

```bash
pnpm build
```
Confirms Tailwind compiles, type-checks, and produces a release bundle.

- [ ] **Step 4: Manual walkthrough**

`pnpm tauri:dev`. Walk every page:
1. Home — confirm Settings (ghost+cog) and New Split (filled+plus) buttons render correctly in dark mode.
2. Settings — confirm Save & Back guard works (the original API-key bug repro is blocked).
3. Wizard — confirm Stepper shows current step state, Cancel ghost button works, each Step's Back/Next pair has icons.
4. TransactionView — Copy/Edit/Delete row; Delete is the only destructive-styled one.
5. Tab through each page — confirm focus rings are visible on all interactive elements.

- [ ] **Step 5: Final cleanup commit if needed**

```bash
git status
git add <changed files>
git commit -m "test(e2e): update selectors for shadcn refactor"
```

---

## Self-Review

**Spec coverage:** Tailwind/shadcn setup → Task 1 ✓. Stepper → Task 2 ✓. Pages → Tasks 3-11 ✓. Small components → Tasks 12-14 ✓. Verification → Task 15 ✓. Settings UX guard preserved → Task 4 ✓. Keyring fix from v1 plan is already on branch at `b89c560`, not repeated.

**Naming consistency:** lucide-react export names verified (`Cog` not `Gear`, `RefreshCw` not `Refresh`, `Trash2` is the standard trash, `CopyIcon`/`UserPlus`/`X`/`Check`/`Pencil`/`ArrowLeft`/`ArrowRight`/`Plus`/`Receipt` all exist).

**Variant mapping:** `default`/`outline`/`ghost`/`destructive` per spec table at top. `size="icon"` for icon-only buttons.
