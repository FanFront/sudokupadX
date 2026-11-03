/** Constrain the on-screen keypad to the actual generated Sudoku's symbols. */
export function variantKeypadSymbols(puzzle, entry, alphabet = false, letterPage = 0) {
  if (alphabet) {
    return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.slice(letterPage*9,(letterPage+1)*9).split('');
  }
  const n = puzzle?.rows;
  if (entry?.group === 'variant-workshop' && puzzle?.cols === n &&
      [4, 6, 9].includes(n)) {
    return Array.from({length:n},(_,index)=>String(index+1));
  }
  // Preserve historical keypad behavior for all original/custom puzzles.
  return ['1','2','3','4','5','6','7','8','9','0'];
}
