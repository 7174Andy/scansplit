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

fn classify_kind(text: &str, price_cents: i64) -> Option<&'static str> {
    let t = text.to_uppercase();
    // Skip totals entirely — `None` signals "drop this row"
    if t.contains("SUBTOTAL") || t.contains("NET TOTAL") || t.contains("TOTAL") ||
       t.contains("BALANCE") || t.contains("AMOUNT DUE") {
        return None;
    }
    if t.contains("TAX") || t.contains("GST") || t.contains("HST") || t.contains("VAT") {
        return Some("tax");
    }
    if t.contains("TIP") || t.contains("GRATUITY") || t.contains("SVC")
        || t.contains("SERVICE CHG") {
        return Some("tip");
    }
    if t.contains("DISCOUNT") || t.contains("PROMO") || t.contains("COUPON")
        || t.contains("SAVINGS") || t.contains("OFF") {
        return Some("discount");
    }
    if price_cents < 0 {
        return Some("discount");
    }
    Some("item")
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

        // Suppression: if the satellite text starts with '(' AND the price text ends with ')',
        // this is a per-item discount allocation (IKEA-style). Drop it.
        let right_closes_paren = l.text.trim_end().ends_with(')');
        let left_opens_paren = name_candidate.as_deref()
            .map(|s| s.trim_start().starts_with('('))
            .unwrap_or(false);
        if left_opens_paren && right_closes_paren {
            continue;
        }
        // If the name candidate starts with '(' but this price line doesn't end with ')',
        // the candidate belongs to the parenthetical allocation row — don't use it.
        let name_candidate = if left_opens_paren && !right_closes_paren {
            None
        } else {
            name_candidate
        };

        let combined_text: String = std::iter::once(l.text.as_str())
            .chain(name_candidate.as_deref())
            .collect::<Vec<_>>()
            .join(" ");

        let kind = match classify_kind(&combined_text, price_cents) {
            Some(k) => k,
            None => continue, // SUBTOTAL/TOTAL rows skipped
        };

        items.push(ParsedItem {
            raw: name_candidate.clone().unwrap_or_default(),
            name: name_candidate,
            price_cents,
            kind: kind.into(),
            confidence: Confidence::High,
            confidence_reasons: vec![],
        });
    }

    // Priceless-item detection: any line beginning with "Article" that has no
    // priced satellite within ±(2 * line_height) becomes a Low-confidence item.
    let article_re = Regex::new(r"^Article\s+\d+").unwrap();
    for (i, l) in lines.iter().enumerate() {
        if !article_re.is_match(l.text.trim()) { continue; }

        let has_priced_satellite = lines.iter().enumerate().any(|(j, ll)| {
            j != i
                && (ll.bbox.y_min - l.bbox.y_min).abs() <= window
                && in_price_col(ll)
                && extract_price_cents(&ll.text).is_some()
        });
        if has_priced_satellite { continue; }

        // Find a name line on the left, immediately adjacent (within window)
        let name_line = lines.iter().enumerate()
            .filter(|(j, ll)| *j != i
                && (ll.bbox.y_min - l.bbox.y_min).abs() <= window
                && !article_re.is_match(ll.text.trim())
                && extract_price_cents(&ll.text).is_none())
            .max_by_key(|(_, ll)| ll.text.len())
            .map(|(_, ll)| ll.text.clone());

        items.push(ParsedItem {
            raw: l.text.clone(),
            name: name_line,
            price_cents: 0,
            kind: "item".into(),
            confidence: Confidence::Low,
            confidence_reasons: vec!["price missing".into()],
        });
    }

    // Extract the printed total from any line containing the TOTAL keyword.
    let parsed_total_cents: Option<i64> = lines.iter()
        .filter(|l| {
            let t = l.text.to_uppercase();
            t.contains("TOTAL") || t.contains("BALANCE") || t.contains("AMOUNT DUE")
        })
        .filter_map(|l| {
            // Find the priced satellite within window
            lines.iter()
                .filter(|ll| (ll.bbox.y_min - l.bbox.y_min).abs() <= window
                    && extract_price_cents(&ll.text).is_some()
                    && in_price_col(ll))
                .filter_map(|ll| extract_price_cents(&ll.text))
                .next()
        })
        .next();

    let computed_total: i64 = items.iter().map(|i| i.price_cents).sum();
    let mut totals_reconciled = true;
    if let Some(printed) = parsed_total_cents {
        let diff = (printed - computed_total).abs();
        if diff > 1 {
            totals_reconciled = false;
        }
    }

    if !totals_reconciled {
        for it in items.iter_mut() {
            it.confidence = match it.confidence {
                Confidence::High => Confidence::Medium,
                Confidence::Medium => Confidence::Low,
                Confidence::Low => Confidence::Low,
            };
            it.confidence_reasons.push("receipt totals don't reconcile".into());
        }
    }

    ParsedReceipt {
        merchant: None,
        items,
        totals_reconciled,
        parsed_total_cents,
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

    #[test]
    fn tax_keyword_classifies_as_tax() {
        let lines = vec![
            line("Caesar Salad",  0.10, 0.30, 0.40),
            line("12.50",         0.85, 0.30, 0.95),
            line("TAX",           0.10, 0.50, 0.20),
            line("1.03",          0.85, 0.50, 0.95),
        ];
        let r = parse(lines);
        let tax = r.items.iter().find(|i| i.kind == "tax").unwrap();
        assert_eq!(tax.price_cents, 103);
    }

    #[test]
    fn tip_keyword_classifies_as_tip() {
        let lines = vec![
            line("Burger",       0.10, 0.30, 0.40),
            line("10.00",        0.85, 0.30, 0.95),
            line("Tip",          0.10, 0.50, 0.20),
            line("2.00",         0.85, 0.50, 0.95),
        ];
        let r = parse(lines);
        assert!(r.items.iter().any(|i| i.kind == "tip" && i.price_cents == 200));
    }

    #[test]
    fn discount_keyword_classifies_as_discount() {
        let lines = vec![
            line("Burger",       0.10, 0.30, 0.40),
            line("10.00",        0.85, 0.30, 0.95),
            line("DISCOUNT 10%", 0.10, 0.50, 0.30),
            line("-1.00",        0.85, 0.50, 0.95),
        ];
        let r = parse(lines);
        assert!(r.items.iter().any(|i| i.kind == "discount" && i.price_cents == -100));
    }

    #[test]
    fn negative_price_without_keyword_classifies_as_discount() {
        let lines = vec![
            line("Burger",   0.10, 0.30, 0.40),
            line("10.00",    0.85, 0.30, 0.95),
            line("Refund",   0.10, 0.50, 0.20),
            line("-2.00",    0.85, 0.50, 0.95),
        ];
        let r = parse(lines);
        assert!(r.items.iter().any(|i| i.kind == "discount" && i.price_cents == -200));
    }

    #[test]
    fn total_subtotal_lines_skipped() {
        let lines = vec![
            line("Burger",    0.10, 0.30, 0.40),
            line("10.00",     0.85, 0.30, 0.95),
            line("SUBTOTAL",  0.10, 0.50, 0.30),
            line("10.00",     0.85, 0.50, 0.95),
            line("TOTAL",     0.10, 0.60, 0.30),
            line("10.00",     0.85, 0.60, 0.95),
        ];
        let r = parse(lines);
        assert_eq!(r.items.len(), 1, "expected only Burger; SUBTOTAL/TOTAL skipped");
    }

    #[test]
    fn parenthetical_per_item_allocation_is_suppressed() {
        let lines = vec![
            // real items
            line("DRONA NN box",    0.10, 0.30, 0.40),
            line("4.99",            0.85, 0.30, 0.95),
            // per-item discount allocation — should be DROPPED
            line("(US S&S $10 off", 0.10, 0.32, 0.40),
            line("-0.34)",          0.85, 0.32, 0.95),
            // real total discount — should be KEPT as kind=discount
            line("US S&S $10 off",  0.10, 0.70, 0.40),
            line("-10.00",          0.85, 0.70, 0.95),
        ];
        let r = parse(lines);
        // Exactly one discount (-10.00). The -0.34 allocation is dropped.
        let discounts: Vec<&ParsedItem> = r.items.iter().filter(|i| i.kind == "discount").collect();
        assert_eq!(discounts.len(), 1);
        assert_eq!(discounts[0].price_cents, -1000);
        // DRONA still there
        assert!(r.items.iter().any(|i| i.kind == "item" && i.price_cents == 499));
    }

    #[test]
    fn matching_totals_keep_high_confidence_and_reconciled_true() {
        let lines = vec![
            line("Burger",   0.10, 0.30, 0.40),
            line("10.00",    0.85, 0.30, 0.95),
            line("TAX",      0.10, 0.50, 0.20),
            line("1.00",     0.85, 0.50, 0.95),
            line("TOTAL",    0.10, 0.70, 0.30),
            line("11.00",    0.85, 0.70, 0.95),
        ];
        let r = parse(lines);
        assert!(r.totals_reconciled);
        assert_eq!(r.parsed_total_cents, Some(1100));
        assert!(r.items.iter().all(|i| i.confidence == Confidence::High));
    }

    #[test]
    fn mismatched_totals_set_flag_false_and_demote_items() {
        let lines = vec![
            line("Burger",   0.10, 0.30, 0.40),
            line("10.00",    0.85, 0.30, 0.95),
            line("TAX",      0.10, 0.50, 0.20),
            line("1.00",     0.85, 0.50, 0.95),
            line("TOTAL",    0.10, 0.70, 0.30),
            line("99.99",    0.85, 0.70, 0.95), // wildly off
        ];
        let r = parse(lines);
        assert!(!r.totals_reconciled);
        assert_eq!(r.parsed_total_cents, Some(9999));
        // Each item picks up 1 demerit -> Medium (was High with 0 demerits)
        assert!(r.items.iter().all(|i| i.confidence == Confidence::Medium));
    }

    #[test]
    fn one_cent_total_mismatch_is_ignored() {
        let lines = vec![
            line("Burger",   0.10, 0.30, 0.40),
            line("10.00",    0.85, 0.30, 0.95),
            line("TOTAL",    0.10, 0.70, 0.30),
            line("10.01",    0.85, 0.70, 0.95),
        ];
        let r = parse(lines);
        assert!(r.totals_reconciled, "1-cent mismatch should still reconcile");
    }

    #[test]
    fn priceless_item_flagged_low_with_zero_price() {
        let lines = vec![
            // priced item to seed price-column detection
            line("Burger",          0.10, 0.30, 0.40),
            line("10.00",           0.85, 0.30, 0.95),
            // priceless item — article + name, no price
            line("Article 12345",   0.10, 0.50, 0.40),
            line("CITRONHAJ s&p",   0.10, 0.51, 0.40),
            // sentinel that another priced row comes after
            line("Salad",           0.10, 0.70, 0.40),
            line("8.00",            0.85, 0.70, 0.95),
        ];
        let r = parse(lines);
        let priceless: Vec<&ParsedItem> = r.items.iter().filter(|i| i.price_cents == 0).collect();
        assert_eq!(priceless.len(), 1, "expected one priceless item");
        assert_eq!(priceless[0].confidence, Confidence::Low);
        assert!(priceless[0].name.as_deref().unwrap().contains("CITRONHAJ"));
    }
}
