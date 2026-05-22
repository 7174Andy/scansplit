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
    let reader = ImageReader::new(Cursor::new(source))
        .with_guessed_format()
        .map_err(|e| AppError::UnsupportedImageFormat(e.to_string()))?;
    let img = reader
        .decode()
        .map_err(|e| AppError::UnsupportedImageFormat(e.to_string()))?;

    let (w, h) = (img.width(), img.height());
    let resized = if w.max(h) > MAX_EDGE {
        let (nw, nh) = if w >= h {
            (MAX_EDGE, (h as f32 * MAX_EDGE as f32 / w as f32) as u32)
        } else {
            ((w as f32 * MAX_EDGE as f32 / h as f32) as u32, MAX_EDGE)
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
