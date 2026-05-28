pub mod claude;
pub mod code_expansions;
pub mod heic;
pub mod image_processing;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ParsedItem {
    pub raw: String,
    pub name: Option<String>,
    pub price_cents: i64,
    pub kind: String, // "item" | "tax" | "tip" | "discount"
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ParsedReceipt {
    pub merchant: Option<String>,
    pub items: Vec<ParsedItem>,
}

#[async_trait::async_trait]
pub trait Scanner: Send + Sync {
    async fn scan_prepared(
        &self,
        prepared_bytes: &[u8],
        media_type: &'static str,
    ) -> crate::error::AppResult<ParsedReceipt>;

    /// Default: prepare the image then delegate to `scan_prepared`.
    async fn scan(&self, image_bytes: &[u8]) -> crate::error::AppResult<ParsedReceipt> {
        let (prepared, media_type) = crate::ocr::claude::prepare_image(image_bytes)?;
        self.scan_prepared(&prepared, media_type).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::AppResult;
    use std::sync::Mutex;

    struct CaptureScanner {
        captured_media_type: Mutex<Option<&'static str>>,
        captured_first_byte: Mutex<Option<u8>>,
    }

    #[async_trait::async_trait]
    impl Scanner for CaptureScanner {
        async fn scan_prepared(
            &self,
            prepared_bytes: &[u8],
            media_type: &'static str,
        ) -> AppResult<ParsedReceipt> {
            *self.captured_media_type.lock().unwrap() = Some(media_type);
            *self.captured_first_byte.lock().unwrap() = prepared_bytes.first().copied();
            Ok(ParsedReceipt { merchant: None, items: vec![] })
        }
    }

    fn encode_png(width: u32, height: u32) -> Vec<u8> {
        let img = image::RgbImage::from_pixel(width, height, image::Rgb([200, 200, 200]));
        let mut out = Vec::new();
        img.write_to(&mut std::io::Cursor::new(&mut out), image::ImageFormat::Png)
            .expect("encode png");
        out
    }

    #[tokio::test]
    async fn default_scan_prepares_image_then_calls_scan_prepared() {
        let scanner = CaptureScanner {
            captured_media_type: Mutex::new(None),
            captured_first_byte: Mutex::new(None),
        };
        let png = encode_png(400, 300);
        scanner.scan(&png).await.expect("default scan delegates");
        assert_eq!(*scanner.captured_media_type.lock().unwrap(), Some("image/png"));
        // PNG signature first byte is 0x89.
        assert_eq!(*scanner.captured_first_byte.lock().unwrap(), Some(0x89));
    }
}
