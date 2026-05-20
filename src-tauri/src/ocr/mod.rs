pub mod claude;
pub mod code_expansions;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Confidence {
    High,
    Medium,
    Low,
}

fn default_confidence_high() -> Confidence { Confidence::High }
fn default_reconciled_true() -> bool { true }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ParsedItem {
    pub raw: String,
    pub name: Option<String>,
    pub price_cents: i64,
    pub kind: String, // "item" | "tax" | "tip" | "discount"
    #[serde(default = "default_confidence_high")]
    pub confidence: Confidence,
    #[serde(default)]
    pub confidence_reasons: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ParsedReceipt {
    pub merchant: Option<String>,
    pub items: Vec<ParsedItem>,
    #[serde(default = "default_reconciled_true")]
    pub totals_reconciled: bool,
    #[serde(default)]
    pub parsed_total_cents: Option<i64>,
}

#[async_trait::async_trait]
pub trait LlmClient: Send + Sync {
    async fn scan(&self, image_bytes: &[u8], api_key: &str) -> crate::error::AppResult<ParsedReceipt>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn confidence_serializes_to_lowercase_string() {
        let json = serde_json::to_string(&Confidence::High).unwrap();
        assert_eq!(json, "\"high\"");
    }

    #[test]
    fn parsed_receipt_reconciled_defaults_to_true_when_field_missing() {
        let json = r#"{"merchant":null,"items":[]}"#;
        let r: ParsedReceipt = serde_json::from_str(json).unwrap();
        assert!(r.totals_reconciled);
        assert!(r.parsed_total_cents.is_none());
    }

    #[test]
    fn parsed_item_confidence_defaults_to_high_when_field_missing() {
        let json = r#"{"raw":"x","name":null,"priceCents":0,"kind":"item"}"#;
        let i: ParsedItem = serde_json::from_str(json).unwrap();
        assert_eq!(i.confidence, Confidence::High);
        assert!(i.confidence_reasons.is_empty());
    }
}
