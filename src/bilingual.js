// Parallel, text-only display of a translation and its source puzzle clues.
export function bilingualTitle(localized, original) {
  const zh=String(localized||'').trim();
  const source=String(original||'').trim();
  return source && source!==zh ? zh+' / '+source : zh;
}
export function displayBilingual(container, translation, original) {
  const zh=String(translation||'');
  const source=typeof original==='string'?original:'';
  container.replaceChildren();
  if(!source || source===zh){container.textContent=zh;return;}
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
    body.textContent=text;
    column.append(heading,body);
    grid.append(column);
  }
  container.append(grid);
}
