import {puzzleIdFromUrl} from './online-library.js';

export const LOGIC_MASTERS_NAME = 'Logic Masters Deutschland';
const BASE = 'https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=';

// The portal sorts the entire result set, not merely the 20 loaded items.
export const LOGIC_MASTERS_SORTS = Object.freeze([
  {value:'neu',label:'最新发布'},
  {value:'schoen',label:'评分最高'},
  {value:'leicht',label:'难度最低'}
]);

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
// LMD presents difficulty as the image's alt/title text in the search table.
// Ratings may be the setter's estimate until enough solvers have voted.
function difficultyFromText(value) {
  const text = decodeEntities(value).toLowerCase().replace(/[\s\u00a0]+/g,' ');
  let level = null;
  if (/sehr leicht|very easy/.test(text)) level = 1;
  else if (/sehr schwer|very hard/.test(text)) level = 5;
  else if (/mittelschwer|medium|moderate/.test(text)) level = 3;
  else if (/\bleicht|easy/.test(text)) level = 2;
  else if (/schwer|hard/.test(text)) level = 4;
  return level === null ? null : {
    level, estimated:/geschätzt|estimated|author(?:'s)? estimate/.test(text)
  };
}
// Beauty/quality rating is a separate percentage, not a difficulty star.
// An N/A or missing percentage must stay unrated.
function ratingPercentFromHtml(fragment, labeled = false) {
  const text = plainText(fragment);
  const pattern = labeled ? /\b(?:Rating|Bewertung)\s*:\s*(\d{1,3})\s*%/gi : /(?:^|\s)(\d{1,3})\s*%/g;
  let rating = null;
  for (const match of text.matchAll(pattern)) {
    const value = Number(match[1]);
    if (value >= 0 && value <= 100) rating = value;
  }
  return rating;
}
function difficultyFromHtml(fragment) {
  const images = fragment.match(/<img\b[^>]*>/gi) || [];
  for (const image of images) {
    const attrs = [...image.matchAll(/\b(?:alt|title)\s*=\s*(["'])(.*?)\1/gi)];
    for (const attr of attrs) {
      const difficulty = difficultyFromText(attr[2]);
      if (difficulty) return difficulty;
    }
  }
  return null;
}
export function logicMastersDifficultyLabel(level, estimated = false) {
  const labels = ['非常简单','简单','中等','困难','非常困难'];
  if (!Number.isInteger(level) || level < 1 || level > 5) return '';
  return '★'.repeat(level) + '☆'.repeat(5-level) + ' ' + labels[level-1] +
    (estimated ? ' · 作者预估' : '');
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

// HTML attribute values can be quoted or unquoted on the portal. Read as
// data only: callers must create their own DOM nodes rather than insert HTML.
function imageAttribute(tag, name) {
  const match = tag.match(new RegExp("\\b" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))","i"));
  return match ? decodeEntities(match[1] ?? match[2] ?? match[3]) : '';
}
function officialPuzzleImage(raw, base) {
  if (!raw || raw.length > 2048) return null;
  try {
    const url = new URL(raw.trim(), base);
    // All source URLs are sanitized; only HTTPS image requests are allowed.
    // This includes external HTTPS image hosts chosen by the puzzle author.
    if (url.protocol !== 'https:' || url.username || url.password ||
        (url.port && url.port !== '443')) return null;
    return url.href;
  } catch { return null; }
}
// Preserve the author's order of paragraphs, inline images and rules. Never
// inject remote HTML: each segment is rendered as a text node or a validated
// HTTPS image element, so scripts/attributes from the page cannot execute.
function descriptionSegments(region, base) {
  const clean = region
    .replace(/<!--[\s\S]*?-->/g,'')
    .replace(/<(script|style|noscript|form)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
  const segments = [];
  let text = '';
  let totalText = 0;
  let imageCount = 0;
  function flushText() {
    const lines = decodeEntities(text).replace(/\u00a0/g,' ')
      .split(/\n+/).map(line => line.replace(/\s+/g,' ').trim())
      .filter(line => line && !/^\(?\s*(?:Eingestellt|Published|Posted)\b/i.test(line));
    const value = lines.join('\n').slice(0,Math.max(0,12000-totalText));
    if (value) {
      segments.push({type:'text',text:value});
      totalText += value.length;
    }
    text = '';
  }
  const tags = /<img\b[^>]*>|<br\s*\/?>|<li\b[^>]*>|<\/(?:p|div|ul|ol|li|h[1-6]|table|tr|blockquote)\s*>|<[^>]*>/gi;
  let lastIndex = 0;
  for (const match of clean.matchAll(tags)) {
    text += clean.slice(lastIndex,match.index);
    const tag = match[0];
    if (/^<img\b/i.test(tag)) {
      const src = imageAttribute(tag,'data-src') || imageAttribute(tag,'src');
      const url = officialPuzzleImage(src,base);
      if (url && imageCount < 24) {
        flushText();
        segments.push({
          type:'image',url,
          alt:imageAttribute(tag,'alt').replace(/\s+/g,' ').slice(0,240)
        });
        imageCount++;
      } else text += ' [图片无法显示] ';
    } else if (/^<br\b/i.test(tag) ||
        /^<\/(?:p|div|ul|ol|li|h[1-6]|table|tr|blockquote)\b/i.test(tag)) {
      text += '\n';
    } else if (/^<li\b/i.test(tag)) {
      text += '\n• ';
    } else {
      text += ' ';
    }
    lastIndex=match.index+tag.length;
  }
  text+=clean.slice(lastIndex);
  flushText();
  return segments;
}

// Keep the setter's original-language rules and embedded images in source
// order. Only the puzzle body is parsed (never portal icons/comments).
export function parseLogicMastersDetails(html, reference) {
  if (typeof html !== 'string' || html.length > 1024*1024)
    throw Error('Logic Masters 页面内容无效或超出 1 MiB');
  const titleMatch = /<h2\b[^>]*>([\s\S]*?)<\/h2>/i.exec(html);
  const title = titleMatch ? plainText(titleMatch[1]) : '';
  const afterHeading = titleMatch
    ? html.slice(titleMatch.index + titleMatch[0].length) : '';
  const codeAt = afterHeading.search(
    /(?:L(?:ö|&ouml;|&#(?:246|x0*f6);)sungscode|Solution(?:\s|&nbsp;)*code)\s*:/i
  );
  // Missing code delimiter: do not accidentally copy the entire portal chrome.
  const region = codeAt >= 0 ? afterHeading.slice(0,codeAt) : '';
  const base = reference ? logicMastersReference(reference?.id || reference).url :
    'https://logic-masters.de/Raetselportal/Raetsel/zeigen.php';
  const segments = descriptionSegments(region,base);
  const images = segments.filter(part => part.type === 'image').map(
    ({url,alt}) => ({url,alt})
  );
  const hasImages = /<img\b/i.test(region);
  const description = segments.filter(part=>part.type === 'text')
    .map(part=>part.text).join('\n');
  const difficulty = difficultyFromHtml(html);
  return {
    title, description, hasImages, images, segments,
    difficulty:difficulty?.level ?? null,
    difficultyEstimated:difficulty?.estimated ?? false,
    ratingPercent:ratingPercentFromHtml(html,true)
  };
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
export function logicMastersSearchUrl(keyword = '', start = 0, sort = 'neu') {
  const search = String(keyword).trim();
  if (search.length > 100) throw Error('搜索关键词最多 100 个字符');
  if (!Number.isSafeInteger(start) || start < 0 || start > 20000 || start % 20 !== 0)
    throw Error('无效的搜索页码');
  if (!LOGIC_MASTERS_SORTS.some(option => option.value === sort))
    throw Error('无效的 Logic Masters 排序方式');
  const url = new URL('https://logic-masters.de/Raetselportal/Suche/erweitert.php');
  url.searchParams.set('chlang','en');
  url.searchParams.set('sort',sort);
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
    // Limit metadata to the same table row to prevent borrowing the next
    // puzzle's difficulty or author when a field is absent.
    const endRow = html.indexOf('</tr>',linkPattern.lastIndex);
    const nextRow = html.indexOf('<tr',linkPattern.lastIndex);
    const end = endRow >= 0 && (nextRow < 0 || endRow < nextRow)
      ? endRow : Math.min(html.length,linkPattern.lastIndex+650);
    const after = html.slice(linkPattern.lastIndex,end);
    const authorMatch = after.match(/(?:\bby\b|\bvon\b)\s*(?:<a\b[^>]*>)?([^<(\n]{1,100})/i);
    const rating = difficultyFromHtml(after);
    items.push({
      id, title: title.slice(0,240),
      author: authorMatch ? plainText(authorMatch[1]).slice(0,100) : '',
      difficulty:rating?.level ?? null,
      difficultyEstimated:rating?.estimated ?? false,
      ratingPercent:ratingPercentFromHtml(after),
      url:logicMastersReference(id).url
    });
    if (items.length >= 20) break;
  }
  const totalMatch = plainText(html.slice(0,15000))
    .match(/([\d.,]+)\s+(?:entries have been found|Eintr[aä]ge (?:wurden )?gefunden|Rätsel (?:wurden )?gefunden)/i);
  const total = totalMatch ? Number(totalMatch[1].replace(/[.,]/g,'')) : null;
  return {items, total:Number.isSafeInteger(total) ? total : null};
}
