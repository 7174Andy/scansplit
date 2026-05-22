# Download Site + Brand Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a single-page download site to GitHub Pages, with terminal one-liner installers (`install.sh` + `install.ps1`) plus a per-platform downloads table; add Intel Mac to the release matrix; and finalize the brand-mark swap (in-app logo + OS app icon) that already exists locally on disk.

**Architecture:** A new `site/` directory holds plain HTML/CSS plus two shell installers and a single SVG brand mark used by all three placements (site, in-app, OS icon). A new `.github/workflows/pages.yml` deploys `site/` to GitHub Pages whenever it changes. The existing `release.yml` gains a `macos-intel` matrix entry and per-row `args` so each bundle filename carries an arch suffix the install scripts can pattern-match.

**Tech Stack:** Plain HTML5 + CSS3 (no build step, no framework), POSIX `sh`, Windows PowerShell 5.1, GitHub Actions (`actions/upload-pages-artifact@v3`, `actions/deploy-pages@v4`, `tauri-apps/tauri-action@v0`), `rsvg-convert` (librsvg) for one-time SVG-to-PNG rasterization.

**Spec:** [`docs/superpowers/specs/2026-05-22-download-site-design.md`](../specs/2026-05-22-download-site-design.md)

---

## Note on testing

This plan does not follow strict TDD. There is almost no automatable surface:

- The site is static HTML/CSS — `pnpm test` and Playwright don't cover it.
- The install scripts produce native side effects (mount DMGs, write to `/Applications`, run `msiexec`) that must be observed on real machines of each OS.
- The Logo React component has no behavior — it returns a constant SVG.
- The release workflow can only be validated by tagging a throwaway release.

Verification is therefore: typecheck the React change (`tsc --noEmit`), open `site/index.html` in a browser to eyeball the layout, and tag a `v0.0.1-rc` release after merge to dry-run the install scripts on real hardware.

## Current on-disk state (before Task 1)

These files already exist locally (uncommitted) from the design phase:

- `docs/superpowers/specs/2026-05-22-download-site-design.md` (new, untracked)
- `site/logo.svg` (new, untracked)
- `src/components/Logo.tsx` (new, untracked)
- `src/pages/Home.tsx` (modified: imports + renders `<Logo>` next to `<h1>`)
- `src-tauri/icons/icon.png` (modified: now the rasterized amber receipt)

Task 1 commits these in two logical groups. If they have already been committed, skip Task 1.

## File structure

- **Create:** `site/index.html`, `site/style.css`, `site/install.sh`, `site/install.ps1`, `site/screenshot.png`, `.github/workflows/pages.yml`
- **Already created (commit in Task 1):** `site/logo.svg`, `src/components/Logo.tsx`, `docs/superpowers/specs/2026-05-22-download-site-design.md`
- **Modify:** `.github/workflows/release.yml` (add Intel Mac), `CLAUDE.md` (add icon-regen command)
- **Already modified (commit in Task 1):** `src/pages/Home.tsx`, `src-tauri/icons/icon.png`
- **Unmodified:** all of `src-tauri/src/`, all of `src/` apart from `Home.tsx` and the new `Logo.tsx`, all migrations, all existing tests

The site files are intentionally flat — six files in `site/`, no subdirectories. The HTML pulls everything from the same folder.

---

## Task 1: Commit the design artifacts and the brand-mark work

**Files:**
- Add: `docs/superpowers/specs/2026-05-22-download-site-design.md` (untracked)
- Add: `site/logo.svg` (untracked)
- Add: `src/components/Logo.tsx` (untracked)
- Add: `src/pages/Home.tsx` (modified)
- Add: `src-tauri/icons/icon.png` (modified)

- [ ] **Step 1: Verify the expected state**

Run: `git status --short`

Expected output (order may vary):
```
 M src-tauri/icons/icon.png
 M src/pages/Home.tsx
?? docs/superpowers/specs/2026-05-22-download-site-design.md
?? site/
?? src/components/Logo.tsx
```

If anything is missing, stop and reconcile before continuing.

- [ ] **Step 2: Commit the spec on its own**

```bash
git add docs/superpowers/specs/2026-05-22-download-site-design.md
git commit -m "docs(spec): download site and brand refresh design"
```

- [ ] **Step 3: Commit the brand mark + in-app logo + icon swap**

```bash
git add site/logo.svg src/components/Logo.tsx src/pages/Home.tsx src-tauri/icons/icon.png
git commit -m "feat(brand): unify app icon and in-app header logo as amber receipt"
```

- [ ] **Step 4: Verify the working tree is clean and tests still pass**

```bash
git status --short
pnpm exec tsc --noEmit
pnpm test
```

Expected:
- `git status --short` is empty.
- `tsc` prints nothing (clean exit).
- Vitest passes all suites.

If Vitest fails on anything that asserts on the Home page's `<h1>` structure, update the test selector to match the new flex wrapper (`flex items-center gap-3 > h1`) rather than reverting the layout.

---

## Task 2: Add Intel Mac to the release matrix

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Read the current release.yml**

Run: `cat .github/workflows/release.yml`

Confirm the `matrix.include` block currently lists exactly three entries: `macos-arm64` / `macos-latest`, `windows-x64` / `windows-latest`, `linux-x64` / `ubuntu-22.04`, with no `args` field on any entry.

- [ ] **Step 2: Replace the matrix block and add `args` plumbing**

Open `.github/workflows/release.yml` and:

(a) Replace the entire `matrix:` block with:

```yaml
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: macos-arm64
            runner: macos-latest
            args: --target aarch64-apple-darwin
          - platform: macos-intel
            runner: macos-13
            args: --target x86_64-apple-darwin
          - platform: windows-x64
            runner: windows-latest
            args: ''
          - platform: linux-x64
            runner: ubuntu-22.04
            args: ''
```

(b) In the `tauri-apps/tauri-action@v0` step, add `args: ${{ matrix.args }}` inside the `with:` block, after `prerelease: false` (or wherever the existing `with:` block ends — order does not matter for action inputs):

```yaml
      - name: Build, create release, and upload bundles
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: 'ScanSplit ${{ github.ref_name }}'
          releaseDraft: true
          args: ${{ matrix.args }}
```

(Preserve any other `with:` keys already there, like `prerelease`.)

- [ ] **Step 3: Validate the YAML parses**

Run: `pnpm exec js-yaml .github/workflows/release.yml > /dev/null` — if `js-yaml` is unavailable, use Python: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))"`.

Expected: clean exit, no error.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add macOS Intel to release matrix"
```

---

## Task 3: Add the Pages deploy workflow

**Files:**
- Create: `.github/workflows/pages.yml`

- [ ] **Step 1: Create the workflow**

Write to `.github/workflows/pages.yml`:

```yaml
name: Pages

on:
  push:
    branches: [main]
    paths: ['site/**', '.github/workflows/pages.yml']
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: site
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Validate YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/pages.yml'))"`

Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/pages.yml
git commit -m "ci: deploy site/ to GitHub Pages on main pushes"
```

- [ ] **Step 4: Note the manual repo setting (do not block on this)**

After the workflow lands on `main` for the first time, the repo owner must flip Settings → Pages → Build and deployment → Source: **GitHub Actions** (one-time). Until they do, the workflow runs green but nothing is published. Surface this in the PR description.

---

## Task 4: Write the macOS / Linux installer

**Files:**
- Create: `site/install.sh`

- [ ] **Step 1: Write the script**

Write to `site/install.sh`:

```sh
#!/bin/sh
# ScanSplit installer for macOS and Linux.
# Usage: curl -fsSL https://7174andy.github.io/scansplit/install.sh | sh
set -e

REPO="7174Andy/scansplit"
API_URL="https://api.github.com/repos/$REPO/releases/latest"

printf 'Installing ScanSplit…\n'

case "$(uname -s)" in
  Darwin) OS=macos ;;
  Linux)  OS=linux ;;
  *) printf 'Unsupported OS: %s\n' "$(uname -s)" >&2; exit 1 ;;
esac

case "$(uname -m)" in
  arm64|aarch64) ARCH=aarch64 ;;
  x86_64|amd64)  ARCH=x64 ;;
  *) printf 'Unsupported arch: %s\n' "$(uname -m)" >&2; exit 1 ;;
esac

# Pick asset name pattern
if [ "$OS" = macos ]; then
  if [ "$ARCH" = aarch64 ]; then
    PATTERN='aarch64\.dmg$'
  else
    PATTERN='_x64\.dmg$'
  fi
elif [ -r /etc/os-release ] && grep -qE '^ID(_LIKE)?=.*(debian|ubuntu)' /etc/os-release; then
  PATTERN='_amd64\.deb$'
  LINUX_FORMAT=deb
else
  PATTERN='_amd64\.AppImage$'
  LINUX_FORMAT=appimage
fi

ASSET_URL=$(curl -fsSL "$API_URL" \
  | grep '"browser_download_url"' \
  | cut -d '"' -f 4 \
  | grep -E "$PATTERN" \
  | head -1)

if [ -z "$ASSET_URL" ]; then
  printf 'No matching asset (pattern: %s). Is a release published yet?\n' "$PATTERN" >&2
  exit 1
fi

TMP=$(mktemp -d)
FILE="$TMP/$(basename "$ASSET_URL")"
printf 'Downloading %s…\n' "$(basename "$ASSET_URL")"
curl -fL --progress-bar "$ASSET_URL" -o "$FILE"

if [ "$OS" = macos ]; then
  printf 'Mounting disk image…\n'
  MOUNT=$(hdiutil attach -nobrowse "$FILE" | awk '/\/Volumes\// {print $NF; exit}')
  if [ -z "$MOUNT" ]; then
    printf 'Could not determine mount point.\n' >&2
    exit 1
  fi
  if [ -d /Applications/ScanSplit.app ]; then
    printf 'Removing existing ScanSplit.app…\n'
    rm -rf /Applications/ScanSplit.app
  fi
  cp -R "$MOUNT/ScanSplit.app" /Applications/
  hdiutil detach -quiet "$MOUNT"
  printf 'Removing quarantine attribute (app is unsigned)…\n'
  xattr -dr com.apple.quarantine /Applications/ScanSplit.app
  printf 'ScanSplit installed. Launch it from Applications.\n'
elif [ "$LINUX_FORMAT" = deb ]; then
  printf 'Installing .deb (sudo required)…\n'
  sudo dpkg -i "$FILE" || sudo apt-get -f install -y
  printf 'ScanSplit installed. Launch it from your application menu.\n'
else
  DEST="$HOME/.local/bin/scansplit"
  mkdir -p "$HOME/.local/bin"
  install -m 755 "$FILE" "$DEST"
  printf 'ScanSplit installed to %s\n' "$DEST"
  case ":$PATH:" in
    *":$HOME/.local/bin:"*) ;;
    *) printf 'Note: add %s to your PATH to launch from anywhere.\n' "$HOME/.local/bin" ;;
  esac
fi
```

- [ ] **Step 2: Make it executable and shell-check it**

```bash
chmod +x site/install.sh
sh -n site/install.sh
```

Expected: `sh -n` is a syntax check and prints nothing on success.

- [ ] **Step 3: Commit**

```bash
git add site/install.sh
git commit -m "feat(site): macOS + Linux installer script"
```

---

## Task 5: Write the Windows installer

**Files:**
- Create: `site/install.ps1`

- [ ] **Step 1: Write the script**

Write to `site/install.ps1`:

```powershell
# ScanSplit installer for Windows.
# Usage: irm https://7174andy.github.io/scansplit/install.ps1 | iex
$ErrorActionPreference = 'Stop'

$repo = '7174Andy/scansplit'
Write-Host 'Installing ScanSplit…'

if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') {
    Write-Error "Only x64 Windows is supported. Detected: $env:PROCESSOR_ARCHITECTURE"
    exit 1
}

$release = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest"
$asset = $release.assets | Where-Object { $_.name -like '*_x64_en-US.msi' } | Select-Object -First 1
if (-not $asset) {
    Write-Error "No .msi asset found in latest release. Has a release been published?"
    exit 1
}

$out = Join-Path $env:TEMP $asset.name
Write-Host "Downloading $($asset.name)…"
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $out

Write-Host 'Launching installer…'
Start-Process msiexec.exe -ArgumentList "/i `"$out`" /qb" -Wait

Write-Host 'ScanSplit installed.'
Write-Host "SmartScreen may warn on first launch — click 'More info' -> 'Run anyway' once and it stops asking."
```

- [ ] **Step 2: Commit**

```bash
git add site/install.ps1
git commit -m "feat(site): Windows installer script"
```

(There is no PowerShell linter assumed to be installed locally. Syntax errors will surface when an actual Windows user runs the script — flagged as a known limitation.)

---

## Task 6: Write the stylesheet

**Files:**
- Create: `site/style.css`

- [ ] **Step 1: Write the CSS**

Write to `site/style.css`:

```css
:root {
  --bg: #ffffff;
  --fg: #0f172a;
  --muted: #64748b;
  --border: #e2e8f0;
  --accent: #f59e0b;
  --code-bg: #f1f5f9;
  --card-bg: #ffffff;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f172a;
    --fg: #e2e8f0;
    --muted: #94a3b8;
    --border: #1e293b;
    --code-bg: #1e293b;
    --card-bg: #1e293b;
  }
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
    "Segoe UI", Roboto, sans-serif;
  line-height: 1.55;
}

a { color: inherit; }

main, .site-header, footer {
  max-width: 960px;
  margin: 0 auto;
  padding: 0 24px;
}

.site-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 20px;
  padding-bottom: 20px;
  position: sticky;
  top: 0;
  background: var(--bg);
  z-index: 10;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  font-weight: 600;
  color: var(--accent);
}

.brand span { color: var(--fg); }

nav { display: flex; gap: 20px; }

nav a {
  text-decoration: none;
  color: var(--muted);
  font-size: 14px;
}

nav a:hover { color: var(--fg); }

.hero {
  padding-top: 64px;
  padding-bottom: 24px;
  text-align: center;
}

.hero h1 {
  font-size: 44px;
  margin: 0 0 16px;
  line-height: 1.15;
}

.tagline {
  font-size: 18px;
  color: var(--muted);
  max-width: 560px;
  margin: 0 auto;
}

.install { padding: 32px 0; }

.tabs {
  max-width: 640px;
  margin: 0 auto;
}

.tabs input[type="radio"] { display: none; }

.tabs label {
  display: inline-block;
  padding: 8px 16px;
  border: 1px solid var(--border);
  cursor: pointer;
  font-size: 14px;
  color: var(--muted);
  background: var(--bg);
}

.tabs label:first-of-type { border-radius: 6px 0 0 6px; }
.tabs label:nth-of-type(2) { border-radius: 0 6px 6px 0; margin-left: -1px; }

.tabs input:checked + label {
  background: var(--accent);
  color: #0f172a;
  border-color: var(--accent);
}

.tab-content { display: none; margin-top: 12px; position: relative; }

#tab-unix:checked ~ .tab-unix,
#tab-win:checked ~ .tab-win { display: block; }

.tab-content pre {
  background: var(--code-bg);
  padding: 16px 56px 16px 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 0;
}

.tab-content code {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 14px;
}

.copy {
  position: absolute;
  top: 10px;
  right: 10px;
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--muted);
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}

.copy:hover { color: var(--fg); }

.hint {
  text-align: center;
  color: var(--muted);
  font-size: 14px;
  margin-top: 16px;
}

.hint code {
  background: var(--code-bg);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 13px;
}

.features { padding: 48px 0; }

.features h2 {
  text-align: center;
  font-size: 28px;
  margin: 0 0 32px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 20px;
  background: var(--card-bg);
}

.card h3 {
  margin: 0 0 8px;
  font-size: 16px;
}

.card p {
  margin: 0;
  color: var(--muted);
  font-size: 14px;
}

.screenshot-section {
  padding: 32px 0;
  display: flex;
  justify-content: center;
}

.screenshot-frame {
  max-width: 880px;
  width: 100%;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 20px 50px -20px rgba(15, 23, 42, 0.25);
  border: 1px solid var(--border);
}

.window-chrome {
  display: flex;
  gap: 6px;
  padding: 10px 14px;
  background: var(--code-bg);
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

.dot-r { background: #ef4444; }
.dot-y { background: #f59e0b; }
.dot-g { background: #10b981; }

.screenshot-frame img { display: block; width: 100%; }

.downloads { padding: 48px 0; }

.downloads h2 {
  font-size: 28px;
  margin: 0 0 8px;
}

.downloads > p {
  color: var(--muted);
  margin: 0 0 16px;
}

.downloads table {
  width: 100%;
  border-collapse: collapse;
}

.downloads th, .downloads td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
}

.downloads th {
  color: var(--muted);
  font-weight: 500;
}

.note {
  margin-top: 24px;
  padding: 12px 16px;
  background: var(--code-bg);
  border-radius: 8px;
  color: var(--muted);
  font-size: 13px;
}

.note strong { color: var(--fg); }

footer {
  padding: 32px 24px;
  text-align: center;
  color: var(--muted);
  font-size: 14px;
}

@media (max-width: 720px) {
  .grid { grid-template-columns: 1fr; }
  .hero h1 { font-size: 32px; }
  nav { gap: 12px; }
}
```

- [ ] **Step 2: Commit**

```bash
git add site/style.css
git commit -m "feat(site): page styles with dark mode via prefers-color-scheme"
```

---

## Task 7: Capture the Step 5 screenshot

**Files:**
- Create: `site/screenshot.png`

This step is interactive. Plan for ~5 minutes.

- [ ] **Step 1: Start the test-mode dev server**

In one terminal: `pnpm dev:test`

Wait until it prints `Local: http://localhost:1420/`.

- [ ] **Step 2: Open the app and seed a transaction**

In Chrome (any browser works, but Chrome's DevTools "Capture node screenshot" makes step 4 easy), open `http://localhost:1420/transaction/new`.

In DevTools Console, paste:

```js
window.__scansplit_seed__('seed-1', {
  items: [
    { name: 'Margherita pizza', priceCents: 1850, kind: 'item' },
    { name: 'Caesar salad',     priceCents: 1450, kind: 'item' },
    { name: 'Sparkling water',  priceCents: 600,  kind: 'item' },
    { name: 'Tax',              priceCents: 320,  kind: 'tax' },
    { name: 'Tip',              priceCents: 600,  kind: 'tip' },
  ],
});
```

- [ ] **Step 3: Advance through the wizard**

1. Step 2 (Items): no changes; click **Next**.
2. Step 3 (People): add three people — `Alex`, `Jordan`, `Sam`. **Next**.
3. Step 4 (Assign): assign one item to all three; one item to Alex + Jordan; one item to Sam only. **Next**.
4. Step 5 (Result): you should see per-person totals.

- [ ] **Step 4: Capture the screenshot**

In DevTools → Elements panel, right-click the top-level element that wraps Step 5's content (the `<div className="mx-auto max-w-3xl p-8">` or equivalent) and choose **Capture node screenshot**. Save the file as `site/screenshot.png`.

Target: PNG, roughly 1100px wide, under 500 KB. If the export is larger, run:

```bash
sips -Z 1100 site/screenshot.png --out site/screenshot.png
```

(`sips` is preinstalled on macOS.)

- [ ] **Step 5: Stop the dev server**

In the terminal running `pnpm dev:test`: Ctrl-C.

- [ ] **Step 6: Commit**

```bash
git add site/screenshot.png
git commit -m "feat(site): Step 5 result screenshot"
```

---

## Task 8: Write the HTML page

**Files:**
- Create: `site/index.html`

- [ ] **Step 1: Write the HTML**

Write to `site/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ScanSplit — split receipts fairly, locally</title>
  <meta name="description" content="A fast, local-first desktop app that turns receipt photos into a fair per-person split. macOS, Windows, Linux.">
  <link rel="icon" href="logo.svg" type="image/svg+xml">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="site-header">
    <a class="brand" href="#">
      <img src="logo.svg" alt="" width="28" height="28">
      <span>ScanSplit</span>
    </a>
    <nav>
      <a href="#install">Install</a>
      <a href="#features">Features</a>
      <a href="#downloads">Downloads</a>
      <a href="https://github.com/7174Andy/scansplit" target="_blank" rel="noopener">GitHub</a>
    </nav>
  </header>

  <main>
    <section class="hero">
      <h1>Split receipts fairly. Locally.</h1>
      <p class="tagline">Snap a receipt, assign items to people, get an exact per-person total — without an account, a cloud, or a paywall.</p>
    </section>

    <section id="install" class="install">
      <div class="tabs">
        <input type="radio" id="tab-unix" name="install-tab" checked>
        <label for="tab-unix">macOS / Linux</label>
        <input type="radio" id="tab-win" name="install-tab">
        <label for="tab-win">Windows</label>

        <div class="tab-content tab-unix">
          <pre><code id="cmd-unix">curl -fsSL https://7174andy.github.io/scansplit/install.sh | sh</code></pre>
          <button class="copy" data-target="cmd-unix" type="button">Copy</button>
        </div>
        <div class="tab-content tab-win">
          <pre><code id="cmd-win">irm https://7174andy.github.io/scansplit/install.ps1 | iex</code></pre>
          <button class="copy" data-target="cmd-win" type="button">Copy</button>
        </div>
      </div>
      <p class="hint">macOS / Linux installs into <code>/Applications</code> or <code>~/.local/bin</code>. Windows opens the MSI installer.</p>
    </section>

    <section id="features" class="features">
      <h2>What it does</h2>
      <div class="grid">
        <div class="card">
          <h3>Multi-receipt transactions</h3>
          <p>Combine several receipts into one shared bill — dinner + drinks tab, one split.</p>
        </div>
        <div class="card">
          <h3>AI line-item extraction</h3>
          <p>Claude Sonnet 4.6 reads the photo and returns structured items, tax, tip, and discounts.</p>
        </div>
        <div class="card">
          <h3>Per-person assignment</h3>
          <p>Toggle who had what. An empty assignment defaults to "everyone."</p>
        </div>
        <div class="card">
          <h3>Exact fair-share math</h3>
          <p>Integer cents, largest-remainder allocation, proportional tax and tip. Totals always sum exactly.</p>
        </div>
        <div class="card">
          <h3>Learns over time</h3>
          <p>Correct a cryptic SKU once ("ITEM 4823" → "Caesar Salad") and ScanSplit remembers it for that merchant.</p>
        </div>
        <div class="card">
          <h3>Local-first</h3>
          <p>Data lives in a SQLite database on your machine. The only outbound call is the OCR request to Anthropic.</p>
        </div>
      </div>
    </section>

    <section class="screenshot-section">
      <div class="screenshot-frame">
        <div class="window-chrome">
          <span class="dot dot-r"></span>
          <span class="dot dot-y"></span>
          <span class="dot dot-g"></span>
        </div>
        <img src="screenshot.png" alt="ScanSplit Step 5 — per-person totals">
      </div>
    </section>

    <section id="downloads" class="downloads">
      <h2>Direct downloads</h2>
      <p>Prefer to click instead? Pick your platform.</p>
      <table>
        <thead>
          <tr><th>Platform</th><th>File</th></tr>
        </thead>
        <tbody>
          <tr><td>macOS (Apple Silicon)</td><td><a class="dl" data-pattern="aarch64\.dmg$" href="https://github.com/7174Andy/scansplit/releases/latest">Latest release →</a></td></tr>
          <tr><td>macOS (Intel)</td><td><a class="dl" data-pattern="_x64\.dmg$" href="https://github.com/7174Andy/scansplit/releases/latest">Latest release →</a></td></tr>
          <tr><td>Windows (MSI)</td><td><a class="dl" data-pattern="_x64_en-US\.msi$" href="https://github.com/7174Andy/scansplit/releases/latest">Latest release →</a></td></tr>
          <tr><td>Windows (NSIS)</td><td><a class="dl" data-pattern="_x64-setup\.exe$" href="https://github.com/7174Andy/scansplit/releases/latest">Latest release →</a></td></tr>
          <tr><td>Linux (Debian/Ubuntu)</td><td><a class="dl" data-pattern="_amd64\.deb$" href="https://github.com/7174Andy/scansplit/releases/latest">Latest release →</a></td></tr>
          <tr><td>Linux (AppImage)</td><td><a class="dl" data-pattern="_amd64\.AppImage$" href="https://github.com/7174Andy/scansplit/releases/latest">Latest release →</a></td></tr>
        </tbody>
      </table>
      <p id="first-run" class="note">
        Bundles are unsigned. <strong>macOS:</strong> right-click → <em>Open</em> the first time (or use the install script, which strips the quarantine flag for you). <strong>Windows:</strong> click <em>More info</em> → <em>Run anyway</em> when SmartScreen warns.
      </p>
    </section>
  </main>

  <footer>
    <p><a href="https://github.com/7174Andy/scansplit">github.com/7174Andy/scansplit</a></p>
  </footer>

  <script>
    document.querySelectorAll('.copy').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = document.getElementById(btn.dataset.target);
        navigator.clipboard.writeText(target.textContent).then(function () {
          var orig = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(function () { btn.textContent = orig; }, 1500);
        }).catch(function () {});
      });
    });

    fetch('https://api.github.com/repos/7174Andy/scansplit/releases/latest')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (release) {
        if (!release || !release.assets) return;
        document.querySelectorAll('a.dl').forEach(function (a) {
          var pattern = new RegExp(a.dataset.pattern);
          var asset = release.assets.find(function (x) { return pattern.test(x.name); });
          if (asset) {
            a.href = asset.browser_download_url;
            a.textContent = asset.name;
          }
        });
      })
      .catch(function () {});
  </script>
</body>
</html>
```

- [ ] **Step 2: Open it in a browser and eyeball it**

Run: `open site/index.html` (macOS) or `xdg-open site/index.html` (Linux). In the browser:

- Header renders the amber receipt logo + "ScanSplit" + nav links.
- Hero, install block, features grid (3-up on desktop, 1-up if you narrow the window past 720px), screenshot panel, and downloads table all render top-to-bottom.
- The tab switcher toggles between the two install commands.
- The copy button copies the command to clipboard.
- The downloads table either shows real filenames (if a release is published) or "Latest release →" fallback links.

If any layout breaks visibly, fix it before continuing (don't ship visibly-broken CSS).

- [ ] **Step 3: Commit**

```bash
git add site/index.html
git commit -m "feat(site): single-page HTML with hero, install, features, downloads"
```

---

## Task 9: Document the icon-regeneration command

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Read the current Commands section**

Run: `grep -n "^## Commands\|^## Architecture" CLAUDE.md`

This will give you the line range of the Commands section.

- [ ] **Step 2: Append a row to the Commands table**

Open `CLAUDE.md`. Find the existing Commands table (markdown table starting with `| Task | Command |`). Append this row at the end of the table, immediately before the next paragraph:

```
| Regenerate app icon from logo SVG | `rsvg-convert -w 512 -h 512 site/logo.svg -o src-tauri/icons/icon.png` |
```

If `rsvg-convert` is not already mentioned elsewhere in `CLAUDE.md`, add a single sentence right below the Commands table:

```markdown
Regenerating the icon requires `librsvg` (`brew install librsvg` on macOS). Re-run the command whenever `site/logo.svg` changes.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note rsvg-convert command for regenerating app icon"
```

---

## Task 10: Open the pull request

**Files:**
- None (PR metadata only)

- [ ] **Step 1: Push the branch**

If you are working on a branch (recommended), push it: `git push -u origin <branch-name>`.

If you've been committing directly to `main` for this work, skip to Step 3 — the PR step does not apply.

- [ ] **Step 2: Create the PR**

```bash
gh pr create --title "Download site + brand refresh" --body "$(cat <<'EOF'
## Summary
- Adds `site/` — a plain HTML/CSS single-page download site published to GitHub Pages via the new `pages.yml` workflow.
- Adds `install.sh` (macOS/Linux) and `install.ps1` (Windows) one-liner installers. `install.sh` strips macOS quarantine attributes and auto-picks `.deb` vs `.AppImage` on Linux.
- Adds macOS Intel to the release matrix (`macos-13` runner, `--target x86_64-apple-darwin`).
- Replaces the OS app icon and adds an in-app header logo, both sourced from a single `site/logo.svg` (amber receipt mark). Tauri auto-generates `.icns` / `.ico` from `icon.png` at bundle time.
- Documents the manual `rsvg-convert` command to regenerate the icon when the SVG changes.

## Manual follow-ups
- **One-time:** flip Settings → Pages → Build and deployment → Source to **GitHub Actions**. Until this is set, the Pages workflow runs green but nothing is published.
- **To validate end-to-end:** cut a `v0.0.1-rc` tag after merge to exercise the updated release matrix and the install scripts on real macOS / Windows / Linux machines.
- The install scripts and downloads table will 404 until at least one release is *published* (not just drafted) — `release.yml` currently produces drafts.

## Test plan
- [ ] `pnpm exec tsc --noEmit` — passes
- [ ] `pnpm test` — passes
- [ ] `pnpm e2e` — passes
- [ ] `open site/index.html` — page renders, tabs switch, copy button works
- [ ] Tag `v0.0.1-rc` and confirm `release.yml` produces four bundles (Apple Silicon, Intel Mac, Windows, Linux)
- [ ] Run `install.sh` on a real macOS arm machine — app installs without Gatekeeper warning
- [ ] Run `install.sh` on a real Linux Debian/Ubuntu machine — app installs via `.deb`
- [ ] Run `install.ps1` on a real Windows machine — installer launches, app installs

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Return the PR URL**

`gh pr view --json url --jq .url`

Hand this URL back to the user.

---

## Self-review checklist (for the executor, after Task 10)

Before reporting the work as complete:

1. `git log --oneline origin/main..HEAD` — confirm one commit per task, no `fixup` or `wip` left behind.
2. `git status` — clean working tree.
3. `pnpm exec tsc --noEmit && pnpm test` — green.
4. Open the PR in a browser, confirm the description renders, attach the live Pages URL once the workflow finishes.
