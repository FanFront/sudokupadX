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


// The portal supports a permanent, server-side advanced search URL.
// Using search fields avoids downloading thousands of puzzles to a phone.
export function logicMastersSearchUrl(keyword = '', start = 0) {
  const search = String(keyword).trim();
  if (search.length > 100) throw Error('搜索关键词最多 100 个字符');
  if (!Number.isSafeInteger(start) || start < 0 || start > 20000 || start % 20 !== 0)
    throw Error('无效的搜索页码');
  const url = new URL('https://logic-masters.de/Raetselportal/Suche/erweitert.php');
  url.searchParams.set('chlang','en');
  if (search) {
    url.searchParams.set('skname','x');
    url.searchParams.set('sktext','x');
    url.searchParams.set('suchtext',search);
  }
  if (start) url.searchParams.set('start',String(start));
  return url.href;
}

// Result HTML includes official "zeigen.php?id=XXXXXX" links. Read the
// actual result anchors, never construct records from guessed puzzle IDs.
// The function is DOM-free so the parser can be unit-tested in Node.
export function parseLogicMastersSearch(html) {
  if (typeof html !== 'string' || html.length > 1024*1024)
    throw Error('Logic Masters 搜索结果内容无效或超过 1 MiB');
  const linkPattern = /<a\b([^>]*\bhref\s*=\s*(["'])(.*?)\2[^>]*)>([\s\S]*?)<\/a>/gi;
  const items = [], seen = new Set();
  let match;
  while ((match=linkPattern.exec(html))!==null) {
    let url;
    try {
      url = new URL(decodeEntities(match[3]),
        'https://logic-masters.de/Raetselportal/Suche/erweitert.php');
    } catch {continue;}
    if (url.hostname !== 'logic-masters.de' && url.hostname !== 'www.logic-masters.de') continue;
    if (url.pathname !== '/Raetselportal/Raetsel/zeigen.php') continue;
    const id = (url.searchParams.get('id') || '').toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(id) || seen.has(id)) continue;
    const title = plainText(match[4]);
    if (!title) continue;
    seen.add(id);
    // Read the adjacent author link when it exists, without trusting any HTML.
    const after = html.slice(linkPattern.lastIndex,linkPattern.lastIndex+450);
    const authorMatch = after.match(/(?:\bby\b|\bvon\b)\s*(?:<a\b[^>]*>)?([^<(\n]{1,100})/i);
    items.push({
      id, title: title.slice(0,240),
      author: authorMatch ? plainText(authorMatch[1]).slice(0,100) : '',
      url:logicMastersReference(id).url
    });
    if (items.length >= 20) break;
  }
  const totalMatch = plainText(html.slice(0,15000))
    .match(/([\d.,]+)\s+(?:entries have been found|Eintr[aä]ge (?:wurden )?gefunden|Rätsel (?:wurden )?gefunden)/i);
  const total = totalMatch ? Number(totalMatch[1].replace(/[.,]/g,'')) : null;
  return {items, total:Number.isSafeInteger(total) ? total : null};
}
