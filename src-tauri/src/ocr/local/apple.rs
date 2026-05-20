//! macOS Apple Vision OCR adapter.
//!
//! Wraps `VNRecognizeTextRequest` to satisfy the [`NativeOcr`] trait. The recognition
//! request is synchronous and CPU/GPU-bound; the [`crate::ocr::local::LocalScanner`]
//! wraps this in `spawn_blocking` (see Task 12).
//!
//! ### Coordinate system
//! Vision returns bounding boxes normalized to `[0, 1]` with the **origin at the
//! bottom-left** of the image. The rest of ScanSplit uses **top-left** origin, so
//! we flip the y axis here on the way out.

use crate::error::{AppError, AppResult};
use crate::ocr::local::{BBox, NativeOcr, OcrLine};

use objc2::rc::Retained;
use objc2::AnyThread;
use objc2_foundation::{NSArray, NSData, NSDictionary, NSString};
use objc2_vision::{
    VNImageRequestHandler, VNRecognizeTextRequest, VNRequest, VNRequestTextRecognitionLevel,
};

pub struct AppleOcr;

impl AppleOcr {
    pub fn new() -> Self {
        Self
    }
}

impl Default for AppleOcr {
    fn default() -> Self {
        Self::new()
    }
}

impl NativeOcr for AppleOcr {
    fn recognize(&self, image_bytes: &[u8]) -> AppResult<Vec<OcrLine>> {
        // SAFETY: All FFI calls below operate on values created in this function
        // and follow Apple's Vision API contract documented at
        // https://developer.apple.com/documentation/vision/vnrecognizetextrequest.
        unsafe {
            // 1) Wrap input bytes in NSData (zero-copy by Foundation).
            let data: Retained<NSData> = NSData::with_bytes(image_bytes);

            // 2) Build the recognize-text request and configure it.
            let request: Retained<VNRecognizeTextRequest> = VNRecognizeTextRequest::new();
            request.setRecognitionLevel(VNRequestTextRecognitionLevel::Accurate);
            request.setUsesLanguageCorrection(true);
            let lang = NSString::from_str("en-US");
            let langs: Retained<NSArray<NSString>> = NSArray::from_retained_slice(&[lang]);
            request.setRecognitionLanguages(&langs);

            // 3) Build the image-request handler from the NSData.
            // VNImageOption keys map to AnyObject values; we pass an empty dict.
            let options: Retained<NSDictionary<_, _>> = NSDictionary::new();
            let handler = VNImageRequestHandler::initWithData_options(
                VNImageRequestHandler::alloc(),
                &data,
                &options,
            );

            // 4) `performRequests:` takes `NSArray<VNRequest>`. `VNRecognizeTextRequest`
            // is a (grand-)subclass of `VNRequest`; `Retained::into_super` only walks
            // one level so we reinterpret the array pointer instead — this is safe
            // because NSArray is non-generic in Objective-C and Vision only inspects
            // each element's `-performRequest:context:error:` selector.
            let requests_concrete: Retained<NSArray<VNRecognizeTextRequest>> =
                NSArray::from_retained_slice(&[request.clone()]);
            let requests: &NSArray<VNRequest> =
                &*(Retained::as_ptr(&requests_concrete) as *const NSArray<VNRequest>);

            handler
                .performRequests_error(requests)
                .map_err(|e| AppError::Other(format!("vision request failed: {}", e)))?;

            // 5) Pull observations off the request and convert each to an OcrLine.
            let results = match request.results() {
                Some(r) => r,
                None => return Ok(Vec::new()),
            };

            let mut out: Vec<OcrLine> = Vec::with_capacity(results.count());
            for obs in results.iter() {
                let candidates = obs.topCandidates(1);
                let Some(cand) = candidates.firstObject() else {
                    continue;
                };
                let text = cand.string().to_string();
                let conf = cand.confidence();
                let bb = obs.boundingBox();

                // Vision: origin bottom-left, normalized [0, 1]. Flip to top-left.
                let x_min = bb.origin.x as f32;
                let x_max = (bb.origin.x + bb.size.width) as f32;
                let y_min_top = (1.0 - (bb.origin.y + bb.size.height)) as f32;
                let y_max_top = (1.0 - bb.origin.y) as f32;

                out.push(OcrLine {
                    text,
                    bbox: BBox {
                        x_min,
                        x_max,
                        y_min: y_min_top,
                        y_max: y_max_top,
                    },
                    confidence: conf,
                });
            }
            Ok(out)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognize_returns_lines_for_a_real_image() {
        let bytes = std::fs::read("tests/fixtures/ikea_receipt.png")
            .expect("fixture missing — copy IMG_4387 to tests/fixtures/ikea_receipt.png");
        let ocr = AppleOcr::new();
        let lines = ocr.recognize(&bytes).expect("Apple Vision recognize");
        assert!(lines.len() > 30, "expected many lines, got {}", lines.len());
        assert!(
            lines.iter().any(|l| l.text.contains("IKEA")),
            "expected an IKEA line; got: {:?}",
            lines.iter().take(10).map(|l| &l.text).collect::<Vec<_>>(),
        );

        // Sanity: all bboxes should be in the normalized top-left frame.
        for l in &lines {
            assert!(
                l.bbox.x_min >= 0.0 && l.bbox.x_max <= 1.0,
                "x out of range: {:?}",
                l.bbox
            );
            assert!(
                l.bbox.y_min >= 0.0 && l.bbox.y_max <= 1.0,
                "y out of range: {:?}",
                l.bbox
            );
            assert!(l.bbox.x_min <= l.bbox.x_max);
            assert!(l.bbox.y_min <= l.bbox.y_max);
        }
    }
}
