use crate::error::{AppError, AppResult};
use crate::ocr::{LlmClient, ParsedReceipt};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::Deserialize;
use serde_json::json;

pub struct ClaudeClient {
    http: reqwest::Client,
    model: String,
}

impl ClaudeClient {
    pub fn new() -> Self {
        Self {
            http: reqwest::Client::new(),
            model: "claude-sonnet-4-6".to_string(),
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
impl LlmClient for ClaudeClient {
    async fn scan(&self, image_bytes: &[u8], api_key: &str) -> AppResult<ParsedReceipt> {
        let b64 = B64.encode(image_bytes);
        let body = json!({
            "model": self.model,
            "max_tokens": 2048,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64}},
                    {"type": "text", "text": PROMPT}
                ]
            }]
        });

        let res = self.http
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", api_key)
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
}
