// A selection mode changes how a tap updates the current set. Dragging
// always adds cells; dragging from an already selected cell does not toggle it.
export const SELECTION_MODE_KEY = 'sudokupadx:selection-mode:v1';

export function normalizeSelectionMode(value) {
  return value === 'multiple' ? 'multiple' : 'single';
}

export function readSelectionMode(storage) {
  try { return normalizeSelectionMode(storage.getItem(SELECTION_MODE_KEY)); }
  catch { return 'single'; }
}

export function switchSelectionMode(current) {
  return current === 'multiple' ? 'single' : 'multiple';
}

export function selectionAfterModeChange(mode, selectedCells) {
  return mode === 'multiple' ? [...selectedCells] :
    selectedCells.length ? [selectedCells.at(-1)] : [];
}

export function tapSelection(mode, selectedCells, index) {
  if (index < 0) return mode === 'multiple' ? [...selectedCells] : [];
  if (mode !== 'multiple') return [index];
  return selectedCells.includes(index) ?
    selectedCells.filter(cell => cell !== index) : [...selectedCells, index];
}

export function dragSelection(mode, selectedCells, startIndex, draggedIndices) {
  const next = mode === 'multiple' ? [...selectedCells] : [];
  const seen = new Set(next);
  for (const index of [startIndex, ...draggedIndices]) {
    if (index >= 0 && !seen.has(index)) {
      next.push(index);
      seen.add(index);
    }
  }
  return next;
}
