# HEIC Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow `.heic` files (the default iPhone photo format) to flow through the wizard scan pipeline without manual conversion.

**Architecture:** Decode HEIC in Rust via `libheif-rs` (a binding to the system `libheif` C library). HEIC bytes are intercepted at the top of `prepare_image` (for the Claude OCR upload) and `process_for_storage` (for the local JPEG thumbnail), decoded to an `image::DynamicImage`, then handed to the existing resize-and-JPEG-encode logic. The Anthropic API still receives JPEG; SQLite still stores JPEG. `libheif` honors `irot`/`imir` automatically so iPhone-portrait photos come out upright.

**Tech Stack:** Tauri 2, Rust, `libheif-rs` 1.x, `image` 0.25, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-05-26-heic-support-design.md`

---

## Task 1: Install libheif locally and add the Cargo dependency

Get the toolchain ready before writing any code. `libheif-rs` will fail to compile without the system C library on the build host.

**Files:**
- Modify: `src-tauri/Cargo.toml`

### Steps

- [ ] **Step 1: Install libheif via Homebrew**

Run: `brew install libheif pkg-config`
Expected: command succeeds (or reports already installed). Verify with `pkg-config --modversion libheif` — should print a version like `1.17.x` or newer.

- [ ] **Step 2: Add `libheif-rs` to Cargo.toml**

In `src-tauri/Cargo.toml`, add this line to the `[dependencies]` block, placed alphabetically just before the `image` line:

```toml
libheif-rs = "1.0"
```

- [ ] **Step 3: Verify the crate compiles**

Run: `cd src-tauri && cargo build`
Expected: build succeeds. The first build will download and compile `libheif-rs` and link against the system `libheif`. If the build fails with `Package libheif was not found in the pkg-config search path`, re-check Step 1 and that `pkg-config` is on PATH.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "build(rust): add libheif-rs dependency"
```

---

## Task 2: Create the HEIC test fixture

Tests in later tasks need a small real HEIC file. Generate one once with macOS `sips` and check it in.

**Files:**
- Create: `src-tauri/tests/fixtures/sample.heic`

### Steps

- [ ] **Step 1: Generate a small JPEG source**

Run: `mkdir -p src-tauri/tests/fixtures && sips -s format jpeg --resampleHeightWidth 200 300 /System/Library/Desktop\ Pictures/Solid\ Colors/Stone.png --out /tmp/source.jpg`
Expected: `/tmp/source.jpg` exists, ~10–30 KB. (If `Stone.png` is missing on this macOS version, substitute any small PNG/JPEG — the actual content does not matter, only that it's a small, valid image.)

- [ ] **Step 2: Convert to HEIC**

Run: `sips -s format heic /tmp/source.jpg --out src-tauri/tests/fixtures/sample.heic`
Expected: `src-tauri/tests/fixtures/sample.heic` exists, < 50 KB. Verify with `file src-tauri/tests/fixtures/sample.heic` — should report `ISO Media, HEIF Image HEVC Main or Main Still Picture Profile`.

- [ ] **Step 3: Capture the fixture's dimensions for later assertions**

Run: `sips -g pixelWidth -g pixelHeight src-tauri/tests/fixtures/sample.heic`
Expected: prints `pixelWidth: 300` and `pixelHeight: 200` (matching the JPEG source). Remember these values — Task 4 and Task 7 assert on them.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/tests/fixtures/sample.heic
git commit -m "test(ocr): add HEIC fixture for decode tests"
```

---

## Task 3: New module `ocr/heic.rs` with `is_heic`

TDD the magic-byte sniffer first. Pure function, no libheif yet.

**Files:**
- Create: `src-tauri/src/ocr/heic.rs`
- Modify: `src-tauri/src/ocr/mod.rs`

### Steps

- [ ] **Step 1: Create `heic.rs` with the function signature and unit tests (failing)**

Create `src-tauri/src/ocr/heic.rs`:

```rust
use crate::error::{AppError, AppResult};

/// True if the bytes look like an ISO BMFF container with a HEIC/HEIF brand.
pub fn is_heic(bytes: &[u8]) -> bool {
    if bytes.len() < 12 || &bytes[4..8] != b"ftyp" {
        return false;
    }
    matches!(&bytes[8..12], b"heic" | b"heix" | b"mif1" | b"heif" | b"heim" | b"heis")
}

pub fn decode_heic_to_image(_bytes: &[u8]) -> AppResult<image::DynamicImage> {
    Err(AppError::UnsupportedImageFormat("not yet implemented".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ftyp(brand: &[u8; 4]) -> Vec<u8> {
        let mut v = vec![0x00, 0x00, 0x00, 0x20];
        v.extend_from_slice(b"ftyp");
        v.extend_from_slice(brand);
        v
    }

    #[test]
    fn is_heic_recognizes_known_brands() {
        for brand in [b"heic", b"heix", b"mif1", b"heif", b"heim", b"heis"] {
            assert!(is_heic(&ftyp(brand)), "expected {:?} to be HEIC", brand);
        }
    }

    #[test]
    fn is_heic_rejects_jpeg_png_webp() {
        assert!(!is_heic(&[0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0, 0, 0, 0, 0])); // JPEG
        assert!(!is_heic(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0])); // PNG
        let mut webp = Vec::from(*b"RIFF");
        webp.extend_from_slice(&[0, 0, 0, 0]);
        webp.extend_from_slice(b"WEBP");
        assert!(!is_heic(&webp));
    }

    #[test]
    fn is_heic_rejects_short_bytes() {
        assert!(!is_heic(&[]));
        assert!(!is_heic(&[0; 8]));
    }

    #[test]
    fn is_heic_rejects_unknown_ftyp_brand() {
        assert!(!is_heic(&ftyp(b"mp42")));
        assert!(!is_heic(&ftyp(b"avif")));
    }
}
```

- [ ] **Step 2: Register the module**

In `src-tauri/src/ocr/mod.rs`, add `pub mod heic;` to the module list at the top. The full top section should be:

```rust
pub mod claude;
pub mod code_expansions;
pub mod heic;
pub mod image_processing;
```

- [ ] **Step 3: Run the unit tests, verify they pass**

Run: `cd src-tauri && cargo test --lib heic::tests`
Expected: 4 tests pass (`is_heic_recognizes_known_brands`, `is_heic_rejects_jpeg_png_webp`, `is_heic_rejects_short_bytes`, `is_heic_rejects_unknown_ftyp_brand`).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/ocr/heic.rs src-tauri/src/ocr/mod.rs
git commit -m "feat(ocr): add is_heic magic-byte sniffer"
```

---

## Task 4: Implement `decode_heic_to_image`

Replace the stub with a real libheif decode. TDD against the fixture committed in Task 2.

**Files:**
- Modify: `src-tauri/src/ocr/heic.rs`

### Steps

- [ ] **Step 1: Add a failing test that decodes the fixture**

Append to the `#[cfg(test)] mod tests` block in `src-tauri/src/ocr/heic.rs`:

```rust
    #[test]
    fn decode_heic_to_image_returns_expected_dimensions() {
        let bytes = std::fs::read("tests/fixtures/sample.heic")
            .expect("fixture sample.heic missing — see Task 2");
        let img = decode_heic_to_image(&bytes).expect("decode should succeed");
        // Fixture was generated at 300x200 (see Task 2 Step 3).
        assert_eq!(img.width(), 300);
        assert_eq!(img.height(), 200);
    }

    #[test]
    fn decode_heic_to_image_rejects_non_heic_bytes() {
        let r = decode_heic_to_image(&[0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0]);
        assert!(matches!(r, Err(AppError::UnsupportedImageFormat(_))));
    }
```

- [ ] **Step 2: Run, verify failure**

Run: `cd src-tauri && cargo test --lib heic::tests::decode_heic_to_image_returns_expected_dimensions`
Expected: FAIL with `"not yet implemented"`.

- [ ] **Step 3: Replace the stub with the real decode**

In `src-tauri/src/ocr/heic.rs`, replace the entire `decode_heic_to_image` function with:

```rust
pub fn decode_heic_to_image(bytes: &[u8]) -> AppResult<image::DynamicImage> {
    use libheif_rs::{ColorSpace, HeifContext, LibHeif, RgbChroma};

    let lib = LibHeif::new();
    let ctx = HeifContext::read_from_bytes(bytes)
        .map_err(|e| AppError::UnsupportedImageFormat(format!("heic open: {e}")))?;
    let handle = ctx
        .primary_image_handle()
        .map_err(|e| AppError::UnsupportedImageFormat(format!("heic primary handle: {e}")))?;
    let decoded = lib
        .decode(&handle, ColorSpace::Rgb(RgbChroma::Rgb), None)
        .map_err(|e| AppError::UnsupportedImageFormat(format!("heic decode: {e}")))?;

    let planes = decoded.planes();
    let plane = planes
        .interleaved
        .ok_or_else(|| AppError::UnsupportedImageFormat("heic missing interleaved plane".into()))?;

    let width = plane.width;
    let height = plane.height;
    let stride = plane.stride;
    let row_bytes = (width as usize) * 3;

    let mut buf = Vec::with_capacity(row_bytes * height as usize);
    for y in 0..height as usize {
        let start = y * stride;
        buf.extend_from_slice(&plane.data[start..start + row_bytes]);
    }
    let rgb = image::RgbImage::from_raw(width, height, buf)
        .ok_or_else(|| AppError::UnsupportedImageFormat("heic raw buffer size mismatch".into()))?;
    Ok(image::DynamicImage::ImageRgb8(rgb))
}
```

- [ ] **Step 4: Run the tests, verify pass**

Run: `cd src-tauri && cargo test --lib heic::tests`
Expected: 6 tests pass (the 4 from Task 3 plus `decode_heic_to_image_returns_expected_dimensions` and `decode_heic_to_image_rejects_non_heic_bytes`).

If the test fails because the libheif-rs API differs from what's shown (the crate has had small breaking changes between versions), adjust the imports/method names per the version on crates.io. The shape (open context → primary handle → decode to RGB → read interleaved plane → build `RgbImage`) is stable.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/ocr/heic.rs
git commit -m "feat(ocr): decode HEIC bytes into DynamicImage via libheif"
```

---

## Task 5: Wire HEIC into `prepare_image` and remove the old rejection

`prepare_image` short-circuits on HEIC bytes, decodes via the new helper, then encodes the result as JPEG (resizing if needed). The HEIC branch in `detect_media_type` is removed because HEIC no longer reaches it.

**Files:**
- Modify: `src-tauri/src/ocr/claude.rs`

### Steps

- [ ] **Step 1: Update the existing HEIC test to assert the new behavior (failing)**

In `src-tauri/src/ocr/claude.rs`, find `detect_media_type_heic_returns_unsupported` (around line 246) and **replace it** with:

```rust
    #[test]
    fn prepare_image_converts_heic_to_jpeg() {
        let bytes = std::fs::read("tests/fixtures/sample.heic")
            .expect("fixture sample.heic missing — see plan Task 2");
        let (out, mime) = prepare_image(&bytes).expect("HEIC should be accepted");
        assert_eq!(mime, "image/jpeg");
        // JPEG SOI marker.
        assert_eq!(&out[..3], &[0xFF, 0xD8, 0xFF]);
        assert!(!out.is_empty());
    }
```

- [ ] **Step 2: Run the new test, verify failure**

Run: `cd src-tauri && cargo test --lib ocr::claude::tests::prepare_image_converts_heic_to_jpeg`
Expected: FAIL — `prepare_image` still calls `detect_media_type` first, which returns `UnsupportedImageFormat`.

- [ ] **Step 3: Add the HEIC short-circuit at the top of `prepare_image`**

In `src-tauri/src/ocr/claude.rs`, replace the body of `prepare_image` (around line 113) so the function reads:

```rust
pub fn prepare_image(bytes: &[u8]) -> AppResult<(Vec<u8>, &'static str)> {
    if super::heic::is_heic(bytes) {
        let img = super::heic::decode_heic_to_image(bytes)?;
        let needs_resize = img.width() > MAX_EDGE || img.height() > MAX_EDGE;
        let img = if needs_resize {
            img.resize(MAX_EDGE, MAX_EDGE, image::imageops::FilterType::Triangle)
        } else {
            img
        };
        let mut out = Vec::new();
        let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, JPEG_QUALITY);
        img.into_rgb8()
            .write_with_encoder(encoder)
            .map_err(|e| AppError::Other(format!("could not encode image: {e}")))?;
        return Ok((out, "image/jpeg"));
    }

    let media_type = detect_media_type(bytes)?;

    let img = image::load_from_memory(bytes)
        .map_err(|e| AppError::Other(format!("could not decode image: {e}")))?;
    let needs_resize = img.width() > MAX_EDGE || img.height() > MAX_EDGE;

    if bytes.len() <= MAX_BYTES && !needs_resize {
        return Ok((bytes.to_vec(), media_type));
    }

    let resized = if needs_resize {
        img.resize(MAX_EDGE, MAX_EDGE, image::imageops::FilterType::Triangle)
    } else {
        img
    };

    let mut out = Vec::new();
    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, JPEG_QUALITY);
    resized
        .into_rgb8()
        .write_with_encoder(encoder)
        .map_err(|e| AppError::Other(format!("could not encode image: {e}")))?;
    Ok((out, "image/jpeg"))
}
```

- [ ] **Step 4: Remove the HEIC rejection branch in `detect_media_type`**

In `src-tauri/src/ocr/claude.rs`, in the `detect_media_type` function (around line 152–156), **delete** these lines:

```rust
    } else if bytes.len() >= 12 && &bytes[4..8] == b"ftyp" {
        // ISO BMFF container — HEIC/HEIF/AVIF live here.
        Err(AppError::UnsupportedImageFormat(
            "HEIC/HEIF receipts are not yet supported — convert to JPEG or PNG".into(),
        ))
```

So that the chain goes directly from the PDF branch to the final unknown-format `else`.

- [ ] **Step 5: Run all claude.rs tests, verify pass**

Run: `cd src-tauri && cargo test --lib ocr::claude::tests`
Expected: all existing tests still pass plus the new `prepare_image_converts_heic_to_jpeg`. There should be **no** `detect_media_type_heic_returns_unsupported` anymore.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/ocr/claude.rs
git commit -m "feat(ocr): accept HEIC in prepare_image via libheif"
```

---

## Task 6: Wire HEIC into `process_for_storage`

The local thumbnail path also needs the short-circuit so the stored JPEG isn't an attempt to decode HEIC with the `image` crate (which would fail).

**Files:**
- Modify: `src-tauri/src/ocr/image_processing.rs`

### Steps

- [ ] **Step 1: Add a failing test**

Append a `#[cfg(test)] mod tests` block to the end of `src-tauri/src/ocr/image_processing.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn process_for_storage_converts_heic_to_jpeg() {
        let bytes = std::fs::read("tests/fixtures/sample.heic")
            .expect("fixture sample.heic missing — see plan Task 2");
        let out = process_for_storage(&bytes).expect("HEIC should be accepted");
        assert_eq!(out.mime, "image/jpeg");
        assert_eq!(&out.bytes[..3], &[0xFF, 0xD8, 0xFF]);
    }
}
```

- [ ] **Step 2: Run, verify failure**

Run: `cd src-tauri && cargo test --lib ocr::image_processing::tests::process_for_storage_converts_heic_to_jpeg`
Expected: FAIL — `ImageReader::with_guessed_format()` can't decode HEIC, so the error path fires.

- [ ] **Step 3: Add the HEIC short-circuit**

In `src-tauri/src/ocr/image_processing.rs`, replace the `process_for_storage` function with:

```rust
pub fn process_for_storage(source: &[u8]) -> AppResult<ProcessedImage> {
    let img = if super::heic::is_heic(source) {
        super::heic::decode_heic_to_image(source)?
    } else {
        let reader = ImageReader::new(Cursor::new(source))
            .with_guessed_format()
            .map_err(|e| AppError::UnsupportedImageFormat(e.to_string()))?;
        reader
            .decode()
            .map_err(|e| AppError::UnsupportedImageFormat(e.to_string()))?
    };

    let (w, h) = (img.width(), img.height());
    let resized = if w.max(h) > MAX_EDGE {
        let (nw, nh) = if w >= h {
            let nh = (h as f32 * MAX_EDGE as f32 / w as f32).round() as u32;
            (MAX_EDGE, nh.max(1))
        } else {
            let nw = (w as f32 * MAX_EDGE as f32 / h as f32).round() as u32;
            (nw.max(1), MAX_EDGE)
        };
        img.resize_exact(nw, nh, FilterType::Lanczos3)
    } else {
        img
    };

    let rgb = resized.to_rgb8();
    let mut out = Vec::with_capacity(rgb.len() / 4);
    let mut encoder = JpegEncoder::new_with_quality(&mut out, JPEG_QUALITY);
    encoder
        .encode(
            rgb.as_raw(),
            rgb.width(),
            rgb.height(),
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|e| AppError::Other(format!("jpeg encode: {e}")))?;

    Ok(ProcessedImage {
        bytes: out,
        mime: "image/jpeg",
    })
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd src-tauri && cargo test --lib ocr::image_processing::tests`
Expected: PASS.

- [ ] **Step 5: Run the full Rust test suite as a regression check**

Run: `cd src-tauri && cargo test`
Expected: every test passes. If anything related to OCR or transactions fails, fix it before continuing — do not commit broken state.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/ocr/image_processing.rs
git commit -m "feat(ocr): accept HEIC in process_for_storage"
```

---

## Task 7: End-to-end integration test

A separate integration test in `tests/` exercises both code paths through the public crate boundary, catching any future regression where someone wires up only one side.

**Files:**
- Create: `src-tauri/tests/heic_test.rs`

### Steps

- [ ] **Step 1: Create the integration test file**

Create `src-tauri/tests/heic_test.rs`:

```rust
use scansplit_lib::ocr::{claude, image_processing};

const FIXTURE: &str = "tests/fixtures/sample.heic";

#[test]
fn prepare_image_round_trip_for_heic() {
    let bytes = std::fs::read(FIXTURE).expect("fixture missing");
    let (out, mime) = claude::prepare_image(&bytes).expect("HEIC should be accepted");
    assert_eq!(mime, "image/jpeg");
    assert_eq!(&out[..3], &[0xFF, 0xD8, 0xFF]);
    assert!(out.len() < 4_500_000, "output must fit Anthropic limit");
}

#[test]
fn process_for_storage_round_trip_for_heic() {
    let bytes = std::fs::read(FIXTURE).expect("fixture missing");
    let out = image_processing::process_for_storage(&bytes).expect("HEIC should be accepted");
    assert_eq!(out.mime, "image/jpeg");
    assert_eq!(&out.bytes[..3], &[0xFF, 0xD8, 0xFF]);
}
```

- [ ] **Step 2: Verify the test names match Tauri's library name**

The crate name in `src-tauri/Cargo.toml` is `scansplit_lib` (per the `[lib]` block: `name = "scansplit_lib"`). If this differs at implementation time, adjust the `use` line.

- [ ] **Step 3: Run, verify pass**

Run: `cd src-tauri && cargo test --test heic_test`
Expected: both tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/tests/heic_test.rs
git commit -m "test(ocr): integration test for HEIC end-to-end"
```

---

## Task 8: Install libheif in the CI Rust job

CI runs on Ubuntu, which doesn't include libheif by default.

**Files:**
- Modify: `.github/workflows/ci.yml`

### Steps

- [ ] **Step 1: Add libheif to the Linux install step**

In `.github/workflows/ci.yml`, in the `rust` job's "Install system deps" step, **append** `libheif-dev` to the `apt-get install` line. The full step becomes:

```yaml
      - name: Install system deps
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libheif-dev pkg-config
```

(`pkg-config` is added too; `libheif-rs` needs it to find the C library. It's typically pre-installed on `ubuntu-latest`, but listing it explicitly is safer.)

- [ ] **Step 2: Commit and push**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(rust): install libheif-dev for HEIC support"
```

- [ ] **Step 3: Verify CI passes**

Push the branch (or open a PR) and watch the `rust` job in GitHub Actions. Expected: `cargo test` runs and all tests including the new HEIC tests pass on Linux.

If CI fails with a libheif link error, the most likely cause is the runner image already having `pkg-config` but a stale `apt` cache — `apt-get update` should fix it. If it still fails, fall back to installing `libheif-1` (runtime) and `libheif-dev` (headers) explicitly.

---

## Task 9: Install libheif in the release workflow

The Tauri release build runs on all three platforms. Each needs libheif at build time.

**Files:**
- Modify: `.github/workflows/release.yml`

### Steps

- [ ] **Step 1: Update the existing Linux install step**

In `.github/workflows/release.yml`, the existing "Install Linux dependencies" step (gated on `matrix.platform == 'linux-x64'`) appends `libheif-dev`:

```yaml
      - name: Install Linux dependencies
        if: matrix.platform == 'linux-x64'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libheif-dev pkg-config
```

- [ ] **Step 2: Add a macOS install step**

In `.github/workflows/release.yml`, after the existing "Install Linux dependencies" step and before "Install frontend dependencies", insert:

```yaml
      - name: Install macOS dependencies
        if: startsWith(matrix.platform, 'macos')
        run: brew install libheif pkg-config
```

- [ ] **Step 3: Add a Windows install step**

In `.github/workflows/release.yml`, after the macOS step, insert:

```yaml
      - name: Install Windows dependencies (libheif via vcpkg)
        if: matrix.platform == 'windows-x64'
        shell: bash
        run: |
          vcpkg install libheif:x64-windows-static-md
          echo "VCPKG_ROOT=$VCPKG_INSTALLATION_ROOT" >> "$GITHUB_ENV"
          echo "VCPKGRS_DYNAMIC=1" >> "$GITHUB_ENV"
```

(`VCPKG_INSTALLATION_ROOT` is pre-set on GitHub's `windows-latest` runner image. `VCPKGRS_DYNAMIC=1` tells `libheif-rs`'s build script to use the dynamic-MD vcpkg port.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci(release): install libheif on macOS, Linux, and Windows runners"
```

- [ ] **Step 5: Validate by triggering a test build (optional but recommended)**

Either push a `v0.0.0-heic-test` tag to drive the release workflow once, or run a manual workflow dispatch if added. Confirm all three matrix jobs reach the `tauri-action` step without libheif errors. Delete the test tag and draft release afterward if you did this.

---

## Task 10: macOS dylib bundling check

`libheif-rs` dynamically links against `libheif.dylib` on macOS. The bundle produced by `cargo tauri build` may or may not include the dylib, depending on Tauri's defaults and Homebrew's install path. Verify and fix if needed.

**Files:**
- Possibly modify: `src-tauri/tauri.conf.json`

### Steps

- [ ] **Step 1: Build a local macOS bundle**

Run: `pnpm tauri:build`
Expected: build succeeds. The bundle lives at `src-tauri/target/release/bundle/macos/ScanSplit.app`.

- [ ] **Step 2: Inspect linked dylibs**

Run: `otool -L src-tauri/target/release/bundle/macos/ScanSplit.app/Contents/MacOS/scansplit`
Expected output includes a line like `/opt/homebrew/opt/libheif/lib/libheif.1.dylib (compatibility version ...)`. **This is the problem to check:** if the path points to `/opt/homebrew/...` or `/usr/local/...`, the app will fail on an end user's Mac that doesn't have Homebrew + libheif installed.

- [ ] **Step 3: Decide on a bundling approach**

Two acceptable options, pick whichever works first:

  **Option A — Bundle via `tauri.conf.json` resources:** In `src-tauri/tauri.conf.json`, extend the `bundle` block:

  ```json
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": ["icons/icon.png"],
    "macOS": {
      "frameworks": [
        "/opt/homebrew/opt/libheif/lib/libheif.1.dylib",
        "/opt/homebrew/opt/libde265/lib/libde265.0.dylib",
        "/opt/homebrew/opt/x265/lib/libx265.215.dylib"
      ]
    }
  }
  ```

  (Exact filenames depend on the installed versions — confirm with `ls /opt/homebrew/opt/libheif/lib/` etc. on the build host.)

  **Option B — Static-link libheif:** if `libheif-rs` exposes a `bundled` or `static` cargo feature in the version you pinned (check the crate's `Cargo.toml`), enable it instead and skip the framework copying.

- [ ] **Step 4: Rebuild and re-inspect**

Run: `pnpm tauri:build` then re-run the `otool -L` from Step 2. Expected: the libheif/libde265/x265 paths now point to `@rpath/Frameworks/...` (Option A) or are no longer listed at all (Option B).

- [ ] **Step 5: Functional smoke test on the bundle**

Open the built `.app` (double-click or `open src-tauri/target/release/bundle/macos/ScanSplit.app`). In the wizard, pick a real iPhone-shot HEIC file (e.g. from `~/Pictures` or a Photos export). Expected: the scan completes successfully, the thumbnail renders, and OCR results come back. If the app immediately crashes with a `dyld` error, libheif is still missing — return to Step 3.

- [ ] **Step 6: Commit if `tauri.conf.json` changed**

```bash
git add src-tauri/tauri.conf.json
git commit -m "build(tauri): bundle libheif dylibs on macOS"
```

---

## Final verification

- [ ] Run `cd src-tauri && cargo test` — all unit and integration tests pass.
- [ ] Run `pnpm test` — frontend Vitest still passes.
- [ ] Run `pnpm tauri:dev` and import an iPhone HEIC photo through the wizard. Confirm: file is accepted, scan completes, items appear, thumbnail in Step 2 / Step 5 renders.
- [ ] CI green on the branch (frontend, rust, e2e jobs).
- [ ] (If Task 10 Step 5 wasn't done locally yet) On a Mac without Homebrew libheif installed, run the bundled `.app` and import a HEIC. Confirm no `dyld` errors.
