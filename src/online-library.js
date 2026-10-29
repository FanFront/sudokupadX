// Online SudokuPad index and on-demand offline puzzle storage.
// Keep remote content as data; the Rust puzzle engine validates it before play.
export const ONLINE_INDEX_URL = 'https://stefanlobbenmeier.github.io/sudoku-index/index.json';
export const MAX_ONLINE_PUZZLE = 8 * 1024 * 1024;
const DB_NAME = 'sudokupadx-online-v1';
let databasePromise;

export function puzzleIdFromUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'sudokupad.app' ||
        parsed.username || parsed.password || parsed.port) return null;
    const id = decodeURIComponent(parsed.pathname.replace(/^\/+|\/+$/g, ''));
    if (!id || id.length > 1024 || /[\u0000-\u001f]/.test(id)) return null;
    return id.replace(/^sudoku\//, '');
  } catch { return null; }
}

export function parseOnlineIndex(payload) {
  const raw = typeof payload === 'string' ? JSON.parse(payload) : payload;
  if (!raw || raw.schemaVersion !== 1 || !Array.isArray(raw.entries) ||
      !Array.isArray(raw.sources) || !raw.entries.length) {
    throw Error('在线题库索引格式不正确');
  }
  const sources = new Map(raw.sources.filter(s => s && typeof s.id === 'string')
    .map(s => [s.id, String(s.name || s.id)]));
  const seen = new Set();
  const entries = [];
  for (const item of raw.entries) {
    if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 256 ||
        typeof item.title !== 'string' || !item.title.trim() ||
        !puzzleIdFromUrl(item.puzzleUrl) || seen.has(item.id)) continue;
    seen.add(item.id);
    entries.push({
      id: item.id,
      title: item.title.trim().slice(0, 300),
      sourceId: String(item.sourceId || '').slice(0, 100),
      sourceName: sources.get(item.sourceId) || String(item.sourceId || '未知来源'),
      publishedAt: typeof item.publishedAt === 'string' ? item.publishedAt : '',
      puzzleUrl: item.puzzleUrl
    });
  }
  if (!entries.length) throw Error('在线题库中没有可用的 SudokuPad 谜题');
  entries.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return {entries, generatedAt: String(raw.generatedAt || '')};
}

export function filterOnlineEntries(entries, {search = '', source = '', offlineOnly = false, offlineIds = new Set()} = {}) {
  const needle = search.trim().toLocaleLowerCase();
  return entries.filter(item =>
    (!offlineOnly || offlineIds.has(item.id)) &&
    (!source || item.sourceId === source) &&
    (!needle || [item.title, item.sourceName, item.puzzleUrl, item.id]
      .some(field => String(field || '').toLocaleLowerCase().includes(needle)))
  );
}

export function puzzleDownloadUrl(puzzleUrl) {
  const id = puzzleIdFromUrl(puzzleUrl);
  if (!id) throw Error('不是有效的 SudokuPad 谜题链接');
  if (/^scl[A-Za-z0-9+/=]+$/.test(id)) return null;
  if (/^(fpuz|fpuzzles|ctc|scf)/i.test(id)) {
    throw Error('这个索引条目使用了当前 Rust 解码器暂不支持的内嵌格式');
  }
  return 'https://sudokupad.svencodes.com/ctclegacy/' + id.split('/').map(encodeURIComponent).join('/');
}

export function normalizeRemotePuzzle(text) {
  if (typeof text !== 'string' || text.length > MAX_ONLINE_PUZZLE) {
    throw Error('在线谜题超出 8 MiB 大小限制');
  }
  let value = text.trim().replace(/^\uFEFF/, '');
  if (value.startsWith('"')) {
    try { value = JSON.parse(value); } catch { throw Error('在线谜题文本无法解析'); }
  }
  if (typeof value !== 'string') throw Error('在线谜题内容无效');
  if (value.startsWith('{')) {
    try {
      const json = JSON.parse(value);
      if (typeof json === 'object' && json && (Array.isArray(json.cells) || Array.isArray(json.ce)))
        return value;
      if (typeof json?.puzzle === 'string') value = json.puzzle;
      else if (typeof json?.data === 'string') value = json.data;
      else throw Error('在线谜题缺少宫格数据');
    } catch(error) {
      // Compact SudokuMaker literals are parsed by the Rust importer.
      if (error instanceof SyntaxError) return value;
      throw error;
    }
  }
  if (value.startsWith('scl') && /^scl[A-Za-z0-9+/=]+$/.test(value) ||
      value.startsWith('{') && value.length <= MAX_ONLINE_PUZZLE) return value;
  throw Error('在线谜题不是当前支持的 SCL / JSON 格式');
}

export async function fetchOnlinePuzzle(entry, fetcher = fetch) {
  const id = puzzleIdFromUrl(entry.puzzleUrl);
  const url = puzzleDownloadUrl(entry.puzzleUrl);
  if (!url) return normalizeRemotePuzzle(id);
  const response = await fetcher(url, {cache: 'no-store'});
  if (!response.ok) throw Error('谜题下载失败：HTTP ' + response.status);
  if (Number(response.headers?.get('content-length') || 0) > MAX_ONLINE_PUZZLE)
    throw Error('在线谜题超出 8 MiB 大小限制');
  return normalizeRemotePuzzle(await response.text());
}

function db() {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(Error('本机不支持 IndexedDB 离线存储')); return; }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        for (const name of ['meta','puzzles','saved'])
          if (!database.objectStoreNames.contains(name))
            database.createObjectStore(name, {keyPath:'id'});
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || Error('离线数据库无法打开'));
      request.onblocked = () => reject(Error('离线数据库被其他窗口占用'));
    }).catch(error => { databasePromise = undefined; throw error; });
  }
  return databasePromise;
}

async function transaction(stores, mode, update) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(stores, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || Error('本机存储失败'));
    tx.onabort = () => reject(tx.error || Error('本机存储已取消'));
    try { update(tx, value => { result = value; }); }
    catch (error) { tx.abort(); reject(error); }
  });
}

export function readOnlineIndex() {
  return transaction(['meta'], 'readonly', (tx, done) => {
    tx.objectStore('meta').get('latest-index').onsuccess = e => done(e.target.result?.value || null);
  });
}
export function saveOnlineIndex(index) {
  return transaction(['meta'], 'readwrite', tx => {
    tx.objectStore('meta').put({id:'latest-index', value:index});
  });
}
export function listOfflinePuzzles() {
  return transaction(['saved'], 'readonly', (tx, done) => {
    tx.objectStore('saved').getAll().onsuccess = e => done(e.target.result);
  });
}
export function readOfflinePuzzle(id) {
  return transaction(['puzzles'], 'readonly', (tx, done) => {
    tx.objectStore('puzzles').get(id).onsuccess = e => done(e.target.result?.input || null);
  });
}
export function saveOfflinePuzzle(entry, input) {
  if (typeof input !== 'string' || !input.length || input.length > MAX_ONLINE_PUZZLE)
    throw Error('无法保存不完整的谜题');
  return transaction(['puzzles','saved'], 'readwrite', tx => {
    tx.objectStore('puzzles').put({id:entry.id, input});
    tx.objectStore('saved').put(entry);
  });
}
export function removeOfflinePuzzle(id) {
  return transaction(['puzzles','saved'], 'readwrite', tx => {
    tx.objectStore('puzzles').delete(id);
    tx.objectStore('saved').delete(id);
  });
}
