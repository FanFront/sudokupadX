// Generated 4×4/6×6/9×9 puzzles use the full tier-1..5 Rust solver.
// Original adventure maps and standalone linked/Boss SCLs lack generator
// solverRules, so use the typed, visibility-safe local deduction engine.
export function usesTypedHintEngine(puzzle){
  if(!puzzle)return false;
  if(puzzle.rows>16||puzzle.cols>16)return true;
  return puzzle.rows===9&&puzzle.cols===9&&
    !Array.isArray(puzzle.hintRules);
}
