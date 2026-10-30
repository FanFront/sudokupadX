import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const headerButtons=['backButton','libraryButton','demoButton','checkpointButton','importButton'];
const boardButtons=['linkedPuzzleButton','rulesButton','gridButton','fitButton'];

function markup(id){
  const marker='id="'+id+'"';
  assert.equal(html.split(marker).length-1,1,'duplicate or missing button '+id);
  const markerIndex=html.indexOf(marker);
  const start=html.lastIndexOf('<button',markerIndex);
  const openEnd=html.indexOf('>',markerIndex);
  const end=html.indexOf('</button>',openEnd);
  assert.ok(start>=0 && end>openEnd,'button structure for '+id);
  return {tag:html.slice(start,openEnd+1),body:html.slice(openEnd+1,end)};
}

test('app and board toolbars have icons, accessible labels, and no width-changing text',()=>{
  for(const id of [...headerButtons,...boardButtons]){
    const {tag,body}=markup(id);
    assert.ok(tag.includes('icon-button'),id+' is not an icon button');
    assert.match(tag,/aria-label="[^"]+"/,'accessible name missing '+id);
    assert.match(tag,/title="[^"]+"/,'tooltip missing '+id);
    assert.ok(body.includes('<svg ') && body.includes('aria-hidden="true"'),'icon missing '+id);
    const remainder=body.replace(/<svg[\s\S]*?<\/svg>/,'')
      .replace(/<span[^>]*id="linkedPuzzleCount"[^>]*><\/span>/,'');
    assert.equal(remainder.trim(),'','text may change icon width: '+id);
  }
  assert.ok(html.includes('role="toolbar" aria-label="棋盘操作"'));
  assert.ok(html.includes('class="top-actions" aria-label="应用操作"'));
});

test('linked puzzles use an icon plus a small count badge without replacing icon markup',()=>{
  assert.ok(!main.includes('entrance.textContent='));
  assert.ok(main.includes('entrance.hidden=count===0'));
  assert.ok(main.includes("entrance.setAttribute('aria-label',label)"));
  assert.ok(main.includes('badge.hidden=count<=1'));
  assert.ok(main.includes("badge.textContent=count>9?'9+':String(count)"));
  assert.ok(css.includes('#app .board-tools .linked-puzzle-entry'));
  assert.ok(css.includes('#app .linked-puzzle-count[hidden]{display:none!important}'));
});

test('grid and back update names without replacing their icon children',()=>{
  assert.ok(!main.includes("$('backButton').textContent"));
  assert.ok(!main.includes("$('gridButton').textContent"));
  assert.ok(main.includes("button.setAttribute('aria-pressed',String(showGridLines))"));
  assert.ok(main.includes("button.setAttribute('aria-label',label)"));
  assert.ok(css.includes('#app .top-actions .icon-button[hidden]'));
  assert.ok(css.includes('#app .board-tools .icon-button[hidden]'));
  assert.ok(css.includes('@media(max-width:370px)'));
});
