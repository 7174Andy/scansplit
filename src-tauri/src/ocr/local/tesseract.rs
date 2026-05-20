use crate::error::{AppError, AppResult};
use crate::ocr::local::{BBox, NativeOcr, OcrLine};

use leptess::LepTess;

pub struct TesseractOcr {
    tessdata_dir: String,
}

impl TesseractOcr {
    pub fn new(tessdata_dir: String) -> Self {
        Self { tessdata_dir }
    }
}

// Tesseract TSV output columns (tab-separated, first row is the header):
//   level  page_num  block_num  par_num  line_num  word_num
//   left   top  width  height  conf  text
//
// level values:
//   1 = page, 2 = block, 3 = paragraph, 4 = line, 5 = word
//
// Strategy: parse every word (level 5), group by (block, par, line), then
// aggregate into OcrLine records.  This avoids any dependency on a
// ResultIterator API that varies across leptess minor versions.

#[derive(Debug)]
struct TsvWord {
    block_num: u32,
    par_num: u32,
    line_num: u32,
    left: i32,
    top: i32,
    right: i32,    // left + width
    bottom: i32,   // top + height
    conf: f32,     // Tesseract reports 0-100, -1 = rejected
    text: String,
}

fn parse_tsv(tsv: &str, img_w: f32, img_h: f32) -> Vec<OcrLine> {
    // Parse every word-level row.
    let mut words: Vec<TsvWord> = Vec::new();
    let mut lines_iter = tsv.lines();
    let _header = lines_iter.next(); // skip header

    for line in lines_iter {
        let cols: Vec<&str> = line.splitn(12, '\t').collect();
        if cols.len() < 12 {
            continue;
        }
        let level: u32 = cols[0].parse().unwrap_or(0);
        if level != 5 {
            continue; // only words
        }
        let block_num: u32 = cols[2].parse().unwrap_or(0);
        let par_num: u32 = cols[3].parse().unwrap_or(0);
        let line_num: u32 = cols[4].parse().unwrap_or(0);
        let left: i32 = cols[6].parse().unwrap_or(0);
        let top: i32 = cols[7].parse().unwrap_or(0);
        let width: i32 = cols[8].parse().unwrap_or(0);
        let height: i32 = cols[9].parse().unwrap_or(0);
        let conf: f32 = cols[10].parse().unwrap_or(-1.0);
        let text = cols[11].trim().to_string();

        if text.is_empty() {
            continue;
        }

        words.push(TsvWord {
            block_num,
            par_num,
            line_num,
            left,
            top,
            right: left + width,
            bottom: top + height,
            conf,
            text,
        });
    }

    if words.is_empty() {
        return Vec::new();
    }

    // Group words into logical lines using (block, par, line) as key.
    // Sort so grouping is stable.
    words.sort_by_key(|w| (w.block_num, w.par_num, w.line_num, w.left));

    let mut ocr_lines: Vec<OcrLine> = Vec::new();
    let mut group_start = 0usize;

    while group_start < words.len() {
        let key = (
            words[group_start].block_num,
            words[group_start].par_num,
            words[group_start].line_num,
        );
        let group_end = words[group_start..]
            .iter()
            .position(|w| (w.block_num, w.par_num, w.line_num) != key)
            .map(|p| group_start + p)
            .unwrap_or(words.len());

        let group = &words[group_start..group_end];

        // Bounding box = union of all word boxes in the group.
        let x1 = group.iter().map(|w| w.left).min().unwrap_or(0);
        let y1 = group.iter().map(|w| w.top).min().unwrap_or(0);
        let x2 = group.iter().map(|w| w.right).max().unwrap_or(0);
        let y2 = group.iter().map(|w| w.bottom).max().unwrap_or(0);

        // Average confidence across words (ignore rejected words with conf=-1).
        let valid_confs: Vec<f32> = group
            .iter()
            .filter(|w| w.conf >= 0.0)
            .map(|w| w.conf)
            .collect();
        let avg_conf = if valid_confs.is_empty() {
            0.0_f32
        } else {
            valid_confs.iter().sum::<f32>() / valid_confs.len() as f32
        };

        // Join words with a single space.
        let text = group
            .iter()
            .map(|w| w.text.as_str())
            .collect::<Vec<_>>()
            .join(" ");

        if !text.trim().is_empty() {
            ocr_lines.push(OcrLine {
                text: text.trim().to_string(),
                bbox: BBox {
                    x_min: x1 as f32 / img_w,
                    x_max: x2 as f32 / img_w,
                    y_min: y1 as f32 / img_h,
                    y_max: y2 as f32 / img_h,
                },
                confidence: avg_conf / 100.0,
            });
        }

        group_start = group_end;
    }

    // Re-sort by y_min so the parser receives lines in reading order.
    ocr_lines.sort_by(|a, b| a.bbox.y_min.partial_cmp(&b.bbox.y_min).unwrap_or(std::cmp::Ordering::Equal));

    ocr_lines
}

impl NativeOcr for TesseractOcr {
    fn recognize(&self, image_bytes: &[u8]) -> AppResult<Vec<OcrLine>> {
        let tessdata = if self.tessdata_dir.is_empty() {
            None
        } else {
            Some(self.tessdata_dir.as_str())
        };

        let mut lt = LepTess::new(tessdata, "eng")
            .map_err(|e| AppError::Other(format!("tesseract init: {e}")))?;

        lt.set_image_from_mem(image_bytes)
            .map_err(|e| AppError::Other(format!("tesseract image: {e}")))?;

        // PSM 6 — assume a uniform block of text (works well for receipts).
        lt.set_variable(leptess::Variable::TesseditPagesegMode, "6")
            .map_err(|e| AppError::Other(format!("tesseract psm: {e}")))?;

        let (img_w, img_h) = lt
            .get_image_dimensions()
            .map(|(w, h)| (w as f32, h as f32))
            .unwrap_or((1.0, 1.0));

        let tsv = lt
            .get_tsv_text(0)
            .map_err(|e| AppError::Other(format!("tesseract tsv: {e}")))?;

        Ok(parse_tsv(&tsv, img_w, img_h))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Unit-test parse_tsv with synthetic data — no Tesseract system libs needed.
    #[test]
    fn parse_tsv_groups_words_into_lines() {
        // Simulate a minimal TSV with two lines, each having two words.
        // Header row + 4 word rows (level=5).
        let tsv = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n\
                   5\t1\t1\t1\t1\t1\t10\t10\t50\t20\t95\tHello\n\
                   5\t1\t1\t1\t1\t2\t65\t10\t60\t20\t90\tWorld\n\
                   5\t1\t1\t1\t2\t1\t10\t40\t40\t20\t85\tFoo\n\
                   5\t1\t1\t1\t2\t2\t55\t40\t30\t20\t80\tBar\n";

        let lines = parse_tsv(tsv, 200.0, 100.0);
        assert_eq!(lines.len(), 2, "expected 2 logical lines");

        assert_eq!(lines[0].text, "Hello World");
        assert_eq!(lines[1].text, "Foo Bar");

        // Line 1 bbox: x1=10, y1=10, x2=125, y2=30 → normalized by 200×100
        assert!((lines[0].bbox.x_min - 10.0 / 200.0).abs() < 1e-4);
        assert!((lines[0].bbox.x_max - 125.0 / 200.0).abs() < 1e-4);
        assert!((lines[0].bbox.y_min - 10.0 / 100.0).abs() < 1e-4);
        assert!((lines[0].bbox.y_max - 30.0 / 100.0).abs() < 1e-4);

        // Confidence: average of 95 and 90 = 92.5, normalized to 0.925
        assert!((lines[0].confidence - 0.925).abs() < 1e-4);
    }

    #[test]
    fn parse_tsv_skips_empty_text() {
        let tsv = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n\
                   5\t1\t1\t1\t1\t1\t10\t10\t50\t20\t95\t\n\
                   5\t1\t1\t1\t2\t1\t10\t40\t50\t20\t90\tFoo\n";
        let lines = parse_tsv(tsv, 100.0, 100.0);
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].text, "Foo");
    }

    #[test]
    fn parse_tsv_handles_rejected_words() {
        // conf = -1 means rejected; should not crash, confidence falls back to 0.
        let tsv = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n\
                   5\t1\t1\t1\t1\t1\t10\t10\t50\t20\t-1\tGarbled\n";
        let lines = parse_tsv(tsv, 100.0, 100.0);
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].text, "Garbled");
        assert!((lines[0].confidence - 0.0).abs() < 1e-4);
    }

    // Integration test against a real image — only runs in CI where
    // Tesseract system libs + tessdata are present.
    #[test]
    #[ignore = "requires Tesseract system libraries and ikea_receipt.png fixture"]
    fn recognize_returns_lines_for_a_real_image() {
        let tessdata = std::env::var("TESSDATA_PREFIX")
            .unwrap_or_else(|_| "/usr/share/tesseract-ocr/4.00/tessdata".to_string());
        let bytes = std::fs::read("tests/fixtures/ikea_receipt.png")
            .expect("fixture missing — copy IMG_4387 to tests/fixtures/ikea_receipt.png");
        let ocr = TesseractOcr::new(tessdata);
        let lines = ocr.recognize(&bytes).expect("tesseract recognize");
        assert!(!lines.is_empty());
        assert!(lines
            .iter()
            .any(|l| l.text.to_uppercase().contains("IKEA")));
    }
}
