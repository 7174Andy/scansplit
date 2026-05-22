pub mod claude;
pub mod code_expansions;
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
    async fn scan(&self, image_bytes: &[u8]) -> crate::error::AppResult<ParsedReceipt>;
}
