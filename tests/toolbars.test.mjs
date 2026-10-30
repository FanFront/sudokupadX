import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const boardButtons=['homeButton','backButton','linkedPuzzleButton','rulesButton','gridButton','fitButton'];

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

test('puzzle board has a single icon toolbar including Home and linked-puzzle back',()=>{
  for(const id of boardButtons){
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
  assert.ok(!html.includes('class="top-actions"'),'second app toolbar must not display on the board');
  const home=html.slice(html.indexOf('id="homeScreen"'),html.indexOf('id="gameScreen"'));
  for(const id of ['libraryButton','checkpointButton','importButton','continueButton'])
    assert.ok(home.includes('id="'+id+'"'),id+' must be on Home');
  assert.ok(!html.slice(html.indexOf('id="gameScreen"'),html.indexOf('</main>')).includes('id="libraryButton"'));
});

test('mobile solving controls use a three-column number grid and a vertical mode rail',()=>{
  assert.match(html,/class="play-deck"/);
  assert.match(css,/#app \.play-deck\{display:grid;grid-template-columns/);
  assert.match(css,/#app \.keypad\{grid-template-columns:repeat\(3/);
  assert.match(css,/#app \.play-deck \.mode-bar\{order:initial;grid-template-columns:1fr/);
  assert.match(css,/#app \.board-footer\{display:none\}/);
  assert.match(css,/#app #gameScreen\[hidden\]/);
  for(const id of ['alphabetButton','letterPage','eraseButton','undoButton','redoButton','checkButton'])
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
});

test('linked-puzzle count, grid state and navigation remain accessible',()=>{
  assert.ok(!main.includes('entrance.textContent='));
  assert.ok(main.includes('entrance.hidden=count===0'));
  assert.ok(main.includes("entrance.setAttribute('aria-label',label)"));
  assert.ok(main.includes('badge.hidden=count<=1'));
  assert.ok(main.includes("badge.textContent=count>9?'9+':String(count)"));
  assert.ok(css.includes('#app .board-tools .linked-puzzle-entry'));
  assert.ok(css.includes('#app .linked-puzzle-count[hidden]{display:none!important}'));
  assert.ok(!main.includes("$('backButton').textContent"));
  assert.ok(!main.includes("$('gridButton').textContent"));
  assert.ok(main.includes("button.setAttribute('aria-pressed',String(showGridLines))"));
  assert.ok(main.includes("button.setAttribute('aria-label',label)"));
  assert.ok(main.includes("$('homeButton').addEventListener('click',showHome)"));
});
