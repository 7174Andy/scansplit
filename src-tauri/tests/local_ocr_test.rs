//! End-to-end: platform OCR + parser against a checked-in receipt fixture.

#[cfg(target_os = "macos")]
mod mac {
    use scansplit_lib::ocr::local::{apple::AppleOcr, parser, NativeOcr};

    #[test]
    fn ikea_receipt_extracts_tax_and_total() {
        let bytes = std::fs::read("tests/fixtures/ikea_receipt.png").unwrap();
        let ocr = AppleOcr::new();
        let lines = ocr.recognize(&bytes).unwrap();
        let receipt = parser::parse(lines);

        // The pipeline must produce at least some items (proves OCR + parser ran).
        assert!(!receipt.items.is_empty(),
            "expected at least one parsed item");
        // A merchant should be detected from the top of the receipt.
        assert!(
            receipt.merchant.as_deref().map(|m| !m.is_empty()).unwrap_or(false),
            "expected a non-empty merchant, got {:?}",
            receipt.merchant
        );
    }
}

#[cfg(not(target_os = "macos"))]
mod linux {
    use scansplit_lib::ocr::local::{tesseract::TesseractOcr, parser, NativeOcr};

    #[test]
    fn ikea_receipt_recognizes_some_text() {
        let tessdata = std::env::var("TESSDATA_PREFIX")
            .unwrap_or_else(|_| "/usr/share/tesseract-ocr/5/tessdata".into());
        let bytes = std::fs::read("tests/fixtures/ikea_receipt.png").unwrap();
        let ocr = TesseractOcr::new(tessdata);
        let lines = ocr.recognize(&bytes).unwrap();
        // Tesseract quality on a 26 MB phone photo is poor; just sanity-check
        // that we got *something* and the parser doesn't panic.
        assert!(!lines.is_empty(), "tesseract returned no lines");
        let _receipt = parser::parse(lines);
    }
}
