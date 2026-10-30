import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const headerButtons=['backButton','libraryButton','demoButton','checkpointButton','importButton'];
const boardButtons=['linkedPuzzleButton','rulesButton','gridButton','fitButton'];

function markup(id){
  const escaped=id.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&');
  const matches=[...html.matchAll(new RegExp('<button\\b[^>]*\\bid="'+escaped+'"[^>]*>([\\s\\S]*?)<\\/button>','g'))];
  assert.equal(matches.length,1,id+' must occur exactly once');
  return {tag:matches[0][0].slice(0,matches[0][0].indexOf('>')+1),body:matches[0][1]};
}

test('both toolbars keep their same action ids, with real icons and accessible names',()=>{
  for(const id of [...headerButtons,...boardButtons]){
    const {tag,body}=markup(id);
    assert.match(tag,/class="[^"]*icon-button/,'icon button missing for '+id);
    assert.match(tag,/aria-label="[^"]+"/,'accessible label missing for '+id);
    assert.match(tag,/title="[^"]+"/,'tooltip missing for '+id);
    assert.match(body,/<svg\\b[^>]*aria-hidden="true"/,'SVG icon missing for '+id);
    // Icons stay present when the app toggles grid visibility or linked cells.
    const withoutSvgAndCount=body.replace(/<svg[\\s\\S]*?<\\/svg>/,'')
      .replace(/<span[^>]*id="linkedPuzzleCount"[^>]*><\\/span>/,'');
    assert.equal(withoutSvgAndCount.trim(),'','button has width-changing text: '+id);
  }
  assert.match(html,/role="toolbar" aria-label="棋盘操作"/);
  assert.match(html,/class="top-actions" aria-label="应用操作"/);
});

test('linked puzzle selection updates accessible info and count without removing icon',()=>{
  assert.doesNotMatch(main,/entrance\\.textContent=/);
  assert.match(main,/entrance\\.hidden=count===0/);
  assert.match(main,/entrance\\.setAttribute\\('aria-label',label\\)/);
  assert.match(main,/badge\\.hidden=count<=1/);
  assert.match(main,/badge\\.textContent=count>9\\?'9\\+':String\\(count\\)/);
  assert.match(css,/#app \\.board-tools \\.linked-puzzle-entry/);
  assert.match(css,/#app \\.linked-puzzle-count\\[hidden\\]\\{display:none!important\\}/);
});

test('back and grid state use labels without replacing SVG children',()=>{
  assert.doesNotMatch(main,/\\$\\('backButton'\\)\\.textContent/);
  assert.doesNotMatch(main,/\\$\\('gridButton'\\)\\.textContent/);
  assert.match(main,/button\\.setAttribute\\('aria-pressed',String\\(showGridLines\\)\\)/);
  assert.match(main,/button\\.setAttribute\\('aria-label',label\\)/);
  assert.match(css,/#app \\.top-actions \\.icon-button\\[hidden\\]/);
  assert.match(css,/#app \\.board-tools \\.icon-button\\[hidden\\]/);
  assert.match(css,/@media\\(max-width:370px\\)/);
});
