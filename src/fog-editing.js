// A fixed clue's large digit must never be changed when visible.
// Pencil marks (corner and center), cell colours, and erasure of player
// annotations are allowed on ALL selected cells, including visible givens.
// Fogged givens also accept large-digit input, without changing the clue.
export function editableCellIndices(puzzle,progress,indices,mode='value') {
  if(!Array.isArray(indices)||!Array.isArray(puzzle?.cells))return [];
  const annotate=['corner','center','color','erase'].includes(mode);
  return [...new Set(indices)].filter(index=>
    Number.isInteger(index)&&index>=0&&index<puzzle.cells.length&&
    (annotate||puzzle.cells[index]?.given==null||
      progress?.visible?.[index]===false)
  );
}
