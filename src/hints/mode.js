// Generator puzzles advertise a verified Rust solverRules array, including
// the empty array for certified classic Sudoku. Legacy SCLs do not. They may
// be 4×4, 6×6, 9×9, 11×11, or giant overlapping maps: route all of them to
// the typed, visibility-safe engine on both Android and the browser.
export function usesTypedHintEngine(puzzle){
  if(!puzzle)return false;
  return puzzle.rows>16||puzzle.cols>16||
    !Array.isArray(puzzle.hintRules);
}
