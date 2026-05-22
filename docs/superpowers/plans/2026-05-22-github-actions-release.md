# GitHub Actions Release Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `release.yml` GitHub Actions workflow that, on every `v*.*.*` tag push, builds unsigned macOS (Apple Silicon), Windows, and Linux bundles in parallel via `tauri-apps/tauri-action` and attaches them to a draft GitHub Release.

**Architecture:** One new file (`.github/workflows/release.yml`) with a tag-triggered `build-tauri` matrix job across three native runners. `tauri-action` handles release creation and asset upload using the default `GITHUB_TOKEN`. The existing `ci.yml` is untouched.

**Tech Stack:** GitHub Actions, `tauri-apps/tauri-action@v0`, `pnpm/action-setup@v4`, `actions/setup-node@v4`, `dtolnay/rust-toolchain@stable`, `Swatinem/rust-cache@v2`.

**Spec:** [`docs/superpowers/specs/2026-05-22-github-actions-release-design.md`](../specs/2026-05-22-github-actions-release-design.md)

---

## Note on testing

This plan does not follow TDD. The unit under construction is a GitHub Actions workflow whose only meaningful behavior — building native bundles on three OSes and attaching them to a release — is impossible to assert from a unit test. Validation is therefore structural (YAML parses, schema is sane) followed by a live dry-run against GitHub's runners. The plan treats the dry-run as a required step, not optional polish.

## File structure

- **Create:** `.github/workflows/release.yml` — entire feature lives in this one file.
- **Unmodified:** `.github/workflows/ci.yml`, `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`. Version bumping is a per-release procedure, not part of the workflow build-out.

---

## Task 1: Create the release workflow file

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create the workflow file with the full content below**

Write to `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*.*.*'

permissions:
  contents: write

jobs:
  build-tauri:
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: macos-arm64
            runner: macos-latest
          - platform: windows-x64
            runner: windows-latest
          - platform: linux-x64
            runner: ubuntu-22.04

    runs-on: ${{ matrix.runner }}

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - uses: dtolnay/rust-toolchain@stable

      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri

      - name: Install Linux dependencies
        if: matrix.platform == 'linux-x64'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

      - name: Install frontend dependencies
        run: pnpm install --frozen-lockfile

      - name: Build, create release, and upload bundles
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: 'ScanSplit ${{ github.ref_name }}'
          releaseDraft: true
          prerelease: false
```

Why each piece:

- `on.push.tags: ['v*.*.*']` — only runs when a release tag is pushed; never on branch pushes or PRs.
- `permissions: contents: write` — required for `GITHUB_TOKEN` to create the release and upload assets.
- `fail-fast: false` — if Windows fails, we still want macOS and Linux bundles to finish; we can re-run the failed leg.
- `runner` is split from `platform` so the matrix label is human-readable in the Actions UI (`macos-arm64`) while the underlying label (`macos-latest`) is what GitHub schedules on.
- `ubuntu-22.04` is pinned (not `ubuntu-latest`) so the AppImage's glibc/WebKit ABI stays compatible with older distros.
- The Linux apt list mirrors `ci.yml` verbatim — same Tauri runtime deps.
- `releaseDraft: true` — the release is created as a draft so notes can be edited before publishing.

- [ ] **Step 2: Validate the YAML parses**

Run:

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml')); print('ok')"
```

Expected: `ok`

If you see a YAML parse error, fix the indentation or quoting and re-run until it prints `ok`.

- [ ] **Step 3: Sanity-check the workflow with `act` or `actionlint` if available (optional)**

If `actionlint` is installed:

```bash
actionlint .github/workflows/release.yml
```

Expected: no output (success).

If `actionlint` is not installed, skip this step — GitHub will surface schema errors on push.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add release workflow for tagged Tauri builds"
```

---

## Task 2: Push to main and confirm `ci.yml` is unaffected

**Files:** none modified in this task.

- [ ] **Step 1: Push the commit**

```bash
git push origin main
```

- [ ] **Step 2: Verify CI still runs and `release.yml` does NOT run**

Open `https://github.com/<owner>/scansplit/actions` in a browser.

Expected:
- A new `CI` run on the push, currently in progress or recently completed.
- **No `Release` run.** The release workflow is tag-triggered; pushing to `main` must not start it.

If you see `Release` running on the branch push, the `on:` block is wrong — fix the trigger to only include `push.tags` and re-commit.

- [ ] **Step 3: Wait for `CI` to go green**

Watch the `CI` workflow run finish. All three jobs (`frontend`, `rust`, `e2e`) must pass before proceeding to the live dry-run in Task 3.

If CI fails on `main`, fix the underlying issue first — do not tag a broken commit.

---

## Task 3: Live dry-run with a test tag

**Files:** none modified.

This task validates the workflow end-to-end on real runners. It produces a real (draft) GitHub Release that we'll delete at the end of the task.

- [ ] **Step 1: Push a test tag**

```bash
git tag v0.1.0-test.1
git push origin v0.1.0-test.1
```

Pre-release suffix (`-test.1`) makes it obvious in the Releases UI that this is not a real release. The `v*.*.*` trigger matches `v0.1.0-test.1` because `0.1.0-test.1` satisfies the `*.*.*` glob (which matches against the tag string, not semver).

- [ ] **Step 2: Watch the workflow run**

Open `https://github.com/<owner>/scansplit/actions` and find the new `Release` run.

Expected progression:
1. Three matrix jobs (`macos-arm64`, `windows-x64`, `linux-x64`) start in parallel.
2. Each runs checkout → pnpm/node setup → Rust toolchain → (Linux: apt) → `pnpm install` → `tauri-action`.
3. The first job to reach `tauri-action`'s upload step creates the draft release; the other two upload to the same release.
4. All three jobs go green.

Total runtime: typically 10–20 minutes.

- [ ] **Step 3: Inspect the draft release**

Open `https://github.com/<owner>/scansplit/releases`.

Expected: a draft release named `ScanSplit v0.1.0-test.1` with these assets attached (filenames may vary slightly by Tauri version):

| OS | Expected file(s) |
| --- | --- |
| macOS | `ScanSplit_0.1.0-test.1_aarch64.dmg`, `ScanSplit.app.tar.gz` |
| Windows | `ScanSplit_0.1.0-test.1_x64-setup.exe`, `ScanSplit_0.1.0-test.1_x64_en-US.msi` |
| Linux | `scan-split_0.1.0-test.1_amd64.deb`, `scan-split_0.1.0-test.1_amd64.AppImage` |

If any platform's bundles are missing, click into the failed job in the Actions UI to read the error, fix the workflow, push to `main`, delete the test tag (`git push origin :v0.1.0-test.1`), and re-tag.

- [ ] **Step 4: Smoke-test at least the macOS bundle**

Download the `.dmg`, open it, drag ScanSplit into Applications. First launch: right-click → **Open** → confirm the Gatekeeper warning.

Expected: the app window opens to the wizard's Step 1 ("Scan a receipt").

If you have access to a Windows or Linux machine, repeat with the corresponding installer. If not, the macOS test alone is acceptable evidence that the workflow produced a working bundle — the same `tauri-action` v0 invocation produces the other two via identical mechanics.

- [ ] **Step 5: Clean up the test release and tag**

On the release page, click **Delete** on the draft release.

Then delete the tag locally and remotely:

```bash
git tag -d v0.1.0-test.1
git push origin :v0.1.0-test.1
```

Expected: the release disappears from the Releases page; `git tag -l 'v*'` no longer lists `v0.1.0-test.1`.

---

## Task 4: Document the release procedure in README (optional)

**Files:**
- Modify: `README.md` (only if a README exists and contains a "Development" or "Releasing" section; otherwise skip this task)

- [ ] **Step 1: Check whether the README has a relevant section**

```bash
grep -n -i -E '^##.*(releas|deploy|publish)' README.md 2>/dev/null || echo "no relevant section"
```

If the output is `no relevant section`, **skip the rest of this task.** The spec at `docs/superpowers/specs/2026-05-22-github-actions-release-design.md` already documents the procedure; duplicating it in the README is YAGNI unless a release section already exists.

- [ ] **Step 2: If a Releasing section exists, append the procedure**

Add this block under the existing Releasing section:

```markdown
### Cutting a release

1. Bump the version in three files (must match):
   - `package.json`
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml` (`version` under `[package]`)
2. Commit: `chore: release vX.Y.Z`. Push to `main`, wait for CI green.
3. Tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. Wait ~15 min for the `Release` workflow to finish.
5. Edit the draft release notes on GitHub, click **Publish release**.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document release procedure"
git push origin main
```

---

## Task 5: Cut the first real release (manual, ad-hoc)

**Not a workflow change.** This task is a record of the procedure for whoever cuts the first real release. It does not need to be executed as part of plan completion — only when the maintainer is ready to publish v0.2.0 (or whatever the next version is).

- [ ] **Step 1: Decide the version number**

Pick the next semver. For the first release after this workflow lands, `v0.2.0` is the natural choice (current version is `0.1.0`).

- [ ] **Step 2: Bump version in three files**

Edit each file and change the version string to the chosen value (e.g. `0.2.0`):

- `package.json` → `"version": "0.2.0"`
- `src-tauri/tauri.conf.json` → `"version": "0.2.0"`
- `src-tauri/Cargo.toml` → `version = "0.2.0"` under `[package]`

Confirm all three match:

```bash
grep -H '"version"' package.json src-tauri/tauri.conf.json
grep -H '^version' src-tauri/Cargo.toml
```

Expected: all three lines show the same version.

- [ ] **Step 3: Commit, push, wait for CI**

```bash
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore: release v0.2.0"
git push origin main
```

Wait for `CI` to go green on the commit.

- [ ] **Step 4: Tag and push**

```bash
git tag v0.2.0
git push origin v0.2.0
```

- [ ] **Step 5: Wait for the Release workflow, then publish**

When the `Release` workflow finishes (~15 min), open the draft release on GitHub, write release notes, and click **Publish release**.

The release is now public at `https://github.com/<owner>/scansplit/releases/tag/v0.2.0`.

---

## Self-review notes

- **Spec coverage:** All goals from the spec are covered. Tag-triggered workflow (Task 1), three-platform matrix (Task 1), draft release (Task 1), independence from `ci.yml` (Task 2 verifies), documented procedure (Task 4 optional, Task 5 walks through it). Non-goals (signing, Intel Mac, auto-updater, version-bump automation) remain non-goals — no tasks attempt them.
- **No placeholders:** Every step has either a concrete file path, a concrete command, or the literal YAML/markdown to write.
- **Type consistency:** N/A — workflow YAML, no shared types.
- **Bite-sized:** Most steps are one shell command, one file edit, or one UI action.
