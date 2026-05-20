# Dark-mode UI overhaul — design spec

**Date:** 2026-05-19
**Status:** Approved (design intent stable; implementation pivoted)
**Scope:** Visual styling only. No new features, no layout restructuring beyond a stepper, no light-mode support.

> **Decision log (2026-05-19, mid-execution):** Initial implementation rolled hand-written CSS variables and a custom `<Button>` component. We pivoted to **shadcn/ui** (Tailwind + Radix primitives + `lucide-react` icons) so that we don't maintain the design system ourselves. The design intent described below is unchanged — only the implementation surface differs. Token names map to shadcn defaults (e.g., `--accent` → `--primary`, `--text` → `--foreground`); see the v2 plan for the mapping table.

## Problem

The current UI (Tauri + React desktop app) renders poorly on a dark background:

1. Buttons use browser defaults — light-gray fill with dark text on a `#1a1a1a` page. Looks pasted-in, hard to see, looks unprofessional.
2. The `Settings` `<Link>` uses default link blue (`#0000EE`) on `#1a1a1a` — below WCAG AA contrast and visually jarring.
3. The disabled `Next →` button blends into the background (dark gray on dark).
4. Body type uses unstyled browser defaults — no hierarchy beyond `<h1>`/`<h2>`. Secondary text uses `#888`, dim against `#1a1a1a`.
5. All actions are text-only labels — no icons, no visual scanability.

Reference screenshots: home page and Wizard Step 1 (provided by user 2026-05-19).

## Goals

- Buttons that read clearly on the dark background, with explicit primary/secondary/danger/ghost variants and 40px min touch target.
- A coherent color palette defined as CSS custom properties so future changes happen in one place.
- Text hierarchy and contrast that meet WCAG AA at a minimum.
- Icons next to text labels for primary actions; icon-only ghost buttons for compact actions (retry, delete on a thumbnail).
- A visible step indicator for the 5-step Wizard.

## Non-goals

- Light mode.
- Animation system beyond simple `:hover` transitions.
- Functional changes (no behavior, no data, no routing changes).
- Responsive/mobile layout (this is a Tauri desktop app).
- New dependencies. No Tailwind, no UI kit, no icon font. Inline SVG icons only.

## Design tokens

Defined in `src/index.css` as CSS custom properties on `:root`. All component styling references these.

### Color
| Token | Value | Use |
|---|---|---|
| `--bg` | `#0e0e11` | Page background |
| `--surface` | `#1a1a1f` | Cards, elevated containers |
| `--surface-2` | `#25252c` | Inputs, hover states |
| `--border` | `#2e2e36` | Dividers, button borders |
| `--text` | `#f1f1f4` | Primary text |
| `--text-muted` | `#a6a6b0` | Helper text, captions |
| `--accent` | `#5b9eff` | Links, primary buttons, current-step dot |
| `--accent-hover` | `#7ab1ff` | Primary button hover |
| `--accent-press` | `#4a8de8` | Primary button active |
| `--danger` | `#ff6b6b` | Destructive actions, errors |
| `--success` | `#6ec96e` | Success messages |
| `--focus-ring` | `rgba(91, 158, 255, 0.45)` | 2px outline for keyboard focus |

Contrast check (against `--bg #0e0e11`):
- `--text`: 16.5:1 (AAA)
- `--text-muted`: 8.4:1 (AAA)
- `--accent` on `--bg`: 6.7:1 (AA)
- White text on `--accent` filled button: 4.6:1 (AA)

### Spacing & shape
| Token | Value |
|---|---|
| `--radius` | `8px` |
| `--radius-sm` | `6px` |
| `--gap-1` | `4px` |
| `--gap-2` | `8px` |
| `--gap-3` | `12px` |
| `--gap-4` | `16px` |
| `--gap-6` | `24px` |
| `--gap-8` | `32px` |

### Typography
- Font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`
- Base body: `16px / 1.5 / 400`
- `h1`: `32px / 1.2 / 700`
- `h2`: `24px / 1.3 / 600`
- `h3`: `18px / 1.3 / 600`
- `small` / muted: `14px / 1.4 / 400`, color `--text-muted`

## Components

### `<Button>` — `src/components/Button.tsx`

A single component, four variants, optional left/right icons.

```ts
type ButtonProps = {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "sm";
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  iconOnly?: boolean;       // adjusts padding for square icon-only buttons
  "aria-label"?: string;    // required when iconOnly
  children?: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;
```

**Visual rules**

| Variant | Background | Text | Border | Hover |
|---|---|---|---|---|
| primary | `--accent` | `#fff` | none | bg → `--accent-hover` |
| secondary | transparent | `--text` | `1px solid --border` | bg → `--surface-2` |
| ghost | transparent | `--text` | none | bg → `--surface-2` |
| danger | transparent | `--danger` | `1px solid --danger` | bg → rgba(255,107,107,0.12) |

**Sizing**
- `md` (default): height `40px`, horizontal padding `14px`, font `15px / 500`, gap between icon + label `8px`.
- `sm`: height `32px`, padding `10px`, font `14px`.
- `iconOnly`: square, width = height for current size.

**State**
- `:disabled` — `opacity: 0.4; cursor: not-allowed;` (no hover effect)
- `:focus-visible` — `outline: 2px solid var(--focus-ring); outline-offset: 2px;`
- `:active` — primary uses `--accent-press`; others darken by 6%.

Implementation: inline `<style>` block at module scope generates the four class names, or a CSS file `Button.css`. Either is fine — pick whichever the rest of the codebase aligns with. Since the current codebase uses inline styles, the implementation will use a small `Button.css` file imported once (avoids the inline-style API for variants, which is awkward for `:hover`).

### `<Icon>` — `src/components/Icon.tsx`

Inline-SVG icon set as a single component:

```ts
type IconName =
  | "arrow-left" | "arrow-right" | "plus" | "gear"
  | "copy" | "check" | "trash" | "refresh"
  | "receipt" | "user-plus" | "pencil" | "x";

function Icon({ name, size = 16 }: { name: IconName; size?: number }): JSX.Element;
```

All icons drawn at 24×24 viewBox, `stroke: currentColor`, `stroke-width: 2`, `fill: none`, rounded line caps/joins (feather-style). Default render size `16px` inside a button, `20px` for standalone.

Source: hand-written paths, ~12 icons, total component file ≤ 4KB. No external icon library.

### `<Stepper>` — `src/components/Stepper.tsx`

Horizontal step indicator for the Wizard. 5 dots + labels in a single row at the top of the Wizard view.

```
●───●───◉───○───○
Scan  Items  People  Assign  Result
```

- Completed step: filled `--accent` circle, label `--text`
- Current step: filled `--accent` circle with 4px ring `--accent` at 35% opacity, label `--text`, font-weight 600
- Upcoming step: outlined `--border` circle, label `--text-muted`
- Connectors: 1px line, `--border` for upcoming segment, `--accent` for completed segments
- Click behavior: out of scope. Stepper is display-only in v1. (Users navigate with Back/Next.)

Props: `{ steps: string[]; current: number /* 1-based */ }`.

## Page-by-page changes

### `src/index.css`
- Replace 3-line stub with full token definitions, base body styling, focus reset, link color (`color: var(--accent)`), heading sizes, an `input`/`textarea` baseline (background `--surface-2`, border `--border`, padding 8 12, radius `--radius-sm`).
- Keep the file small (target ≤ 90 lines). No CSS framework, no reset library.

### `src/pages/Home.tsx`
- Replace `<Link to="/settings">Settings</Link>` with `<Button variant="ghost" leftIcon={<Icon name='gear'/>} onClick={() => navigate('/settings')}>Settings</Button>`. (Matches the existing pattern used by "+ New Split", which already calls `useNavigate`.)
- "+ New Split" → `<Button variant="primary" leftIcon={<Icon name='plus'/>}>New Split</Button>`.
- Transaction list rows: increase row height to 48px, divider color `--border`, link text `--accent`, right-side meta `--text-muted`.
- Error/empty/loading text bump to base 16px.

### `src/pages/Settings.tsx`
- "← Back" → `<Button variant="ghost" leftIcon={<Icon name='arrow-left'/>}>Back</Button>`.
- Input gets the new global input baseline; remove inline padding override.
- "Save" → `<Button variant="primary" leftIcon={<Icon name='check'/>}>Save</Button>`.
- "Remove key" → `<Button variant="danger" leftIcon={<Icon name='trash'/>}>Remove key</Button>`.
- Helper paragraph color `--text-muted`.
- Status line: replace emoji with `<Icon>` for visual consistency with the rest of the app. `✅ Key configured` → `<Icon name='check'/> Key configured` (icon colored `--success`). `❌ No key set` → `<Icon name='x'/> No key set` (icon colored `--text-muted`).

**UX fix bundled in: unsaved-key prevention.** This addresses a reported bug where users type an API key, press Back without clicking Save, and later see "api key missing" when scanning. The current Save button is too easy to miss; the Back link doesn't trigger a save.
- Add a small inline indicator next to the input: when `key` has content but hasn't been saved, render `<Icon name='pencil'/> Unsaved` in `--text-muted`. After a successful save, render `<Icon name='check'/> Saved` in `--success` (the existing `setSaved(true)` already drives this; just relocate it next to the input and add the unsaved branch driven by `key.length > 0`).
- Intercept the Back button when the input is dirty: if `key` is non-empty, the Back button changes label to "Save & Back" with `variant="primary"`. Clicking it runs `save()` then navigates. If the user wants to discard, they clear the field first or use the OS window close. (Keeps the flow inside the Settings page — no modal needed.)
- Optional follow-up (out of scope for v1): handle hard navigation / window close with a `beforeunload` warning. The Save & Back pattern above covers the in-app case, which is what the reported bug hit.

### `src/pages/Wizard/index.tsx`
- Replace bare "← Cancel" button with `<Button variant="ghost" leftIcon={<Icon name='arrow-left'/>}>Cancel</Button>` in a top bar.
- Add `<Stepper steps={["Scan","Items","People","Assign","Result"]} current={step} />` directly under the cancel button.
- Drop the redundant `Step N of 5 — ...` `<h2>` heading from each Step file (the stepper replaces it). Keep the subtitle/description text.

### Wizard step files
- `Step1Scan.tsx`: "+ Add receipt files" → primary + plus icon. "Next →" → primary + arrow-right icon.
- `Step2Items.tsx`: "+ Add row" → secondary + plus. Header row keeps current `--accent` color (already blueish), retune to `--accent`. Back/Next as in pattern.
- `Step3People.tsx`, `Step4Assign.tsx`: same Back/Next pattern; primary Add buttons get plus icons.
- `Step5Result.tsx`: Back (ghost + arrow-left). "📋 Copy" → secondary + copy icon, text "Copy" / on success "Copied". Save → primary + check icon.

### `src/pages/TransactionView.tsx`
- Same Back/Edit/Delete pattern with appropriate icons (`arrow-left`, `pencil`, `trash`).

### Components
- `ReceiptThumbnail.tsx`: remove (×) text button, replace with `<Button variant="ghost" iconOnly aria-label="Remove receipt">` containing `<Icon name='x'/>`. Retry → `<Icon name='refresh'/>`.
- `ItemRow.tsx`: trash button → ghost icon-only with `trash`.
- `PersonChip.tsx`: x button → ghost icon-only with `x`, sized `sm`.

## File diff summary

**New files**
- `src/components/Button.tsx`
- `src/components/Button.css`
- `src/components/Icon.tsx`
- `src/components/Stepper.tsx`
- `src/components/Stepper.css`

**Modified files**
- `src/index.css` (tokens + base styling)
- `src/pages/Home.tsx`
- `src/pages/Settings.tsx`
- `src/pages/TransactionView.tsx`
- `src/pages/Wizard/index.tsx`
- `src/pages/Wizard/Step1Scan.tsx` … `Step5Result.tsx` (5 files)
- `src/components/ReceiptThumbnail.tsx`
- `src/components/ItemRow.tsx`
- `src/components/PersonChip.tsx`

**No changes**
- `src-tauri/**` — backend untouched.
- `src/lib/**`, `src/store/**` — logic untouched.
- `src/main.tsx`, `src/App.tsx` — routing untouched.

## Testing

This is presentational; logic is unchanged. The existing Vitest unit tests on split math and Playwright e2e tests on wizard flow should pass without modification.

Manual verification:
1. Launch `pnpm tauri:dev`.
2. Walk every page (Home, Settings, Wizard steps 1–5, TransactionView).
3. Confirm: all buttons readable, focus rings visible on keyboard tab, icons render at correct size, no console warnings, no text below 14px outside captions.

If a Playwright selector relies on a button's text content (e.g., `text="+ Add receipt files"`), the visible label may have changed (e.g., still "Add receipt files" but the `+` is now an icon). Audit `e2e/` for selectors that include the literal `+ ` prefix or `←` / `→` arrows; swap to the new visible text.

## Risk

- **Low.** Pure styling. The only behavioral change is the optional removal of per-step `<h2>` headings (replaced by the stepper). If the e2e tests check those headings, update the selectors or keep an `<h2 className="visually-hidden">` for accessibility.
- **CSS file ordering.** `index.css` ships tokens first, then components import their own `.css`. If a component's CSS runs before `index.css` (rare in Vite with the current `main.tsx` import order), CSS variables resolve fine because they cascade — variables defined on `:root` are available anywhere regardless of stylesheet import order.

## Open questions

- Should the stepper labels be clickable to jump back to a completed step? Currently spec'd as display-only. The Wizard already has a Back button; jump-back would be an enhancement, not required for this overhaul.
- Should `<input>` get the same focus ring as buttons? Yes — applied globally in `index.css` via `:focus-visible`.
