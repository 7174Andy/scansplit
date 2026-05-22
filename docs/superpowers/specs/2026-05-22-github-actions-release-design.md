# GitHub Actions release workflow for ScanSplit

**Date:** 2026-05-22
**Status:** Design

## Motivation

ScanSplit currently builds locally with `pnpm tauri:build` and has no
distribution story. To install the app on another machine — or to give it
to anyone else — there is no artifact to download, no version trail, and
no reproducible build environment. The existing `ci.yml` only runs tests;
it does not produce platform bundles.

This design adds a release workflow that, on every `v*.*.*` tag push,
builds macOS (Apple Silicon), Windows, and Linux bundles in parallel and
attaches them to a draft GitHub Release for the same tag. The release
stays in draft so notes can be edited before publishing.

## Goals

- Pushing a tag matching `v*.*.*` produces a draft GitHub Release with
  installers for macOS (arm64), Windows (x64), and Linux (x64) attached.
- Each platform's bundle is produced on its native runner — no
  cross-compilation, no QEMU.
- The release workflow is independent of `ci.yml`. The existing CI keeps
  running on PRs and `main` pushes and is unchanged.
- The procedure for cutting a release is documented in this spec and is
  small enough to be performed by hand without tooling: bump version, tag,
  push.

## Non-goals

- **No code signing or notarization.** Bundles are unsigned. macOS users
  bypass Gatekeeper with right-click → Open; Windows users dismiss
  SmartScreen. This is acceptable for a single-user / personal-use app and
  avoids the cost of an Apple Developer account and Windows code-signing
  certificate. Signing can be layered on later by adding secrets and a
  few `tauri-action` inputs; nothing in this design forecloses it.
- **No Intel Mac support.** Only `macos-latest` (Apple Silicon) is in the
  matrix. Adding `macos-13` later is one extra matrix entry.
- **No auto-updater.** The Tauri updater plugin is not wired in. Users
  re-download from the Releases page to upgrade. This can be added later
  via `tauri-plugin-updater`.
- **No version-bump automation.** The three version files
  (`package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`)
  are edited by hand. A helper script can be added later if the manual
  sync becomes a pain point.
- **No re-running of tests in the release workflow.** The tag is expected
  to point at a commit that already passed `ci.yml` on `main`. Gating
  releases on a fresh CI run would double build time for no real safety
  gain in a single-maintainer project.

## Architecture

### File added

`.github/workflows/release.yml` — a single new workflow file. Nothing in
`ci.yml` changes.

### Trigger

```yaml
on:
  push:
    tags:
      - 'v*.*.*'
```

Tag-only trigger. No `workflow_dispatch`, no branch push. This keeps the
workflow predictable: it runs exactly when a release tag exists.

### Jobs

One job, `build-tauri`, with a matrix across three runners:

| matrix `platform` | runner | bundles produced |
| --- | --- | --- |
| `macos-arm64` | `macos-latest` | `.dmg`, `.app.tar.gz` |
| `windows-x64` | `windows-latest` | `.msi`, NSIS `.exe` |
| `linux-x64` | `ubuntu-22.04` | `.deb`, `.AppImage` |

`ubuntu-22.04` is pinned (rather than `ubuntu-latest`) so the
glibc/WebKit ABI of the AppImage stays compatible with older Linux
distros. `macos-latest` resolves to Apple Silicon on GitHub's current
runner pool.

Each matrix job's steps:

1. `actions/checkout@v4`.
2. `pnpm/action-setup@v4` (version 9), `actions/setup-node@v4` (Node 20,
   `cache: pnpm`).
3. `dtolnay/rust-toolchain@stable`, `Swatinem/rust-cache@v2` with
   `workspaces: src-tauri`.
4. Linux only: `apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev
   libayatana-appindicator3-dev librsvg2-dev` (identical list to
   `ci.yml`).
5. `pnpm install --frozen-lockfile`.
6. `tauri-apps/tauri-action@v0` with:
   - `tagName: ${{ github.ref_name }}` — reuses the pushed tag verbatim.
   - `releaseName: "ScanSplit ${{ github.ref_name }}"`.
   - `releaseDraft: true` — leaves the release as a draft so notes can
     be written and reviewed before publishing.
   - `prerelease: false`.

`tauri-action` is responsible for both creating the GitHub Release on
the first matrix job to reach the upload step and uploading bundles from
all three jobs to that same release. It looks up the release by tag, so
the three parallel jobs converge on one release without an explicit
ordering job.

### Permissions

The workflow needs `contents: write` at the job (or workflow) level so
`tauri-action` can create the release and upload assets via the default
`GITHUB_TOKEN`. No additional secrets are required for the unsigned
path.

## Release procedure

To cut release `v0.2.0`:

1. Edit the version in three places — they must match:
   - `package.json` → `"version": "0.2.0"`
   - `src-tauri/tauri.conf.json` → `"version": "0.2.0"`
   - `src-tauri/Cargo.toml` → `version = "0.2.0"` under `[package]`
2. Commit the bump (`chore: release v0.2.0`), push to `main`, let
   `ci.yml` go green.
3. `git tag v0.2.0 && git push origin v0.2.0`.
4. Wait for `release.yml` to finish (~10–20 min). A draft release named
   `ScanSplit v0.2.0` will appear under the repo's Releases page with
   bundles from all three runners attached.
5. Edit release notes on GitHub, click **Publish release**.

## Distribution to end users

Once published, the release page at `github.com/<owner>/scansplit/releases`
lists downloadable assets. Per-platform installation:

- **macOS (Apple Silicon)** — `ScanSplit_<version>_aarch64.dmg`.
  Double-click, drag into Applications, first launch via right-click →
  **Open** to bypass Gatekeeper (unsigned).
- **Windows** — `ScanSplit_<version>_x64-setup.exe` (NSIS) or
  `ScanSplit_<version>_x64_en-US.msi`. Run installer; click through
  SmartScreen via **More info → Run anyway** (unsigned).
- **Linux** — `scansplit_<version>_amd64.deb` (Debian/Ubuntu:
  `sudo dpkg -i`) or `ScanSplit_<version>_amd64.AppImage` (any distro:
  `chmod +x` and execute).

If the repo is private, downloaders must be GitHub collaborators. If
public, any direct release asset URL works without login.

## Testing

This workflow is hard to test without running it — it produces native
bundles on three OSes. The testing plan is:

1. Merge the workflow file.
2. Cut a throwaway tag (e.g. `v0.1.1`) on the current code with no
   functional changes. Watch the workflow run end-to-end.
3. Manually download each of the three bundles, install on a real
   machine of that OS, and confirm the app launches and the wizard
   reaches Step 5 with a seeded receipt.
4. Delete the test release and tag if the run is purely a dry run.

There is no unit-testable surface to add. Workflow correctness is
validated by execution, not by `pnpm test` or `cargo test`.

## Risks

- **`macos-latest` runner pool changes.** GitHub has migrated
  `macos-latest` to Apple Silicon, but if they revert or split the label,
  builds could silently change architecture. Mitigation: if this matters,
  pin to `macos-14` or `macos-15` explicitly. Not pinned in the initial
  version to keep the workflow short.
- **Tauri action major-version bumps.** `tauri-apps/tauri-action@v0`
  tracks the v0 line. A future v1 may rename inputs. Pinning to a
  specific tag (`@v0.5.x`) is an option if breakage occurs; we accept the
  small risk in exchange for picking up fixes automatically.
- **Version drift between the three files.** Forgetting to bump
  `Cargo.toml` produces a bundle whose internal version disagrees with
  the tag. Not caught by CI. Acceptable for now; a `scripts/bump-version.sh`
  is the obvious follow-up if this happens more than once.

## Future work

- macOS code signing + notarization (Apple Developer account, Developer
  ID Application cert, `APPLE_*` secrets, `tauri-action` signing inputs).
- Windows Authenticode signing.
- Intel Mac matrix entry (`macos-13`).
- Tauri auto-updater plugin wired up to the GitHub Releases endpoint, so
  the app pulls its own updates.
- A `scripts/bump-version.sh` that edits all three version files in one
  command.
