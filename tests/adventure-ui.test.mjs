import test from 'node:test';
import assert from 'node:assert/strict';
import {isVisible,getSectors,getLinkedPuzzles,drawFog,focusInitialFog} from '../src/adventure-ui.js';

test('hidden cells are not selectable while ordinary boards remain visible',()=>{
  assert.equal(isVisible({visible:[true,false]},0),true);
  assert.equal(isVisible({visible:[true,false]},1),false);
  assert.equal(isVisible({cells:[]},0),true);
  assert.equal(isVisible({visible:[true]},-1),false);
});

test('select smallest overlapping sector and keep its rules separate',()=>{
  const puzzle={sectors:[
    {title:'Region',width:9,height:9,cells:[10,11]},
    {title:'Boss Room',width:1,height:1,cells:[11]},
    {title:'Other',width:1,height:1,cells:[35]}
  ]};
  assert.deepEqual(getSectors(puzzle,11).map(x=>x.title),['Boss Room','Region']);
  assert.deepEqual(getSectors(puzzle,1),[]);
});

test('only imported puzzle ids referenced by rules become links',()=>{
  const catalog=[
    {id:'boss-a',url:'https://sudokupad.app/abc',kind:'boss',group:'a',title:'Boss'},
    {id:'boss-b',url:'https://sudokupad.app/xyz',kind:'boss',group:'b',title:'Hidden'}
  ];
  const rules='[Play](https://sudokupad.app/abc) and [Again](https://sudokupad.app/abc).';
  assert.deepEqual(getLinkedPuzzles(rules,catalog,'a').map(x=>x.id),['boss-a']);
  assert.deepEqual(getLinkedPuzzles('No links yet',catalog,'a'),[]);
});

test('fog is painted only over the covered cells',()=>{
  const fills=[];
  const context={save(){},restore(){},fillRect(...args){fills.push(args)},set fillStyle(x){this.color=x}};
  drawFog(context,{rows:2,cols:2},{visible:[true,false,false,true]},
    {left:0,top:0,right:104,bottom:104});
  assert.equal(fills.length,2);
  assert.deepEqual(fills.map(x=>x.slice(0,2)),[[52,0],[0,52]]);
});

test('initial camera focuses a dense visible area instead of whole map',()=>{
  const visible=Array(40*40).fill(false);
  for(let r=18;r<=20;r++)for(let c=16;c<=18;c++)visible[r*40+c]=true;
  visible[0]=true;
  const puzzle={rows:40,cols:40,cells:Array(1600)};
  const camera=focusInitialFog(puzzle,{visible},{width:400,height:600});
  assert.ok(camera.scale>.1);
  assert.ok(camera.x<0&&camera.y<0);
});
