use scansplit_lib::ocr::claude::parse_response_text;

#[test]
fn parses_fixture() {
    let raw = std::fs::read_to_string("tests/fixtures/sample_response.json").unwrap();
    let r = parse_response_text(&raw).unwrap();
    assert_eq!(r.items.len(), 4);
    assert_eq!(r.items[0].name.as_deref(), Some("Whole Milk 2%"));
    assert!(r.items[2].name.is_none());
    assert_eq!(r.items[3].kind, "tax");
}
