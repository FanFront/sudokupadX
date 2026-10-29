use serde::Serialize;
use std::sync::Mutex;
use sudokupadx_core::{EditResult, InputCell, ProgressCheck, Puzzle, Session, Snapshot, DEMO};
use tauri::State;

#[derive(Default)]
struct AppState {
    session: Mutex<Option<Session>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenResponse {
    puzzle: Puzzle,
    progress: Snapshot,
}

fn lock<'a>(state: &'a AppState) -> Result<std::sync::MutexGuard<'a, Option<Session>>, String> {
    state.session.lock().map_err(|_| "Puzzle engine lock failed.".to_owned())
}
fn open(input: &str, state: &AppState) -> Result<OpenResponse, String> {
    let puzzle = sudokupadx_core::load(input)?;
    let session = Session::new(puzzle.clone());
    let result = OpenResponse { puzzle, progress: session.snapshot() };
    *lock(state)? = Some(session);
    Ok(result)
}
fn with_session<T>(
    state: &AppState,
    action: impl FnOnce(&mut Session) -> Result<T, String>,
) -> Result<T, String> {
    let mut engine = lock(state)?;
    let current = engine.as_mut().ok_or("No puzzle is open.")?;
    action(current)
}

#[tauri::command]
fn load_demo(state: State<'_, AppState>) -> Result<OpenResponse, String> {
    open(DEMO, &state)
}
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalizedMetadata {
    title: Option<String>,
    rules: Option<String>,
    msgcorrect: Option<String>,
}

#[tauri::command]
fn open_puzzle(
    input: String,
    localization: Option<LocalizedMetadata>,
    state: State<'_, AppState>
) -> Result<OpenResponse, String> {
    let mut puzzle = sudokupadx_core::load(&input)?;
    if let Some(locale) = localization {
        if let Some(title) = locale.title.filter(|s| !s.trim().is_empty()) {
            puzzle.title = title;
        }
        if let Some(rules) = locale.rules.filter(|s| !s.trim().is_empty()) {
            puzzle.rules = rules;
        }
        if let Some(message) = locale.msgcorrect.filter(|s| !s.trim().is_empty()) {
            puzzle.completion_text = Some(message);
        }
    }
    let result = OpenResponse { puzzle: puzzle.clone(), progress: Session::new(puzzle.clone()).snapshot() };
    *lock(&state)? = Some(Session::new(puzzle));
    Ok(result)
}
#[tauri::command]
fn update_cell(
    index: usize, mode: String, symbol: String, state: State<'_, AppState>
) -> Result<EditResult, String> {
    with_session(&state, |session| session.apply(index, &mode, &symbol))
}
#[tauri::command]
fn update_cells(
    indices: Vec<usize>, mode: String, symbol: String, state: State<'_, AppState>
) -> Result<EditResult, String> {
    with_session(&state, |session| session.apply_many(&indices, &mode, &symbol))
}
#[tauri::command]
fn check_progress(state: State<'_, AppState>) -> Result<ProgressCheck, String> {
    with_session(&state, |session| Ok(session.check_progress()))
}
#[tauri::command]
fn undo(state: State<'_, AppState>) -> Result<EditResult, String> {
    with_session(&state, Session::undo)
}
#[tauri::command]
fn redo(state: State<'_, AppState>) -> Result<EditResult, String> {
    with_session(&state, Session::redo)
}
#[tauri::command]
fn restore_progress(
    cells: Vec<InputCell>, state: State<'_, AppState>
) -> Result<Snapshot, String> {
    with_session(&state, |session| session.restore(cells))
}

// Read only the public Logic Masters puzzle HTML, not arbitrary user-provided
// addresses. Native requests are necessary because the portal may not permit
// cross-origin browser fetches. Do not send session cookies or credentials.
#[tauri::command]
async fn fetch_logic_masters_page(puzzle_id: String) -> Result<String, String> {
    if puzzle_id.len() != 6 || !puzzle_id.bytes().all(|b| b.is_ascii_alphanumeric()) {
        return Err("Logic Masters 谜题 ID 必须为六位字母或数字".into());
    }
    let id = puzzle_id.to_ascii_uppercase();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none())
        .build().map_err(|e| format!("HTTPS 客户端初始化失败: {e}"))?;
    let url = format!("https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id={id}");
    let mut response = client.get(&url).send().await
        .map_err(|e| format!("访问 Logic Masters 失败: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Logic Masters 返回 HTTP {}", response.status()));
    }
    const LIMIT: usize = 1024 * 1024;
    if response.content_length().is_some_and(|len| len > LIMIT as u64) {
        return Err("Logic Masters 页面超过 1 MiB 大小限制".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await
        .map_err(|e| format!("读取 Logic Masters 页面失败: {e}"))? {
        if bytes.len() + chunk.len() > LIMIT {
            return Err("Logic Masters 页面超过 1 MiB 大小限制".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            load_demo, open_puzzle, update_cell, update_cells, check_progress, undo, redo, restore_progress, fetch_logic_masters_page
        ])
        .run(tauri::generate_context!())
        .expect("Failed to start SudokuPad X");
}
