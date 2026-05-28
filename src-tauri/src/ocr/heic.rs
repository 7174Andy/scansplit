use crate::error::{AppError, AppResult};

/// True if the bytes look like an ISO BMFF container with a HEIC/HEIF brand.
pub fn is_heic(bytes: &[u8]) -> bool {
    if bytes.len() < 12 || &bytes[4..8] != b"ftyp" {
        return false;
    }
    matches!(&bytes[8..12], b"heic" | b"heix" | b"mif1" | b"heif" | b"heim" | b"heis")
}

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

    #[test]
    fn decode_heic_to_image_honors_rotation_metadata() {
        // Fixture's stored pixels are 300x200 with an irot (90° cw / 270° ccw)
        // box. iPhone portrait photos use this same mechanism, so libheif must
        // apply the transform — otherwise users see sideways receipts.
        let bytes = std::fs::read("tests/fixtures/sample_rotated.heic")
            .expect("fixture sample_rotated.heic missing");
        let img = decode_heic_to_image(&bytes).expect("decode should succeed");
        assert_eq!(img.width(), 200, "expected post-rotation width");
        assert_eq!(img.height(), 300, "expected post-rotation height");
    }
}
