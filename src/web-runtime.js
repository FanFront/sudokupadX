// Web-only bridge to the same sudokupadx-core Rust engine used by Tauri.
// The generated wasm-pack assets live in public/wasm/ at build time and are
// loaded lazily so native Android builds do not require WebAssembly artifacts.
let enginePromise;

export function browserEngine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      const url = new URL(`${import.meta.env.BASE_URL}wasm/sudokupadx_web.js`, location.origin);
      const module = await import(/* @vite-ignore */ url.href);
      await module.default();
      return new module.WasmPuzzleEngine();
    })().catch(error => {
      enginePromise = undefined;
      throw new Error('浏览器 WASM 引擎加载失败，请使用 npm run build:web 生成它：' +
        (error?.message || String(error)));
    });
  }
  return enginePromise;
}

export async function invokeBrowser(command, args = {}) {
  const engine = await browserEngine();
  let payload;
  switch (command) {
    case 'load_demo':
      payload = engine.load_demo();
      break;
    case 'open_puzzle':
      payload = engine.open_puzzle(args.input, JSON.stringify(args.localization ?? null));
      break;
    case 'update_cell':
      payload = engine.update_cell(args.index, args.mode, args.symbol || '');
      break;
    case 'update_cells':
      payload = engine.update_cells(JSON.stringify(args.indices), args.mode, args.symbol || '');
      break;
    case 'undo':
      payload = engine.undo();
      break;
    case 'redo':
      payload = engine.redo();
      break;
    case 'restore_progress':
      payload = engine.restore_progress(JSON.stringify(args.cells));
      break;
    default:
      throw new Error('Unknown browser command: ' + command);
  }
  return JSON.parse(payload);
}
