// Penpa+ shares are self-contained puzzle packages, not remotely fetched SCL.
// Only accept the canonical Penpa+ editor origin; never fetch arbitrary URLs.
export const MAX_PENPA_LINK = 1024 * 1024;
const PENPA_ORIGIN = 'https://swaroopg92.github.io/penpa-edit/';

function getRawParameter(fragment, name) {
  const part = fragment.split('&').find(item => item.startsWith(name + '='));
  if (!part) return null;
  try { return decodeURIComponent(part.slice(name.length + 1)); }
  catch { return null; }
}

export function parsePenpaUrl(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_PENPA_LINK) return null;
  let url;
  try { url = new URL(raw.trim()); } catch { return null; }
  if (url.protocol !== 'https:' || url.hostname !== 'swaroopg92.github.io' ||
      url.username || url.password || url.port ||
      !/^\/penpa-edit\/(?:index\.html)?$/i.test(url.pathname)) return null;
  // Original Penpa+ supports both ?m=solve&p= and #m=solve&p= links.
  const fragment = url.hash && /(?:^|&)p=/.test(url.hash.slice(1))
    ? url.hash.slice(1) : url.search.slice(1);
  const mode = getRawParameter(fragment, 'm') || 'solve';
  const payload = getRawParameter(fragment, 'p');
  if (!['solve','edit'].includes(mode) || !payload || payload.length > MAX_PENPA_LINK ||
      !/^[A-Za-z0-9+/=]+$/.test(payload)) return null;
  const answer = getRawParameter(fragment, 'a');
  if (answer !== null && (answer.length > MAX_PENPA_LINK ||
      !/^[A-Za-z0-9+/=]+$/.test(answer))) return null;
  // The upstream loader splits '&' and '=' directly, without URL-decoding.
  // Supply plain Base64 so encoded %2B, %2F and %3D cannot break it.
  const converterUrl = PENPA_ORIGIN + '?m=' + mode + '&p=' + payload +
    (answer ? '&a=' + answer : '');
  return {url:url.href, converterUrl, mode, payload};
}

export function penpaPuzzleId(url) {
  const parsed = parsePenpaUrl(url);
  if (!parsed) return null;
  const data = parsed.mode + ':' + parsed.payload;
  let hashA = 2166136261, hashB = 2166136261;
  for (let i = 0; i < data.length; i++) {
    hashA = Math.imul(hashA ^ data.charCodeAt(i), 16777619) >>> 0;
    hashB = Math.imul(hashB ^ data.charCodeAt(data.length - 1 - i), 16777619) >>> 0;
  }
  return 'penpa-' + hashA.toString(16).padStart(8,'0') +
    hashB.toString(16).padStart(8,'0') + '-' + data.length;
}

export function directPenpaEntry(url) {
  const parsed = parsePenpaUrl(url);
  if (!parsed) throw Error('请粘贴有效的 Penpa+ HTTPS 分享链接（包含 p 参数）');
  return {
    id:penpaPuzzleId(url), title:'Penpa+ · 导入谜题',
    sourceId:'penpa',sourceName:'Penpa+',sourceUrl:'',
    publishedAt:'',puzzleUrl:parsed.url
  };
}

// The converter emits SudokuPad-style metadata in text-only cages.
// Our Rust engine expects the metadata object, so copy it without changing
// authored cage geometry or mutating the original puzzle.
export function preparePenpaScl(converted) {
  if (!converted || !Array.isArray(converted.cells) ||
      converted.cells.length === 0 || converted.cells.length > 160 ||
      !converted.cells.every(row => Array.isArray(row) &&
        row.length === converted.cells[0].length) ||
      converted.cells[0].length === 0 || converted.cells[0].length > 160) {
    throw Error('Penpa+ 转换器没有生成 SudokuPadX 支持的方格棋盘');
  }
  const metadata = {...(converted.metadata || {})};
  const fields = new Set(['title','author','rules','msgcorrect','msgincorrect','msgvalid','msginvalid','msgunknown','solution']);
  for (const cage of converted.cages || []) {
    if (cage?.cells?.length || typeof cage?.value !== 'string') continue;
    const match = /^([a-z]+):\s*([\s\S]*)$/i.exec(cage.value);
    if (!match) continue;
    const key = match[1].toLowerCase();
    if (fields.has(key) && !metadata[key]) metadata[key] = match[2];
  }
  // A partial digit-only solution cannot validate a Penpa+ shading/line puzzle;
  // do not enable an incorrect completion indicator for such a puzzle.
  if (typeof metadata.solution === 'string' &&
      (!/^[A-Za-z1-9]+$/.test(metadata.solution) ||
        metadata.solution.length !== converted.cells.length * converted.cells[0].length))
    delete metadata.solution;
  const output = JSON.stringify({...converted,metadata});
  if (output.length > 8 * 1024 * 1024)
    throw Error('转换后的 Penpa+ 谜题超过 8 MiB 限制');
  return output;
}

export async function convertPenpaUrl(url, loadConverter = () => import('@sudokupad/penpa-to-scl')) {
  const parsed = parsePenpaUrl(url);
  if (!parsed) throw Error('无效的 Penpa+ 分享链接');
  try {
    const {PenpaToSclConverter} = await loadConverter();
    const converted = new PenpaToSclConverter().convertPenpaToScl(parsed.converterUrl);
    return preparePenpaScl(converted);
  } catch (error) {
    throw Error('Penpa+ 转换失败（可能使用了不支持的网格或绘图类型）：' +
      String(error?.message || error));
  }
}
