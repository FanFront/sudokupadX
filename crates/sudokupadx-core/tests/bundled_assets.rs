//! Verify every distributable puzzle package in the new native project.
//! This catches missing side quests and parser regressions before publishing.
use std::{fs,path::PathBuf};

#[test]
fn all_bundled_scl_packages_decode() {
    let root=PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../public/puzzles");
    let catalog=fs::read_to_string(root.join("catalog.json")).expect("catalog");
    let index:serde_json::Value=serde_json::from_str(&catalog).expect("catalog JSON");
    let entries=index["items"].as_array().expect("puzzle entries");
    assert_eq!(entries.len(),115,"4 old adventure maps, 42 old links, 4 new hubs, 65 new links");
    for item in entries {
        let path=item["file"].as_str().expect("file");
        assert!(path.starts_with("puzzles/") && path.ends_with(".scl"));
        let file=root.join(path.trim_start_matches("puzzles/"));
        let packed=fs::read_to_string(&file)
            .unwrap_or_else(|e|panic!("{}: {e}",file.display()));
        let puzzle=sudokupadx_core::load(&packed)
            .unwrap_or_else(|e|panic!("{}: {e}",file.display()));
        assert!(puzzle.rows>0 && puzzle.cols>0);
        assert_eq!(puzzle.cells.len(),puzzle.rows*puzzle.cols);
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
    assert_eq!(translations.as_object().unwrap().len(),91);
}
