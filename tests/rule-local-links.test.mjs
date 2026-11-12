import test from 'node:test';
import assert from 'node:assert/strict';
import {renderLinkedRules} from '../src/bilingual.js';

test('tutorial markdown link becomes an in-app button for a visible bundled destination',()=>{
  const make=tag=>({
    tag,children:[],textContent:'',listeners:{},
    append(...children){this.children.push(...children);},
    replaceChildren(){this.children=[];this.textContent='';},
    addEventListener(type,listener){this.listeners[type]=listener;}
  });
  const old=globalThis.document;
  globalThis.document={
    createElement:make,
    createTextNode:value=>({tag:'#text',textContent:value})
  };
  try {
    const panel=make('section');
    let opened=0;
    const url='https://sudokupad.app/sudokuvania/prologue-empty-house?setting-nogrid=1';
    const original='[点此进入教程／序章]('+url+')。';
    renderLinkedRules(panel,original,link=>
      link===url?()=>{opened++;}:null);
    const button=panel.children.find(child=>child.tag==='button');
    assert.ok(button);
    assert.equal(button.textContent,'点此进入教程／序章');
    assert.equal(button.type,'button');
    assert.equal(button.className,'rule-local-link');
    button.listeners.click();
    assert.equal(opened,1);
    assert.equal(panel.children.at(-1).textContent,'。');

    // Hidden/unbundled links are retained as plain text, not external
    // navigation or injected HTML.
    renderLinkedRules(panel,original,()=>null);
    assert.equal(panel.textContent,original);
    assert.equal(panel.children.length,0);
    const injection='<img src=x onerror=alert(1)>';
    renderLinkedRules(panel,injection,()=>()=>{});
    assert.equal(panel.textContent,injection);
    assert.equal(panel.children.length,0);
  }finally{globalThis.document=old;}
});
