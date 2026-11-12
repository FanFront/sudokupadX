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

  // Dimensions describe the canvas, not necessarily a Sudoku grid.
  // Even a 15x15 canvas (Sudokuvania 2's prologue) can contain overlapping
  // 6x6 and 9x9 puzzles. Cells in their intersection belong to BOTH grids,
  // while cells that merely share a canvas row must not conflict.
  const squareSectors = (puzzle.sectors || []).filter(sector => {
    const {left,top,width,height} = sector || {};
    return [left,top,width,height].every(Number.isInteger) &&
      left >= 0 && top >= 0 && width === height && width >= 4 && width <= 16 &&
      left + width <= cols && top + height <= rows;
  });
  // On standalone small boards a square story panel is not enough evidence
  // to override the ordinary whole-board Sudoku. Look for an authored grid.
  const localGrids = rows <= 16 && cols <= 16
    ? squareSectors.filter(sector =>
        /\bsudoku\b|数独/i.test(String(sector.rules || '')) ||
        /\bgrid\b/i.test(String(sector.title || '')))
    : squareSectors;
  if (localGrids.length) {
    for (const sector of localGrids) {
      const {left,top,width,height} = sector;
      addRowsAndColumns(left, top, width, height);

      // Author-declared standard boxes are genuine houses too. Adventure
      // SCLs often omit regions[] because their boxes are drawn as artwork.
      // Never guess boxes for a grid with custom/unknown region rules.
      const box = String(sector.rules || '').match(
        /(\d{1,2})\s*[x×]\s*(\d{1,2})\s*(?:box(?:es)?|宫)/i
      );
      if (!box) continue;
      const boxWidth = Number(box[1]), boxHeight = Number(box[2]);
      if (!boxWidth || !boxHeight || boxWidth * boxHeight !== width ||
          width % boxWidth || height % boxHeight) continue;
      for (let r = top; r < top + height; r += boxHeight) {
        for (let c = left; c < left + width; c += boxWidth) {
          add(Array.from({length:boxWidth * boxHeight}, (_,i) =>
            (r + Math.floor(i / boxWidth)) * cols + c + i % boxWidth));
        }
      }
    }
  } else if (rows <= 16 && cols <= 16) {
    addRowsAndColumns(0, 0, cols, rows);
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
