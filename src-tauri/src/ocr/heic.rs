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
