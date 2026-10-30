//! Browser entry point. All puzzle parsing, fog, editing and save validation
//! uses the exact same Rust engine as the Android/Tauri application.
use serde_json::{json, Value};
use sudokupadx_core::{self as core, InputCell, Session};
use wasm_bindgen::prelude::*;

fn js_error(error: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&error.to_string())
}

fn to_json(value: &impl serde::Serialize) -> Result<String, JsValue> {
    serde_json::to_string(value).map_err(js_error)
}

#[wasm_bindgen]
pub struct WasmPuzzleEngine {
    session: Option<Session>,
}

#[wasm_bindgen]
impl WasmPuzzleEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self { session: None }
    }

    /// JSON string containing { puzzle, progress }, identical to Tauri's
    /// open_puzzle command response.
    pub fn open_puzzle(&mut self, input: &str, localization_json: &str) -> Result<String, JsValue> {
        let mut puzzle = core::load(input).map_err(js_error)?;
        let locale: Value = serde_json::from_str(localization_json).map_err(js_error)?;
        if let Some(localized) = locale.as_object() {
            if let Some(value) = localized.get("title").and_then(Value::as_str).filter(|s| !s.trim().is_empty()) {
                puzzle.title = value.into();
            }
            if let Some(value) = localized.get("rules").and_then(Value::as_str).filter(|s| !s.trim().is_empty()) {
                puzzle.rules = value.into();
            }
            if let Some(value) = localized.get("msgcorrect").and_then(Value::as_str).filter(|s| !s.trim().is_empty()) {
                puzzle.completion_text = Some(value.into());
            }
        }
        let session = Session::new(puzzle.clone());
        let response = to_json(&json!({"puzzle": puzzle, "progress": session.snapshot()}))?;
        self.session = Some(session);
        Ok(response)
    }

    pub fn update_cell(&mut self, index: usize, mode: &str, symbol: &str) -> Result<String, JsValue> {
        let session = self.session.as_mut().ok_or_else(|| js_error("No puzzle is open."))?;
        to_json(&session.apply(index, mode, symbol).map_err(js_error)?)
    }

    pub fn update_cells(&mut self, indices_json: &str, mode: &str, symbol: &str) -> Result<String, JsValue> {
        let indices: Vec<usize> = serde_json::from_str(indices_json).map_err(js_error)?;
        let session = self.session.as_mut().ok_or_else(|| js_error("No puzzle is open."))?;
        to_json(&session.apply_many(&indices, mode, symbol).map_err(js_error)?)
    }

    pub fn check_progress(&mut self) -> Result<String, JsValue> {
        let session = self.session.as_ref().ok_or_else(|| js_error("No puzzle is open."))?;
        to_json(&session.check_progress())
    }

    pub fn undo(&mut self) -> Result<String, JsValue> {
        let session = self.session.as_mut().ok_or_else(|| js_error("No puzzle is open."))?;
        to_json(&session.undo().map_err(js_error)?)
    }

    pub fn redo(&mut self) -> Result<String, JsValue> {
        let session = self.session.as_mut().ok_or_else(|| js_error("No puzzle is open."))?;
        to_json(&session.redo().map_err(js_error)?)
    }

    /// Restore the Rust-managed board and recompute fog, exactly like Android.
    pub fn restore_progress(&mut self, cells_json: &str) -> Result<String, JsValue> {
        let cells: Vec<InputCell> = serde_json::from_str(cells_json).map_err(js_error)?;
        let session = self.session.as_mut().ok_or_else(|| js_error("No puzzle is open."))?;
        to_json(&session.restore(cells).map_err(js_error)?)
    }
}

impl Default for WasmPuzzleEngine {
    fn default() -> Self { Self::new() }
}
