//! Safe SudokuPad package loading and input state. No original SudokuPad runtime.
use serde::{Deserialize, Serialize};
use serde_json::Value;
mod adventure;
pub use adventure::{FogTrigger, Sector};
use adventure::{read_foglight,read_sectors,read_solution,read_triggers};

const MAX_INPUT_BYTES: usize = 8 * 1024 * 1024;
const MAX_SIDE: usize = 160;
const MAX_MARKS: usize = 12_000;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Cell {
    pub given: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Puzzle {
    pub key: String,
    pub title: String,
    pub author: String,
    pub rules: String,
    pub rows: usize,
    pub cols: usize,
    pub cells: Vec<Cell>,
    pub regions: Vec<Value>,
    pub lines: Vec<Value>,
    pub underlays: Vec<Value>,
    pub overlays: Vec<Value>,
    pub cages: Vec<Value>,
    pub arrows: Vec<Value>,
    pub sectors: Vec<Sector>,
    #[serde(skip)]
    pub foglight: Option<Vec<usize>>,
    #[serde(skip)]
    pub triggers: Vec<FogTrigger>,
    #[serde(skip)]
    pub solution: Option<Vec<Option<String>>>,
    #[serde(skip)]
    pub completion_text: Option<String>,
    pub warnings: Vec<String>,
}

fn as_text(v: &Value) -> Option<String> {
    match v {
        Value::String(s) if !s.is_empty() => Some(s.to_string()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

fn stable_key(data: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for &b in data.as_bytes() {
        hash = (hash ^ b as u64).wrapping_mul(0x100000001b3);
    }
    format!("fnv1a-{hash:016x}")
}

/// Convert only SudokuMaker's data-only compact syntax into JSON5. The
/// scanner respects quote/escape boundaries: neither puzzle text nor code is
/// evaluated. JavaScript array elisions become JSON nulls; t/f/n atoms become
/// true/false/null. Unknown token syntax is still rejected by JSON5.
fn normalize_compact(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut output = String::with_capacity(text.len() + text.len() / 10);
    let mut quote: Option<char> = None;
    let mut escaped = false;
    let mut nesting = Vec::new();
    for (idx, &ch) in chars.iter().enumerate() {
        if let Some(current) = quote {
            output.push(ch);
            if escaped { escaped = false; }
            else if ch == '\\' { escaped = true; }
            else if ch == current { quote = None; }
            continue;
        }
        if ch == '\'' || ch == '"' {
            quote = Some(ch);
            output.push(ch);
            continue;
        }
        if ch == '[' || ch == '{' { nesting.push(ch); }
        if ch == ']' || ch == '}' { nesting.pop(); }
        if ch == ',' && nesting.last() == Some(&'[') {
            let previous = output.chars().rev().find(|c| !c.is_whitespace());
            if matches!(previous, Some('[' | ',')) {
                output.push_str("null");
            }
        }
        if matches!(ch, 't' | 'f' | 'n') {
            let before = output.chars().rev().find(|c| !c.is_whitespace());
            let after = chars[idx + 1..].iter().find(|c| !c.is_whitespace()).copied();
            if matches!(before, Some(':' | '[' | ','))
                && matches!(after, Some(',' | '}' | ']'))
            {
                output.push_str(match ch { 't' => "true", 'f' => "false", _ => "null" });
                continue;
            }
        }
        output.push(ch);
    }
    output
}

/// SudokuMaker also uses non-JSON unquoted color atoms like `c:#0` and
/// `stroke:ffffff`. Treat only the hexadecimal color forms as strings.
fn quote_compact_colors(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut result = String::with_capacity(text.len() + text.len() / 20);
    let mut i = 0;
    let mut quote = None;
    let mut escaped = false;
    while i < chars.len() {
        let c = chars[i];
        if let Some(q) = quote {
            result.push(c);
            if escaped { escaped = false; }
            else if c == '\\' { escaped = true; }
            else if c == q { quote = None; }
            i += 1;
            continue;
        }
        if c == '\'' || c == '"' {
            quote = Some(c);
            result.push(c);
            i += 1;
            continue;
        }
        if c == ':' {
            let mut begin = i + 1;
            while begin < chars.len() && chars[begin].is_whitespace() { begin += 1; }
            let mut end = begin;
            if begin < chars.len() && chars[begin] == '#' {
                end += 1;
                while end < chars.len() && chars[end].is_ascii_hexdigit() { end += 1; }
                if end > begin + 1 {
                    result.push(':');
                    for ch in &chars[i + 1..begin] { result.push(*ch); }
                    result.push('\'');
                    for ch in &chars[begin..end] { result.push(*ch); }
                    result.push('\'');
                    i = end;
                    continue;
                }
            } else {
                while end < chars.len() && chars[end].is_ascii_hexdigit() { end += 1; }
                let word: String = chars[begin..end].iter().collect();
                if matches!(word.len(), 6 | 8) &&
                    word.chars().any(|ch| ch.is_ascii_alphabetic()) &&
                    (end == chars.len() || matches!(chars[end], ',' | '}' | ']' | ' ')) {
                    result.push(':');
                    for ch in &chars[i + 1..begin] { result.push(*ch); }
                    result.push('\'');
                    result.push_str(&word);
                    result.push('\'');
                    i = end;
                    continue;
                }
            }
        }
        result.push(c);
        i += 1;
    }
    result
}

fn marks(v: &Value, field: &str, alias: &str, warnings: &mut Vec<String>) -> Vec<Value> {
    let Some(array) = v.get(field).or_else(|| v.get(alias)).and_then(Value::as_array) else {
        return Vec::new();
    };
    if array.len() > MAX_MARKS {
        warnings.push(format!("{field}: only the first {MAX_MARKS} marks are displayed"));
    }
    array.iter().take(MAX_MARKS).map(|item| {
        let mut item = item.clone();
        if let Some(map) = item.as_object_mut() {
            let field_aliases = if field == "lines" {
                &[("wp", "wayPoints"), ("c", "color"), ("th", "thickness")][..]
            } else {
                &[("ct", "center"), ("w", "width"), ("h", "height"),
                  ("te", "text"), ("fs", "fontSize"), ("c", "backgroundColor"),
                  ("bc", "borderColor"), ("bs", "borderSize")][..]
            };
            for &(short, long) in field_aliases {
                if !map.contains_key(long) {
                    if let Some(value) = map.get(short).cloned() {
                        map.insert(long.to_owned(), value);
                    }
                }
            }
        }
        item
    }).collect()
}

/// Accept raw JSON, JSON5-compatible SudokuMaker compact literals, or
/// SudokuPad's `scl` + LZ-String Base64. Never eval third-party strings.
pub fn load(input: &str) -> Result<Puzzle, String> {
    let input = input.trim().trim_start_matches('\u{feff}');
    if input.is_empty() {
        return Err("Empty puzzle. Import a .scl or .json file.".into());
    }
    if input.len() > MAX_INPUT_BYTES {
        return Err("Puzzle file is too large (8 MiB limit).".into());
    }
    let decoded = if let Some(payload) = input.strip_prefix("scl") {
        if payload.is_empty() || !payload.bytes().all(|b|
            b.is_ascii_alphanumeric() || b == b'+' || b == b'/' || b == b'=')
        {
            return Err("Invalid SudokuPad SCL Base64 alphabet.".into());
        }
        let utf16 = lz_str::decompress_from_base64(payload)
            .ok_or_else(|| "SCL LZ-String decompression failed.".to_string())?;
        String::from_utf16(&utf16)
            .map_err(|_| "SCL payload is not valid UTF-16.".to_string())?
    } else {
        input.to_string()
    };
    if decoded.len() > MAX_INPUT_BYTES * 4 {
        return Err("Decompressed puzzle exceeds size limit.".into());
    }
    let root: Value = match serde_json::from_str(&decoded) {
        Ok(puzzle) => puzzle,
        Err(_) => {
            // JSON5 accepts unquoted keys and single-quoted strings without
            // evaluating arbitrary third-party JavaScript expressions.
            json5::from_str(&quote_compact_colors(&normalize_compact(&decoded))).map_err(
                |err| format!("Unsupported puzzle JSON or compact literal: {err}")
            )?
        }
    };

    let matrix = root.get("cells").or_else(|| root.get("ce")).and_then(Value::as_array)
        .ok_or_else(|| "Missing cells[][] array.".to_string())?;
    let rows = matrix.len();
    let cols = matrix.iter()
        .filter_map(Value::as_array).map(Vec::len).max().unwrap_or(0);
    if rows == 0 || cols == 0 || rows > MAX_SIDE || cols > MAX_SIDE
        || rows.saturating_mul(cols) > MAX_SIDE * MAX_SIDE
    {
        return Err(format!("Unsupported board dimensions: {rows} × {cols}."));
    }
    let mut cells = Vec::with_capacity(rows * cols);
    for row in matrix {
        let entries = row.as_array()
            .ok_or_else(|| "Each cells row must be an array.".to_string())?;
        for col in 0..cols {
            let value = entries.get(col).and_then(|cell| {
                if cell.is_object() { cell.get("value").or_else(|| cell.get("v")).and_then(as_text) }
                else { as_text(cell) }
            }).filter(|v| v != "0" && v != ".");
            cells.push(Cell { given: value });
        }
    }
    let meta = root.get("metadata").unwrap_or(&Value::Null);
    let title = meta.get("title").and_then(Value::as_str)
        .or_else(|| root.get("title").and_then(Value::as_str))
        .unwrap_or("Imported puzzle").to_owned();
    let author = meta.get("author").and_then(Value::as_str).unwrap_or("").to_owned();
    let rules = meta.get("rules").and_then(Value::as_str).unwrap_or("").to_owned();
    let mut warnings = Vec::new();
    let foglight = read_foglight(&root, rows, cols);
    let triggers = read_triggers(&root, rows, cols);
    let sectors = read_sectors(meta, rows, cols);
    let solution = read_solution(meta, rows, cols);
    if foglight.is_some() && solution.is_none() && !triggers.is_empty() {
        warnings.push("Fog starts correctly, but trigger validation needs a full solution.".into());
    }
    if root.get("triggereffect").and_then(Value::as_array)
        .is_some_and(|items| items.len() != triggers.len()) {
        warnings.push("Some unsupported scripted trigger types were ignored.".into());
    }
    if root.get("fogofwar").is_some() && foglight.is_none() {
        warnings.push("Unsupported fog-of-war variant (not foglight).".into());
    }
    if root.get("arrows").is_some() || root.get("thermos").is_some() {
        warnings.push("Some variant constraints are not yet drawn or validated.".into());
    }
    let key = root.get("id").and_then(as_text).unwrap_or_else(|| stable_key(&decoded));
    Ok(Puzzle {
        key, title, author, rules, rows, cols, cells,
        regions: marks(&root, "regions", "re", &mut warnings),
        lines: marks(&root, "lines", "l", &mut warnings),
        underlays: marks(&root, "underlays", "u", &mut warnings),
        overlays: marks(&root, "overlays", "o", &mut warnings),
        cages: marks(&root, "cages", "ca", &mut warnings),
        arrows: marks(&root, "arrows", "a", &mut warnings),
        sectors, foglight, triggers, solution,
        completion_text: meta.get("msgcorrect").and_then(Value::as_str).map(str::to_owned),
        warnings,
    })
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InputCell {
    pub value: Option<String>,
    #[serde(default)]
    pub corner: Vec<String>,
    #[serde(default)]
    pub center: Vec<String>,
    pub color: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub cells: Vec<InputCell>,
    pub can_undo: bool,
    pub can_redo: bool,
    pub visible: Vec<bool>,
    pub solved: bool,
    pub completion: Option<String>,
}

/// A manual correctness check reports counts, never solution values or positions.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressCheck {
    pub has_solution: bool,
    pub checked: usize,
    pub unverifiable: usize,
    pub mistakes: usize,
}

#[derive(Clone, Debug, Serialize)]
pub struct ChangedCell {
    pub index: usize,
    pub cell: InputCell,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditResult {
    pub index: usize,
    pub cell: InputCell,
    /// All cells changed by this edit, including bulk edits and undo/redo.
    pub changes: Vec<ChangedCell>,
    pub can_undo: bool,
    pub can_redo: bool,
    pub visible: Vec<bool>,
    pub solved: bool,
    pub completion: Option<String>,
}

#[derive(Clone, Debug)]
struct CellChange {
    index: usize,
    before: InputCell,
    after: InputCell,
}

#[derive(Clone, Debug)]
struct Edit {
    changes: Vec<CellChange>,
}

pub struct Session {
    pub puzzle: Puzzle,
    cells: Vec<InputCell>,
    undo: Vec<Edit>,
    redo: Vec<Edit>,
    visible: Vec<bool>,
}

fn valid_symbol(s: &str) -> bool {
    s.chars().count() == 1 && s.chars().all(|c|
        c.is_ascii_digit() || c.is_ascii_uppercase())
}
fn valid_color(s: &str) -> bool {
    matches!(s, "#f8cd75" | "#a9d9a1" | "#9fcbff" | "#e9b0d6" | "#bfb5fa")
}
fn toggle(list: &mut Vec<String>, value: &str) {
    if let Some(pos) = list.iter().position(|item| item == value) {
        list.remove(pos);
    } else if list.len() < 26 {
        list.push(value.to_owned());
        list.sort();
    }
}

impl Session {
    pub fn new(puzzle: Puzzle) -> Self {
        let cells = vec![InputCell::default(); puzzle.cells.len()];
        let mut session = Self { puzzle, cells, undo: Vec::new(), redo: Vec::new(), visible: Vec::new() };
        session.refresh_fog();
        session
    }
    fn correct(&self, index: usize) -> bool {
        let Some(solution) = &self.puzzle.solution else { return false };
        let Some(Some(expected)) = solution.get(index) else { return false };
        self.puzzle.cells[index].given.as_ref()
            .or(self.cells[index].value.as_ref()) == Some(expected)
    }
    fn solved(&self) -> bool {
        self.puzzle.solution.as_ref().is_some_and(|solution|
            solution.iter().enumerate().all(|(index,s)| s.is_none() || self.correct(index))
        )
    }
    fn completion(&self) -> Option<String> {
        if self.solved() { self.puzzle.completion_text.clone() } else { None }
    }
    /// Compare only player-placed large digits against known solution entries.
    /// Givens and candidate notes are not checked. The state and fog do not change.
    pub fn check_progress(&self) -> ProgressCheck {
        let solution = self.puzzle.solution.as_ref();
        let mut result = ProgressCheck {
            has_solution: solution.is_some_and(|s| s.iter().any(Option::is_some)),
            checked: 0, unverifiable: 0, mistakes: 0,
        };
        for (index, cell) in self.cells.iter().enumerate() {
            if self.puzzle.cells[index].given.is_some() { continue; }
            let Some(entered) = cell.value.as_ref() else { continue; };
            let expected = solution.and_then(|s| s.get(index)).and_then(Option::as_ref);
            if let Some(expected) = expected {
                result.checked += 1;
                if entered != expected { result.mistakes += 1; }
            } else {
                result.unverifiable += 1;
            }
        }
        result
    }
    fn refresh_fog(&mut self) {
        if let Some(initial) = &self.puzzle.foglight {
            let mut visible = vec![false; self.cells.len()];
            for &index in initial { if index < visible.len() { visible[index] = true; } }
            for trigger in &self.puzzle.triggers {
                // Immutable givens cannot fire player-entry reveal events by themselves.
                // Mixed trigger sets still require every referenced cell to be correct.
                if trigger.all_correct.iter().any(|&index| self.puzzle.cells[index].given.is_none())
                    && trigger.all_correct.iter().all(|&index| self.correct(index)) {
                    for &index in &trigger.reveals {
                        if index < visible.len() { visible[index] = true; }
                    }
                }
            }
            self.visible = visible;
        } else {
            self.visible = vec![true; self.cells.len()];
        }
    }
    pub fn snapshot(&self) -> Snapshot {
        Snapshot {
            cells: self.cells.clone(),
            can_undo: !self.undo.is_empty(),
            can_redo: !self.redo.is_empty(),
            visible: self.visible.clone(),
            solved: self.solved(),
            completion: self.completion(),
        }
    }
    fn result(&self, index: usize, indices: &[usize]) -> EditResult {
        EditResult {
            index,
            cell: self.cells[index].clone(),
            changes: indices.iter().map(|&index| ChangedCell {
                index, cell: self.cells[index].clone()
            }).collect(),
            can_undo: !self.undo.is_empty(),
            can_redo: !self.redo.is_empty(),
            visible: self.visible.clone(),
            solved: self.solved(),
            completion: self.completion(),
        }
    }
    /// Saved input is validated; given cells remain immutable on restoration.
    pub fn restore(&mut self, cells: Vec<InputCell>) -> Result<Snapshot, String> {
        if cells.len() != self.cells.len() {
            return Err("Save has different board dimensions.".into());
        }
        for (index, value) in cells.iter().enumerate() {
            if self.puzzle.cells[index].given.is_some() && *value != InputCell::default() {
                return Err("Save tried to modify a given cell.".into());
            }
            if value.value.as_deref().is_some_and(|s| !valid_symbol(s))
                || value.corner.len() > 26 || value.center.len() > 26
                || value.corner.iter().any(|s| !valid_symbol(s))
                || value.center.iter().any(|s| !valid_symbol(s))
                || value.color.as_deref().is_some_and(|s| !valid_color(s))
            {
                return Err("Save contains invalid marks.".into());
            }
        }
        self.cells = cells;
        self.undo.clear();
        self.redo.clear();
        self.refresh_fog();
        Ok(self.snapshot())
    }
    pub fn apply(&mut self, index: usize, mode: &str, symbol: &str) -> Result<EditResult, String> {
        if index >= self.cells.len() { return Err("Cell is outside the board.".into()); }
        if self.puzzle.cells[index].given.is_some() {
            return Err("Given cells cannot be edited.".into());
        }
        self.apply_many(&[index], mode, symbol)
    }

    /// Apply a single keypad action to all selected editable cells. Undo/redo
    /// treats the group as one edit and fog is recalculated only once.
    pub fn apply_many(&mut self, indices: &[usize], mode: &str, symbol: &str) -> Result<EditResult, String> {
        if !matches!(mode, "value" | "corner" | "center" | "color" | "erase") {
            return Err("Unknown input mode.".into());
        }
        if mode == "color" && !valid_color(symbol) {
            return Err("Invalid palette color.".into());
        }
        if mode != "erase" && mode != "color" && !valid_symbol(symbol) {
            return Err("Enter one digit or uppercase letter.".into());
        }
        if indices.len() > self.cells.len() {
            return Err("Too many selected cells.".into());
        }
        let mut selected = Vec::new();
        for &index in indices {
            if index >= self.cells.len() { return Err("Cell is outside the board.".into()); }
            if self.puzzle.cells[index].given.is_none() && !selected.contains(&index) {
                selected.push(index);
            }
        }
        if selected.is_empty() { return Err("No editable cells selected.".into()); }
        // When some cells already contain the symbol, complete the selection
        // rather than erasing those cells. A second press clears them all.
        let all_active = selected.iter().all(|&index| {
            let cell = &self.cells[index];
            match mode {
                "value" => cell.value.as_deref() == Some(symbol),
                "corner" => cell.corner.iter().any(|s| s == symbol),
                "center" => cell.center.iter().any(|s| s == symbol),
                "color" => cell.color.as_deref() == Some(symbol),
                _ => false,
            }
        });
        let mut changes = Vec::new();
        for &index in &selected {
            let before = self.cells[index].clone();
            let next = &mut self.cells[index];
            match mode {
                "value" => next.value = if all_active { None } else { Some(symbol.to_owned()) },
                "corner" => {
                    if all_active {
                        next.corner.retain(|s| s != symbol);
                    } else if !next.corner.iter().any(|s| s == symbol) {
                        toggle(&mut next.corner, symbol);
                    }
                }
                "center" => {
                    if all_active {
                        next.center.retain(|s| s != symbol);
                    } else if !next.center.iter().any(|s| s == symbol) {
                        toggle(&mut next.center, symbol);
                    }
                }
                "color" => next.color = if all_active { None } else { Some(symbol.to_owned()) },
                "erase" => *next = InputCell::default(),
                _ => unreachable!(),
            }
            let after = next.clone();
            if before != after { changes.push(CellChange { index, before, after }); }
        }
        let index = *selected.last().unwrap();
        let changed_indices: Vec<usize> = changes.iter().map(|c| c.index).collect();
        if !changes.is_empty() {
            self.undo.push(Edit { changes });
            if self.undo.len() > 300 { self.undo.remove(0); }
            self.redo.clear();
        }
        self.refresh_fog();
        Ok(self.result(index, &changed_indices))
    }
    pub fn undo(&mut self) -> Result<EditResult, String> {
        let edit = self.undo.pop().ok_or_else(|| "Nothing to undo.".to_string())?;
        let mut indices = Vec::new();
        for change in &edit.changes {
            self.cells[change.index] = change.before.clone();
            indices.push(change.index);
        }
        let index = *indices.last().expect("a stored edit must change a cell");
        self.redo.push(edit);
        self.refresh_fog();
        Ok(self.result(index, &indices))
    }
    pub fn redo(&mut self) -> Result<EditResult, String> {
        let edit = self.redo.pop().ok_or_else(|| "Nothing to redo.".to_string())?;
        let mut indices = Vec::new();
        for change in &edit.changes {
            self.cells[change.index] = change.after.clone();
            indices.push(change.index);
        }
        let index = *indices.last().expect("a stored edit must change a cell");
        self.undo.push(edit);
        self.refresh_fog();
        Ok(self.result(index, &indices))
    }
}

#[cfg(test)]
const DEMO: &str = r#"{
  "id":"sudokupadx-demo-v1",
  "metadata":{"title":"First Steps · 初始练习","author":"SudokuPad X","rules":"Fill each row, column and 3×3 region with digits 1–9.\n每行、每列、每个 3×3 宫填入 1–9。"},
  "cells":[
    [{"value":5},{"value":3},{},{},{"value":7},{},{},{},{}],
    [{"value":6},{},{},{"value":1},{"value":9},{"value":5},{},{},{}],
    [{},{"value":9},{"value":8},{},{},{},{},{"value":6},{}],
    [{"value":8},{},{},{},{"value":6},{},{},{},{"value":3}],
    [{"value":4},{},{},{"value":8},{},{"value":3},{},{},{"value":1}],
    [{"value":7},{},{},{},{"value":2},{},{},{},{"value":6}],
    [{},{"value":6},{},{},{},{},{"value":2},{"value":8},{}],
    [{},{},{"value":4},{"value":1},{"value":9},{},{},{"value":5}],
    [{},{},{},{},{"value":8},{},{},{"value":7},{"value":9}]
  ],
  "regions":[
    [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]],
    [[0,3],[0,4],[0,5],[1,3],[1,4],[1,5],[2,3],[2,4],[2,5]],
    [[0,6],[0,7],[0,8],[1,6],[1,7],[1,8],[2,6],[2,7],[2,8]],
    [[3,0],[3,1],[3,2],[4,0],[4,1],[4,2],[5,0],[5,1],[5,2]],
    [[3,3],[3,4],[3,5],[4,3],[4,4],[4,5],[5,3],[5,4],[5,5]],
    [[3,6],[3,7],[3,8],[4,6],[4,7],[4,8],[5,6],[5,7],[5,8]],
    [[6,0],[6,1],[6,2],[7,0],[7,1],[7,2],[8,0],[8,1],[8,2]],
    [[6,3],[6,4],[6,5],[7,3],[7,4],[7,5],[8,3],[8,4],[8,5]],
    [[6,6],[6,7],[6,8],[7,6],[7,7],[7,8],[8,6],[8,7],[8,8]]
  ]
}"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn raw_and_scl_roundtrip() {
        let original = load(DEMO).unwrap();
        assert_eq!((original.rows, original.cols), (9, 9));
        assert_eq!(original.cells[0].given.as_deref(), Some("5"));
        let packed = format!("scl{}", lz_str::compress_to_base64(DEMO));
        let unpacked = load(&packed).unwrap();
        assert_eq!(unpacked.cells[0].given.as_deref(), Some("5"));
        assert_eq!(unpacked.regions.len(), 9);
    }
    #[test]
    fn compact_literal_without_eval() {
        let doc = "{id:'compact',metadata:{title:'Test'},cells:[[{value:1},{}],[{},{}]],lines:[]}";
        let board = load(doc).unwrap();
        assert_eq!(board.key, "compact");
        assert_eq!(board.cells[0].given.as_deref(), Some("1"));
    }
    #[test]
    fn compact_sparse_cells_and_atom_tokens() {
        let raw = "{id:'compact-sparse',metadata:{title:'Sparse'},ce:[[,,{v:1}],[{value:2},,]],re:[],l:[{wp:[[0,0],[1,1]],c:'#fff',th:2,r:t}],u:[{ct:[1,1],w:1,h:1,te:'t,f,n'}]}";
        let doc = load(raw).unwrap();
        assert_eq!(doc.rows, 2);
        assert_eq!(doc.cols, 3);
        assert_eq!(doc.lines[0]["wayPoints"], serde_json::json!([[0,0],[1,1]]));
        assert_eq!(doc.underlays[0]["text"], "t,f,n");
    }
    #[test]
    fn compact_color_atoms() {
        let src = "{id:'color',metadata:{title:'Color'},ce:[[{v:1},{}]],l:[{c:#0,wp:[[0,0],[0,1]]}],u:[{stroke:ffffff,fill:ffffff20,ct:[0,0]}]}";
        let board = load(src).unwrap();
        assert_eq!(board.lines[0]["color"], "#0");
        assert_eq!(board.underlays[0]["stroke"], "ffffff");
    }
    #[test]
    fn notes_and_undo_redo() {
        let mut session = Session::new(load(DEMO).unwrap());
        assert!(session.apply(0, "value", "9").is_err());
        session.apply(2, "value", "9").unwrap();
        session.apply(2, "corner", "2").unwrap();
        assert_eq!(session.snapshot().cells[2].corner, vec!["2"]);
        session.undo().unwrap();
        assert!(session.snapshot().cells[2].corner.is_empty());
        assert_eq!(session.snapshot().cells[2].value.as_deref(), Some("9"));
        session.redo().unwrap();
        assert_eq!(session.snapshot().cells[2].corner, vec!["2"]);
    }

    #[test]
    fn manual_progress_check_reports_counts_without_mutating_fog_or_history() {
        let raw = r#"{"metadata":{"solution":"1234"},"cells":[[{"value":1},{}],[{},{}]],
          "foglight":[[0,1]]}"#;
        let mut session = Session::new(load(raw).unwrap());
        session.apply(1, "value", "9").unwrap();
        session.apply(2, "corner", "9").unwrap();
        let before = session.snapshot();
        let check = session.check_progress();
        assert!(check.has_solution);
        assert_eq!(check.checked, 1);
        assert_eq!(check.unverifiable, 0);
        assert_eq!(check.mistakes, 1);
        assert_eq!(session.snapshot().visible, before.visible);
        assert_eq!(session.snapshot().can_undo, before.can_undo);
        assert_eq!(session.snapshot().cells[1].value, before.cells[1].value);
        session.apply(1, "value", "2").unwrap();
        assert_eq!(session.check_progress().mistakes, 0);
    }

    #[test]
    fn manual_progress_check_never_claims_correctness_without_a_solution() {
        let mut session = Session::new(load(DEMO).unwrap());
        session.apply(2, "value", "9").unwrap();
        let check = session.check_progress();
        assert!(!check.has_solution);
        assert_eq!(check.checked, 0);
        assert_eq!(check.unverifiable, 1);
        assert_eq!(check.mistakes, 0);
    }

    #[test]
    fn dynamic_fog_reveals_only_when_all_trigger_cells_correct() {
        let raw = r#"{"metadata":{"solution":"1234"},"cells":[[{},{}],[{},{}]],
          "foglight":[[0,0],[0,1]],
          "triggereffect":[{"trigger":{"type":"cellvalue","cell":"r1c1r1c2"},
           "effect":{"type":"foglight","cells":"r2c2"}}]}"#;
        let mut session=Session::new(load(raw).unwrap());
        assert_eq!(session.snapshot().visible,vec![true,true,false,false]);
        session.apply(0,"value","1").unwrap();
        assert!(!session.snapshot().visible[3]);
        session.apply(1,"value","3").unwrap();
        assert!(!session.snapshot().visible[3]);
        session.apply(1,"value","2").unwrap();
        assert!(session.snapshot().visible[3]);
        session.undo().unwrap();
        assert!(!session.snapshot().visible[3]);
        session.redo().unwrap();
        assert!(session.snapshot().visible[3]);
    }
    #[test]
    fn given_only_fog_triggers_do_not_activate_and_covered_cells_are_editable() {
        let raw = r#"{"metadata":{"solution":"1234"},"cells":[[{"value":1},{}],[{},{}]],
          "foglight":[[0,1]],
          "triggereffect":[
            {"trigger":{"type":"cellvalue","cell":"r1c1"},
             "effect":{"type":"foglight","cells":"r2c2"}},
            {"trigger":{"type":"cellvalue","cell":"r1c1r2c1"},
             "effect":{"type":"foglight","cells":"r2c1"}}]}"#;
        let mut session = Session::new(load(raw).unwrap());
        assert_eq!(session.snapshot().visible, vec![false,true,false,false]);
        // A player can enter the correct value into an as-yet fogged cell.
        session.apply(2, "value", "3").unwrap();
        assert_eq!(session.snapshot().visible, vec![false,true,true,false]);
        session.undo().unwrap();
        assert_eq!(session.snapshot().visible, vec![false,true,false,false]);
        session.redo().unwrap();
        assert_eq!(session.snapshot().visible, vec![false,true,true,false]);
    }

    #[test]
    fn bulk_input_is_one_undoable_edit_and_does_not_erase_matching_values() {
        let raw = r#"{"metadata":{"solution":"1234"},"cells":[[{"value":1},{}],[{},{}]],
          "foglight":[[0,1]],"triggereffect":[
          {"trigger":{"type":"cellvalue","cell":"r1c2r2c1"},
           "effect":{"type":"foglight","cells":"r2c2"}}]}"#;
        let mut session = Session::new(load(raw).unwrap());
        session.apply(1, "value", "2").unwrap();
        let result = session.apply_many(&[0,1,2,2], "value", "2").unwrap();
        assert_eq!(result.changes.len(), 1); // Given and already-correct values skipped.
        assert_eq!(session.snapshot().cells[1].value.as_deref(), Some("2"));
        assert_eq!(session.snapshot().cells[2].value.as_deref(), Some("2"));
        session.undo().unwrap();
        assert!(session.snapshot().cells[2].value.is_none());
        assert_eq!(session.snapshot().cells[1].value.as_deref(), Some("2"));
        // Set two cells in a single transaction, then undo both at once.
        session.apply_many(&[1,2], "value", "3").unwrap();
        assert_eq!(session.snapshot().cells[1].value.as_deref(), Some("3"));
        assert_eq!(session.snapshot().cells[2].value.as_deref(), Some("3"));
        let undone = session.undo().unwrap();
        assert_eq!(undone.changes.len(), 2);
        assert_eq!(session.snapshot().cells[1].value.as_deref(), Some("2"));
        assert!(session.snapshot().cells[2].value.is_none());
        session.redo().unwrap();
        assert_eq!(session.snapshot().cells[2].value.as_deref(), Some("3"));
        session.apply_many(&[1,2], "corner", "5").unwrap();
        assert_eq!(session.snapshot().cells[1].corner, vec!["5"]);
        assert_eq!(session.snapshot().cells[2].corner, vec!["5"]);
        session.apply_many(&[1,2], "corner", "5").unwrap();
        assert!(session.snapshot().cells[1].corner.is_empty());
        assert!(session.snapshot().cells[2].corner.is_empty());
    }

    #[test]
    fn reject_bad_payload_and_save() {
        assert!(load("sclnot@valid").is_err());
        assert!(load("{cells:[]}").is_err());
        let mut session = Session::new(load(DEMO).unwrap());
        let mut save = session.snapshot().cells;
        save[0].value = Some("9".into());
        assert!(session.restore(save).is_err());
    }
}
