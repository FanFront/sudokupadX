//! Verify every distributable puzzle package in the new native project.
//! This catches missing side quests and parser regressions before publishing.
use std::{fs,path::PathBuf};

#[test]
fn all_bundled_scl_packages_decode() {
    let root=PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../public/puzzles");
    let catalog=fs::read_to_string(root.join("catalog.json")).expect("catalog");
    let index:serde_json::Value=serde_json::from_str(&catalog).expect("catalog JSON");
    let entries=index["items"].as_array().expect("puzzle entries");
    assert_eq!(entries.len(),143,"116 bundled packages and 27 optional enemy links");
    assert_eq!(entries.iter().filter(|item|item["file"].is_string()).count(),116,
        "the original offline SCL pack must stay intact");
    assert_eq!(entries.iter().filter(|item|item["remote"]==true).count(),27,
        "all 27 remote-only optional enemies must be enumerated");
    for item in entries {
        if item["remote"]==true {
            let id=item["id"].as_str().expect("enemy id");
            let url=item["url"].as_str().expect("enemy URL");
            assert!(id.starts_with("enemy-"));
            assert!(url.starts_with("https://sudokupad.app/sudokuvania/enemy-"));
            assert!(item["file"].is_null(),"remote enemies must not pretend to be bundled");
            continue;
        }
        let path=item["file"].as_str().expect("file");
        assert!(path.starts_with("puzzles/") && path.ends_with(".scl"));
        let file=root.join(path.trim_start_matches("puzzles/"));
        let packed=fs::read_to_string(&file)
            .unwrap_or_else(|e|panic!("{}: {e}",file.display()));
        let puzzle=sudokupadx_core::load(&packed)
            .unwrap_or_else(|e|panic!("{}: {e}",file.display()));
        assert!(puzzle.rows>0 && puzzle.cols>0);
        assert_eq!(puzzle.cells.len(),puzzle.rows*puzzle.cols);
        if item["id"]=="lineage-of-logic" {
            assert!(puzzle.rules.contains("prologue-empty-house") ||
                puzzle.sectors.iter().any(|sector|
                    sector.rules.contains("prologue-empty-house")),
                "original main map must link to the tutorial prologue");
        }
        if item["id"]=="prologue-empty-house" {
            assert_eq!((puzzle.rows,puzzle.cols),(15,15));
            assert!(!puzzle.sectors.is_empty(),"prologue sectors must be preserved");
            assert!(puzzle.foglight.as_ref().is_some_and(|v|!v.is_empty()),
                "prologue must retain authored initial fog");
            assert!(!puzzle.triggers.is_empty(),
                "prologue must retain authored dynamic fog triggers");
        }
        if item["kind"]=="main" {
            assert!(!puzzle.sectors.is_empty(),"{} sector grid missing",path);
            assert!(puzzle.foglight.as_ref().is_some_and(|v|!v.is_empty()));
            assert!(!puzzle.triggers.is_empty(),"{} triggers missing",path);
            assert!(puzzle.solution.is_some(),"{} solution missing",path);
            let mut initial=vec![false;puzzle.cells.len()];
            for &index in puzzle.foglight.as_ref().unwrap() { initial[index]=true; }
            let session=sudokupadx_core::Session::new(puzzle);
            assert_eq!(session.snapshot().visible,initial,
                "{} must start with exactly the source foglight cells",path);
        }
    }
    let locale=fs::read_to_string(root.join("locale-zh.json")).expect("locales");
    let translations:serde_json::Value=serde_json::from_str(&locale).unwrap();
    assert_eq!(translations.as_object().unwrap().len(),92);
}
