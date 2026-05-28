# HEIC Support

## Problem

iPhone photos save as HEIC by default. The frontend file picker in `src/pages/Wizard/Step1Scan.tsx` already lists `heic` as an accepted extension, but the Rust backend rejects HEIC bytes in `src-tauri/src/ocr/claude.rs::detect_media_type` with `AppError::UnsupportedImageFormat("HEIC/HEIF receipts are not yet supported — convert to JPEG or PNG")`. The user must currently convert each photo manually before importing.

The Anthropic Messages API does not accept HEIC either (supported types: JPEG, PNG, GIF, WebP), so any solution must decode HEIC into a supported format before the API call.

## Goals

- A `.heic` file selected via the wizard's file picker is decoded, sent to Claude for OCR, and stored as a JPEG thumbnail with no extra user action.
- iPhone-orientation metadata is honored so portrait photos appear upright.
- The change builds and runs on all three target platforms (macOS, Linux, Windows) used by `.github/workflows/release.yml`.

## Non-goals

- HEIC sequences / multi-image HEIF containers (only the primary image is decoded).
- Re-encoding stored thumbnails back to HEIC (all stored images remain JPEG, matching current behavior in `ocr/image_processing.rs`).
- EXIF orientation handling for non-HEIC formats (pre-existing JPEG/PNG behavior is unchanged).
- iOS / Android targets — Tauri 2 mobile is not in scope for this app.

## Approach

Decode HEIC in the Rust backend using `libheif-rs`, which wraps the C `libheif` library. The decoded pixels are handed to the existing `image` crate pipeline, so the resize-and-encode-as-JPEG logic is unchanged.

This approach was chosen over a frontend conversion (e.g. `heic2any`) to keep all image processing on the backend (per CLAUDE.md boundary discipline), avoid bloating the WebView bundle, and avoid reworking the `scan_receipt` Rust command (which currently takes a file path, not bytes).

## Architecture

### New module: `src-tauri/src/ocr/heic.rs`

```rust
pub fn is_heic(bytes: &[u8]) -> bool;
pub fn decode_heic_to_image(bytes: &[u8]) -> AppResult<image::DynamicImage>;
```

- `is_heic` checks the ISO BMFF `ftyp` box at bytes 4..8 and matches the brand at bytes 8..12 against `heic`, `heix`, `mif1`, `heif`, `heim`, `heis`. Returns `false` (not an error) for non-HEIC bytes.
- `decode_heic_to_image` uses `libheif_rs::HeifContext::read_from_bytes` to load the file, takes the primary image handle, decodes to interleaved RGB8 via `ColorSpace::Rgb(RgbChroma::Rgb)`, and constructs an `image::RgbImage` from the resulting pixel plane. libheif applies the `irot` / `imir` transforms automatically, so portrait iPhone photos come out upright. On any libheif failure, returns `AppError::UnsupportedImageFormat(<libheif error string>)`.

### Updated: `src-tauri/src/ocr/claude.rs`

`prepare_image` gets a HEIC short-circuit at the top:

```rust
pub fn prepare_image(bytes: &[u8]) -> AppResult<(Vec<u8>, &'static str)> {
    if heic::is_heic(bytes) {
        let img = heic::decode_heic_to_image(bytes)?;
        let img = if img.width() > MAX_EDGE || img.height() > MAX_EDGE {
            img.resize(MAX_EDGE, MAX_EDGE, image::imageops::FilterType::Triangle)
        } else {
            img
        };
        let mut out = Vec::new();
        let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, JPEG_QUALITY);
        img.into_rgb8().write_with_encoder(encoder)
            .map_err(|e| AppError::Other(format!("could not encode image: {e}")))?;
        return Ok((out, "image/jpeg"));
    }
    // existing path unchanged
}
```

`detect_media_type` loses its HEIC branch. The `ftyp` detection is moved into `heic::is_heic` and consulted by `prepare_image` before `detect_media_type` is reached. `detect_media_type` continues to reject PDF and unknown bytes.

### Updated: `src-tauri/src/ocr/image_processing.rs`

`process_for_storage` gets the same HEIC short-circuit before its existing `ImageReader::with_guessed_format()` path:

```rust
pub fn process_for_storage(source: &[u8]) -> AppResult<ProcessedImage> {
    let img = if heic::is_heic(source) {
        heic::decode_heic_to_image(source)?
    } else {
        ImageReader::new(Cursor::new(source))
            .with_guessed_format()
            .map_err(|e| AppError::UnsupportedImageFormat(e.to_string()))?
            .decode()
            .map_err(|e| AppError::UnsupportedImageFormat(e.to_string()))?
    };
    // existing resize + JPEG encode unchanged
}
```

### Updated: `src-tauri/src/ocr/mod.rs`

Add `pub mod heic;`.

## Dependencies

Add to `src-tauri/Cargo.toml`:

```toml
libheif-rs = "1.0"
```

The crate links against the system `libheif` C library; it does not vendor it. If the current stable on crates.io has bumped majors at implementation time, pin to that instead — the public API used here (`HeifContext::read_from_bytes`, primary image handle, `ColorSpace::Rgb`) has been stable across recent majors.

### Build-time system deps

- **macOS:** `brew install libheif` (pulls `libde265`, `x265`, `pkg-config`).
- **Linux (Debian/Ubuntu):** `apt-get install -y libheif-dev pkg-config`.
- **Windows:** `vcpkg install libheif:x64-windows-static-md`, with `VCPKG_ROOT` set and `VCPKGRS_DYNAMIC=1` exported in the runner environment.

### Runtime

On macOS and Linux, `libheif` is dynamically linked. The Tauri bundle on macOS must include `libheif.dylib` and its transitive deps (`libde265`, `x265`) via `tauri.conf.json` `bundle.macOS.frameworks` (or `resources`) so end users without Homebrew can run the app. On Windows the `vcpkg` static-MD triplet links the C++ runtime dynamically but `libheif` itself statically, so no extra DLL bundling is needed.

## CI / Release changes

### `.github/workflows/ci.yml` — `rust` job

Before `cargo test`, add:

```yaml
- name: Install libheif
  run: sudo apt-get update && sudo apt-get install -y libheif-dev pkg-config
```

### `.github/workflows/release.yml` — Tauri build matrix

Add an OS-conditional install step for each matrix entry:

- macOS runner: `brew install libheif`
- Linux runner: `sudo apt-get install -y libheif-dev pkg-config` (in addition to the existing GTK/WebKit installs)
- Windows runner: `vcpkg install libheif:x64-windows-static-md` and set `VCPKG_ROOT` / `VCPKGRS_DYNAMIC=1`

If the macOS Tauri bundle needs the dylib at runtime, also add a step to copy `/opt/homebrew/lib/libheif.dylib` (and `libde265`, `libx265`) into the bundle's `Frameworks` directory, or configure `tauri.bundle.macOS.frameworks` in `tauri.conf.json` to point at them.

## Error handling

- libheif decode failures bubble up as `AppError::UnsupportedImageFormat(<libheif message>)`, which is already serialized to `{ code: "UNSUPPORTED_IMAGE_FORMAT", message }` by `error.rs` and surfaced by `ScanErrorDialog`.
- No new error codes introduced.
- The existing user-facing "convert to JPEG or PNG" string is removed from `detect_media_type` since HEIC is now supported.

## Testing

### Rust unit tests (`src-tauri/src/ocr/heic.rs` `#[cfg(test)] mod tests`)

- `is_heic_recognizes_known_brands` — covers `ftypheic`, `ftypheix`, `ftypmif1`, `ftypheif`, `ftypheim`, `ftypheis`.
- `is_heic_rejects_jpeg_png_webp` — sanity check that magic-byte detection doesn't false-positive.
- `decode_heic_to_image_returns_expected_dimensions` — decodes the checked-in fixture, asserts width/height match what `sips` reports.

### Rust integration test (`src-tauri/tests/heic_test.rs`)

- `prepare_image_converts_heic_to_jpeg` — loads fixture, calls `claude::prepare_image`, asserts returned mime is `"image/jpeg"` and bytes start with `0xFF 0xD8 0xFF`.
- `process_for_storage_handles_heic` — same fixture, asserts `ProcessedImage.mime == "image/jpeg"` and decoded dimensions are ≤ `MAX_EDGE`.

### Updated existing test

`src-tauri/src/ocr/claude.rs::detect_media_type_heic_returns_unsupported` is removed (the behavior it asserts no longer exists). Replace with `heic::is_heic_recognizes_heic_brand` in the new module.

### Fixture

`src-tauri/tests/fixtures/sample.heic` — a small (~20KB) HEIC generated once with `sips -s format heic small.jpg --out sample.heic` on macOS and committed to the repo. The fixture is iPhone-orientation-tagged (rotated 90°) so the orientation assertion in `decode_heic_to_image_returns_expected_dimensions` is meaningful.

### Frontend

No new tests required. `Step1Scan` already lists `heic` in the file picker filter, and the test-mode seam (`__scansplit_seed__`) bypasses real OCR. The E2E flow in `src/test/e2e/wizard.spec.ts` is unchanged.

## Files touched

- `src-tauri/Cargo.toml` — add `libheif-rs` dependency
- `src-tauri/src/ocr/mod.rs` — register new module
- `src-tauri/src/ocr/heic.rs` — new
- `src-tauri/src/ocr/claude.rs` — short-circuit in `prepare_image`, remove HEIC branch in `detect_media_type`, update test
- `src-tauri/src/ocr/image_processing.rs` — short-circuit in `process_for_storage`
- `src-tauri/tests/heic_test.rs` — new
- `src-tauri/tests/fixtures/sample.heic` — new binary fixture
- `.github/workflows/ci.yml` — install libheif on Linux runner
- `.github/workflows/release.yml` — install libheif on all three runners; possibly bundle dylib on macOS
- `src-tauri/tauri.conf.json` — possibly add `bundle.macOS.frameworks` entries for libheif dylibs (decide during implementation based on whether `cargo tauri build` already picks them up)
