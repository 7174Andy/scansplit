use crate::error::{AppError, AppResult};
use image::{codecs::jpeg::JpegEncoder, imageops::FilterType, ImageReader};
use std::io::Cursor;

const MAX_EDGE: u32 = 2000;
const JPEG_QUALITY: u8 = 80;

#[derive(Debug)]
pub struct ProcessedImage {
    pub bytes: Vec<u8>,
    pub mime: &'static str,
}

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
