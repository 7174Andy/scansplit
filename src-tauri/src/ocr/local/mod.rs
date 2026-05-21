pub mod parser;

#[cfg(target_os = "macos")]
pub mod apple;

#[cfg(not(target_os = "macos"))]
pub mod tesseract;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct BBox {
    pub x_min: f32,
    pub y_min: f32,
    pub x_max: f32,
    pub y_max: f32,
}

impl BBox {
    pub fn width(&self) -> f32 { self.x_max - self.x_min }
    pub fn height(&self) -> f32 { self.y_max - self.y_min }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrLine {
    pub text: String,
    pub bbox: BBox,
    pub confidence: f32, // 0.0-1.0, soft hint only
}

pub trait NativeOcr: Send + Sync {
    fn recognize(&self, image_bytes: &[u8]) -> crate::error::AppResult<Vec<OcrLine>>;
}

use std::sync::Arc;
use crate::error::AppResult;
use crate::ocr::{ParsedReceipt, Scanner};

pub struct LocalScanner {
    ocr: Arc<dyn NativeOcr>,
}

impl LocalScanner {
    pub fn new(ocr: Arc<dyn NativeOcr>) -> Self { Self { ocr } }
}

#[async_trait::async_trait]
impl Scanner for LocalScanner {
    async fn scan(&self, image_bytes: &[u8]) -> AppResult<ParsedReceipt> {
        let bytes = image_bytes.to_vec();
        let ocr = self.ocr.clone();
        let lines = tokio::task::spawn_blocking(move || ocr.recognize(&bytes))
            .await
            .map_err(|e| crate::error::AppError::Other(format!("ocr task join: {e}")))??;
        Ok(crate::ocr::local::parser::parse(lines))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ocr::Scanner;
    use crate::error::AppResult;

    struct FakeOcr {
        lines: Vec<OcrLine>,
    }
    impl NativeOcr for FakeOcr {
        fn recognize(&self, _bytes: &[u8]) -> AppResult<Vec<OcrLine>> { Ok(self.lines.clone()) }
    }

    #[tokio::test]
    async fn local_scanner_runs_ocr_then_parser() {
        let fake = FakeOcr {
            lines: vec![
                OcrLine {
                    text: "Burger".into(),
                    bbox: BBox { x_min: 0.1, y_min: 0.3, x_max: 0.4, y_max: 0.31 },
                    confidence: 1.0,
                },
                OcrLine {
                    text: "10.00".into(),
                    bbox: BBox { x_min: 0.85, y_min: 0.3, x_max: 0.95, y_max: 0.31 },
                    confidence: 1.0,
                },
            ],
        };
        let scanner = LocalScanner::new(Arc::new(fake));
        let receipt = scanner.scan(&[]).await.unwrap();
        assert_eq!(receipt.items.len(), 1);
        assert_eq!(receipt.items[0].price_cents, 1000);
    }
}
