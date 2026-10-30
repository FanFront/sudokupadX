use serde::Serialize;
use std::sync::Mutex;
use sudokupadx_core::{EditResult, InputCell, ProgressCheck, Puzzle, Session, Snapshot};
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
fn with_session<T>(
    state: &AppState,
    action: impl FnOnce(&mut Session) -> Result<T, String>,
) -> Result<T, String> {
    let mut engine = lock(state)?;
    let current = engine.as_mut().ok_or("No puzzle is open.")?;
    action(current)
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

// Query the official LMD advanced-search endpoint. The server performs the
// keyword filtering; clients fetch only one 20-item page at a time.
#[tauri::command]
async fn search_logic_masters(query: String, start: u32) -> Result<String, String> {
    if query.chars().count() > 100 || query.contains('\0') {
        return Err("Logic Masters 搜索关键词过长或无效".into());
    }
    if start > 20_000 || start % 20 != 0 {
        return Err("Logic Masters 搜索页码无效".into());
    }
    let mut url = reqwest::Url::parse(
        "https://logic-masters.de/Raetselportal/Suche/erweitert.php"
    ).map_err(|e| e.to_string())?;
    {
        let mut params = url.query_pairs_mut();
        params.append_pair("chlang", "en");
        if !query.trim().is_empty() {
            params.append_pair("skname", "x");
            params.append_pair("sktext", "x");
            params.append_pair("suchtext", query.trim());
        }
        if start > 0 {
            params.append_pair("start", &start.to_string());
        }
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::none())
        .build().map_err(|e| e.to_string())?;
    let mut response = client.get(url).send().await
        .map_err(|e| format!("检索 Logic Masters 失败: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Logic Masters 搜索返回 HTTP {}", response.status()));
    }
    const MAX_PAGE: usize = 1024 * 1024;
    if response.content_length().is_some_and(|len| len > MAX_PAGE as u64) {
        return Err("搜索结果超过大小限制".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await
        .map_err(|e| format!("读取 Logic Masters 搜索结果失败: {e}"))? {
        if bytes.len() + chunk.len() > MAX_PAGE {
            return Err("搜索结果超过大小限制".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            open_puzzle, update_cell, update_cells, check_progress, undo, redo, restore_progress, fetch_logic_masters_page, search_logic_masters
        ])
        .run(tauri::generate_context!())
        .expect("Failed to start SudokuPad X");
}
