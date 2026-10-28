//! Optional integration tests against *locally checked-out* offline assets from
//! the user's earlier project. Do not copy third-party puzzle data into this repo.
use std::{env, fs, path::Path};

#[test]
fn load_real_sudokuvania_and_super_sudokoid_packages() {
    let Ok(directory) = env::var("SUDOKUPAD_REFERENCE_ASSETS") else {
        eprintln!("SUDOKUPAD_REFERENCE_ASSETS not set; skipping external-data test.");
        return;
    };
    let root = Path::new(&directory);
    let mut count = 0;
    let mut failures = Vec::new();
    let mut seen = Vec::new();
    let mut paths = fs::read_dir(root)
        .unwrap_or_else(|error| panic!("Cannot read {}: {error}", root.display()))
        .map(|entry| entry.expect("entry").path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "scl"))
        .collect::<Vec<_>>();
    paths.sort();

    for path in paths {
        let file = path.file_name().unwrap().to_string_lossy().to_string();
        let raw = fs::read_to_string(&path)
            .unwrap_or_else(|error| panic!("{}: {error}", path.display()));
        match sudokupadx_core::load(&raw) {
            Ok(puzzle) => {
                assert!(puzzle.rows >= 9, "{file}: rows");
                assert!(puzzle.cols >= 9, "{file}: columns");
                assert_eq!(puzzle.cells.len(), puzzle.rows * puzzle.cols);
                seen.push(file);
                count += 1;
            }
            Err(error) => failures.push(format!("{file}: {error}")),
        }
    }
    eprintln!("Parsed {count} cached puzzles successfully: {}", seen.join(", "));
    assert!(failures.is_empty(), "SCL compatibility failures:\n{}", failures.join("\n"));
    assert!(count >= 24, "Expected 4 main games plus 20 translated boss puzzles");
}
