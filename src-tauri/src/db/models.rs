use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transaction {
    pub id: String,
    pub title: String,
    pub currency: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Person {
    pub id: String,
    pub transaction_id: String,
    pub name: String,
    pub position: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Receipt {
    pub id: String,
    pub transaction_id: String,
    pub image_path: String,
    pub position: i64,
    pub scanned_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: String,
    pub transaction_id: String,
    pub receipt_id: Option<String>,
    pub raw_code: Option<String>,
    pub name: String,
    pub price_cents: i64,
    pub kind: String,
    pub position: i64,
    pub assigned_person_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FullTransaction {
    pub transaction: Transaction,
    pub people: Vec<Person>,
    pub receipts: Vec<Receipt>,
    pub items: Vec<Item>,
}
