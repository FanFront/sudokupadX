export function buildConflictHouses(puzzle) {
  const rows = puzzle?.rows, cols = puzzle?.cols;
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) return [];
  const size = rows * cols, houses = [], seen = new Set();
  const add = indices => {
    const clean = [...new Set(indices.filter(index => Number.isInteger(index) && index >= 0 && index < size))];
    if (clean.length < 2) return;
    const key = [...clean].sort((a,b) => a-b).join(',');
    if (!seen.has(key)) {seen.add(key);houses.push(clean);}
  };
  const addRowsAndColumns = (left, top, width, height) => {
    for (let r = top; r < top + height; r++)
      add(Array.from({length:width}, (_,i) => r*cols + left + i));
    for (let c = left; c < left + width; c++)
      add(Array.from({length:height}, (_,i) => (top+i)*cols + c));
  };

  // Small puzzles use their whole board as the standard Sudoku grid.
  // Adventure maps contain unrelated grids on the same global row/column.
  if (rows <= 16 && cols <= 16) {
    addRowsAndColumns(0, 0, cols, rows);
  } else {
    for (const sector of puzzle.sectors || []) {
      const {left,top,width,height} = sector;
      // Only a complete square Sudoku grid supplies row/column houses.
      // Story sections and large map rectangles must not create conflicts.
      if (![left,top,width,height].every(Number.isInteger) ||
          left < 0 || top < 0 || width !== height || width < 4 || width > 16 ||
          left + width > cols || top + height > rows) continue;
      addRowsAndColumns(left, top, width, height);
    }
  }
  const coordinates = pairs => pairs.map(pair => {
    if (!Array.isArray(pair) || pair.length < 2) return -1;
    const [r,c] = pair;
    return Number.isInteger(r) && Number.isInteger(c) && r >= 0 && c >= 0 && r < rows && c < cols
      ? r * cols + c : -1;
  });
  for (const region of puzzle.regions || []) {
    if (Array.isArray(region)) add(coordinates(region));
  }
  // SudokuMaker represents non-repeating killer cages as unique:true.
  // Some are hidden helper constraints (not drawn), but they still restrict
  // which numbers may coexist. Decorative cages without unique:true do not.
  for (const cage of puzzle.cages || []) {
    if (cage?.unique === true && Array.isArray(cage.cells)) add(coordinates(cage.cells));
  }
  return houses;
}

/**
 * Conflicts are based on *placed* values: duplicates in a row, column or region
 * turn red, and a corner/center candidate turns red if a peer already has that
 * value. Two identical pencil marks are not a Sudoku violation.
 *
 * Fog-covered values do not participate, since that could leak hidden clues.
 * A cell's own value never conflicts with its (currently hidden) notes.
 */
export function detectConflicts(puzzle, progress, houses = buildConflictHouses(puzzle)) {
  const size = puzzle?.cells?.length || 0;
  const valueCells = new Set();
  const noteSymbols = Array.from({length:size}, () => new Set());
  const placed = Array.from({length:size}, (_,index) => {
    if (progress?.visible?.[index] === false) return null;
    return puzzle.cells[index]?.given ?? progress?.cells?.[index]?.value ?? null;
  });

  for (const house of houses) {
    const valuePositions = new Map();
    for (const index of house) {
      const value = placed[index];
      if (value == null || value === '') continue;
      if (!valuePositions.has(value)) valuePositions.set(value, []);
      valuePositions.get(value).push(index);
    }
    for (const positions of valuePositions.values()) {
      if (positions.length > 1) positions.forEach(index => valueCells.add(index));
    }
    for (const index of house) {
      // Only visible, unfilled cells have displayed candidates.
      if (progress?.visible?.[index] === false || placed[index] != null) continue;
      const cell = progress?.cells?.[index];
      for (const mark of [...(cell?.corner || []), ...(cell?.center || [])]) {
        const positions = valuePositions.get(mark);
        if (positions?.some(peer => peer !== index)) noteSymbols[index].add(mark);
      }
    }
  }
  return {valueCells, noteSymbols};
}
