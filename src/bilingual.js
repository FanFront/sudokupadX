// Parallel, text-only display of a translation and its source puzzle clues.
export function bilingualTitle(localized, original) {
  const zh=String(localized||'').trim();
  const source=String(original||'').trim();
  return source && source!==zh ? zh+' / '+source : zh;
}
export function displayBilingual(container, translation, original, glossary = [], localAction = null) {
  const zh=String(translation||'');
  const source=typeof original==='string'?original:'';
  container.replaceChildren();
  if(!source || source===zh){renderLinkedRules(container,zh,localAction);return;}
  const grid=document.createElement('div');
  grid.className='bilingual-columns';
  for(const [lang,label,text] of [
    ['zh-Hans','中文译文',zh],['und','原文 / Original',source]
  ]){
    const column=document.createElement('section');
    column.className='bilingual-column';
    column.lang=lang;
    const heading=document.createElement('strong');
    heading.className='bilingual-label';
    heading.textContent=label;
    const body=document.createElement('div');
    body.className='bilingual-copy';
    renderLinkedRules(body,text,localAction);
    column.append(heading,body);
    grid.append(column);
  }
  container.append(grid);
  if(Array.isArray(glossary) && glossary.length){
    const legend=document.createElement('section');
    legend.className='bilingual-glossary';
    const heading=document.createElement('strong');
    heading.textContent='棋盘文字对照（棋盘原文保持不变）';
    legend.append(heading);
    const terms=document.createElement('div');
    terms.className='bilingual-terms';
    for(const item of glossary){
      if(typeof item?.original!=='string'||typeof item?.zh!=='string')continue;
      const row=document.createElement('div');
      row.className='bilingual-term';
      const original=document.createElement('span');
      original.textContent=item.original;
      const translated=document.createElement('span');
      translated.textContent=item.zh;
      row.append(original,translated);
      terms.append(row);
    }
    legend.append(terms);
    container.append(legend);
  }
}

// Only locally bundled SudokuPad links become active controls. All remaining
// source markup stays literal text; no untrusted puzzle HTML is injected.
export function renderLinkedRules(container, text, localAction = null) {
  const value=String(text||'');
  if(typeof localAction!=='function') {container.textContent=value;return;}
  const pattern=/\[([^\]\n]{1,160})\]\((https:\/\/sudokupad\.app\/[A-Za-z0-9_/-]+(?:\?[^\s)]*)?)\)/g;
  let cursor=0,found=false;
  container.replaceChildren();
  for(const match of value.matchAll(pattern)) {
    const action=localAction(match[2]);
    if(typeof action!=='function')continue;
    if(match.index>cursor)
      container.append(document.createTextNode(value.slice(cursor,match.index)));
    const button=document.createElement('button');
    button.type='button';
    button.className='rule-local-link';
    button.textContent=match[1];
    button.addEventListener('click',action);
    container.append(button);
    cursor=match.index+match[0].length;
    found=true;
  }
  if(!found){container.textContent=value;return;}
  if(cursor<value.length)container.append(document.createTextNode(value.slice(cursor)));
}
