use crate::ocr::ParsedReceipt;
use crate::ocr::local::OcrLine;

pub fn parse(_lines: Vec<OcrLine>) -> ParsedReceipt {
    ParsedReceipt {
        merchant: None,
        items: vec![],
        totals_reconciled: true,
        parsed_total_cents: None,
    }
}
