// Authored clues can be concealed by fog. While concealed, the player may
// place normal large digits, corner/center candidates and colour marks.
// Once visible, the original given remains immutable and takes precedence.
export function editableCellIndices(puzzle,progress,indices) {
  if(!Array.isArray(indices)||!Array.isArray(puzzle?.cells))return [];
  return [...new Set(indices)].filter(index=>
    Number.isInteger(index)&&index>=0&&index<puzzle.cells.length&&
    (puzzle.cells[index]?.given==null||progress?.visible?.[index]===false)
  );
}
