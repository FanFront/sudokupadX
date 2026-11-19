// Proof-enabled MIT sudoku-core 4.1.1 build from FanFront/sudokuCoach.
// Adds candidate-level chain and colour proof metadata; see THIRD_PARTY_NOTICES.md.
/*! sudoku-core 4.1.1 • MIT © Komeil Mehranfar. See SUDOKU-CORE-LICENSE.txt. Source: github.com/komeilmehranfar/sudoku-core @ 7fe225d. */

// sudoku-core/src/board/constants.ts
var BOARD_SIZE = 9;
var CELL_COUNT = BOARD_SIZE * BOARD_SIZE;
var BOX_SIZE = 3;
var FULL_CANDIDATES = 511;
var DIFFICULTY_L1 = "L1";
var DIFFICULTY_L2 = "L2";
var DIFFICULTY_L3 = "L3";
var DIFFICULTY_L4 = "L4";
var DIFFICULTY_L5 = "L5";
var DIFFICULTY_L6 = "L6";
var DIFFICULTY_L7 = "L7";
var DIFFICULTY_L8 = "L8";
var DIFFICULTY_L9 = "L9";
var DIFFICULTY_L10 = "L10";
var DIFFICULTIES = [
  DIFFICULTY_L1,
  DIFFICULTY_L2,
  DIFFICULTY_L3,
  DIFFICULTY_L4,
  DIFFICULTY_L5,
  DIFFICULTY_L6,
  DIFFICULTY_L7,
  DIFFICULTY_L8,
  DIFFICULTY_L9,
  DIFFICULTY_L10
];
var STEP_TYPE = {
  VALUE: "value",
  ELIMINATION: "elimination",
  ADD: "add"
};

// sudoku-core/src/board/candidates.ts
function digitBit(digit) {
  return 1 << digit - 1;
}
function hasDigit(mask, digit) {
  return (mask & digitBit(digit)) !== 0;
}
function removeDigit(mask, digit) {
  return mask & ~digitBit(digit);
}
function addDigit(mask, digit) {
  return mask | digitBit(digit);
}
function candidateCount(mask) {
  let n = 0;
  let m = mask;
  while (m) {
    n += m & 1;
    m >>= 1;
  }
  return n;
}
function singleDigit(mask) {
  if (candidateCount(mask) !== 1) return null;
  for (let d = 1; d <= 9; d++) {
    if (hasDigit(mask, d)) return d;
  }
  return null;
}
function digitsFromMask(mask) {
  const digits = [];
  for (let d = 1; d <= 9; d++) {
    if (hasDigit(mask, d)) digits.push(d);
  }
  return digits;
}
function maskFromDigits(digits) {
  return digits.reduce((mask, d) => addDigit(mask, d), 0);
}
function fullCandidates() {
  return FULL_CANDIDATES;
}

// sudoku-core/src/board/houses.ts
function buildHouses() {
  const rows = [];
  const cols = [];
  const boxes = [];
  for (let i = 0; i < BOARD_SIZE; i++) {
    const row = [];
    const col = [];
    const box = [];
    for (let j = 0; j < BOARD_SIZE; j++) {
      row.push(BOARD_SIZE * i + j);
      col.push(BOARD_SIZE * j + i);
    }
    const boxRow = Math.floor(i / BOX_SIZE) * BOX_SIZE;
    const boxCol = i % BOX_SIZE * BOX_SIZE;
    for (let r = 0; r < BOX_SIZE; r++) {
      for (let c = 0; c < BOX_SIZE; c++) {
        box.push((boxRow + r) * BOARD_SIZE + (boxCol + c));
      }
    }
    rows.push(row);
    cols.push(col);
    boxes.push(box);
  }
  return [rows, cols, boxes];
}
var HOUSES = buildHouses();
var CELL_HOUSES = Array.from({ length: CELL_COUNT }, (_, index) => {
  const row = Math.floor(index / BOARD_SIZE);
  const col = index % BOARD_SIZE;
  const box = Math.floor(row / BOX_SIZE) * BOX_SIZE + Math.floor(col / BOX_SIZE);
  return [row, col, box];
});
function peersOf(cellIndex) {
  const [row, col, box] = CELL_HOUSES[cellIndex];
  const set = /* @__PURE__ */ new Set([
    ...HOUSES[0][row],
    ...HOUSES[1][col],
    ...HOUSES[2][box]
  ]);
  set.delete(cellIndex);
  return [...set];
}
function sameHouse(a, b) {
  if (a === b) return true;
  const [ra, ca, ba] = CELL_HOUSES[a];
  const [rb, cb, bb] = CELL_HOUSES[b];
  return ra === rb || ca === cb || ba === bb;
}

// sudoku-core/src/board/board.ts
function createEmptyGrid() {
  return {
    values: Array(CELL_COUNT).fill(0),
    candidates: Array(CELL_COUNT).fill(FULL_CANDIDATES)
  };
}
function cloneGrid(state) {
  return {
    values: state.values.slice(),
    candidates: state.candidates.slice()
  };
}
function boardFromPublic(board) {
  if (board.length !== CELL_COUNT) {
    throw new Error(`Board must have ${CELL_COUNT} cells, got ${board.length}`);
  }
  const state = createEmptyGrid();
  for (let i = 0; i < CELL_COUNT; i++) {
    const value = board[i];
    if (value == null) continue;
    if (!Number.isInteger(value) || value < 1 || value > 9) {
      const fix = value === 0 ? " (use null for empty cells)" : "";
      throw new Error(
        `Invalid cell value at ${i}: ${JSON.stringify(
          value
        )}, expected 1\u20139 or null${fix}`
      );
    }
    if (!placeValue(state, i, value)) {
      throw new Error(`Conflicting value ${value} at index ${i}`);
    }
  }
  return state;
}
function boardToPublic(state) {
  return state.values.map((v) => v === 0 ? null : v);
}
function placeValue(state, index, digit) {
  if (state.values[index] === digit) return true;
  if (state.values[index] !== 0) return false;
  for (const peer of peersOf(index)) {
    if (state.values[peer] === digit) return false;
  }
  state.values[index] = digit;
  state.candidates[index] = 0;
  for (const peer of peersOf(index)) {
    if (state.values[peer] !== 0) continue;
    state.candidates[peer] = removeDigit(state.candidates[peer], digit);
  }
  return true;
}
function clearValue(state, index) {
  const digit = state.values[index];
  if (digit === 0) return;
  state.values[index] = 0;
  rebuildCandidates(state);
}
function rebuildCandidates(state) {
  state.candidates = state.values.map((v) => v === 0 ? fullCandidates() : 0);
  for (let i = 0; i < CELL_COUNT; i++) {
    const digit = state.values[i];
    if (digit === 0) continue;
    for (const peer of peersOf(i)) {
      if (state.values[peer] !== 0) continue;
      state.candidates[peer] = removeDigit(state.candidates[peer], digit);
    }
  }
}
function isComplete(state) {
  return state.values.every((v) => v !== 0);
}
function eliminateCandidate(state, index, digit) {
  if (state.values[index] !== 0) return false;
  const before = state.candidates[index];
  const after = removeDigit(before, digit);
  if (before === after) return false;
  state.candidates[index] = after;
  return true;
}
function addCandidate(state, index, digit) {
  if (state.values[index] !== 0) return false;
  const before = state.candidates[index];
  const after = addDigit(before, digit);
  if (before === after) return false;
  state.candidates[index] = after;
  return true;
}

// sudoku-core/src/tactics/types.ts
function step(tactic, updates, teaching) {
  var _a, _b, _c;
  return {
    ...teaching?.proof ? { proof: teaching.proof } : {},
    strategy: tactic.title,
    updates,
    type: tactic.type,
    ...((_a = teaching == null ? void 0 : teaching.patternCells) == null ? void 0 : _a.length) ? { patternCells: teaching.patternCells } : {},
    ...((_b = teaching == null ? void 0 : teaching.patternDigits) == null ? void 0 : _b.length) ? { patternDigits: teaching.patternDigits } : {},
    ...((_c = teaching == null ? void 0 : teaching.regionCells) == null ? void 0 : _c.length) ? { regionCells: teaching.regionCells } : {}
  };
}
function regionFromCells(cells) {
  const set = /* @__PURE__ */ new Set();
  for (const c of cells) {
    const [r, col, b] = CELL_HOUSES[c];
    for (const idx of HOUSES[0][r]) set.add(idx);
    for (const idx of HOUSES[1][col]) set.add(idx);
    for (const idx of HOUSES[2][b]) set.add(idx);
  }
  return [...set];
}

// sudoku-core/src/tactics/names.ts
var TACTIC_ID = {
  MEDUSA_3D: "3d-medusa",
  AIC: "aic",
  BUG_PLUS_ONE: "bug-plus-one",
  CRANE: "crane",
  EMPTY_RECTANGLE: "empty-rectangle",
  FINNED_JELLYFISH: "finned-jellyfish",
  FINNED_SWORDFISH: "finned-swordfish",
  FINNED_X_WING: "finned-x-wing",
  HIDDEN_GROUPS: "hidden-groups",
  HIDDEN_PAIR: "hidden-pair",
  HIDDEN_QUAD: "hidden-quad",
  HIDDEN_SINGLE: "hidden-single",
  HIDDEN_TRIPLE: "hidden-triple",
  JELLYFISH: "jellyfish",
  NAKED_PAIR: "naked-pair",
  NAKED_QUAD: "naked-quad",
  NAKED_SINGLE: "naked-single",
  NAKED_TRIPLE: "naked-triple",
  NISHIO: "nishio",
  OPEN_SINGLES: "open-singles",
  POINTING_ELIMINATION: "pointing-elimination",
  SIMPLE_COLOURING: "simple-colouring",
  SKYSCRAPER: "skyscraper",
  SWORDFISH: "swordfish",
  TWO_STRING_KITE: "two-string-kite",
  UNIQUE_RECTANGLE: "unique-rectangle",
  W_WING: "w-wing",
  WXYZ_WING: "wxyz-wing",
  X_CHAIN: "x-chain",
  X_WING: "x-wing",
  XY_CHAIN: "xy-chain",
  XYZ_WING: "xyz-wing",
  Y_WING: "y-wing"
};
var STRATEGY = {
  MEDUSA_3D: "3D-Medusa Strategy",
  AIC: "AIC Strategy",
  BUG_PLUS_ONE: "BUG+1 Strategy",
  CRANE: "Crane Strategy",
  EMPTY_RECTANGLE: "Empty Rectangle Strategy",
  FINNED_JELLYFISH: "Finned Jellyfish Strategy",
  FINNED_SWORDFISH: "Finned Swordfish Strategy",
  FINNED_X_WING: "Finned X-Wing Strategy",
  HIDDEN_GROUPS: "Hidden Groups Strategy",
  HIDDEN_PAIR: "Hidden Pair Strategy",
  HIDDEN_QUAD: "Hidden Quad Strategy",
  HIDDEN_SINGLE: "Single Candidate Strategy",
  HIDDEN_TRIPLE: "Hidden Triple Strategy",
  JELLYFISH: "Jellyfish Strategy",
  NAKED_PAIR: "Naked Pair Strategy",
  NAKED_QUAD: "Naked Quadruple Strategy",
  NAKED_SINGLE: "Visual Elimination Strategy",
  NAKED_TRIPLE: "Naked Triplet Strategy",
  NISHIO: "Nishio Forcing Chain Strategy",
  OPEN_SINGLES: "Open Singles Strategy",
  POINTING_ELIMINATION: "Pointing Elimination Strategy",
  SIMPLE_COLOURING: "Simple Colouring Strategy",
  SKYSCRAPER: "Skyscraper Strategy",
  SWORDFISH: "Swordfish Strategy",
  TWO_STRING_KITE: "Two-String-Kite Strategy",
  UNIQUE_RECTANGLE: "Unique Rectangle Strategy",
  W_WING: "W-Wing Strategy",
  WXYZ_WING: "WXYZ-Wing Strategy",
  X_CHAIN: "X-Chain Strategy",
  X_WING: "X-Wing Strategy",
  XY_CHAIN: "XY-Chain Strategy",
  XYZ_WING: "XYZ-Wing Strategy",
  Y_WING: "Y-Wing Strategy"
};

// sudoku-core/src/tactics/open-singles.ts
var openSinglesTactic = {
  id: TACTIC_ID.OPEN_SINGLES,
  title: STRATEGY.OPEN_SINGLES,
  score: 0.1,
  rank: 1,
  type: STEP_TYPE.VALUE,
  find(state) {
    for (const group of HOUSES) {
      for (const house of group) {
        const empty = [];
        const used = /* @__PURE__ */ new Set();
        for (const idx of house) {
          const v = state.values[idx];
          if (v === 0) empty.push(idx);
          else used.add(v);
        }
        if (empty.length !== 1) continue;
        const remaining = [];
        for (let d = 1; d <= BOARD_SIZE; d++) {
          if (!used.has(d)) remaining.push(d);
        }
        if (remaining.length !== 1) continue;
        const index = empty[0];
        if (!digitsFromMask(state.candidates[index]).includes(remaining[0])) {
          continue;
        }
        return step(
          { title: STRATEGY.OPEN_SINGLES, type: STEP_TYPE.VALUE },
          [{ index, filledValue: remaining[0] }],
          {
            patternCells: [index],
            regionCells: [...house]
          }
        );
      }
    }
    return null;
  }
};

// sudoku-core/src/tactics/naked-single.ts
var nakedSingleTactic = {
  id: TACTIC_ID.NAKED_SINGLE,
  title: STRATEGY.NAKED_SINGLE,
  score: 9,
  rank: 2.3,
  type: STEP_TYPE.VALUE,
  find(state) {
    for (let i = 0; i < CELL_COUNT; i++) {
      if (state.values[i] !== 0) continue;
      const digit = singleDigit(state.candidates[i]);
      if (digit == null) continue;
      return step(
        { title: STRATEGY.NAKED_SINGLE, type: STEP_TYPE.VALUE },
        [{ index: i, filledValue: digit }],
        {
          patternCells: [i],
          regionCells: regionFromCells([i])
        }
      );
    }
    return null;
  }
};

// sudoku-core/src/tactics/hidden-single.ts
var hiddenSingleTactic = {
  id: TACTIC_ID.HIDDEN_SINGLE,
  title: STRATEGY.HIDDEN_SINGLE,
  score: 8,
  rank: 1.5,
  type: STEP_TYPE.VALUE,
  find(state) {
    for (const group of HOUSES) {
      for (const house of group) {
        for (let digit = 1; digit <= BOARD_SIZE; digit++) {
          const cells = [];
          for (const idx of house) {
            if (state.values[idx] !== 0) continue;
            if (hasDigit(state.candidates[idx], digit)) cells.push(idx);
            if (cells.length > 1) break;
          }
          if (cells.length === 1) {
            return step(
              { title: STRATEGY.HIDDEN_SINGLE, type: STEP_TYPE.VALUE },
              [{ index: cells[0], filledValue: digit }],
              {
                patternCells: [cells[0]],
                regionCells: [...house]
              }
            );
          }
        }
      }
    }
    return null;
  }
};

// sudoku-core/src/tactics/naked-pair.ts
var nakedPairTactic = {
  id: TACTIC_ID.NAKED_PAIR,
  title: STRATEGY.NAKED_PAIR,
  score: 50,
  rank: 3,
  type: STEP_TYPE.ELIMINATION,
  find(state) {
    for (const group of HOUSES) {
      for (const house of group) {
        const pairCells = [];
        for (const idx of house) {
          if (state.values[idx] !== 0) continue;
          if (candidateCount(state.candidates[idx]) === 2) {
            pairCells.push({ index: idx, mask: state.candidates[idx] });
          }
        }
        for (let a = 0; a < pairCells.length; a++) {
          for (let b = a + 1; b < pairCells.length; b++) {
            if (pairCells[a].mask !== pairCells[b].mask) continue;
            const digits = digitsFromMask(pairCells[a].mask);
            const locked = /* @__PURE__ */ new Set([pairCells[a].index, pairCells[b].index]);
            const updates = [];
            for (const idx of house) {
              if (locked.has(idx) || state.values[idx] !== 0) continue;
              for (const digit of digits) {
                if (hasDigit(state.candidates[idx], digit)) {
                  updates.push({ index: idx, eliminatedCandidate: digit });
                }
              }
            }
            if (updates.length > 0) {
              return step(
                { title: STRATEGY.NAKED_PAIR, type: STEP_TYPE.ELIMINATION },
                updates,
                {
                  patternCells: [pairCells[a].index, pairCells[b].index],
                  patternDigits: digits,
                  regionCells: [...house]
                }
              );
            }
          }
        }
      }
    }
    return null;
  }
};

// sudoku-core/src/tactics/locked-candidates.ts
var pointingEliminationTactic = {
  id: TACTIC_ID.POINTING_ELIMINATION,
  title: STRATEGY.POINTING_ELIMINATION,
  score: 80,
  rank: 2.6,
  type: STEP_TYPE.ELIMINATION,
  find(state) {
    for (let houseType = 0; houseType < 3; houseType++) {
      for (let houseIndex = 0; houseIndex < BOARD_SIZE; houseIndex++) {
        const house = HOUSES[houseType][houseIndex];
        for (let digit = 1; digit <= BOARD_SIZE; digit++) {
          const cells = [];
          for (const idx of house) {
            if (state.values[idx] !== 0) continue;
            if (hasDigit(state.candidates[idx], digit)) cells.push(idx);
          }
          if (cells.length < 2) continue;
          let sameAlt = true;
          let sameAltTwo = true;
          let altId = -1;
          let altTwoId = -1;
          for (const cell of cells) {
            const houses = CELL_HOUSES[cell];
            const newAlt = houseType === 2 ? houses[0] : houses[2];
            const newAltTwo = houseType === 2 ? houses[1] : houses[2];
            if (altId === -1) {
              altId = newAlt;
              altTwoId = newAltTwo;
            } else {
              if (newAlt !== altId) sameAlt = false;
              if (newAltTwo !== altTwoId) sameAltTwo = false;
            }
          }
          if (!sameAlt && !sameAltTwo) continue;
          const altHouseType = houseType === 2 ? sameAlt ? 0 : 1 : 2;
          const altHouse = HOUSES[altHouseType][CELL_HOUSES[cells[0]][altHouseType]];
          const cellSet = new Set(cells);
          const updates = [];
          for (const idx of altHouse) {
            if (cellSet.has(idx)) continue;
            if (state.values[idx] !== 0) continue;
            if (!hasDigit(state.candidates[idx], digit)) continue;
            updates.push({ index: idx, eliminatedCandidate: digit });
          }
          if (updates.length > 0) {
            return step(
              {
                title: STRATEGY.POINTING_ELIMINATION,
                type: STEP_TYPE.ELIMINATION
              },
              updates,
              {
                patternCells: cells,
                patternDigits: [digit],
                regionCells: [.../* @__PURE__ */ new Set([...house, ...altHouse])]
              }
            );
          }
        }
      }
    }
    return null;
  }
};

// sudoku-core/src/tactics/hidden-pair.ts
var hiddenPairTactic = {
  id: TACTIC_ID.HIDDEN_PAIR,
  title: STRATEGY.HIDDEN_PAIR,
  score: 90,
  rank: 3.4,
  type: STEP_TYPE.ELIMINATION,
  find(state) {
    for (const group of HOUSES) {
      for (const house of group) {
        const digitCells = Array.from({ length: 10 }, () => []);
        for (const idx of house) {
          if (state.values[idx] !== 0) continue;
          for (const d of digitsFromMask(state.candidates[idx])) {
            digitCells[d].push(idx);
          }
        }
        for (let d1 = 1; d1 <= BOARD_SIZE; d1++) {
          if (digitCells[d1].length !== 2) continue;
          for (let d2 = d1 + 1; d2 <= BOARD_SIZE; d2++) {
            if (digitCells[d2].length !== 2) continue;
            const a = digitCells[d1];
            const b = digitCells[d2];
            if (a[0] !== b[0] || a[1] !== b[1]) continue;
            const updates = [];
            for (const idx of a) {
              for (let d = 1; d <= BOARD_SIZE; d++) {
                if (d === d1 || d === d2) continue;
                if (hasDigit(state.candidates[idx], d)) {
                  updates.push({ index: idx, eliminatedCandidate: d });
                }
              }
            }
            if (updates.length > 0) {
              return step(
                { title: STRATEGY.HIDDEN_PAIR, type: STEP_TYPE.ELIMINATION },
                updates,
                {
                  patternCells: [a[0], a[1]],
                  patternDigits: [d1, d2],
                  regionCells: [...house]
                }
              );
            }
          }
        }
      }
    }
    return null;
  }
};

// sudoku-core/src/tactics/hidden-groups.ts
function findHiddenGroup(state, size, title) {
  for (const group of HOUSES) {
    for (const house of group) {
      const digitCells = Array.from({ length: 10 }, () => []);
      for (const idx of house) {
        if (state.values[idx] !== 0) continue;
        for (const d of digitsFromMask(state.candidates[idx])) {
          digitCells[d].push(idx);
        }
      }
      const digits = [];
      for (let d = 1; d <= BOARD_SIZE; d++) {
        if (digitCells[d].length >= 1 && digitCells[d].length <= size) {
          digits.push(d);
        }
      }
      if (digits.length < size) continue;
      const combos = combinations(digits.length, size);
      for (const idxs of combos) {
        const chosen = idxs.map((i) => digits[i]);
        const cells = /* @__PURE__ */ new Set();
        for (const d of chosen) {
          for (const c of digitCells[d]) cells.add(c);
        }
        if (cells.size !== size) continue;
        const updates = [];
        const digitSet = new Set(chosen);
        for (const idx of cells) {
          for (let d = 1; d <= BOARD_SIZE; d++) {
            if (digitSet.has(d)) continue;
            if (hasDigit(state.candidates[idx], d)) {
              updates.push({ index: idx, eliminatedCandidate: d });
            }
          }
        }
        if (updates.length > 0) {
          return step({ title, type: STEP_TYPE.ELIMINATION }, updates, {
            patternCells: [...cells],
            patternDigits: chosen,
            regionCells: [...house]
          });
        }
      }
    }
  }
  return null;
}
function combinations(n, k) {
  const result = [];
  const cur = [];
  function dfs(start) {
    if (cur.length === k) {
      result.push(cur.slice());
      return;
    }
    for (let i = start; i < n; i++) {
      cur.push(i);
      dfs(i + 1);
      cur.pop();
    }
  }
  dfs(0);
  return result;
}
var hiddenTripleTactic = {
  id: TACTIC_ID.HIDDEN_TRIPLE,
  title: STRATEGY.HIDDEN_TRIPLE,
  score: 100,
  rank: 3.5,
  type: STEP_TYPE.ELIMINATION,
  find(state) {
    return findHiddenGroup(state, 3, STRATEGY.HIDDEN_TRIPLE);
  }
};
var hiddenQuadTactic = {
  id: TACTIC_ID.HIDDEN_QUAD,
  title: STRATEGY.HIDDEN_QUAD,
  score: 140,
  rank: 3.7,
  type: STEP_TYPE.ELIMINATION,
  find(state) {
    return findHiddenGroup(state, 4, STRATEGY.HIDDEN_QUAD);
  }
};
var hiddenGroupsTactic = {
  id: TACTIC_ID.HIDDEN_GROUPS,
  title: STRATEGY.HIDDEN_GROUPS,
  score: 100,
  rank: 3.5,
  type: STEP_TYPE.ELIMINATION,
  find(state) {
    var _a;
    return (_a = findHiddenGroup(state, 3, STRATEGY.HIDDEN_GROUPS)) != null ? _a : findHiddenGroup(state, 4, STRATEGY.HIDDEN_GROUPS);
  }
};

// sudoku-core/src/tactics/naked-triple.ts
var nakedTripleTactic = {
  id: TACTIC_ID.NAKED_TRIPLE,
  title: STRATEGY.NAKED_TRIPLE,
  score: 100,
  rank: 3.6,
  type: STEP_TYPE.ELIMINATION,
  find(state) {
    for (const group of HOUSES) {
      for (const house of group) {
        const cells = house.filter(
          (idx) => state.values[idx] === 0 && candidateCount(state.candidates[idx]) >= 2 && candidateCount(state.candidates[idx]) <= 3
        );
        for (let a = 0; a < cells.length; a++) {
          for (let b = a + 1; b < cells.length; b++) {
            for (let c = b + 1; c < cells.length; c++) {
              const union = maskFromDigits([
                ...digitsFromMask(state.candidates[cells[a]]),
                ...digitsFromMask(state.candidates[cells[b]]),
                ...digitsFromMask(state.candidates[cells[c]])
              ]);
              if (candidateCount(union) !== 3) continue;
              const digits = digitsFromMask(union);
              const locked = /* @__PURE__ */ new Set([cells[a], cells[b], cells[c]]);
              const updates = [];
              for (const idx of house) {
                if (locked.has(idx) || state.values[idx] !== 0) continue;
                for (const digit of digits) {
                  if (hasDigit(state.candidates[idx], digit)) {
                    updates.push({ index: idx, eliminatedCandidate: digit });
                  }
                }
              }
              if (updates.length > 0) {
                return step(
                  { title: STRATEGY.NAKED_TRIPLE, type: STEP_TYPE.ELIMINATION },
                  updates,
                  {
                    patternCells: [cells[a], cells[b], cells[c]],
                    patternDigits: digits,
                    regionCells: [...house]
                  }
                );
              }
            }
          }
        }
      }
    }
    return null;
  }
};

// sudoku-core/src/tactics/naked-quad.ts
var nakedQuadTactic = {
  id: TACTIC_ID.NAKED_QUAD,
  title: STRATEGY.NAKED_QUAD,
  score: 120,
  rank: 3.8,
  type: STEP_TYPE.ELIMINATION,
  find(state) {
    for (const group of HOUSES) {
      for (const house of group) {
        const cells = house.filter(
          (idx) => state.values[idx] === 0 && candidateCount(state.candidates[idx]) >= 2 && candidateCount(state.candidates[idx]) <= 4
        );
        for (let a = 0; a < cells.length; a++) {
          for (let b = a + 1; b < cells.length; b++) {
            for (let c = b + 1; c < cells.length; c++) {
              for (let d = c + 1; d < cells.length; d++) {
                const idxs = [cells[a], cells[b], cells[c], cells[d]];
                const union = maskFromDigits(
                  idxs.flatMap((i) => digitsFromMask(state.candidates[i]))
                );
                if (candidateCount(union) !== 4) continue;
                const digits = digitsFromMask(union);
                const locked = new Set(idxs);
                const updates = [];
                for (const idx of house) {
                  if (locked.has(idx) || state.values[idx] !== 0) continue;
                  for (const digit of digits) {
                    if (hasDigit(state.candidates[idx], digit)) {
                      updates.push({ index: idx, eliminatedCandidate: digit });
                    }
                  }
                }
                if (updates.length > 0) {
                  return step(
                    {
                      title: STRATEGY.NAKED_QUAD,
                      type: STEP_TYPE.ELIMINATION
                    },
                    updates,
                    {
                      patternCells: idxs,
                      patternDigits: digits,
                      regionCells: [...house]
                    }
                  );
                }
              }
            }
          }
        }
      }
    }
    return null;
  }
};

// sudoku-core/src/tactics/fish.ts
function findBasicFish(state, size, title) {
  const rowHit = findFishOrientation(state, size, 0, 1, title);
  if (rowHit) return rowHit;
  return findFishOrientation(state, size, 1, 0, title);
}
function findFishOrientation(state, size, primaryType, secondaryType, title) {
  for (let digit = 1; digit <= BOARD_SIZE; digit++) {
    const lines = [];
    for (let i = 0; i < BOARD_SIZE; i++) {
      const house = HOUSES[primaryType][i];
      const seconds = [];
      for (let j = 0; j < BOARD_SIZE; j++) {
        const idx = house[j];
        if (state.values[idx] !== 0) continue;
        if (hasDigit(state.candidates[idx], digit)) seconds.push(j);
      }
      if (seconds.length >= 2 && seconds.length <= size) {
        lines.push({ line: i, seconds });
      }
    }
    if (lines.length < size) continue;
    const combo = combinations2(lines.length, size);
    for (const idxs of combo) {
      const chosen = idxs.map((i) => lines[i]);
      const secondarySet = /* @__PURE__ */ new Set();
      for (const line of chosen) {
        for (const s of line.seconds) secondarySet.add(s);
      }
      if (secondarySet.size !== size) continue;
      const primarySet = new Set(chosen.map((c) => c.line));
      const updates = [];
      for (const sec of secondarySet) {
        const house = HOUSES[secondaryType][sec];
        for (let p = 0; p < BOARD_SIZE; p++) {
          if (primarySet.has(p)) continue;
          const idx = house[p];
          if (state.values[idx] !== 0) continue;
          if (hasDigit(state.candidates[idx], digit)) {
            updates.push({ index: idx, eliminatedCandidate: digit });
          }
        }
      }
      if (updates.length > 0) {
        const patternCells = [];
        for (const line of chosen) {
          for (const s of line.seconds) {
            const idx = primaryType === 0 ? line.line * BOARD_SIZE + s : s * BOARD_SIZE + line.line;
            patternCells.push(idx);
          }
        }
        const regionCells = [
          .../* @__PURE__ */ new Set([
            ...chosen.flatMap((c) => [...HOUSES[primaryType][c.line]]),
            ...[...secondarySet].flatMap((s) => [...HOUSES[secondaryType][s]])
          ])
        ];
        return step({ title, type: STEP_TYPE.ELIMINATION }, updates, {
          patternCells,
          regionCells
        });
      }
    }
  }
  return null;
}
function combinations2(n, k) {
  const result = [];
  const cur = [];
  function dfs(start) {
    if (cur.length === k) {
      result.push(cur.slice());
      return;
    }
    for (let i = start; i < n; i++) {
      cur.push(i);
      dfs(i + 1);
      cur.pop();
    }
  }
  dfs(0);
  return result;
}
var xWingTactic = {
  id: TACTIC_ID.X_WING,
  title: STRATEGY.X_WING,
  score: 120,
  rank: 3.2,
  type: STEP_TYPE.ELIMINATION,
  find(state) {
    return findBasicFish(state, 2, STRATEGY.X_WING);
  }
};
var swordfishTactic = {
  id: TACTIC_ID.SWORDFISH,
  title: STRATEGY.SWORDFISH,
  score: 200,
  rank: 3.8,
  type: STEP_TYPE.ELIMINATION,
  find(state) {
    return findBasicFish(state, 3, STRATEGY.SWORDFISH);
  }
};
var jellyfishTactic = {
  id: TACTIC_ID.JELLYFISH,
  title: STRATEGY.JELLYFISH,
  score: 280,
  rank: 5.2,
  type: STEP_TYPE.ELIMINATION,
  find(state) {
    return findBasicFish(state, 4, STRATEGY.JELLYFISH);
  }
};

// sudoku-core/src/tactics/turbot.ts
function elimTails(state, digit, t1, t2) {
  if (t1 === t2) return [];
  const peers1 = new Set(peersOf(t1));
  const updates = [];
  for (const idx of peersOf(t2)) {
    if (!peers1.has(idx) || idx === t1 || idx === t2) continue;
    if (state.values[idx] !== 0) continue;
    if (hasDigit(state.candidates[idx], digit)) {
      updates.push({ index: idx, eliminatedCandidate: digit });
    }
  }
  return updates;
}
function findSkyscraper(state) {
  for (let digit = 1; digit <= BOARD_SIZE; digit++) {
    const rowPairs = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      const cols = [];
      for (let c = 0; c < BOARD_SIZE; c++) {
        const idx = r * 9 + c;
        if (state.values[idx] !== 0) continue;
        if (hasDigit(state.candidates[idx], digit)) cols.push(c);
      }
      if (cols.length === 2) rowPairs.push({ row: r, cols });
    }
    for (let i = 0; i < rowPairs.length; i++) {
      for (let j = i + 1; j < rowPairs.length; j++) {
        const a = rowPairs[i];
        const b = rowPairs[j];
        const shared = a.cols.filter((c) => b.cols.includes(c));
        if (shared.length !== 1) continue;
        const sc = shared[0];
        const cA = a.cols.find((c) => c !== sc);
        const cB = b.cols.find((c) => c !== sc);
        if (cA === cB) continue;
        const t1 = a.row * 9 + cA;
        const t2 = b.row * 9 + cB;
        const linkA = a.row * 9 + sc;
        const linkB = b.row * 9 + sc;
        const updates = elimTails(state, digit, t1, t2);
        if (updates.length > 0) {
          return step(
            { title: STRATEGY.SKYSCRAPER, type: STEP_TYPE.ELIMINATION },
            updates,
            {
              patternCells: [t1, t2, linkA, linkB],
              regionCells: [
                .../* @__PURE__ */ new Set([
                  ...HOUSES[0][a.row],
                  ...HOUSES[0][b.row],
                  ...HOUSES[1][sc]
                ])
              ]
            }
          );
        }
      }
    }
    const colPairs = [];
    for (let c = 0; c < BOARD_SIZE; c++) {
      const rows = [];
      for (let r = 0; r < BOARD_SIZE; r++) {
        const idx = r * 9 + c;
        if (state.values[idx] !== 0) continue;
        if (hasDigit(state.candidates[idx], digit)) rows.push(r);
      }
      if (rows.length === 2) colPairs.push({ col: c, rows });
    }
    for (let i = 0; i < colPairs.length; i++) {
      for (let j = i + 1; j < colPairs.length; j++) {
        const a = colPairs[i];
        const b = colPairs[j];
        const shared = a.rows.filter((r) => b.rows.includes(r));
        if (shared.length !== 1) continue;
        const sr = shared[0];
        const rA = a.rows.find((r) => r !== sr);
        const rB = b.rows.find((r) => r !== sr);
        if (rA === rB) continue;
        const t1 = rA * 9 + a.col;
        const t2 = rB * 9 + b.col;
        const linkA = sr * 9 + a.col;
        const linkB = sr * 9 + b.col;
        const updates = elimTails(state, digit, t1, t2);
        if (updates.length > 0) {
          return step(
            { title: STRATEGY.SKYSCRAPER, type: STEP_TYPE.ELIMINATION },
            updates,
            {
              patternCells: [t1, t2, linkA, linkB],
              regionCells: [
                .../* @__PURE__ */ new Set([
                  ...HOUSES[1][a.col],
                  ...HOUSES[1][b.col],
                  ...HOUSES[0][sr]
                ])
              ]
            }
          );
        }
      }
    }
  }
  return null;
}
function findTwoStringKite(state) {
  for (let digit = 1; digit <= BOARD_SIZE; digit++) {
    const rowPairs = [];
    const colPairs = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      const cols = [];
      for (let c = 0; c < BOARD_SIZE; c++) {
        const idx = r * 9 + c;
        if (state.values[idx] !== 0) continue;
        if (hasDigit(state.candidates[idx], digit)) cols.push(c);
      }
      if (cols.length === 2) rowPairs.push({ row: r, cols });
    }
    for (let c = 0; c < BOARD_SIZE; c++) {
      const rows = [];
      for (let r = 0; r < BOARD_SIZE; r++) {
        const idx = r * 9 + c;
        if (state.values[idx] !== 0) continue;
        if (hasDigit(state.candidates[idx], digit)) rows.push(r);
      }
      if (rows.length === 2) colPairs.push({ col: c, rows });
    }
    for (const rp of rowPairs) {
      for (const cp of colPairs) {
        for (const rc of rp.cols) {
          for (const rr of cp.rows) {
            const rowEnd = rp.row * 9 + rc;
            const colEnd = rr * 9 + cp.col;
            if (rowEnd === colEnd) continue;
            const [, , b1] = CELL_HOUSES[rowEnd];
            const [, , b2] = CELL_HOUSES[colEnd];
            if (b1 !== b2) continue;
            const t1 = rp.row * 9 + (rp.cols[0] === rc ? rp.cols[1] : rp.cols[0]);
            const t2 = (cp.rows[0] === rr ? cp.rows[1] : cp.rows[0]) * 9 + cp.col;
            if (t1 === t2 || t1 === colEnd || t2 === rowEnd) continue;
            const updates = elimTails(state, digit, t1, t2);
            if (updates.length > 0) {
              const boxCells = [...HOUSES[2][b1]];
              const rowCells = [...HOUSES[0][rp.row]];
              const colCells = [...HOUSES[1][cp.col]];
              return step(
                {
                  title: STRATEGY.TWO_STRING_KITE,
                  type: STEP_TYPE.ELIMINATION
                },
                updates,
                {
                  patternCells: [t1, t2, rowEnd, colEnd],
                  regionCells: [
                    .../* @__PURE__ */ new Set([...rowCells, ...colCells, ...boxCells])
                  ]
                }
              );
            }
          }
        }
      }
    }
  }
  return null;
}
function findCrane(state) {
  for (let digit = 1; digit <= BOARD_SIZE; digit++) {
    const boxPairs = [];
    for (const house of HOUSES[2]) {
      const hits = [];
      for (const idx of house) {
        if (state.values[idx] !== 0) continue;
        if (hasDigit(state.candidates[idx], digit)) hits.push(idx);
      }
      if (hits.length === 2) boxPairs.push({ a: hits[0], b: hits[1] });
    }
    const linePairs = [];
    for (let kind = 0; kind <= 1; kind++) {
      for (const house of HOUSES[kind]) {
        const hits = [];
        for (const idx of house) {
          if (state.values[idx] !== 0) continue;
          if (hasDigit(state.candidates[idx], digit)) hits.push(idx);
        }
        if (hits.length === 2) linePairs.push({ a: hits[0], b: hits[1] });
      }
    }
    for (const bp of boxPairs) {
      for (const lp of linePairs) {
        const boxEnds = [bp.a, bp.b];
        const lineEnds = [lp.a, lp.b];
        if (bp.a === lp.a && bp.b === lp.b || bp.a === lp.b && bp.b === lp.a) {
          continue;
        }
        for (const be of boxEnds) {
          for (const le of lineEnds) {
            if (be === le) continue;
            if (!sameHouse(be, le)) continue;
            const t1 = boxEnds[0] === be ? boxEnds[1] : boxEnds[0];
            const t2 = lineEnds[0] === le ? lineEnds[1] : lineEnds[0];
            if (t1 === t2 || t1 === le || t2 === be) continue;
            const updates = elimTails(state, digit, t1, t2);
            if (updates.length > 0) {
              const [, , box] = CELL_HOUSES[be];
              const [lr, lc] = CELL_HOUSES[le];
              const [tr, tc] = CELL_HOUSES[t2];
              const lineHouse = lr === tr ? [...HOUSES[0][lr]] : [...HOUSES[1][lc === tc ? lc : tc]];
              return step(
                { title: STRATEGY.CRANE, type: STEP_TYPE.ELIMINATION },
                updates,
                {
                  patternCells: [t1, t2, be, le],
                  regionCells: [.../* @__PURE__ */ new Set([...HOUSES[2][box], ...lineHouse])]
                }
              );
            }
          }
        }
      }
    }
  }
  return null;
}
var skyscraperTactic = {
  id: TACTIC_ID.SKYSCRAPER,
  title: STRATEGY.SKYSCRAPER,
  score: 150,
  rank: 4,
  type: STEP_TYPE.ELIMINATION,
  find: findSkyscraper
};
var twoStringKiteTactic = {
  id: TACTIC_ID.TWO_STRING_KITE,
  title: STRATEGY.TWO_STRING_KITE,
  score: 150,
  rank: 4,
  type: STEP_TYPE.ELIMINATION,
  find: findTwoStringKite
};
var craneTactic = {
  id: TACTIC_ID.CRANE,
  title: STRATEGY.CRANE,
  score: 160,
  rank: 4.1,
  type: STEP_TYPE.ELIMINATION,
  find: findCrane
};

// sudoku-core/src/tactics/y-wing.ts
var yWingTactic = {
  id: TACTIC_ID.Y_WING,
  title: STRATEGY.Y_WING,
  score: 140,
  rank: 4.2,
  type: STEP_TYPE.ELIMINATION,
  find(state) {
    const bivalue = [];
    for (let i = 0; i < CELL_COUNT; i++) {
      if (state.values[i] !== 0) continue;
      if (candidateCount(state.candidates[i]) !== 2) continue;
      bivalue.push({ index: i, digits: digitsFromMask(state.candidates[i]) });
    }
    for (const pivot of bivalue) {
      const [x, y] = pivot.digits;
      const peers = new Set(peersOf(pivot.index));
      const xz = bivalue.filter(
        (c) => c.index !== pivot.index && peers.has(c.index) && c.digits.includes(x) && !c.digits.includes(y)
      );
      const yz = bivalue.filter(
        (c) => c.index !== pivot.index && peers.has(c.index) && c.digits.includes(y) && !c.digits.includes(x)
      );
      for (const a of xz) {
        const z = a.digits.find((d) => d !== x);
        for (const b of yz) {
          if (!b.digits.includes(z)) continue;
          const peersA = new Set(peersOf(a.index));
          const peersB = peersOf(b.index);
          const updates = [];
          for (const idx of peersB) {
            if (!peersA.has(idx)) continue;
            if (idx === pivot.index || idx === a.index || idx === b.index)
              continue;
            if (state.values[idx] !== 0) continue;
            if (hasDigit(state.candidates[idx], z)) {
              updates.push({ index: idx, eliminatedCandidate: z });
            }
          }
          if (updates.length > 0) {
            const patternCells = [pivot.index, a.index, b.index];
            return step(
              { title: STRATEGY.Y_WING, type: STEP_TYPE.ELIMINATION },
              updates,
              {
                patternCells,
                regionCells: regionFromCells(patternCells)
              }
            );
          }
        }
      }
    }
    return null;
  }
};

// sudoku-core/src/tactics/xyz-wing.ts
var xyzWingTactic = {
  id: TACTIC_ID.XYZ_WING,
  title: STRATEGY.XYZ_WING,
  score: 180,
  rank: 4.4,
  type: STEP_TYPE.ELIMINATION,
  find(state) {
    const cells = [];
    for (let i = 0; i < CELL_COUNT; i++) {
      if (state.values[i] !== 0) continue;
      const n = candidateCount(state.candidates[i]);
      if (n < 2 || n > 3) continue;
      cells.push({ index: i, digits: digitsFromMask(state.candidates[i]) });
    }
    const pivots = cells.filter((c) => c.digits.length === 3);
    const bivalue = cells.filter((c) => c.digits.length === 2);
    for (const pivot of pivots) {
      const [x, y, z] = pivot.digits;
      const peers = new Set(peersOf(pivot.index));
      const wings = bivalue.filter((c) => peers.has(c.index));
      for (let i = 0; i < wings.length; i++) {
        for (let j = i + 1; j < wings.length; j++) {
          const a = wings[i];
          const b = wings[j];
          for (const pair of [
            [x, y, z],
            [x, z, y],
            [y, z, x]
          ]) {
            const [p, q, common] = pair;
            const aOk = a.digits.includes(p) && a.digits.includes(common) && !a.digits.includes(q);
            const bOk = b.digits.includes(q) && b.digits.includes(common) && !b.digits.includes(p);
            if (!aOk || !bOk) continue;
            const peersA = new Set(peersOf(a.index));
            const peersB = peersOf(b.index);
            const updates = [];
            for (const idx of peersB) {
              if (!peersA.has(idx)) continue;
              if (idx === pivot.index || idx === a.index || idx === b.index)
                continue;
              if (!peers.has(idx)) continue;
              if (state.values[idx] !== 0) continue;
              if (hasDigit(state.candidates[idx], common)) {
                updates.push({
                  index: idx,
                  eliminatedCandidate: common
                });
              }
            }
            if (updates.length > 0) {
              const patternCells = [pivot.index, a.index, b.index];
              return step(
                { title: STRATEGY.XYZ_WING, type: STEP_TYPE.ELIMINATION },
                updates,
                {
                  patternCells,
                  regionCells: regionFromCells(patternCells)
                }
              );
            }
          }
        }
      }
    }
    return null;
  }
};

// sudoku-core/src/tactics/w-wing.ts
var wWingTactic = {
  id: TACTIC_ID.W_WING,
  title: STRATEGY.W_WING,
  score: 170,
  rank: 4.3,
  type: STEP_TYPE.ELIMINATION,
  find(state) {
    const cells = [];
    for (let i = 0; i < CELL_COUNT; i++) {
      if (state.values[i] !== 0) continue;
      if (candidateCount(state.candidates[i]) !== 2) continue;
      const [a, b] = digitsFromMask(state.candidates[i]);
      cells.push({ index: i, digits: [a, b] });
    }
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const A = cells[i];
        const B = cells[j];
        const setA = new Set(A.digits);
        if (!setA.has(B.digits[0]) || !setA.has(B.digits[1])) continue;
        if (A.digits[0] === A.digits[1]) continue;
        const x = A.digits[0];
        const z = A.digits[1];
        for (const [linkDigit, elimDigit] of [
          [x, z],
          [z, x]
        ]) {
          if (!strongLinkOnDigit(state, linkDigit, A.index, B.index)) continue;
          const peersA = new Set(peersOf(A.index));
          const updates = [];
          for (const idx of peersOf(B.index)) {
            if (!peersA.has(idx) || idx === A.index || idx === B.index)
              continue;
            if (state.values[idx] !== 0) continue;
            if (hasDigit(state.candidates[idx], elimDigit)) {
              updates.push({ index: idx, eliminatedCandidate: elimDigit });
            }
          }
          if (updates.length > 0) {
            const patternCells = [A.index, B.index];
            return step(
              { title: STRATEGY.W_WING, type: STEP_TYPE.ELIMINATION },
              updates,
              {
                patternCells,
                regionCells: regionFromCells(patternCells)
              }
            );
          }
        }
      }
    }
    return null;
  }
};
function strongLinkOnDigit(state, digit, cellA, cellB) {
  for (const group of HOUSES) {
    for (const house of group) {
      if (!house.includes(cellA) || !house.includes(cellB)) continue;
      const hits = [];
      for (const idx of house) {
        if (state.values[idx] !== 0) continue;
        if (hasDigit(state.candidates[idx], digit)) hits.push(idx);
      }
      if (hits.length === 2 && hits.includes(cellA) && hits.includes(cellB)) {
        return true;
      }
    }
  }
  for (const group of HOUSES) {
    for (const house of group) {
      const hits = [];
      for (const idx of house) {
        if (state.values[idx] !== 0) continue;
        if (hasDigit(state.candidates[idx], digit)) hits.push(idx);
      }
      if (hits.length !== 2) continue;
      const [p, q] = hits;
      if (p === cellA || p === cellB || q === cellA || q === cellB) continue;
      const peersA = peersOf(cellA);
      const peersB = peersOf(cellB);
      if (peersA.includes(p) && peersB.includes(q) || peersA.includes(q) && peersB.includes(p)) {
        if (sameHouse(cellA, cellB)) continue;
        return true;
      }
    }
  }
  return false;
}

// sudoku-core/src/tactics/empty-rectangle.ts
var emptyRectangleTactic = {
  id: TACTIC_ID.EMPTY_RECTANGLE,
  title: STRATEGY.EMPTY_RECTANGLE,
  score: 220,
  rank: 4.6,
  type: STEP_TYPE.ELIMINATION,
  find(state) {
    for (let digit = 1; digit <= BOARD_SIZE; digit++) {
      for (let box = 0; box < BOARD_SIZE; box++) {
        const er = findEmptyRectangle(state, box, digit);
        if (!er) continue;
        const { row: erRow, col: erCol } = er;
        const boxRow0 = Math.floor(box / BOX_SIZE) * BOX_SIZE;
        const boxCol0 = box % BOX_SIZE * BOX_SIZE;
        for (let xCol = 0; xCol < BOARD_SIZE; xCol++) {
          if (xCol === erCol) continue;
          if (xCol >= boxCol0 && xCol < boxCol0 + BOX_SIZE) continue;
          const hits = candidatesInCol(state, xCol, digit);
          if (hits.length !== 2) continue;
          const onErRow = hits.find((i) => Math.floor(i / 9) === erRow);
          if (onErRow == null) continue;
          const remote = hits.find((i) => i !== onErRow);
          const remoteRow = Math.floor(remote / 9);
          const target = remoteRow * 9 + erCol;
          if (state.values[target] !== 0) continue;
          if (!hasDigit(state.candidates[target], digit)) continue;
          const tCol = erCol;
          const tRow = remoteRow;
          const inErBox = tRow >= boxRow0 && tRow < boxRow0 + BOX_SIZE && tCol >= boxCol0 && tCol < boxCol0 + BOX_SIZE;
          if (inErBox) continue;
          const patternCells = [...candidatesInBox(state, box, digit), ...hits];
          return step(
            { title: STRATEGY.EMPTY_RECTANGLE, type: STEP_TYPE.ELIMINATION },
            [{ index: target, eliminatedCandidate: digit }],
            {
              patternCells: [...new Set(patternCells)],
              regionCells: [
                .../* @__PURE__ */ new Set([
                  ...HOUSES[2][box],
                  ...HOUSES[1][xCol],
                  ...HOUSES[1][erCol],
                  ...HOUSES[0][erRow]
                ])
              ]
            }
          );
        }
        for (let yRow = 0; yRow < BOARD_SIZE; yRow++) {
          if (yRow === erRow) continue;
          if (yRow >= boxRow0 && yRow < boxRow0 + BOX_SIZE) continue;
          const hits = candidatesInRow(state, yRow, digit);
          if (hits.length !== 2) continue;
          const onErCol = hits.find((i) => i % 9 === erCol);
          if (onErCol == null) continue;
          const remote = hits.find((i) => i !== onErCol);
          const remoteCol = remote % 9;
          const target = erRow * 9 + remoteCol;
          if (state.values[target] !== 0) continue;
          if (!hasDigit(state.candidates[target], digit)) continue;
          const tRow = erRow;
          const tCol = remoteCol;
          const inErBox = tRow >= boxRow0 && tRow < boxRow0 + BOX_SIZE && tCol >= boxCol0 && tCol < boxCol0 + BOX_SIZE;
          if (inErBox) continue;
          const patternCells = [...candidatesInBox(state, box, digit), ...hits];
          return step(
            { title: STRATEGY.EMPTY_RECTANGLE, type: STEP_TYPE.ELIMINATION },
            [{ index: target, eliminatedCandidate: digit }],
            {
              patternCells: [...new Set(patternCells)],
              regionCells: [
                .../* @__PURE__ */ new Set([
                  ...HOUSES[2][box],
                  ...HOUSES[0][yRow],
                  ...HOUSES[0][erRow],
                  ...HOUSES[1][erCol]
                ])
              ]
            }
          );
        }
      }
    }
    return null;
  }
};
function candidatesInBox(state, box, digit) {
  const hits = [];
  for (const idx of HOUSES[2][box]) {
    if (state.values[idx] !== 0) continue;
    if (hasDigit(state.candidates[idx], digit)) hits.push(idx);
  }
  return hits;
}
function findEmptyRectangle(state, box, digit) {
  const positions = [];
  for (const idx of HOUSES[2][box]) {
    if (state.values[idx] !== 0) continue;
    if (hasDigit(state.candidates[idx], digit)) positions.push(idx);
  }
  if (positions.length < 2) return null;
  const rows = [...new Set(positions.map((i) => Math.floor(i / 9)))];
  const cols = [...new Set(positions.map((i) => i % 9))];
  for (const r of rows) {
    for (const c of cols) {
      if (!positions.every((i) => Math.floor(i / 9) === r || i % 9 === c))
        continue;
      const onRowOnly = positions.some(
        (i) => Math.floor(i / 9) === r && i % 9 !== c
      );
      const onColOnly = positions.some(
        (i) => i % 9 === c && Math.floor(i / 9) !== r
      );
      if (onRowOnly && onColOnly) return { row: r, col: c };
    }
  }
  return null;
}
function candidatesInCol(state, col, digit) {
  const hits = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    const idx = r * 9 + col;
    if (state.values[idx] !== 0) continue;
    if (hasDigit(state.candidates[idx], digit)) hits.push(idx);
  }
  return hits;
}
function candidatesInRow(state, row, digit) {
  const hits = [];
  for (let c = 0; c < BOARD_SIZE; c++) {
    const idx = row * 9 + c;
    if (state.values[idx] !== 0) continue;
    if (hasDigit(state.candidates[idx], digit)) hits.push(idx);
  }
  return hits;
}

// sudoku-core/src/tactics/unique-rectangle.ts
var uniqueRectangleTactic = {
  id: TACTIC_ID.UNIQUE_RECTANGLE,
  title: STRATEGY.UNIQUE_RECTANGLE,
  score: 200,
  rank: 4.8,
  type: STEP_TYPE.ELIMINATION,
  find(state) {
    const empties = [];
    for (let i = 0; i < CELL_COUNT; i++) {
      if (state.values[i] === 0) empties.push(i);
    }
    for (let i = 0; i < empties.length; i++) {
      for (let j = i + 1; j < empties.length; j++) {
        const a = empties[i];
        const b = empties[j];
        const [ra, ca, ba] = CELL_HOUSES[a];
        const [rb, cb, bb] = CELL_HOUSES[b];
        if (ra === rb || ca === cb) continue;
        const c = ra * 9 + cb;
        const d = rb * 9 + ca;
        if (state.values[c] !== 0 || state.values[d] !== 0) continue;
        const corners = [a, b, c, d];
        const boxes = new Set(corners.map((x) => CELL_HOUSES[x][2]));
        if (boxes.size !== 2) continue;
        void ba;
        void bb;
        for (let x = 1; x <= 9; x++) {
          for (let y = x + 1; y <= 9; y++) {
            if (!corners.every((idx) => hasDigit(state.candidates[idx], x)))
              continue;
            if (!corners.every((idx) => hasDigit(state.candidates[idx], y)))
              continue;
            const bivalue = corners.filter(
              (idx) => candidateCount(state.candidates[idx]) === 2 && hasDigit(state.candidates[idx], x) && hasDigit(state.candidates[idx], y)
            );
            if (bivalue.length !== 3) continue;
            const floor = corners.find((idx) => !bivalue.includes(idx));
            if (candidateCount(state.candidates[floor]) <= 2) continue;
            const updates = [];
            for (const digit of [x, y]) {
              if (hasDigit(state.candidates[floor], digit)) {
                updates.push({ index: floor, eliminatedCandidate: digit });
              }
            }
            if (updates.length > 0) {
              return step(
                {
                  title: STRATEGY.UNIQUE_RECTANGLE,
                  type: STEP_TYPE.ELIMINATION
                },
                updates,
                {
                  patternCells: corners,
                  regionCells: regionFromCells(corners)
                }
              );
            }
          }
        }
      }
    }
    return null;
  }
};

// Sudoku Coach: retain the candidate-level proof used by each tactic.
function chainProof(path) {
  return { kind: 'chain', nodes: path };
}

function colourProof(component, colour, adjacency, decode) {
  const positions = new Map(component.map((key, i) => [key, i]));
  const edges = [];
  for (const [i, key] of component.entries()) {
    for (const neighbour of adjacency.get(key) || []) {
      const j = positions.get(neighbour);
      if (j > i) edges.push([i, j]);
    }
  }
  return {
    kind: 'colour',
    nodes: component.map(key => ({ ...decode(key), colour: colour.get(key) })),
    edges
  };
}

function xyProof(state, path, endpointDigit) {
  const nodes = [];
  let incoming = endpointDigit;
  for (const cell of path) {
    const outgoing = digitsFromMask(state.candidates[cell]).find(digit => digit !== incoming);
    nodes.push({ cell, digit: incoming }, { cell, digit: outgoing });
    incoming = outgoing;
  }
  return chainProof(nodes);
}

// sudoku-core/src/tactics/simple-colouring.ts
var simpleColouringTactic = {
  id: TACTIC_ID.SIMPLE_COLOURING,
  title: STRATEGY.SIMPLE_COLOURING,
  score: 180,
  rank: 4.5,
  type: STEP_TYPE.ELIMINATION,
  find(state) {
    for (let digit = 1; digit <= BOARD_SIZE; digit++) {
      const hit = colourDigit(state, digit);
      if (hit) return hit;
    }
    return null;
  }
};
function colourDigit(state, digit) {
  var _a;
  const adj = /* @__PURE__ */ new Map();
  const add = (a, b) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.get(a).includes(b)) adj.get(a).push(b);
  };
  for (const group of HOUSES) {
    for (const house of group) {
      const hits = [];
      for (const idx of house) {
        if (state.values[idx] !== 0) continue;
        if (hasDigit(state.candidates[idx], digit)) hits.push(idx);
      }
      if (hits.length === 2) {
        add(hits[0], hits[1]);
        add(hits[1], hits[0]);
      }
    }
  }
  const nodes = [...adj.keys()];
  if (nodes.length < 2) return null;
  const colour = /* @__PURE__ */ new Map();
  const visited = /* @__PURE__ */ new Set();
  for (const start of nodes) {
    if (visited.has(start)) continue;
    const queue = [start];
    colour.set(start, 0);
    visited.add(start);
    let bipartite = true;
    while (queue.length) {
      const cur = queue.shift();
      const c = colour.get(cur);
      for (const n of (_a = adj.get(cur)) != null ? _a : []) {
        if (!colour.has(n)) {
          colour.set(n, 1 - c);
          visited.add(n);
          queue.push(n);
        } else if (colour.get(n) === c) {
          bipartite = false;
        }
      }
    }
    if (!bipartite) continue;
    const component = [...colour.keys()].filter((k) => visited.has(k));
    const compColour = /* @__PURE__ */ new Map();
    for (const n of component) compColour.set(n, colour.get(n));
    for (const group of HOUSES) {
      for (const house of group) {
        for (const col of [0, 1]) {
          const same = house.filter(
            (idx) => state.values[idx] === 0 && hasDigit(state.candidates[idx], digit) && compColour.get(idx) === col
          );
          if (same.length >= 2) {
            const updates2 = eliminateColour(state, digit, compColour, col);
            if (updates2.length > 0) {
              const patternCells = [...compColour.keys()];
              return step(
                {
                  title: STRATEGY.SIMPLE_COLOURING,
                  type: STEP_TYPE.ELIMINATION
                },
                updates2,
                {
                  patternCells,
                  regionCells: regionFromCells(patternCells),
                  proof: colourProof(patternCells, compColour, adj, cell => ({ cell, digit }))
                }
              );
            }
          }
        }
      }
    }
    const updates = [];
    for (let idx = 0; idx < 81; idx++) {
      if (state.values[idx] !== 0) continue;
      if (!hasDigit(state.candidates[idx], digit)) continue;
      if (compColour.has(idx)) continue;
      const peers = peersOf(idx);
      let see0 = false;
      let see1 = false;
      for (const p of peers) {
        if (compColour.get(p) === 0) see0 = true;
        if (compColour.get(p) === 1) see1 = true;
      }
      if (see0 && see1) {
        updates.push({ index: idx, eliminatedCandidate: digit });
      }
    }
    if (updates.length > 0) {
      const patternCells = [...compColour.keys()];
      return step(
        { title: STRATEGY.SIMPLE_COLOURING, type: STEP_TYPE.ELIMINATION },
        updates,
        {
          patternCells,
          regionCells: regionFromCells(patternCells),
                  proof: colourProof(patternCells, compColour, adj, cell => ({ cell, digit }))
        }
      );
    }
    for (const n of component) colour.delete(n);
  }
  return null;
}
function eliminateColour(state, digit, colour, falseColour) {
  const updates = [];
  for (const [idx, c] of colour) {
    if (c !== falseColour) continue;
    if (state.values[idx] !== 0) continue;
    if (hasDigit(state.candidates[idx], digit)) {
      updates.push({ index: idx, eliminatedCandidate: digit });
    }
  }
  return updates;
}

// sudoku-core/src/tactics/finned-fish.ts
function findFinnedFish(state, size, title) {
  const a = findFinnedOrientation(state, size, 0, 1, title);
  if (a) return a;
  return findFinnedOrientation(state, size, 1, 0, title);
}
function findFinnedOrientation(state, size, primaryType, secondaryType, title) {
  for (let digit = 1; digit <= BOARD_SIZE; digit++) {
    const lines = [];
    for (let i = 0; i < BOARD_SIZE; i++) {
      const house = HOUSES[primaryType][i];
      const seconds = [];
      for (let j = 0; j < BOARD_SIZE; j++) {
        const idx = house[j];
        if (state.values[idx] !== 0) continue;
        if (hasDigit(state.candidates[idx], digit)) seconds.push(j);
      }
      if (seconds.length >= 2) lines.push({ line: i, seconds });
    }
    if (lines.length < size) continue;
    for (const primaryIdxs of combinations3(lines.length, size)) {
      const chosen = primaryIdxs.map((i) => lines[i]);
      for (let finIdx = 0; finIdx < size; finIdx++) {
        const finPrimary = chosen[finIdx];
        const rest = chosen.filter((_, i) => i !== finIdx);
        const restSeconds = /* @__PURE__ */ new Set();
        for (const r of rest) for (const s of r.seconds) restSeconds.add(s);
        if (restSeconds.size > size) continue;
        if (![...restSeconds].every((s) => finPrimary.seconds.includes(s)))
          continue;
        const S = new Set(restSeconds);
        for (const s of finPrimary.seconds) {
          if (S.size >= size) break;
          if (!S.has(s)) S.add(s);
        }
        if (S.size !== size) continue;
        if (rest.some((r) => r.seconds.some((s) => !S.has(s)))) continue;
        const fins = finPrimary.seconds.filter((s) => !S.has(s));
        if (fins.length === 0) continue;
        const finCells = fins.map(
          (s) => HOUSES[primaryType][finPrimary.line][s]
        );
        const boxes = new Set(finCells.map((i) => CELL_HOUSES[i][2]));
        if (boxes.size !== 1) continue;
        const finBox = [...boxes][0];
        const primarySet = new Set(chosen.map((c) => c.line));
        const updates = [];
        for (const sec of S) {
          const house = HOUSES[secondaryType][sec];
          for (let p = 0; p < BOARD_SIZE; p++) {
            if (primarySet.has(p)) continue;
            const idx = house[p];
            if (CELL_HOUSES[idx][2] !== finBox) continue;
            if (state.values[idx] !== 0) continue;
            if (!hasDigit(state.candidates[idx], digit)) continue;
            updates.push({ index: idx, eliminatedCandidate: digit });
          }
        }
        if (updates.length > 0) {
          const patternCells = [];
          for (const line of chosen) {
            for (const s of line.seconds) {
              patternCells.push(HOUSES[primaryType][line.line][s]);
            }
          }
          const regionCells = [
            .../* @__PURE__ */ new Set([
              ...chosen.flatMap((c) => [...HOUSES[primaryType][c.line]]),
              ...[...S].flatMap((s) => [...HOUSES[secondaryType][s]]),
              ...HOUSES[2][finBox]
            ])
          ];
          return step({ title, type: STEP_TYPE.ELIMINATION }, updates, {
            patternCells,
            regionCells
          });
        }
      }
    }
  }
  return null;
}
function combinations3(n, k) {
  const result = [];
  const cur = [];
  function dfs(start) {
    if (cur.length === k) {
      result.push(cur.slice());
      return;
    }
    for (let i = start; i < n; i++) {
      cur.push(i);
      dfs(i + 1);
      cur.pop();
    }
  }
  dfs(0);
  return result;
}
var finnedXWingTactic = {
  id: TACTIC_ID.FINNED_X_WING,
  title: STRATEGY.FINNED_X_WING,
  score: 190,
  rank: 4.7,
  type: STEP_TYPE.ELIMINATION,
  find(state) {
    return findFinnedFish(state, 2, STRATEGY.FINNED_X_WING);
  }
};
var finnedSwordfishTactic = {
  id: TACTIC_ID.FINNED_SWORDFISH,
  title: STRATEGY.FINNED_SWORDFISH,
  score: 220,
  rank: 5,
  type: STEP_TYPE.ELIMINATION,
  find(state) {
    return findFinnedFish(state, 3, STRATEGY.FINNED_SWORDFISH);
  }
};
var finnedJellyfishTactic = {
  id: TACTIC_ID.FINNED_JELLYFISH,
  title: STRATEGY.FINNED_JELLYFISH,
  score: 260,
  rank: 5.4,
  type: STEP_TYPE.ELIMINATION,
  find(state) {
    return findFinnedFish(state, 4, STRATEGY.FINNED_JELLYFISH);
  }
};

// sudoku-core/src/tactics/wxyz-wing.ts
var wxyzWingTactic = {
  id: TACTIC_ID.WXYZ_WING,
  title: STRATEGY.WXYZ_WING,
  score: 240,
  rank: 4.8,
  type: STEP_TYPE.ELIMINATION,
  find(state) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let b = 0; b < BOARD_SIZE; b++) {
        const hit = searchInTwoUnits(state, HOUSES[0][r], HOUSES[2][b]);
        if (hit) return hit;
      }
    }
    for (let c = 0; c < BOARD_SIZE; c++) {
      for (let b = 0; b < BOARD_SIZE; b++) {
        const hit = searchInTwoUnits(state, HOUSES[1][c], HOUSES[2][b]);
        if (hit) return hit;
      }
    }
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const hit = searchInTwoUnits(state, HOUSES[0][r], HOUSES[1][c]);
        if (hit) return hit;
      }
    }
    return null;
  }
};
function searchInTwoUnits(state, unitA, unitB) {
  const inA = new Set(unitA);
  const inB = new Set(unitB);
  const cells = [];
  for (const idx of /* @__PURE__ */ new Set([...unitA, ...unitB])) {
    if (state.values[idx] !== 0) continue;
    const n = candidateCount(state.candidates[idx]);
    if (n < 2 || n > 4) continue;
    cells.push({ index: idx, mask: state.candidates[idx] });
  }
  if (cells.length < 4) return null;
  for (let a = 0; a < cells.length; a++) {
    for (let b = a + 1; b < cells.length; b++) {
      for (let c = b + 1; c < cells.length; c++) {
        for (let d = c + 1; d < cells.length; d++) {
          const group = [cells[a], cells[b], cells[c], cells[d]];
          const indices = group.map((g) => g.index);
          const onlyA = indices.every((i) => inA.has(i));
          const onlyB = indices.every((i) => inB.has(i));
          if (onlyA || onlyB) continue;
          if (!indices.every((i) => inA.has(i) || inB.has(i))) continue;
          const union = group[0].mask | group[1].mask | group[2].mask | group[3].mask;
          if (candidateCount(union) !== 4) continue;
          const digits = digitsFromMask(union);
          let z = null;
          for (const digit of digits) {
            if (!isRestrictedDigit(indices, group, digit)) {
              if (z != null) {
                z = null;
                break;
              }
              z = digit;
            }
          }
          if (z == null) continue;
          const zDigit = z;
          const zCells = indices.filter(
            (_, i) => hasDigit(group[i].mask, zDigit)
          );
          if (zCells.length < 2) continue;
          const groupSet = new Set(indices);
          const peerSets = zCells.map((zc) => new Set(peersOf(zc)));
          const updates = [];
          for (let t = 0; t < CELL_COUNT; t++) {
            if (groupSet.has(t) || state.values[t] !== 0) continue;
            if (!hasDigit(state.candidates[t], zDigit)) continue;
            if (peerSets.every((ps) => ps.has(t))) {
              updates.push({ index: t, eliminatedCandidate: zDigit });
            }
          }
          if (updates.length > 0) {
            return step(
              { title: STRATEGY.WXYZ_WING, type: STEP_TYPE.ELIMINATION },
              updates,
              {
                patternCells: indices,
                regionCells: regionFromCells(indices)
              }
            );
          }
        }
      }
    }
  }
  return null;
}
function isRestrictedDigit(indices, group, digit) {
  const holders = indices.filter((_, i) => hasDigit(group[i].mask, digit));
  if (holders.length <= 1) return true;
  for (let i = 0; i < holders.length; i++) {
    for (let j = i + 1; j < holders.length; j++) {
      if (!sameHouse(holders[i], holders[j])) return false;
    }
  }
  return true;
}

// sudoku-core/src/tactics/bug-plus-one.ts
var bugPlusOneTactic = {
  id: TACTIC_ID.BUG_PLUS_ONE,
  title: STRATEGY.BUG_PLUS_ONE,
  score: 240,
  rank: 5.1,
  type: STEP_TYPE.VALUE,
  find(state) {
    const tri = [];
    let bivalueCount = 0;
    for (let i = 0; i < CELL_COUNT; i++) {
      if (state.values[i] !== 0) continue;
      const n = candidateCount(state.candidates[i]);
      if (n === 2) bivalueCount++;
      else if (n === 3) tri.push(i);
      else return null;
    }
    if (tri.length !== 1 || bivalueCount === 0) return null;
    const cell = tri[0];
    const digits = digitsFromMask(state.candidates[cell]);
    for (const digit of digits) {
      const [r, c, b] = [
        HOUSES[0][Math.floor(cell / 9)],
        HOUSES[1][cell % 9],
        HOUSES[2][Math.floor(Math.floor(cell / 9) / 3) * 3 + Math.floor(cell % 9 / 3)]
      ];
      const oddInAll = [r, c, b].every((house) => {
        let count = 0;
        for (const idx of house) {
          if (state.values[idx] !== 0) continue;
          if (hasDigit(state.candidates[idx], digit)) count++;
        }
        return count % 2 === 1;
      });
      if (oddInAll) {
        return step(
          { title: STRATEGY.BUG_PLUS_ONE, type: STEP_TYPE.VALUE },
          [{ index: cell, filledValue: digit }],
          {
            patternCells: [cell],
            regionCells: regionFromCells([cell])
          }
        );
      }
    }
    return null;
  }
};

// sudoku-core/src/tactics/x-chain.ts
var xChainTactic = {
  id: TACTIC_ID.X_CHAIN,
  title: STRATEGY.X_CHAIN,
  score: 260,
  rank: 6.6,
  type: STEP_TYPE.ELIMINATION,
  find(state) {
    var _a, _b;
    for (let digit = 1; digit <= BOARD_SIZE; digit++) {
      const strong = buildStrongLinks(state, digit);
      const cells = [...strong.keys()];
      if (cells.length < 2) continue;
      for (const start of cells) {
        const stack = [];
        for (const a of (_a = strong.get(start)) != null ? _a : []) {
          stack.push([start, a]);
        }
        while (stack.length) {
          const path = stack.pop();
          if (path.length > 14) continue;
          const end = path[path.length - 1];
          if (path.length >= 4) {
            const updates = elimSeeingBoth(state, digit, start, end, path);
            if (updates.length > 0) {
              return step(
                { title: STRATEGY.X_CHAIN, type: STEP_TYPE.ELIMINATION },
                updates,
                {
                  patternCells: path,
                  regionCells: regionFromCells(path),
                  proof: chainProof(path.map(cell => ({ cell, digit })))
                }
              );
            }
          }
          for (const peer of peersOf(end)) {
            if (path.includes(peer)) continue;
            if (state.values[peer] !== 0) continue;
            if (!hasDigit(state.candidates[peer], digit)) continue;
            for (const next of (_b = strong.get(peer)) != null ? _b : []) {
              if (path.includes(next) || next === end) continue;
              stack.push([...path, peer, next]);
            }
          }
        }
      }
    }
    return null;
  }
};
function buildStrongLinks(state, digit) {
  const map = /* @__PURE__ */ new Map();
  const add = (a, b) => {
    if (!map.has(a)) map.set(a, []);
    if (!map.get(a).includes(b)) map.get(a).push(b);
  };
  for (const group of HOUSES) {
    for (const house of group) {
      const hits = [];
      for (const idx of house) {
        if (state.values[idx] !== 0) continue;
        if (hasDigit(state.candidates[idx], digit)) hits.push(idx);
      }
      if (hits.length === 2) {
        add(hits[0], hits[1]);
        add(hits[1], hits[0]);
      }
    }
  }
  return map;
}
function elimSeeingBoth(state, digit, a, b, chain) {
  if (a === b) return [];
  const peersA = new Set(peersOf(a));
  const used = new Set(chain);
  const updates = [];
  for (const idx of peersOf(b)) {
    if (!peersA.has(idx) || used.has(idx)) continue;
    if (state.values[idx] !== 0) continue;
    if (hasDigit(state.candidates[idx], digit)) {
      updates.push({ index: idx, eliminatedCandidate: digit });
    }
  }
  return updates;
}

// sudoku-core/src/tactics/xy-chain.ts
var xyChainTactic = {
  id: TACTIC_ID.XY_CHAIN,
  title: STRATEGY.XY_CHAIN,
  score: 300,
  rank: 6.8,
  type: STEP_TYPE.ELIMINATION,
  find(state) {
    const bivalue = [];
    for (let i = 0; i < CELL_COUNT; i++) {
      if (state.values[i] !== 0) continue;
      if (candidateCount(state.candidates[i]) !== 2) continue;
      const d = digitsFromMask(state.candidates[i]);
      bivalue.push({ index: i, digits: [d[0], d[1]] });
    }
    if (bivalue.length < 3) return null;
    const byIndex = new Map(bivalue.map((c) => [c.index, c]));
    let best = null;
    let bestLen = Infinity;
    for (const start of bivalue) {
      for (const z of start.digits) {
        const onDigit = start.digits[0] === z ? start.digits[1] : start.digits[0];
        const stack = [
          { path: [start.index], onDigit }
        ];
        while (stack.length) {
          const { path, onDigit: currentOn } = stack.pop();
          if (path.length > 12 || path.length >= bestLen) continue;
          const endIdx = path[path.length - 1];
          if (path.length >= 3 && currentOn === z && hasDigit(state.candidates[endIdx], z)) {
            const updates = elimZ(state, z, start.index, endIdx, path);
            if (updates.length > 0 && path.length < bestLen) {
              bestLen = path.length;
              best = step(
                { title: STRATEGY.XY_CHAIN, type: STEP_TYPE.ELIMINATION },
                updates,
                {
                  patternCells: path,
                  regionCells: regionFromCells(path),
                  proof: xyProof(state, path, z)
                }
              );
              if (bestLen === 3) return best;
            }
          }
          for (const peer of peersOf(endIdx)) {
            if (path.includes(peer)) continue;
            const next = byIndex.get(peer);
            if (!next) continue;
            if (!next.digits.includes(currentOn)) continue;
            const nextOn = next.digits[0] === currentOn ? next.digits[1] : next.digits[0];
            stack.push({ path: [...path, peer], onDigit: nextOn });
          }
        }
      }
    }
    return best;
  }
};
function elimZ(state, z, a, b, path) {
  const peersA = new Set(peersOf(a));
  const used = new Set(path);
  const updates = [];
  for (const idx of peersOf(b)) {
    if (!peersA.has(idx) || used.has(idx)) continue;
    if (state.values[idx] !== 0) continue;
    if (hasDigit(state.candidates[idx], z)) {
      updates.push({ index: idx, eliminatedCandidate: z });
    }
  }
  return updates;
}

// sudoku-core/src/tactics/medusa.ts
function key(cell, digit) {
  return `${cell}:${digit}`;
}
function parse(k) {
  const [c, d] = k.split(":").map(Number);
  return { cell: c, digit: d };
}
var medusa3dTactic = {
  id: TACTIC_ID.MEDUSA_3D,
  title: STRATEGY.MEDUSA_3D,
  score: 320,
  rank: 7.2,
  type: STEP_TYPE.ELIMINATION,
  find(state) {
    var _a;
    const adj = /* @__PURE__ */ new Map();
    const add = (a, b) => {
      if (!adj.has(a)) adj.set(a, []);
      if (!adj.get(a).includes(b)) adj.get(a).push(b);
    };
    for (let digit = 1; digit <= BOARD_SIZE; digit++) {
      for (const group of HOUSES) {
        for (const house of group) {
          const hits = [];
          for (const idx of house) {
            if (state.values[idx] !== 0) continue;
            if (hasDigit(state.candidates[idx], digit)) hits.push(idx);
          }
          if (hits.length === 2) {
            const ka = key(hits[0], digit);
            const kb = key(hits[1], digit);
            add(ka, kb);
            add(kb, ka);
          }
        }
      }
    }
    for (let i = 0; i < CELL_COUNT; i++) {
      if (state.values[i] !== 0) continue;
      if (candidateCount(state.candidates[i]) !== 2) continue;
      const [d1, d2] = digitsFromMask(state.candidates[i]);
      const ka = key(i, d1);
      const kb = key(i, d2);
      add(ka, kb);
      add(kb, ka);
    }
    const nodes = [...adj.keys()];
    if (nodes.length < 4) return null;
    const colour = /* @__PURE__ */ new Map();
    const visited = /* @__PURE__ */ new Set();
    for (const start of nodes) {
      if (visited.has(start)) continue;
      const queue = [start];
      colour.set(start, 0);
      visited.add(start);
      const component = [start];
      let ok = true;
      while (queue.length) {
        const cur = queue.shift();
        const c = colour.get(cur);
        for (const n of (_a = adj.get(cur)) != null ? _a : []) {
          if (!colour.has(n)) {
            colour.set(n, 1 - c);
            visited.add(n);
            queue.push(n);
            component.push(n);
          } else if (colour.get(n) === c) {
            ok = false;
          }
        }
      }
      if (!ok || component.length < 3) continue;
      const updates = applyMedusaRules(state, component, colour);
      if (updates.length > 0) {
        const patternCells = [...new Set(component.map((k) => parse(k).cell))];
        return step(
          { title: STRATEGY.MEDUSA_3D, type: STEP_TYPE.ELIMINATION },
          updates,
          {
            patternCells,
            regionCells: regionFromCells(patternCells),
            proof: colourProof(component, colour, adj, parse)
          }
        );
      }
    }
    return null;
  }
};
function applyMedusaRules(state, component, colour) {
  var _a;
  const compSet = new Set(component);
  const byCell = /* @__PURE__ */ new Map();
  for (const k of component) {
    const { cell } = parse(k);
    if (!byCell.has(cell)) byCell.set(cell, []);
    byCell.get(cell).push(k);
  }
  for (const [, keys] of byCell) {
    for (const col of [0, 1]) {
      const same = keys.filter((k) => colour.get(k) === col);
      if (same.length >= 2) {
        return eliminateColour2(state, component, colour, col);
      }
    }
  }
  for (let digit = 1; digit <= BOARD_SIZE; digit++) {
    for (const group of HOUSES) {
      for (const house of group) {
        for (const col of [0, 1]) {
          const same = house.filter((idx) => {
            const k = key(idx, digit);
            return compSet.has(k) && colour.get(k) === col;
          });
          if (same.length >= 2) {
            return eliminateColour2(state, component, colour, col);
          }
        }
      }
    }
  }
  const updates = [];
  for (const [cell, keys] of byCell) {
    const colours = new Set(keys.map((k) => colour.get(k)));
    if (colours.size < 2) continue;
    for (const d of digitsFromMask(state.candidates[cell])) {
      const k = key(cell, d);
      if (compSet.has(k)) continue;
      updates.push({ index: cell, eliminatedCandidate: d });
    }
  }
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    if (state.values[cell] !== 0) continue;
    for (const d of digitsFromMask(state.candidates[cell])) {
      const k = key(cell, d);
      if (compSet.has(k)) continue;
      let see0 = false;
      let see1 = false;
      for (const p of peersOf(cell)) {
        const pk = key(p, d);
        if (!compSet.has(pk)) continue;
        if (colour.get(pk) === 0) see0 = true;
        if (colour.get(pk) === 1) see1 = true;
      }
      if (see0 && see1) {
        updates.push({ index: cell, eliminatedCandidate: d });
      }
    }
  }
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    if (state.values[cell] !== 0) continue;
    const cellKeys = (_a = byCell.get(cell)) != null ? _a : [];
    for (const d of digitsFromMask(state.candidates[cell])) {
      const k = key(cell, d);
      if (compSet.has(k)) continue;
      for (const ck of cellKeys) {
        const cellCol = colour.get(ck);
        const opp = 1 - cellCol;
        let seesOpp = false;
        for (const p of peersOf(cell)) {
          const pk = key(p, d);
          if (compSet.has(pk) && colour.get(pk) === opp) {
            seesOpp = true;
            break;
          }
        }
        if (seesOpp) {
          updates.push({ index: cell, eliminatedCandidate: d });
          break;
        }
      }
    }
  }
  return dedupe(updates);
}
function eliminateColour2(state, component, colour, falseColour) {
  const updates = [];
  for (const k of component) {
    if (colour.get(k) !== falseColour) continue;
    const { cell, digit } = parse(k);
    if (state.values[cell] !== 0) continue;
    if (hasDigit(state.candidates[cell], digit)) {
      updates.push({ index: cell, eliminatedCandidate: digit });
    }
  }
  return dedupe(updates);
}
function dedupe(updates) {
  const seen = /* @__PURE__ */ new Set();
  return updates.filter((u) => {
    const k = `${u.index}:${u.eliminatedCandidate}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// sudoku-core/src/tactics/aic.ts
function node(cell, digit) {
  return `${cell}:${digit}`;
}
function parse2(n) {
  const [c, d] = n.split(":").map(Number);
  return { cell: c, digit: d };
}
var aicTactic = {
  id: TACTIC_ID.AIC,
  title: STRATEGY.AIC,
  score: 340,
  rank: 7.5,
  type: STEP_TYPE.ELIMINATION,
  find(state) {
    var _a, _b;
    const strong = buildStrong(state);
    const weak = buildWeak(state);
    for (const [a, bs] of strong) {
      for (const b of bs) {
        if (!weak.has(a)) weak.set(a, []);
        if (!weak.get(a).includes(b)) weak.get(a).push(b);
      }
    }
    const nodes = [...strong.keys()];
    if (nodes.length < 2) return null;
    for (const start of nodes) {
      for (const first of (_a = strong.get(start)) != null ? _a : []) {
        const stack = [
          { path: [start, first], needStrong: false }
        ];
        while (stack.length) {
          const { path, needStrong } = stack.pop();
          if (path.length > 16) continue;
          const end = path[path.length - 1];
          if (path.length >= 4 && !needStrong) {
            const updates = elimFromEndpoints(state, path[0], end);
            if (updates.length > 0) {
              const patternCells = [...new Set(path.map((n) => parse2(n).cell))];
              return step(
                { title: STRATEGY.AIC, type: STEP_TYPE.ELIMINATION },
                updates,
                {
                  patternCells,
                  regionCells: regionFromCells(patternCells),
                  proof: chainProof(path.map(parse2))
                }
              );
            }
          }
          const nextMap = needStrong ? strong : weak;
          for (const nxt of (_b = nextMap.get(end)) != null ? _b : []) {
            if (path.includes(nxt)) continue;
            stack.push({
              path: [...path, nxt],
              needStrong: !needStrong
            });
          }
        }
      }
    }
    return null;
  }
};
function buildStrong(state) {
  const map = /* @__PURE__ */ new Map();
  const add = (a, b) => {
    if (!map.has(a)) map.set(a, []);
    if (!map.get(a).includes(b)) map.get(a).push(b);
  };
  for (let digit = 1; digit <= BOARD_SIZE; digit++) {
    for (const group of HOUSES) {
      for (const house of group) {
        const hits = [];
        for (const idx of house) {
          if (state.values[idx] !== 0) continue;
          if (hasDigit(state.candidates[idx], digit)) hits.push(idx);
        }
        if (hits.length === 2) {
          add(node(hits[0], digit), node(hits[1], digit));
          add(node(hits[1], digit), node(hits[0], digit));
        }
      }
    }
  }
  for (let i = 0; i < CELL_COUNT; i++) {
    if (state.values[i] !== 0) continue;
    if (candidateCount(state.candidates[i]) !== 2) continue;
    const [d1, d2] = digitsFromMask(state.candidates[i]);
    add(node(i, d1), node(i, d2));
    add(node(i, d2), node(i, d1));
  }
  return map;
}
function buildWeak(state) {
  const map = /* @__PURE__ */ new Map();
  const add = (a, b) => {
    if (!map.has(a)) map.set(a, []);
    if (!map.get(a).includes(b)) map.get(a).push(b);
  };
  for (let digit = 1; digit <= BOARD_SIZE; digit++) {
    for (const group of HOUSES) {
      for (const house of group) {
        const hits = [];
        for (const idx of house) {
          if (state.values[idx] !== 0) continue;
          if (hasDigit(state.candidates[idx], digit)) hits.push(idx);
        }
        for (let i = 0; i < hits.length; i++) {
          for (let j = i + 1; j < hits.length; j++) {
            add(node(hits[i], digit), node(hits[j], digit));
            add(node(hits[j], digit), node(hits[i], digit));
          }
        }
      }
    }
  }
  for (let i = 0; i < CELL_COUNT; i++) {
    if (state.values[i] !== 0) continue;
    const digits = digitsFromMask(state.candidates[i]);
    for (let a = 0; a < digits.length; a++) {
      for (let b = a + 1; b < digits.length; b++) {
        add(node(i, digits[a]), node(i, digits[b]));
        add(node(i, digits[b]), node(i, digits[a]));
      }
    }
  }
  return map;
}
function elimFromEndpoints(state, start, end) {
  const s = parse2(start);
  const e = parse2(end);
  const updates = [];
  if (s.digit === e.digit && s.cell !== e.cell) {
    const peersS = new Set(peersOf(s.cell));
    for (const idx of peersOf(e.cell)) {
      if (!peersS.has(idx) || idx === s.cell || idx === e.cell) continue;
      if (state.values[idx] !== 0) continue;
      if (hasDigit(state.candidates[idx], s.digit)) {
        updates.push({ index: idx, eliminatedCandidate: s.digit });
      }
    }
  } else if (s.cell === e.cell && s.digit !== e.digit) {
    for (const d of digitsFromMask(state.candidates[s.cell])) {
      if (d === s.digit || d === e.digit) continue;
      updates.push({ index: s.cell, eliminatedCandidate: d });
    }
  }
  const seen = /* @__PURE__ */ new Set();
  return updates.filter((u) => {
    const k = `${u.index}:${u.eliminatedCandidate}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// sudoku-core/src/tactics/nishio.ts
var nishioTactic = {
  id: TACTIC_ID.NISHIO,
  title: STRATEGY.NISHIO,
  score: 400,
  rank: 7.9,
  type: STEP_TYPE.ELIMINATION,
  find(state) {
    for (let i = 0; i < CELL_COUNT; i++) {
      if (state.values[i] !== 0) continue;
      const digits = digitsFromMask(state.candidates[i]);
      if (digits.length < 2) continue;
      for (const digit of digits) {
        if (assumptionContradicts(state, i, digit)) {
          return step(
            { title: STRATEGY.NISHIO, type: STEP_TYPE.ELIMINATION },
            [{ index: i, eliminatedCandidate: digit }],
            {
              patternCells: [i],
              regionCells: regionFromCells([i])
            }
          );
        }
      }
    }
    return null;
  }
};
function assumptionContradicts(state, index, digit) {
  const trial = cloneGrid(state);
  if (!placeValue(trial, index, digit)) return true;
  if (!propagateSingles(trial)) return true;
  return hasContradiction(trial);
}
function propagateSingles(state) {
  var _a, _b;
  for (let guard = 0; guard < 200; guard++) {
    const next = (_b = (_a = openSinglesTactic.find(state)) != null ? _a : nakedSingleTactic.find(state)) != null ? _b : hiddenSingleTactic.find(state);
    if (!next) return true;
    for (const u of next.updates) {
      if (u.filledValue == null) continue;
      if (!placeValue(state, u.index, u.filledValue)) return false;
    }
  }
  return true;
}
function hasContradiction(state) {
  for (let i = 0; i < CELL_COUNT; i++) {
    if (state.values[i] !== 0) continue;
    if (state.candidates[i] === 0) return true;
  }
  for (const group of HOUSES) {
    for (const house of group) {
      const present = /* @__PURE__ */ new Set();
      for (const idx of house) {
        if (state.values[idx] !== 0) present.add(state.values[idx]);
      }
      for (let d = 1; d <= 9; d++) {
        if (present.has(d)) continue;
        let canPlace = false;
        for (const idx of house) {
          if (state.values[idx] !== 0) continue;
          if (hasDigit(state.candidates[idx], d)) {
            canPlace = true;
            break;
          }
        }
        if (!canPlace) return true;
      }
    }
  }
  return false;
}

// sudoku-core/src/tactics/registry.ts
var TACTICS = [
  openSinglesTactic,
  // 1.0
  hiddenSingleTactic,
  // 1.5
  nakedSingleTactic,
  // 2.3
  pointingEliminationTactic,
  // 2.6
  nakedPairTactic,
  // 3.0
  xWingTactic,
  // 3.2
  hiddenPairTactic,
  // 3.4
  hiddenGroupsTactic,
  // 3.5
  nakedTripleTactic,
  // 3.6
  nakedQuadTactic,
  // 3.8
  swordfishTactic,
  // 3.8
  skyscraperTactic,
  // 4.0
  twoStringKiteTactic,
  // 4.0
  craneTactic,
  // 4.1
  yWingTactic,
  // 4.2
  wWingTactic,
  // 4.3
  xyzWingTactic,
  // 4.4
  simpleColouringTactic,
  // 4.5
  emptyRectangleTactic,
  // 4.6
  finnedXWingTactic,
  // 4.7
  uniqueRectangleTactic,
  // 4.8
  wxyzWingTactic,
  // 4.8
  finnedSwordfishTactic,
  // 5.0
  bugPlusOneTactic,
  // 5.1
  jellyfishTactic,
  // 5.2
  finnedJellyfishTactic,
  // 5.4
  xChainTactic,
  // 6.6
  xyChainTactic,
  // 6.8
  medusa3dTactic,
  // 7.2
  aicTactic,
  // 7.5
  nishioTactic
  // 7.9
];
function tacticByTitle(title) {
  return TACTICS.find((t) => t.title === title);
}

// sudoku-core/src/tactics/apply.ts
function applyStep(state, found) {
  for (const update of found.updates) {
    if (update.filledValue != null) {
      placeValue(state, update.index, update.filledValue);
    } else if (update.eliminatedCandidate != null) {
      eliminateCandidate(state, update.index, update.eliminatedCandidate);
    } else if (update.addedCandidate != null) {
      addCandidate(state, update.index, update.addedCandidate);
    }
  }
}
function findNextStep(state, tactics = TACTICS) {
  for (const tactic of tactics) {
    const found = tactic.find(state);
    if (found) return found;
  }
  return null;
}
var ELIMINATION_TACTICS = TACTICS.filter(
  (t) => t.type === STEP_TYPE.ELIMINATION
);
function walkthrough(initial, tactics = TACTICS, maxSteps = 500) {
  const state = cloneGrid(initial);
  const steps = [];
  for (let i = 0; i < maxSteps; i++) {
    if (isComplete(state)) {
      return { solved: true, steps, state, stuck: false };
    }
    const found = findNextStep(state, tactics);
    if (!found) {
      return { solved: false, steps, state, stuck: true };
    }
    applyStep(state, found);
    steps.push(found);
  }
  return {
    solved: isComplete(state),
    steps,
    state,
    stuck: !isComplete(state)
  };
}

// sudoku-core/src/rate/difficulty.ts
var SCORE_BUMP = {
  [DIFFICULTY_L1]: 80,
  [DIFFICULTY_L2]: 150,
  [DIFFICULTY_L3]: 900,
  [DIFFICULTY_L4]: 700,
  [DIFFICULTY_L5]: 1100,
  [DIFFICULTY_L6]: 1400,
  [DIFFICULTY_L7]: 2e3,
  [DIFFICULTY_L8]: 2600,
  [DIFFICULTY_L9]: 3400,
  [DIFFICULTY_L10]: Infinity
};
function rateSteps(steps) {
  var _a, _b;
  const freq = /* @__PURE__ */ new Map();
  let hardestRank = 0;
  let hardestTechnique;
  let placements = 0;
  for (const s of steps) {
    freq.set(s.strategy, ((_a = freq.get(s.strategy)) != null ? _a : 0) + 1);
    if (s.type === STEP_TYPE.VALUE) placements += s.updates.length;
    const tactic = tacticByTitle(s.strategy);
    if (tactic && tactic.rank >= hardestRank) {
      hardestRank = tactic.rank;
      hardestTechnique = tactic.title;
    }
  }
  let score = 0;
  const usedStrategies = [];
  for (const tactic of TACTICS) {
    const f = (_b = freq.get(tactic.title)) != null ? _b : 0;
    if (f === 0) continue;
    score += f * tactic.score;
    usedStrategies.push({ title: tactic.title, freq: f });
  }
  const tedium = placements === 0 ? steps.length : Math.round(steps.length / placements * 100) / 100;
  const difficulty = mapDifficulty(hardestRank, score);
  return {
    score: Math.round(score * 10) / 10,
    difficulty,
    hardestTechnique,
    hardestRank,
    usedStrategies,
    tedium
  };
}
var RANK_FLOOR = [
  [7, DIFFICULTY_L10],
  [5, DIFFICULTY_L9],
  [4.2, DIFFICULTY_L8],
  [3.9, DIFFICULTY_L7],
  [3.2, DIFFICULTY_L6],
  [3, DIFFICULTY_L5],
  [2.6, DIFFICULTY_L4],
  [2.3, DIFFICULTY_L3],
  [1.5, DIFFICULTY_L2]
];
function mapDifficulty(hardestRank, score) {
  var _a, _b;
  let level = (_b = (_a = RANK_FLOOR.find(([floor]) => hardestRank >= floor)) == null ? void 0 : _a[1]) != null ? _b : DIFFICULTY_L1;
  if (score > SCORE_BUMP[level]) {
    const idx = difficultyIndex(level);
    if (idx < DIFFICULTIES.length - 1) level = DIFFICULTIES[idx + 1];
  }
  return level;
}
function difficultyIndex(d) {
  return DIFFICULTIES.indexOf(d);
}
function isAtMost(actual, max) {
  return difficultyIndex(actual) <= difficultyIndex(max);
}

// sudoku-core/src/uniqueness/count-solutions.ts
function isValid(board, index, num) {
  const row = Math.floor(index / 9);
  const col = index % 9;
  for (let i = 0; i < 9; i++) {
    if (board[row * 9 + i] === num || board[col + 9 * i] === num) return false;
  }
  const startRow = row - row % 3;
  const startCol = col - col % 3;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (board[(startRow + i) * 9 + startCol + j] === num) return false;
    }
  }
  return true;
}
function countSolutions(board, limit = 2) {
  if (board.length !== CELL_COUNT) return 0;
  const grid = board.map((v) => v != null ? v : 0);
  let count = 0;
  function solve() {
    if (count >= limit) return true;
    let bestIndex = -1;
    let bestOptions = [];
    for (let i = 0; i < CELL_COUNT; i++) {
      if (grid[i] !== 0) continue;
      const options = [];
      for (let num = 1; num <= 9; num++) {
        if (isValid(grid, i, num)) options.push(num);
      }
      if (options.length === 0) return false;
      if (bestIndex === -1 || options.length < bestOptions.length) {
        bestIndex = i;
        bestOptions = options;
        if (options.length === 1) break;
      }
    }
    if (bestIndex === -1) {
      count++;
      return count >= limit;
    }
    for (const num of bestOptions) {
      grid[bestIndex] = num;
      if (solve()) {
        if (count >= limit) {
          grid[bestIndex] = 0;
          return true;
        }
      }
      grid[bestIndex] = 0;
    }
    return false;
  }
  solve();
  return count;
}
function isUniqueSolution(board) {
  return countSolutions(board, 2) === 1;
}
function getUniqueSolution(board) {
  if (board.length !== CELL_COUNT) return null;
  const grid = board.map((v) => v != null ? v : 0);
  let found = null;
  let count = 0;
  function solve() {
    if (count >= 2) return true;
    let bestIndex = -1;
    let bestOptions = [];
    for (let i = 0; i < CELL_COUNT; i++) {
      if (grid[i] !== 0) continue;
      const options = [];
      for (let num = 1; num <= 9; num++) {
        if (isValid(grid, i, num)) options.push(num);
      }
      if (options.length === 0) return false;
      if (bestIndex === -1 || options.length < bestOptions.length) {
        bestIndex = i;
        bestOptions = options;
        if (options.length === 1) break;
      }
    }
    if (bestIndex === -1) {
      count++;
      if (count === 1) found = grid.slice();
      return count >= 2;
    }
    for (const num of bestOptions) {
      grid[bestIndex] = num;
      if (solve()) {
        if (count >= 2) {
          grid[bestIndex] = 0;
          return true;
        }
      }
      grid[bestIndex] = 0;
    }
    return false;
  }
  solve();
  return count === 1 ? found : null;
}

// sudoku-core/src/generate/generate.ts
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = state + 1831565813 >>> 0;
    let t = state;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function shuffle(items, random = Math.random) {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function fillCompleteGrid(random) {
  const state = createEmptyGrid();
  function solve(index) {
    if (index >= CELL_COUNT) return true;
    if (state.values[index] !== 0) return solve(index + 1);
    const digits = shuffle(digitsFromMask(state.candidates[index]), random);
    for (const digit of digits) {
      const snapshot = cloneGrid(state);
      if (!placeValue(state, index, digit)) {
        Object.assign(state, snapshot);
        continue;
      }
      if (solve(index + 1)) return true;
      state.values = snapshot.values;
      state.candidates = snapshot.candidates;
    }
    return false;
  }
  if (!solve(0)) throw new Error("Failed to fill a complete grid");
  return state;
}
var CLUE_TARGET = {
  [DIFFICULTY_L1]: 42,
  [DIFFICULTY_L2]: 38,
  [DIFFICULTY_L3]: 34,
  [DIFFICULTY_L4]: 30,
  [DIFFICULTY_L5]: 28,
  [DIFFICULTY_L6]: 26,
  [DIFFICULTY_L7]: 24,
  [DIFFICULTY_L8]: 22,
  [DIFFICULTY_L9]: 21,
  [DIFFICULTY_L10]: 20
};
function humanRating(grid, board) {
  if (!isUniqueSolution(board)) return null;
  const path = walkthrough(grid);
  return path.solved ? rateSteps(path.steps).difficulty : null;
}
function generatePuzzle(options) {
  var _a;
  const { difficulty, maxAttempts = 500, seed } = options;
  const timeoutMs = (_a = options.timeoutMs) != null ? _a : seed === void 0 ? 16e3 : Infinity;
  const random = seed === void 0 ? Math.random : mulberry32(seed >>> 0);
  const started = Date.now();
  const outOfTime = () => Date.now() - started > timeoutMs;
  const targetClues = CLUE_TARGET[difficulty];
  for (let attempt = 0; attempt < maxAttempts && !outOfTime(); attempt++) {
    const grid = fillCompleteGrid(random);
    let clues = CELL_COUNT;
    let exact = null;
    for (const cellIndex of shuffle([...Array(CELL_COUNT).keys()], random)) {
      if (outOfTime()) break;
      const digit = grid.values[cellIndex];
      clearValue(grid, cellIndex);
      const board = boardToPublic(grid);
      const rating = humanRating(grid, board);
      if (rating === null || !isAtMost(rating, difficulty)) {
        placeValue(grid, cellIndex, digit);
        continue;
      }
      clues--;
      if (rating === difficulty) {
        exact = board;
        if (clues <= targetClues) return board;
      }
    }
    if (exact) return exact;
  }
  throw new Error(
    `Could not generate a "${difficulty}" puzzle within budget (${timeoutMs}ms / ${maxAttempts} attempts)`
  );
}
export {
  STRATEGY,
  TACTIC_ID,
  applyStep,
  boardFromPublic,
  countSolutions,
  digitsFromMask,
  generatePuzzle,
  getUniqueSolution,
  rateSteps,
  walkthrough
};
