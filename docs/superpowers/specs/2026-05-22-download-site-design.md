# Download site and brand refresh for ScanSplit

**Date:** 2026-05-22
**Status:** Design

## Motivation

ScanSplit has a working release workflow (`release.yml`) but no public
landing point. A user who hears about the app has nowhere to go: the
repo's README is dev-facing, and the GitHub Releases page is bare metal
(asset filenames, no context, no install guidance). For a desktop app
shipped as unsigned bundles, the install moment is also the most fragile
part of the experience — Gatekeeper warnings on macOS and the
`.deb`-vs-`.AppImage` choice on Linux are real friction.

This design adds a single-page static site, published to GitHub Pages,
with a terminal one-liner install (matching the
[emdee.tlab.sh](https://emdee.tlab.sh/) reference the user pointed at)
plus a per-platform downloads table. The one-liner does the work the
double-click can't: it strips macOS quarantine attributes, picks the
right Linux package format, and surfaces a clear success message.

A new brand mark — a single-color amber receipt — ships alongside the
site and replaces both the in-app header wordmark's neighbor and the
OS-level app icon. The previous icon (teal + yellow interlocking
circles) was abstract; the new mark is purpose-built ("a receipt") so
the brand reads as the same thing in the dock, the app header, and the
hero of the download site. One SVG is the source of truth for all
three placements.

## Goals

- A user landing on `https://7174andy.github.io/scansplit/` can install
  ScanSplit on macOS, Windows, or Linux with one terminal command or one
  click on a download asset.
- The `install.sh` script handles macOS quarantine bypass (`xattr -dr
  com.apple.quarantine`) so the first launch does not trigger
  Gatekeeper's "cannot be opened because Apple cannot check it"
  warning.
- The `install.sh` script auto-detects Linux package format from
  `/etc/os-release` (`.deb` for Debian-family, `.AppImage` otherwise) so
  Linux users do not have to choose.
- The site, the install scripts, and the release workflow all stay in
  the same repo; nothing requires an external host or DNS.
- Intel Mac (`x86_64-apple-darwin`) bundles are added to the release
  matrix alongside the existing Apple Silicon target.
- The site is plain HTML/CSS with no build step. A reader can open
  `site/index.html` locally and see the page rendered correctly.
- The same brand mark (`site/logo.svg`) is used in three places: the
  site hero/header, the in-app Home page header, and the OS app icon
  (`src-tauri/icons/icon.png`, rasterized from the SVG). All three
  read as the same identity.

## Non-goals

- **No custom domain.** The user picked the default GitHub Pages URL
  (`7174andy.github.io/scansplit`). Adding a custom domain later is a
  DNS change plus a `CNAME` file; this design does not foreclose it.
- **No code signing or notarization.** Bundles remain unsigned. The
  install script silences the macOS warning via `xattr`, not via a
  Developer ID cert. Windows users still see SmartScreen; the
  PowerShell install script prints a one-line note about that. Signing
  is a separate effort with its own credentials.
- **No package-manager publishing.** No Homebrew tap, no winget
  manifest, no apt repository. The terminal one-liner is a shell
  installer, not a package-manager install. Publishing to registries
  is a separate, ongoing-maintenance effort and out of scope.
- **No client-side JavaScript framework.** No React, no Tailwind, no
  build step. The page is hand-written HTML + a single CSS file. The
  tab switcher for the install command uses the CSS `:checked +`
  pattern with hidden radio inputs — no JS.
- **No analytics or telemetry on the site.** The site is informational
  only and does not load third-party scripts.
- **No auto-updater integration.** Re-running `install.sh` upgrades to
  the latest release; that is the entire update story for now.
- **No site-side validation that a release exists.** The install
  scripts fail with a clear error if `releases/latest` returns nothing;
  the HTML does not try to gate the install command on release
  presence.

## Architecture

### Files added or changed

```
site/
  index.html        new: single page
  style.css         new: all styles, dark mode via prefers-color-scheme
  install.sh        new: macOS + Linux installer
  install.ps1       new: Windows installer
  screenshot.png    new: captured from pnpm dev:test (Step 5 result)
  logo.svg          new: single-color amber receipt mark; also serves as site favicon
  CNAME             omitted in v1; add when custom domain is wanted

src/components/
  Logo.tsx          new: inline-SVG React component; size via className,
                    color via currentColor (default text-amber-500)

src/pages/
  Home.tsx          modified: wraps the existing <h1>ScanSplit</h1> in a flex
                    row with <Logo className="size-9"> to its left

src-tauri/icons/
  icon.png          replaced: 512×512 RGBA PNG rasterized from site/logo.svg
                    via rsvg-convert. Tauri auto-generates .icns / .ico from
                    this single PNG at bundle time.

.github/workflows/
  pages.yml         new: deploys site/ to GitHub Pages on main pushes that touch site/
  release.yml       modified: add macos-intel matrix entry
```

### Brand mark and app icon

The single source of truth for the brand is `site/logo.svg`: a 64×64
viewBox containing a one-color (amber-500, `#f59e0b`) receipt
silhouette. Three placements consume it:

1. **Site.** The HTML references `site/logo.svg` for the header
   wordmark's neighbor and as the favicon via
   `<link rel="icon" href="/logo.svg">`. SVG favicons are supported by
   all modern browsers; a fallback is not required for v1.
2. **In-app header.** `src/components/Logo.tsx` is a React component
   that inlines the same SVG. It accepts a `className` prop merged via
   `cn()` from `src/lib/utils`. The default class is `text-amber-500`,
   so the SVG's `fill="currentColor"` paints amber unless the caller
   overrides the color. `Home.tsx` renders it at `size-9` (36px) next
   to the existing `<h1>` wordmark.
3. **OS app icon.** `src-tauri/icons/icon.png` is a 512×512 RGBA PNG
   rasterized from the SVG. Tauri's bundler generates platform
   formats (`.icns`, `.ico`, smaller PNGs) from this single source at
   bundle time, so no further per-format files are checked in.

The rasterization step is **manual and reproducible**, not automated.
Whenever `logo.svg` changes, the developer runs:

```
rsvg-convert -w 512 -h 512 site/logo.svg -o src-tauri/icons/icon.png
```

`rsvg-convert` (from librsvg) is the only external dep; on macOS,
`brew install librsvg`. We deliberately do **not** wire this into a
git hook, build step, or CI workflow:

- The logo changes rarely. Drift between SVG and PNG is detectable by
  eye and easy to correct.
- Adding `librsvg` as a CI dep on three runners would slow every build
  for a step that runs once per visual change.
- A pre-commit hook would block the rare contributor without
  `rsvg-convert` installed.

A short note in `CLAUDE.md` (or the README) records the regen command
so it is not lost.

### Page structure (`site/index.html`)

Single page, anchor navigation, no SPA routing.

1. **Header** — `ScanSplit` wordmark + tiny app icon on the left;
   nav links (`Install`, `Features`, `Downloads`) and a GitHub link on
   the right. Sticky on scroll.
2. **Hero** — Tagline ("Turn receipt photos into a fair per-person
   split. Local-first, no accounts."), a one-sentence description,
   and the install command block immediately below.
3. **Install block** — Tabbed UI with two tabs: **macOS / Linux** and
   **Windows**. Tabs implemented as two hidden radio inputs and CSS
   `:checked` selectors — no JS for the switch itself. Each tab body
   is a single `<pre>` with a copy-to-clipboard button (one of the two
   inline `<script>` blocks on the page; the other populates the
   downloads table — see below). If JS is disabled, the command is
   still visible and selectable; the copy button degrades to a no-op.
   - macOS / Linux: `curl -fsSL https://7174andy.github.io/scansplit/install.sh | sh`
   - Windows: `irm https://7174andy.github.io/scansplit/install.ps1 | iex`
4. **Features** — 6-card grid (3 columns on desktop, 1 column mobile).
   Each card: small icon (inline SVG, lucide-style), title, one-sentence
   description.
   - Multi-receipt transactions
   - AI line-item extraction (Claude Sonnet 4.6)
   - Per-person item assignment
   - Exact fair-share math (integer cents, proportional tax/tip)
   - Learns cryptic SKU codes over time
   - Local-first — data never leaves your machine
5. **Screenshot** — Single image of the Step 5 result page, captured
   from `pnpm dev:test`. Rendered with a soft shadow and a fake
   window-chrome bar (CSS only) so it looks like a screenshot of the
   app, not a screenshot of a browser.
6. **Downloads** — Per-platform table. Each row links a release asset
   from the *latest* release. To avoid hard-coding the version, the
   links point at the `releases/latest/download/<asset-name>` URL
   pattern, which GitHub redirects to the actual asset for the latest
   published (non-draft) release:
   | Platform | Asset |
   | --- | --- |
   | macOS (Apple Silicon) | `ScanSplit_aarch64.dmg` |
   | macOS (Intel) | `ScanSplit_x64.dmg` |
   | Windows (MSI) | `ScanSplit_x64_en-US.msi` |
   | Windows (NSIS) | `ScanSplit_x64-setup.exe` |
   | Linux (Debian/Ubuntu) | `scansplit_amd64.deb` |
   | Linux (AppImage) | `ScanSplit_amd64.AppImage` |
   Tauri's bundler embeds the version in the filename; the `releases/latest/download/` redirect does *not* preserve version-less names. **Decision:** the install scripts and download table resolve the version dynamically from the GitHub API (see below) rather than relying on the redirect with a version-stripped name. The table above shows the asset-name *pattern*; in the rendered HTML each cell shows the actual versioned filename, populated by a tiny inline JS snippet that fetches `api.github.com/repos/7174Andy/scansplit/releases/latest` once on page load and rewrites the `<a href>` and link text. If JS is disabled or the API call fails, the link falls back to the `releases/latest` page (no specific asset, but always works).
7. **Footer** — Repo link and a small "unsigned bundles — first run
   requires bypassing Gatekeeper / SmartScreen" note that links to a
   `#first-run` anchor in the downloads section. The repo currently
   has no `LICENSE` file; the footer omits a license line until one is
   added.

### Styling (`site/style.css`)

- Slate base palette to echo the app's shadcn `slate` base
  (`components.json`).
- `prefers-color-scheme: dark` for dark mode; no manual toggle in v1
  (one less interactive element to test). Light mode default.
- System font stack: `ui-sans-serif, system-ui, -apple-system, …`. No
  webfont download.
- Max content width 960px, centered. Generous whitespace, matching the
  reference's "fast and minimal" vibe.
- Tabs styled as a 2-button pill switcher above the code block. Active
  tab has a darker background; hidden radio inputs hold state.
- The 6 feature cards: thin border, no shadow, rounded corners
  (`8px`). Icons in `--accent` color (a single accent color, slate-700
  in light mode, slate-300 in dark).
- Total file size target: under 8 KB unminified.

### Install script: `site/install.sh`

POSIX `sh`, not bash. Must run on macOS's default `/bin/sh` (dash on
Debian, bash-in-sh-mode on macOS) without bashisms.

Behavior:

1. `set -e`. Print a single header line: `Installing ScanSplit…`.
2. Detect OS:
   ```sh
   case "$(uname -s)" in
     Darwin) OS=macos ;;
     Linux)  OS=linux ;;
     *) echo "Unsupported OS: $(uname -s)" >&2; exit 1 ;;
   esac
   ```
3. Detect arch via `uname -m` — `arm64`/`aarch64` → `aarch64`,
   `x86_64` → `x64`. Unknown arch exits with a clear message.
4. Fetch latest release JSON from
   `https://api.github.com/repos/7174Andy/scansplit/releases/latest`.
   Parse the asset URL for the relevant filename using `grep` +
   `cut` (no `jq` dependency — `jq` is not on a fresh macOS).
   - macOS arm: asset name matches `*aarch64.dmg`.
   - macOS x64: asset name matches `*_x64.dmg`.
   - Linux deb-family: asset name matches `*_amd64.deb`.
   - Linux other: asset name matches `*_amd64.AppImage`.
5. On Linux, determine package format:
   ```sh
   if [ -r /etc/os-release ] && grep -qE '^ID(_LIKE)?=.*(debian|ubuntu)' /etc/os-release; then
     FORMAT=deb
   else
     FORMAT=appimage
   fi
   ```
6. Download to `$(mktemp -d)`. Use `curl -fL --progress-bar`.
7. Install:
   - **macOS .dmg**:
     ```sh
     hdiutil attach -nobrowse -quiet "$DMG"
     cp -R "/Volumes/ScanSplit/ScanSplit.app" /Applications/
     hdiutil detach -quiet "/Volumes/ScanSplit"
     xattr -dr com.apple.quarantine /Applications/ScanSplit.app
     ```
     The `xattr` line is what eliminates the Gatekeeper warning on
     first launch. The volume name `ScanSplit` matches Tauri's default
     `.dmg` configuration.
   - **Linux .deb**: `sudo dpkg -i "$DEB"`. If `dpkg` errors on
     missing deps, suggest `sudo apt-get -f install`.
   - **Linux .AppImage**: `install -m 755 "$AI" "$HOME/.local/bin/scansplit"`.
     Print a one-line PATH check.
8. Print final success line:
   `ScanSplit v<version> installed. Launch it from Applications / your app menu.`

The script exits non-zero on any failure, with a message that names the
failing step.

### Install script: `site/install.ps1`

PowerShell 5.1-compatible (Windows 10/11 default). No external modules.

Behavior:

1. `$ErrorActionPreference = 'Stop'`. Print `Installing ScanSplit…`.
2. Detect arch: `$env:PROCESSOR_ARCHITECTURE` — `AMD64` → x64; reject
   ARM64 with a "build not yet provided" message (Windows-on-ARM is not
   in the release matrix in v1).
3. Fetch latest release via `Invoke-RestMethod
   https://api.github.com/repos/7174Andy/scansplit/releases/latest`.
   Pick the asset whose `name` ends `_x64_en-US.msi`.
4. Download to `$env:TEMP\ScanSplit-<version>.msi` via
   `Invoke-WebRequest`.
5. Run `Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qb" -Wait`.
   `/qb` (basic UI, no questions) is friendlier than `/quiet` because
   it shows progress; the user can cancel.
6. Print `ScanSplit installed. SmartScreen may warn on first launch —
   click 'More info' → 'Run anyway' once and it stops asking.`

### Release workflow change

Add an Intel Mac entry to the existing matrix in
`.github/workflows/release.yml`. The current matrix has three rows; the
new matrix has four:

```yaml
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

The existing `macos-arm64` row gains an explicit
`--target aarch64-apple-darwin` so its bundle filename includes the
arch suffix (`_aarch64.dmg`) and the install script can disambiguate
the two macOS assets reliably. The `tauri-apps/tauri-action@v0` step
gains a new input:

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

`tauri-action` forwards `args` to `tauri build`. The Rust target for
Intel Mac must be installed on the runner; the `dtolnay/rust-toolchain`
step is extended with `targets: x86_64-apple-darwin` on the
`macos-intel` row (conditional `if:` check), or unconditionally on
both Mac runners — the second is simpler and the no-op install is
cheap.

### Pages workflow: `.github/workflows/pages.yml`

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

This workflow only deploys; it does not build. The site has no build
step. The `paths:` filter keeps unrelated PRs from triggering a Pages
redeploy.

### One-time repo setting (manual)

The user must flip the Pages source once, in the repo settings:

> Settings → Pages → Build and deployment → Source: **GitHub Actions**.

Without this, the Pages workflow runs and uploads the artifact but
nothing is published. The PR description will surface this step.

## Screenshot procedure

The screenshot at `site/screenshot.png` is captured once, by hand (or
once by the assistant during implementation), and committed to the
repo. Re-capturing is a manual step when the UI changes meaningfully.

Procedure:

1. `pnpm dev:test` (Vite, port 1420, test-mode seam active).
2. Open `http://localhost:1420` in Chrome at 1100×760 (matches the
   Tauri window dimensions in `tauri.conf.json`).
3. Navigate to `/transaction/new`. Use the dev-tools console to seed
   the wizard via the test-mode hook:
   ```js
   window.__scansplit_seed__('seed-1', {
     items: [
       { name: 'Margherita pizza', priceCents: 1850, kind: 'item' },
       { name: 'Caesar salad', priceCents: 1450, kind: 'item' },
       { name: 'Sparkling water', priceCents: 600, kind: 'item' },
       { name: 'Tax', priceCents: 320, kind: 'tax' },
       { name: 'Tip', priceCents: 600, kind: 'tip' },
     ],
   });
   ```
4. Add 3 people (Alex, Jordan, Sam). Assign items so the split is
   non-trivial (one item to everyone, one to two of three, one to one).
5. Navigate to Step 5 (Result). Take a screenshot of the rendered page
   only (DevTools "Capture node screenshot" on the page root, or a
   plain OS screenshot cropped to the page).
6. Save to `site/screenshot.png`. PNG, ~1100px wide, file size under
   500 KB.

The exact seed data and people names live in this spec, not in the
codebase — re-capturing follows this recipe.

## Testing

The site is mostly static. The testable surfaces are:

- **HTML validity** — Open `site/index.html` in a browser and confirm
  the page renders, the tabs switch, the copy-to-clipboard button
  works, and the downloads table populates (or falls back) when the
  page loads. This is manual; not worth an automated harness.
- **Install scripts** — Both scripts are tested by running them on a
  real machine of each platform after the first release tag is cut.
  No unit-test harness; the success criterion is "the app appears in
  `/Applications` (macOS), launches without a Gatekeeper warning, and
  shows the Settings page".
- **Pages workflow** — Validated by execution; the first push to
  `main` touching `site/` should produce a green workflow and a live
  page at the GitHub Pages URL.
- **Release matrix** — The Intel Mac addition is validated by the
  next release cut; the throwaway-tag procedure from the release
  spec (`2026-05-22-github-actions-release-design.md`) applies.
- **In-app logo placement** — `pnpm tauri:dev`, open the Home page,
  confirm the amber receipt mark appears at `size-9` to the left of
  the "ScanSplit" wordmark and aligns vertically with the button row.
- **OS app icon swap** — `pnpm tauri:build`, install the resulting
  bundle locally, and confirm the dock (macOS) / taskbar (Windows) /
  application menu (Linux) shows the amber receipt and not the old
  teal+yellow infinity. `tsc --noEmit` and the existing Vitest /
  Playwright suites continue to pass with no changes.

No new `pnpm test`, `cargo test`, or Playwright coverage is added. The
existing test suites already cover the app itself; the site has no app
logic, and the Logo component is a static SVG render with no behavior
worth a unit test.

## Risks

- **Releases-latest API rate limiting.** The downloads table makes one
  unauthenticated GitHub API call per page load. GitHub's anonymous
  rate limit is 60/hour/IP. For a single-user app this will never bind
  in practice, but if the page goes viral on Hacker News it will. The
  fallback path (link to `releases/latest`) keeps the page functional
  even when rate-limited.
- **Asset name drift.** The install scripts pattern-match asset names.
  If Tauri changes its default bundle naming, both scripts break. The
  fix is a one-line pattern update per script, but it is a silent
  failure mode — a user runs the command and gets a 404. Mitigation:
  the throwaway-tag testing pass after any Tauri version bump.
- **`xattr` is opt-in trust.** Stripping the quarantine attribute is
  the standard workaround for unsigned apps, but a sophisticated user
  may reasonably want to know it is happening. The script prints a
  one-line note (`Removing quarantine attribute (app is unsigned)…`)
  before running `xattr`. We do not hide it.
- **Intel Mac runner availability.** `macos-13` is GitHub's Intel
  runner label; if GitHub deprecates it, the workflow breaks. Pinning
  to the latest available Intel label is the mitigation; the migration
  is mechanical when it happens.
- **`releases/latest` does not include drafts.** The current
  release workflow ships drafts. Until the first release is *published*
  (not just created), the API and the downloads table return nothing.
  This is mentioned in the PR description.
- **Logo SVG / PNG drift.** `src-tauri/icons/icon.png` is generated
  from `site/logo.svg` by hand, not by CI. If someone edits the SVG
  without regenerating the PNG, the OS icon silently lags. Mitigated
  by (a) keeping the regen command in `CLAUDE.md` next to the file,
  and (b) the rarity of logo changes — drift is detectable by eye on
  the next build.
- **macOS dock icon cache.** Even after a fresh `tauri:build`, macOS
  may show the old icon in the dock until the icon cache is
  invalidated (`killall Dock`) or the app is uninstalled and
  reinstalled. This is a verification annoyance, not a shipped-bug
  risk.

## Open questions

- Should the site include a "What's new" / changelog section? Skipped
  in v1 — the GitHub release notes serve that purpose and the site
  links to the Releases page. Revisit if there is repeat feedback.

## Future work

- Custom domain (`scansplit.tlab.sh` or similar) via a `CNAME` file in
  `site/` and a DNS change.
- Code signing + notarization, which removes the `xattr` step and the
  SmartScreen note entirely.
- Package-manager publishing: Homebrew tap, winget manifest, possibly
  an apt repository. Each is its own follow-up.
- Auto-updater plugin so re-installs are not needed for updates.
- A more elaborate screenshot section — feature-by-feature animated
  GIFs of the wizard flow.
- Light/dark mode toggle on the site (currently follows OS).
