import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bilingualTitle,displayBilingual} from '../src/bilingual.js';
const read=p=>JSON.parse(readFileSync(new URL('../public/puzzles/'+p,import.meta.url),'utf8'));
const source=read('new-games-source-text.json'),local=read('locale-zh.json');
test('all 69 new games preserve original rules, URLs, titles and completion beside Chinese',()=>{
  assert.equal(Object.keys(source).length,69);
  for(const [id,puzzle] of Object.entries(source)){
    const t=local[id];
    assert.ok(t?.title?.trim(),id+' missing title');
    assert.ok(t?.rules?.trim(),id+' missing Chinese rules');
    assert.equal(t.rulesOriginal,puzzle.rules,id+' original rules lost');
    const links=s=>[...s.matchAll(/https:\/\/sudokupad\.app\/([a-z0-9]{10})/g)].map(m=>m[1]);
    assert.deepEqual(links(t.rules),links(puzzle.rules),id+' links changed');
    assert.equal(t.msgcorrectOriginal||'',puzzle.msgcorrect||'',id+' completion original lost');
    if(puzzle.msgcorrect) assert.ok(t.msgcorrect?.trim(),id+' completion untranslated');
    if(puzzle.title&&puzzle.title!==t.title)assert.equal(t.titleOriginal,puzzle.title,id+' original title lost');
  }
});
test('display helper uses text nodes rather than HTML and supports legacy monolingual puzzles',()=>{
  const node=()=>({textContent:'',children:[],append(...nodes){this.children.push(...nodes);}});
  const old=globalThis.document;
  globalThis.document={createElement:node};
  try{
    const container={children:[],textContent:'',replaceChildren(){this.children=[];this.textContent='';},append(x){this.children.push(x);}};
    displayBilingual(container,'中文 <测试>','Original <test>');
    assert.equal(container.children.length,1);
    const cols=container.children[0].children;
    assert.equal(cols.length,2);
    assert.equal(cols[0].children[1].textContent,'中文 <测试>');
    assert.equal(cols[1].children[1].textContent,'Original <test>');
    assert.equal(bilingualTitle('生命之树','Tree of Life'),'生命之树 / Tree of Life');
    displayBilingual(container,'仅中文',null);
    assert.equal(container.textContent,'仅中文');
  }finally{globalThis.document=old;}
});

test('source artwork has bilingual glosses without rewriting text inside the puzzle',()=>{
  for(const id of ['k4995f3fx1','mfhh567b60']){
    const entries=local[id].boardGlossary;
    assert.ok(Array.isArray(entries)&&entries.length>=3);
    assert.ok(entries.every(x=>x.original?.trim()&&x.zh?.trim()));
  }
});
