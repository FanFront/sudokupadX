import {puzzleIdFromUrl} from './online-library.js';

export const LOGIC_MASTERS_NAME = 'Logic Masters Deutschland';
const BASE = 'https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=';

// Never fetch a user-supplied host: resolve only the official puzzle-page ID.
export function logicMastersReference(input) {
  const raw = String(input || '').trim();
  let id = raw;
  if (/^https?:\/\//i.test(raw)) {
    let url;
    try { url = new URL(raw); } catch { throw Error('Logic Masters 链接无效'); }
    if (url.protocol !== 'https:' ||
        !['logic-masters.de','www.logic-masters.de'].includes(url.hostname) ||
        url.username || url.password || url.port ||
        url.pathname !== '/Raetselportal/Raetsel/zeigen.php')
      throw Error('请提供 Logic Masters 的 HTTPS 谜题页面链接');
    id = url.searchParams.get('id') || '';
  }
  if (!/^[A-Za-z0-9]{6}$/.test(id))
    throw Error('请输入六位 Logic Masters 谜题 ID 或完整页面链接');
  id = id.toUpperCase();
  return {id, url:BASE + id};
}

function decodeEntities(value) {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#(?:x[0-9a-f]+|[0-9]+));/gi, token => {
    const simple = {amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'};
    const key = token.slice(1,-1).toLowerCase();
    if (simple[key]) return simple[key];
    const cp = key.startsWith('#x') ? parseInt(key.slice(2),16) : parseInt(key.slice(1),10);
    return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff
      ? String.fromCodePoint(cp) : token;
  });
}
function plainText(text) {
  return decodeEntities(text.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ')).trim();
}
function supportedLink(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !['sudokupad.app','www.sudokupad.app'].includes(url.hostname) ||
        url.username || url.password || url.port) return null;
    url.hostname = 'sudokupad.app';
    return puzzleIdFromUrl(url.href) ? url.href : null;
  } catch { return null; }
}

// LMD embeds puzzle diagrams as images, but some pages also link to an actual
// SudokuPad definition. Only those links can be loaded without reconstructing
// or altering the author's puzzle.
export function parseLogicMastersPage(html, reference) {
  if (typeof html !== 'string' || html.length > 1024*1024)
    throw Error('Logic Masters 页面内容无效或超出 1 MiB');
  const ref = logicMastersReference(reference?.id || reference);
  const titleMatch = html.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i) ||
    html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = (titleMatch && plainText(titleMatch[1]).replace(/\s*[—|-]\s*Rätselportal.*$/i,'')) ||
    'Logic Masters ' + ref.id;
  const normalized = decodeEntities(html.replace(/\\\//g,'/'));
  const matches = normalized.match(/https?:\/\/(?:www\.)?sudokupad\.app\/[^\s"'<>\\]+/gi) || [];
  const unique = new Set();
  for (let match of matches) {
    match = match.replace(/[),.;]+$/,'');
    const url = supportedLink(match);
    if (url) unique.add(url);
  }
  return [...unique].slice(0,20).map((puzzleUrl, index) => ({
    id:'lmd:' + ref.id + ':' + puzzleIdFromUrl(puzzleUrl),
    title:unique.size === 1 ? title : title + ' · 链接 ' + (index + 1),
    sourceId:'logic-masters',
    sourceName:LOGIC_MASTERS_NAME,
    sourceUrl:ref.url,
    publishedAt:'',
    puzzleUrl
  }));
}

export function directSudokuPadEntry(input) {
  const url = supportedLink(String(input || '').trim());
  if (!url) throw Error('请粘贴有效的 SudokuPad HTTPS 谜题链接');
  const id = puzzleIdFromUrl(url);
  return {
    id:'lmd:direct:' + id, title:'SudokuPad · ' + id.slice(0,50),
    sourceId:'logic-masters',sourceName:LOGIC_MASTERS_NAME,
    sourceUrl:'',publishedAt:'',puzzleUrl:url
  };
}
