use regex::Regex;
use std::sync::OnceLock;

use crate::ocr::{ParsedReceipt, ParsedItem, Confidence};
use crate::ocr::local::OcrLine;

fn price_regex() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"-?\$?\s*(\d+)[\.,](\d{2})").unwrap())
}

fn article_regex() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"^Article\s+\d+").unwrap())
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

fn tax_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"\b(TAX|GST|HST|VAT)\b").unwrap())
}
fn tip_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"\b(TIP|GRATUITY|SVC|SERVICE\s+CHG)\b").unwrap())
}
fn discount_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"\b(DISCOUNT|PROMO|COUPON|SAVINGS|OFF)\b").unwrap())
}
fn skip_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"\b(SUBTOTAL|NET\s+TOTAL|TOTAL|BALANCE|AMOUNT\s+DUE)\b").unwrap())
}
fn subtotal_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"\b(SUBTOTAL|NET\s+TOTAL)\b").unwrap())
}
fn total_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"\b(TOTAL|BALANCE|AMOUNT\s+DUE)\b").unwrap())
}

fn is_decorative(text: &str) -> bool {
    let t = text.trim();
    !t.is_empty()
        && t.len() >= 4
        && t.chars().all(|c| matches!(c, '*' | '-' | '_' | '=' | '~'))
}

fn classify_kind(text: &str, price_cents: i64) -> Option<&'static str> {
    let t = text.to_uppercase();
    // Skip totals entirely — `None` signals "drop this row"
    if skip_re().is_match(&t) { return None; }
    if tax_re().is_match(&t) { return Some("tax"); }
    if tip_re().is_match(&t) { return Some("tip"); }
    if discount_re().is_match(&t) { return Some("discount"); }
    if price_cents < 0 { return Some("discount"); }
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

    // Drop decorative separator lines (rows of *, -, =, etc.) so they can never
    // be selected as item name candidates.
    lines.retain(|l| !is_decorative(&l.text));

    let priced: Vec<&OcrLine> = lines.iter().filter(|l| extract_price_cents(&l.text).is_some()).collect();
    let price_col = mode_x_max(&priced).unwrap_or(1.0);
    let line_height = median(lines.iter().map(|l| l.bbox.height()).collect()).unwrap_or(0.013);

    let in_price_col = |l: &OcrLine| (l.bbox.x_max - price_col).abs() < line_height;

    let mut items: Vec<ParsedItem> = Vec::new();
    let window = 2.0 * line_height;

    // Cut-off: anything below the printed TOTAL is footer (payment method,
    // transaction record, etc.) and must not become an item.
    let footer_cutoff_y: Option<f32> = {
        let mut candidates: Vec<f32> = Vec::new();
        for (i, l) in lines.iter().enumerate() {
            if extract_price_cents(&l.text).is_none() { continue; }
            if !in_price_col(l) { continue; }
            let satellite_text: String = lines.iter().enumerate()
                .filter(|(j, ll)| *j != i
                    && (ll.bbox.y_min - l.bbox.y_min).abs() <= window
                    && !in_price_col(ll)
                    && extract_price_cents(&ll.text).is_none())
                .map(|(_, ll)| ll.text.as_str())
                .collect::<Vec<_>>()
                .join(" ");
            let combined = format!("{} {}", l.text, satellite_text);
            // Cutoff fires only on grand-total rows (TOTAL/BALANCE/AMOUNT DUE).
            // SUBTOTAL and NET TOTAL appear mid-receipt and must NOT trigger the
            // cutoff — otherwise rows like TAX (which often follows Net total)
            // get dropped.
            let combined_u = combined.to_uppercase();
            if total_re().is_match(&combined_u) && !subtotal_re().is_match(&combined_u) {
                candidates.push(l.bbox.y_min);
            }
        }
        candidates.into_iter().reduce(f32::min)
    };

    for (i, l) in lines.iter().enumerate() {
        if let Some(cut) = footer_cutoff_y {
            if l.bbox.y_min > cut { continue; }
        }
        let price_cents = match extract_price_cents(&l.text) {
            Some(p) => p,
            None => continue,
        };
        if !in_price_col(l) { continue; }

        // Prefer the satellite *closest* in y to the price line — that's
        // visually paired with it on the receipt. Fall back to longest text
        // on ties (e.g. when two satellites share the same row as the price).
        let name_candidate = lines.iter().enumerate()
            .filter(|(j, ll)| *j != i
                && (ll.bbox.y_min - l.bbox.y_min).abs() <= window
                && !in_price_col(ll)
                && extract_price_cents(&ll.text).is_none())
            .min_by(|(_, a), (_, b)| {
                let da = (a.bbox.y_min - l.bbox.y_min).abs();
                let db = (b.bbox.y_min - l.bbox.y_min).abs();
                da.partial_cmp(&db)
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then_with(|| b.text.len().cmp(&a.text.len()))
            })
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
    let article_re = article_regex();
    for (i, l) in lines.iter().enumerate() {
        if let Some(cut) = footer_cutoff_y {
            if l.bbox.y_min > cut { continue; }
        }
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
    // Exclude SUBTOTAL and NET TOTAL — they are not the final printed total.
    let parsed_total_cents: Option<i64> = lines.iter()
        .filter(|l| {
            let t = l.text.to_uppercase();
            !subtotal_re().is_match(&t) && total_re().is_match(&t)
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

    let merchant: Option<String> = {
        let first_priced_y = priced.first().map(|l| l.bbox.y_min).unwrap_or(1.0);
        lines.iter()
            .filter(|l| l.bbox.y_min < first_priced_y)
            .find(|l| {
                let t = l.text.trim();
                t.len() > 3
                    && t.chars().filter(|c| c.is_alphabetic()).count() as f32
                        / t.chars().count() as f32 > 0.5
            })
            .map(|l| l.text.trim().to_string())
    };

    ParsedReceipt {
        merchant,
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
    fn merchant_extracted_from_first_alphabetic_header_line() {
        let lines = vec![
            line("IKEA San Diego",       0.40, 0.05, 0.60),
            line("Mon - Sat 10am-9pm",   0.35, 0.07, 0.60),
            line("Burger",               0.10, 0.30, 0.40),
            line("10.00",                0.85, 0.30, 0.95),
        ];
        let r = parse(lines);
        assert_eq!(r.merchant.as_deref(), Some("IKEA San Diego"));
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

    #[test]
    fn realistic_restaurant_receipt_reconciles_end_to_end() {
        // 3 items + tax + tip + one discount — total is sum of all
        let lines = vec![
            line("The Diner",    0.40, 0.03, 0.60), // merchant header
            line("Caesar Salad", 0.10, 0.30, 0.40),
            line("12.50",        0.85, 0.30, 0.95),
            line("Burger",       0.10, 0.35, 0.40),
            line("14.00",        0.85, 0.35, 0.95),
            line("Fries",        0.10, 0.40, 0.40),
            line("4.50",         0.85, 0.40, 0.95),
            line("PROMO -$2",    0.10, 0.45, 0.40),
            line("-2.00",        0.85, 0.45, 0.95),
            line("TAX",          0.10, 0.55, 0.20),
            line("2.32",         0.85, 0.55, 0.95),
            line("TIP",          0.10, 0.60, 0.20),
            line("3.00",         0.85, 0.60, 0.95),
            line("TOTAL",        0.10, 0.70, 0.30),
            line("34.32",        0.85, 0.70, 0.95), // 1250+1400+450-200+232+300 = 3432
        ];
        let r = parse(lines);
        assert_eq!(r.merchant.as_deref(), Some("The Diner"));
        assert!(r.totals_reconciled);
        assert_eq!(r.parsed_total_cents, Some(3432));
        assert_eq!(r.items.iter().filter(|i| i.kind == "item").count(), 3);
        assert!(r.items.iter().any(|i| i.kind == "tax" && i.price_cents == 232));
        assert!(r.items.iter().any(|i| i.kind == "tip" && i.price_cents == 300));
        assert!(r.items.iter().any(|i| i.kind == "discount" && i.price_cents == -200));
        assert!(r.items.iter().all(|i| i.confidence == Confidence::High));
    }

    #[test]
    fn classify_kind_does_not_misclassify_words_containing_keywords() {
        // COFFEE contains "OFF" — must remain an item, not a discount
        assert_eq!(classify_kind("COFFEE", 350), Some("item"));
        // OFFICE CHAIR contains "OFF"
        assert_eq!(classify_kind("OFFICE CHAIR", 9999), Some("item"));
        // TANGO BLANCO TEQUILA doesn't contain a tax keyword as a whole word
        assert_eq!(classify_kind("TANGO BLANCO TEQUILA", 4500), Some("item"));
        // TULIP contains "TIP" as a substring but not a whole word
        assert_eq!(classify_kind("TULIP BOUQUET", 2200), Some("item"));
    }

    #[test]
    fn asterisk_separator_is_not_used_as_item_name() {
        // The asterisk line is at y_min=0.305, within ±2×line_height (0.026) of both
        // priced rows (0.30 and 0.36). Its 40-char text beats "Burger" (6) and "Salad"
        // (5) in the max_by_key(text.len()) sweep, so without the decorative filter it
        // becomes the name for both items.
        let lines = vec![
            line("Burger",                                  0.10, 0.30,  0.40),
            line("10.00",                                   0.85, 0.30,  0.95),
            line("****************************************", 0.10, 0.305, 0.65),
            line("Salad",                                   0.10, 0.36,  0.40),
            line("8.00",                                    0.85, 0.36,  0.95),
        ];
        let r = parse(lines);
        // Both items present with the correct names — no asterisk name on either.
        let names: Vec<String> = r.items.iter().filter_map(|i| i.name.clone()).collect();
        for n in &names {
            assert!(!n.contains("*"), "name should not contain asterisks: {n:?}");
        }
        assert!(names.iter().any(|n| n == "Burger"), "Burger missing from {:?}", names);
        assert!(names.iter().any(|n| n == "Salad"), "Salad missing from {:?}", names);
    }

    #[test]
    fn rows_below_total_are_not_emitted_as_items() {
        // USD$11.00 is in the price column (x_max=0.95) and is below TOTAL.
        // Without the footer cutoff it gets emitted as an extra item.
        // "#1234" is also in the price column and below TOTAL.
        let lines = vec![
            line("Burger",         0.10, 0.30, 0.40),
            line("10.00",          0.85, 0.30, 0.95),
            line("TAX",            0.10, 0.50, 0.20),
            line("1.00",           0.85, 0.50, 0.95),
            line("TOTAL",          0.10, 0.70, 0.30),
            line("11.00",          0.85, 0.70, 0.95),
            // Footer rows — all below TOTAL, should be dropped
            line("EFT Debit Card", 0.10, 0.80, 0.40),
            line("USD$11.00",      0.10, 0.80, 0.95), // in price col, below TOTAL
            line("Total Articles", 0.10, 0.85, 0.40),
            line("1",              0.85, 0.85, 0.95),
            line("TRANSACTION",    0.10, 0.90, 0.40),
            line("#1234",          0.85, 0.90, 0.95),
        ];
        let r = parse(lines);
        // Only Burger + Tax — no EFT, Total Articles, or TRANSACTION rows.
        assert_eq!(r.items.len(), 2, "expected only Burger and TAX, got: {:?}",
            r.items.iter().map(|i| (i.name.clone(), i.price_cents, i.kind.clone())).collect::<Vec<_>>());
        assert!(r.items.iter().any(|i| i.kind == "item" && i.price_cents == 1000));
        assert!(r.items.iter().any(|i| i.kind == "tax" && i.price_cents == 100));
    }

    #[test]
    fn net_total_does_not_trigger_footer_cutoff() {
        // Real-world IKEA ordering: Net total → TAX → Total → footer.
        // The footer cutoff must fire at TOTAL (not Net total), so TAX
        // sandwiched between them stays in the items.
        let lines = vec![
            line("Burger",     0.10, 0.30, 0.40),
            line("10.00",      0.85, 0.30, 0.95),
            line("Net total",  0.10, 0.50, 0.30),
            line("10.00",      0.85, 0.50, 0.95),
            line("TAX",        0.10, 0.60, 0.20),
            line("1.00",       0.85, 0.60, 0.95),
            line("TOTAL",      0.10, 0.70, 0.30),
            line("11.00",      0.85, 0.70, 0.95),
            line("Payment",    0.10, 0.80, 0.40),
            line("USD$11.00",  0.10, 0.80, 0.95),
        ];
        let r = parse(lines);
        assert!(r.items.iter().any(|i| i.kind == "tax" && i.price_cents == 100),
            "TAX row must survive when Net total appears before it; got: {:?}",
            r.items.iter().map(|i| (i.name.clone(), i.price_cents, i.kind.clone())).collect::<Vec<_>>());
        // No payment row leaks through.
        assert!(!r.items.iter().any(|i| i.price_cents == 1100 && i.kind == "item"),
            "USD$11.00 payment row must be dropped (below TOTAL)");
    }

    #[test]
    fn subtotal_does_not_get_picked_as_printed_total() {
        let lines = vec![
            line("Burger",   0.10, 0.30, 0.40),
            line("10.00",    0.85, 0.30, 0.95),
            line("TAX",      0.10, 0.50, 0.20),
            line("1.00",     0.85, 0.50, 0.95),
            line("SUBTOTAL", 0.10, 0.60, 0.30),
            line("10.00",    0.85, 0.60, 0.95),  // would corrupt reconciliation if matched
            line("TOTAL",    0.10, 0.70, 0.30),
            line("11.00",    0.85, 0.70, 0.95),
        ];
        let r = parse(lines);
        assert_eq!(r.parsed_total_cents, Some(1100), "must be TOTAL (1100), not SUBTOTAL (1000)");
        assert!(r.totals_reconciled);
    }
}
