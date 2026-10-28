//! Adventure metadata and fog-of-war parsing. This module is data-only.
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sector {
    pub title: String,
    pub author: String,
    pub rules: String,
    pub left: usize,
    pub top: usize,
    pub width: usize,
    pub height: usize,
    pub cells: Vec<usize>,
}

#[derive(Clone, Debug)]
pub struct FogTrigger {
    pub all_correct: Vec<usize>,
    pub reveals: Vec<usize>,
}

/// SudokuPad uses one-based rNcN coordinates. A run of coordinates means
/// a set, not a single numeric identifier.
pub fn cell_refs(text: &str, rows: usize, cols: usize) -> Vec<usize> {
    let mut result = Vec::new();
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] != b'r' { i += 1; continue; }
        let mut p = i + 1;
        let start = p;
        while p < bytes.len() && bytes[p].is_ascii_digit() { p += 1; }
        if p == start || p >= bytes.len() || bytes[p] != b'c' { i += 1; continue; }
        let r = text[start..p].parse::<usize>().unwrap_or(0);
        p += 1;
        let col_start = p;
        while p < bytes.len() && bytes[p].is_ascii_digit() { p += 1; }
        if p == col_start { i += 1; continue; }
        let c = text[col_start..p].parse::<usize>().unwrap_or(0);
        if (1..=rows).contains(&r) && (1..=cols).contains(&c) {
            let index = (r - 1) * cols + c - 1;
            if !result.contains(&index) { result.push(index); }
        }
        i = p;
    }
    result
}

fn rectangle_cells(left: usize, top: usize, width: usize, height: usize, rows: usize, cols: usize) -> Vec<usize> {
    let mut cells = Vec::new();
    for row in top..top.saturating_add(height).min(rows) {
        for col in left..left.saturating_add(width).min(cols) {
            cells.push(row * cols + col);
        }
    }
    cells
}

pub fn read_sectors(meta: &Value, rows: usize, cols: usize) -> Vec<Sector> {
    meta.get("grids").and_then(Value::as_array).into_iter().flatten()
        .take(500)
        .filter_map(|grid| {
            let left = grid.get("left")?.as_u64()? as usize;
            let top = grid.get("top")?.as_u64()? as usize;
            let width = grid.get("width")?.as_u64()? as usize;
            let height = grid.get("height")?.as_u64()? as usize;
            if width == 0 || height == 0 || left >= cols || top >= rows { return None; }
            let cells = rectangle_cells(left, top, width, height, rows, cols);
            Some(Sector {
                title: grid.get("title").and_then(Value::as_str).unwrap_or("Sector").to_owned(),
                author: grid.get("author").and_then(Value::as_str).unwrap_or("").to_owned(),
                rules: grid.get("rules").and_then(Value::as_str).unwrap_or("").to_owned(),
                left, top, width, height, cells,
            })
        }).collect()
}

pub fn read_foglight(root: &Value, rows: usize, cols: usize) -> Option<Vec<usize>> {
    let fog = root.get("foglight").or_else(|| root.get("fl"))?.as_array()?;
    let mut result = Vec::new();
    for pair in fog {
        let Some(pair) = pair.as_array() else { continue };
        let (Some(r), Some(c)) = (pair.first().and_then(Value::as_u64), pair.get(1).and_then(Value::as_u64)) else { continue };
        // Foglight source arrays are zero-based [row,column] coordinates.
        if (r as usize) < rows && (c as usize) < cols {
            let index = r as usize * cols + c as usize;
            if !result.contains(&index) { result.push(index); }
        }
    }
    Some(result)
}

pub fn read_triggers(root: &Value, rows: usize, cols: usize) -> Vec<FogTrigger> {
    root.get("triggereffect").or_else(|| root.get("te"))
        .and_then(Value::as_array).into_iter().flatten()
        .take(20000)
        .filter_map(|item| {
            let trigger = item.get("trigger")?;
            let effect = item.get("effect")?;
            if trigger.get("type")?.as_str()? != "cellvalue" ||
               effect.get("type")?.as_str()? != "foglight" { return None; }
            let all_correct = cell_refs(trigger.get("cell")?.as_str()?, rows, cols);
            let reveals = cell_refs(effect.get("cells")?.as_str()?, rows, cols);
            if all_correct.is_empty() || reveals.is_empty() { return None; }
            Some(FogTrigger { all_correct, reveals })
        }).collect()
}

pub fn read_solution(meta: &Value, rows: usize, cols: usize) -> Option<Vec<Option<String>>> {
    let solution = meta.get("solution")?.as_str()?;
    let symbols = solution.chars().map(|c| {
        if c.is_ascii_alphanumeric() && c != '0' { Some(c.to_ascii_uppercase().to_string()) }
        else { None }
    }).collect::<Vec<_>>();
    if symbols.len() == rows * cols { Some(symbols) } else { None }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn refs_use_one_based_indices() {
        assert_eq!(cell_refs("r1c1r2c3r1c1r5c5", 3, 3), vec![0,5]);
        assert!(cell_refs("some text",9,9).is_empty());
    }
    #[test]
    fn sector_cells_are_row_major() {
        let v=serde_json::json!({"grids":[{"top":1,"left":2,"height":2,"width":2,"title":"Area","rules":"Hello"}]});
        let s=read_sectors(&v,5,5);
        assert_eq!(s[0].cells, vec![7,8,12,13]);
    }
    #[test]
    fn initial_light_is_zero_based() {
        let v=serde_json::json!({"foglight":[[0,0],[1,2],[20,20],[0,0]]});
        assert_eq!(read_foglight(&v,3,4),Some(vec![0,6]));
    }
}
