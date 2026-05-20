pub mod parser;

#[cfg(target_os = "macos")]
pub mod apple;

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
