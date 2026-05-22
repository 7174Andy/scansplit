use image::{ImageBuffer, Rgb};
use scansplit_lib::ocr::image_processing::process_for_storage;

fn make_png(width: u32, height: u32) -> Vec<u8> {
    let img: ImageBuffer<Rgb<u8>, Vec<u8>> =
        ImageBuffer::from_fn(width, height, |_, _| Rgb([200, 150, 50]));
    let mut bytes = std::io::Cursor::new(Vec::new());
    img.write_to(&mut bytes, image::ImageFormat::Png).unwrap();
    bytes.into_inner()
}

#[test]
fn resizes_when_over_max_dim() {
    let src = make_png(3000, 2000);
    let out = process_for_storage(&src).unwrap();
    assert_eq!(out.mime, "image/jpeg");
    let decoded = image::load_from_memory(&out.bytes).unwrap();
    assert!(decoded.width() <= 2000 && decoded.height() <= 2000);
    // Aspect ratio preserved (3:2 -> 2000:~1333)
    assert_eq!(decoded.width(), 2000);
    assert_eq!(decoded.height(), 1333);
}

#[test]
fn passthrough_under_max_dim() {
    let src = make_png(800, 600);
    let out = process_for_storage(&src).unwrap();
    assert_eq!(out.mime, "image/jpeg");
    let decoded = image::load_from_memory(&out.bytes).unwrap();
    assert_eq!(decoded.width(), 800);
    assert_eq!(decoded.height(), 600);
}

#[test]
fn rejects_invalid_bytes() {
    let err = process_for_storage(b"not an image").unwrap_err();
    assert!(matches!(
        err,
        scansplit_lib::error::AppError::UnsupportedImageFormat(_)
    ));
}
