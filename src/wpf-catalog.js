// The ropeko database indexes puzzle types and WPF competition references.
// A competition reference is not an individual puzzle file: GP PDFs contain
// multiple puzzles. Validate the URL and verify PDF magic bytes on download.
export const WPF_SEARCH_URL = 'https://logic-puzzles.ropeko.ch/php/db/search.php';
const ROOT = 'https://gp.worldpuzzle.org/sites/default/files/Puzzles/';

export function parseWpfIndex(html) {
  if (typeof html !== 'string' || html.length > 4 * 1024 * 1024) throw Error('WPF 索引格式无效');
  const text = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ')
    .replace(/&amp;/gi,'&').replace(/\s+/g,' ');
  const rounds = [], seen = new Set();
  const pattern = /WPF\s+(Sudoku|Puzzle)\s+GP\s+(20\d{2})\s*-\s*(Round\s+\d+(?:\s*[ABCX]|\s+(?:Casual|Competitive))?|Playoffs)\s*\((\d+)\)/gi;
  for (const match of text.matchAll(pattern)) {
    const kind = match[1].toLowerCase();
    const year = Number(match[2]), round = match[3].replace(/\s+/g,' ').trim();
    const id = 'wpf:' + kind + ':' + year + ':' + round.toLowerCase().replace(/\s+/g,'-');
    if (seen.has(id)) continue;
    seen.add(id);
    rounds.push({id,kind,year,round,referenceId:Number(match[4]),
      title:'WPF ' + (kind === 'sudoku' ? 'Sudoku' : 'Puzzle') + ' GP ' + year + ' - ' + round,
      sourceUrl:WPF_SEARCH_URL});
  }
  const types = [];
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(html,'text/html');
    const distinct = new Set();
    for (const node of doc.querySelectorAll('a[href]')) {
      let url;
      try { url = new URL(node.getAttribute('href'),WPF_SEARCH_URL); } catch { continue; }
      const matched = /^\/php\/db\/puzzle\.php$/.test(url.pathname) &&
        /^(\d{1,4})$/.exec(url.searchParams.get('id') || '');
      if (!matched || url.hostname !== 'logic-puzzles.ropeko.ch') continue;
      const id = Number(matched[1]);
      const title = (node.textContent || '').trim();
      if (!title || title.length > 150 || distinct.has(id)) continue;
      distinct.add(id);
      types.push({id:'wpf:type:' + id,typeId:id,title,sourceUrl:url.href});
    }
  }
  rounds.sort((a,b)=>b.year-a.year || a.kind.localeCompare(b.kind) ||
    a.round.localeCompare(b.round,undefined,{numeric:true}));
  types.sort((a,b)=>a.title.localeCompare(b.title));
  return {rounds,types};
}

export function filterWpfIndex(items,{search='',year='',kind=''}={}) {
  const needle=search.trim().toLocaleLowerCase();
  return items.filter(item=>(!year || String(item.year)===String(year)) &&
    (!kind || item.kind===kind) &&
    (!needle || [item.title,item.round,String(item.year),item.id]
      .some(part=>String(part||'').toLocaleLowerCase().includes(needle))));
}

// WPF puzzle-type references can point to PDF files hosted by authors,
// national federations or historical archives, not only WPF's GP directory.
// Accept absolute public HTTP(S) URLs whose final path suffix is ".pdf".
// Keep URL-level guardrails; native Android verifies PDF bytes on download.
export function validatedWpfPdfUrl(raw) {
  if (typeof raw!=='string' || !raw || raw.length>2048 ||
      raw.trim()!==raw || /[\x00-\x1f\x7f]/.test(raw) ||
      !/\.pdf$/i.test(raw) || /%2f|%5c|%2e/i.test(raw)) return null;
  try {
    const url=new URL(raw);
    const host=url.hostname.toLowerCase().replace(/\.$/,'');
    if (!['http:','https:'].includes(url.protocol) || !host ||
        url.username || url.password || url.port || url.search || url.hash ||
        !/\.pdf$/i.test(url.pathname) || url.href.length>2048 ||
        // Reject loopback, literal IPs and private network hostnames.
        host.startsWith('[') || /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
        /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host) ||
        /(?:^|\/)(?:\.\.?)(?:\/|$)/.test(url.pathname))
      return null;
    return url.href;
  } catch { return null; }
}

// Conventional WPF GP competition-booklet filenames. Some older rounds used
// other names; those attempts fail closed (HTTP/magic bytes), never open HTML.
export function wpfRoundPdfCandidates(entry) {
  const n=/^Round\s+(\d+)(?:\s*([ABCX])|\s+(Casual|Competitive))?$/i.exec(entry.round||'');
  if (!n || !Number.isInteger(entry.year) || entry.year<2014 || entry.year>2100 ||
      !['sudoku','puzzle'].includes(entry.kind)) return [];
  const stem=entry.year+'_'+(entry.kind==='sudoku'?'Sudoku':'Puzzle')+'Round'+n[1];
  const suffix=n[2]||n[3]||'';
  return [...new Set([
    ...(suffix?[stem+suffix,stem+'_'+suffix]:[]),stem
  ].map(file=>ROOT+entry.year+'/'+file+'.pdf'))].filter(validatedWpfPdfUrl);
}

export function parseWpfTypePdfs(html) {
  if (typeof html!=='string' || html.length>1024*1024) throw Error('WPF 题型页面太大');
  if (typeof DOMParser==='undefined') return [];
  const doc=new DOMParser().parseFromString(html,'text/html');
  const found=new Map();
  for (const link of doc.querySelectorAll('a[href]')) {
    let url;
    try { url=new URL(link.getAttribute('href'),WPF_SEARCH_URL); } catch { continue; }
    const pdfUrl=validatedWpfPdfUrl(url.href);
    if (!pdfUrl || found.has(pdfUrl)) continue;
    const title=(link.textContent||'').trim().slice(0,160) ||
      decodeURIComponent(url.pathname.split('/').pop()).replace(/\.pdf$/i,'');
    found.set(pdfUrl,{id:'wpf:pdf:'+pdfUrl,title,pdfUrl,sourceUrl:WPF_SEARCH_URL});
  }
  return [...found.values()];
}

export function isPdfData(data) {
  const bytes=data instanceof Uint8Array ? data : new Uint8Array(data||[]);
  return bytes.byteLength>=5 && bytes[0]===37 && bytes[1]===80 &&
    bytes[2]===68 && bytes[3]===70 && bytes[4]===45;
}
