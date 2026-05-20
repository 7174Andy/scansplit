use regex::Regex;
use std::sync::OnceLock;

use crate::ocr::{ParsedReceipt, ParsedItem, Confidence};
use crate::ocr::local::OcrLine;

fn price_regex() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"-?\$?\s*(\d+)[\.,](\d{2})").unwrap())
}

fn extract_price_cents(text: &str) -> Option<i64> {
    let captures = price_regex().captures(text)?;
    let m = captures.get(0)?;
    let dollars: i64 = captures.get(1)?.as_str().parse().ok()?;
    let cents: i64 = captures.get(2)?.as_str().parse().ok()?;
    let mut total = dollars * 100 + cents;
    if m.as_str().trim_start().starts_with('-') { total = -total; }
    Some(total)
}

fn median<T: Copy + PartialOrd>(mut xs: Vec<T>) -> Option<T> {
    if xs.is_empty() { return None; }
    xs.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    Some(xs[xs.len() / 2])
}

fn mode_x_max(prices: &[&OcrLine]) -> Option<f32> {
    // For small N we approximate "mode" with median — same result on tight clusters.
    median(prices.iter().map(|l| l.bbox.x_max).collect())
}

pub fn parse(mut lines: Vec<OcrLine>) -> ParsedReceipt {
    if lines.is_empty() {
        return ParsedReceipt {
            merchant: None,
            items: vec![],
            totals_reconciled: true,
            parsed_total_cents: None,
        };
    }

    lines.sort_by(|a, b| a.bbox.y_min.partial_cmp(&b.bbox.y_min).unwrap_or(std::cmp::Ordering::Equal));

    let priced: Vec<&OcrLine> = lines.iter().filter(|l| extract_price_cents(&l.text).is_some()).collect();
    let price_col = mode_x_max(&priced).unwrap_or(1.0);
    let line_height = median(lines.iter().map(|l| l.bbox.height()).collect()).unwrap_or(0.013);

    let in_price_col = |l: &OcrLine| (l.bbox.x_max - price_col).abs() < line_height;

    let mut items: Vec<ParsedItem> = Vec::new();
    let window = 2.0 * line_height;

    for (i, l) in lines.iter().enumerate() {
        let price_cents = match extract_price_cents(&l.text) {
            Some(p) => p,
            None => continue,
        };
        if !in_price_col(l) { continue; }

        let name_candidate = lines.iter().enumerate()
            .filter(|(j, ll)| *j != i
                && (ll.bbox.y_min - l.bbox.y_min).abs() <= window
                && !in_price_col(ll)
                && extract_price_cents(&ll.text).is_none())
            .max_by_key(|(_, ll)| ll.text.len())
            .map(|(_, ll)| ll.text.clone());

        items.push(ParsedItem {
            raw: name_candidate.clone().unwrap_or_default(),
            name: name_candidate,
            price_cents,
            kind: "item".into(),
            confidence: Confidence::High,
            confidence_reasons: vec![],
        });
    }

    ParsedReceipt {
        merchant: None,
        items,
        totals_reconciled: true,
        parsed_total_cents: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ocr::Confidence;
    use crate::ocr::local::BBox;

    fn line(text: &str, x_min: f32, y_min: f32, x_max: f32) -> OcrLine {
        OcrLine {
            text: text.into(),
            bbox: BBox { x_min, y_min, x_max, y_max: y_min + 0.013 },
            confidence: 1.0,
        }
    }

    #[test]
    fn empty_input_returns_empty_receipt() {
        let r = parse(vec![]);
        assert!(r.items.is_empty());
        assert!(r.totals_reconciled);
        assert!(r.parsed_total_cents.is_none());
        assert!(r.merchant.is_none());
    }

    #[test]
    fn single_item_with_right_aligned_price_parses_as_item() {
        let lines = vec![
            line("Caesar Salad",  0.10, 0.30, 0.40),
            line("12.50",         0.85, 0.30, 0.95),
        ];
        let r = parse(lines);
        assert_eq!(r.items.len(), 1);
        let it = &r.items[0];
        assert_eq!(it.kind, "item");
        assert_eq!(it.price_cents, 1250);
        assert_eq!(it.name.as_deref(), Some("Caesar Salad"));
        assert_eq!(it.confidence, Confidence::High);
    }
}
