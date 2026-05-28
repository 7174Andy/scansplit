use crate::error::{AppError, AppResult};
use crate::ocr::{Scanner, ParsedReceipt};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::Deserialize;
use serde_json::json;

pub struct ClaudeScanner {
    http: reqwest::Client,
    model: String,
    api_key: String,
}

impl ClaudeScanner {
    pub fn new(api_key: String) -> Self {
        Self {
            http: reqwest::Client::new(),
            model: "claude-sonnet-4-6".to_string(),
            api_key,
        }
    }
}

const PROMPT: &str = r#"You are extracting line items from a receipt image.
Return ONLY valid JSON matching this schema (no prose, no markdown fences):

{
  "merchant": "<store name if visible, or null>",
  "items": [
    {
      "raw": "<exact text as printed>",
      "name": "<readable expansion if confident, or null>",
      "priceCents": <integer cents, e.g. 349 for $3.49>,
      "kind": "item" | "tax" | "tip" | "discount"
    }
  ]
}

Rules:
- One object per line item on the receipt.
- Use negative priceCents for discounts.
- Mark tax/tip/discount rows with kind accordingly; everything else is "item".
- If a code is too ambiguous to expand (MISC, ITEM 4823, generic SKUs), set name=null.
- Do NOT include subtotal/total rows — only individual lines plus tax/tip/discount adjustments."#;

#[derive(Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicBlock>,
}

#[derive(Deserialize)]
struct AnthropicBlock {
    #[serde(rename = "type")]
    block_type: String,
    text: Option<String>,
}

#[async_trait::async_trait]
impl Scanner for ClaudeScanner {
    async fn scan(&self, image_bytes: &[u8]) -> AppResult<ParsedReceipt> {
        let (prepared, media_type) = prepare_image(image_bytes)?;
        let b64 = B64.encode(&prepared);
        let body = json!({
            "model": self.model,
            "max_tokens": 2048,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}},
                    {"type": "text", "text": PROMPT}
                ]
            }]
        });

        let res = self.http
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await?;

        if res.status() == reqwest::StatusCode::UNAUTHORIZED {
            return Err(AppError::InvalidApiKey);
        }
        if !res.status().is_success() {
            return Err(AppError::Other(format!(
                "anthropic status {}: {}",
                res.status(),
                res.text().await.unwrap_or_default()
            )));
        }

        let parsed: AnthropicResponse = res.json().await?;
        let text = parsed.content.into_iter()
            .find(|b| b.block_type == "text")
            .and_then(|b| b.text)
            .ok_or_else(|| AppError::OcrParse("no text block".into()))?;

        let cleaned = strip_fences(&text);
        let receipt: ParsedReceipt = serde_json::from_str(&cleaned)
            .map_err(|e| AppError::OcrParse(format!("{e}: payload was: {cleaned}")))?;
        Ok(receipt)
    }
}

// Anthropic rejects images above 5 MB; we leave a small safety margin.
const MAX_BYTES: usize = 4_500_000;
// Anthropic downsamples beyond 1568 px on the long edge anyway.
const MAX_EDGE: u32 = 1568;
const JPEG_QUALITY: u8 = 85;

pub fn prepare_image(bytes: &[u8]) -> AppResult<(Vec<u8>, &'static str)> {
    if super::heic::is_heic(bytes) {
        let img = super::heic::decode_heic_to_image(bytes)?;
        let needs_resize = img.width() > MAX_EDGE || img.height() > MAX_EDGE;
        let img = if needs_resize {
            img.resize(MAX_EDGE, MAX_EDGE, image::imageops::FilterType::Triangle)
        } else {
            img
        };
        let mut out = Vec::new();
        let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, JPEG_QUALITY);
        img.into_rgb8()
            .write_with_encoder(encoder)
            .map_err(|e| AppError::Other(format!("could not encode image: {e}")))?;
        return Ok((out, "image/jpeg"));
    }

    let media_type = detect_media_type(bytes)?;

    let img = image::load_from_memory(bytes)
        .map_err(|e| AppError::Other(format!("could not decode image: {e}")))?;
    let needs_resize = img.width() > MAX_EDGE || img.height() > MAX_EDGE;

    if bytes.len() <= MAX_BYTES && !needs_resize {
        return Ok((bytes.to_vec(), media_type));
    }

    let resized = if needs_resize {
        img.resize(MAX_EDGE, MAX_EDGE, image::imageops::FilterType::Triangle)
    } else {
        img
    };

    let mut out = Vec::new();
    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, JPEG_QUALITY);
    resized
        .into_rgb8()
        .write_with_encoder(encoder)
        .map_err(|e| AppError::Other(format!("could not encode image: {e}")))?;
    Ok((out, "image/jpeg"))
}

pub fn detect_media_type(bytes: &[u8]) -> AppResult<&'static str> {
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Ok("image/jpeg")
    } else if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) {
        Ok("image/png")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Ok("image/gif")
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Ok("image/webp")
    } else if bytes.starts_with(b"%PDF-") {
        Err(AppError::UnsupportedImageFormat(
            "PDF receipts are not yet supported".into(),
        ))
    } else {
        Err(AppError::UnsupportedImageFormat(
            "could not detect image format from file contents".into(),
        ))
    }
}

pub fn strip_fences(s: &str) -> String {
    let trimmed = s.trim();
    if trimmed.starts_with("```") {
        let after = trimmed.trim_start_matches("```json").trim_start_matches("```");
        let end = after.rfind("```").unwrap_or(after.len());
        after[..end].trim().to_string()
    } else {
        trimmed.to_string()
    }
}

pub fn parse_response_text(text: &str) -> AppResult<ParsedReceipt> {
    let cleaned = strip_fences(text);
    serde_json::from_str::<ParsedReceipt>(&cleaned)
        .map_err(|e| AppError::OcrParse(format!("{e}: payload was: {cleaned}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_fences_removes_json_fence() {
        let s = "```json\n{\"merchant\":null,\"items\":[]}\n```";
        assert_eq!(strip_fences(s), "{\"merchant\":null,\"items\":[]}");
    }

    #[test]
    fn strip_fences_passthrough() {
        let s = "{\"merchant\":null,\"items\":[]}";
        assert_eq!(strip_fences(s), s);
    }

    #[test]
    fn parse_response_text_ok() {
        let raw = r#"{"merchant":"Trattoria","items":[
            {"raw":"PASTA","name":"Pasta","priceCents":1400,"kind":"item"}
        ]}"#;
        let r = parse_response_text(raw).unwrap();
        assert_eq!(r.merchant.as_deref(), Some("Trattoria"));
        assert_eq!(r.items.len(), 1);
        assert_eq!(r.items[0].price_cents, 1400);
    }

    #[test]
    fn parse_response_text_malformed_returns_ocr_parse() {
        let r = parse_response_text("not json");
        assert!(matches!(r, Err(crate::error::AppError::OcrParse(_))));
    }

    #[test]
    fn detect_media_type_png() {
        let png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00];
        assert_eq!(detect_media_type(&png).unwrap(), "image/png");
    }

    #[test]
    fn detect_media_type_jpeg() {
        let jpeg = [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10];
        assert_eq!(detect_media_type(&jpeg).unwrap(), "image/jpeg");
    }

    #[test]
    fn detect_media_type_webp() {
        let mut webp = Vec::from(*b"RIFF");
        webp.extend_from_slice(&[0x00, 0x00, 0x00, 0x00]);
        webp.extend_from_slice(b"WEBP");
        assert_eq!(detect_media_type(&webp).unwrap(), "image/webp");
    }

    #[test]
    fn detect_media_type_gif() {
        assert_eq!(detect_media_type(b"GIF89a...").unwrap(), "image/gif");
    }

    #[test]
    fn detect_media_type_pdf_returns_unsupported() {
        let r = detect_media_type(b"%PDF-1.7\n");
        assert!(matches!(r, Err(crate::error::AppError::UnsupportedImageFormat(_))));
    }

    #[test]
    fn prepare_image_converts_heic_to_jpeg() {
        let bytes = std::fs::read("tests/fixtures/sample.heic")
            .expect("fixture sample.heic missing — see plan Task 2");
        let (out, mime) = prepare_image(&bytes).expect("HEIC should be accepted");
        assert_eq!(mime, "image/jpeg");
        // JPEG SOI marker.
        assert_eq!(&out[..3], &[0xFF, 0xD8, 0xFF]);
        assert!(!out.is_empty());
    }

    #[test]
    fn detect_media_type_unknown_returns_unsupported() {
        let r = detect_media_type(b"garbage bytes");
        assert!(matches!(r, Err(crate::error::AppError::UnsupportedImageFormat(_))));
    }

    fn encode_png(width: u32, height: u32) -> Vec<u8> {
        let img = image::RgbImage::from_pixel(width, height, image::Rgb([200, 200, 200]));
        let mut out = Vec::new();
        img.write_to(&mut std::io::Cursor::new(&mut out), image::ImageFormat::Png)
            .expect("encode png");
        out
    }

    #[test]
    fn prepare_image_passes_small_image_through_unchanged() {
        let png = encode_png(400, 300);
        let (out, media) = prepare_image(&png).unwrap();
        assert_eq!(media, "image/png");
        assert_eq!(out, png);
    }

    #[test]
    fn prepare_image_downscales_oversize_image_and_reencodes_as_jpeg() {
        let png = encode_png(3000, 2000);
        let (out, media) = prepare_image(&png).unwrap();
        assert_eq!(media, "image/jpeg");
        let decoded = image::load_from_memory(&out).expect("decode result");
        assert!(decoded.width() <= MAX_EDGE && decoded.height() <= MAX_EDGE);
        assert!(decoded.width() == MAX_EDGE || decoded.height() == MAX_EDGE);
        assert!(out.len() < MAX_BYTES);
    }

    #[test]
    fn prepare_image_rejects_unsupported_format_before_decode() {
        let r = prepare_image(b"%PDF-1.7\n...");
        assert!(matches!(r, Err(crate::error::AppError::UnsupportedImageFormat(_))));
    }
}
