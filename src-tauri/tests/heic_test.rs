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
