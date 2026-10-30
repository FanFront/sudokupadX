import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PEN_COLORS,normalizePenLines,penNodeAt,tracePenNodes,
  createPenStroke,applyPenStep,penStrokeLines,penSegmentKey
} from '../src/pen-lines.js';

const puzzle={rows:9,cols:9};
const camera={x:0,y:0,scale:1};
const center=(x,y)=>[2*x+1,2*y+1];
const edge=(x,y)=>[2*x,2*y];

test('pen snaps to cell centers or vertices independent of camera zoom and pan',()=>{
  assert.deepEqual(penNodeAt({x:26,y:78},camera,52,puzzle,'center'),center(0,1));
  assert.deepEqual(penNodeAt({x:52,y:104},camera,52,puzzle,'edge'),edge(1,2));
  assert.deepEqual(penNodeAt({x:100,y:200},{x:48,y:96,scale:2},52,puzzle,'center'),center(0,1));
  assert.equal(penNodeAt({x:-5,y:50},camera,52,puzzle,'center'),null);
  assert.equal(penNodeAt({x:470,y:20},camera,52,puzzle,'center'),null);
});

test('fast finger movement is sampled as adjacent cell-center segments',()=>{
  const from={x:26,y:26},to={x:26+52*5,y:26};
  const nodes=tracePenNodes(from,to,camera,52,puzzle,'center');
  const stroke=createPenStroke([],PEN_COLORS[0]);
  let previous=center(0,0);
  for(const node of nodes){
    if(node)applyPenStep(stroke,previous,node);
    previous=node;
  }
  const lines=penStrokeLines(stroke);
  assert.equal(lines.length,5);
  assert.deepEqual(lines[0].a,center(0,0));
  assert.deepEqual(lines[4].b,center(5,0));
});

test('one stroke can connect diagonal centers; drawing over it erases instead of duplicating',()=>{
  const a=center(2,2),b=center(3,3);
  const first=createPenStroke([],PEN_COLORS[2]);
  assert.equal(applyPenStep(first,a,b),true);
  assert.equal(applyPenStep(first,b,a),false);
  const saved=normalizePenLines(penStrokeLines(first),9,9);
  assert.equal(saved.length,1);
  assert.equal(penSegmentKey(saved[0].a,saved[0].b),penSegmentKey(b,a));
  const second=createPenStroke(saved,PEN_COLORS[2]);
  assert.equal(applyPenStep(second,b,a),true);
  assert.equal(penStrokeLines(second).length,0);
});

test('edge lines are distinct from cell-center lines and eraser respects exact segment',()=>{
  const a=edge(1,1),b=edge(2,1);
  const stroke=createPenStroke([],PEN_COLORS[3]);
  assert.equal(applyPenStep(stroke,a,b),true);
  assert.equal(applyPenStep(stroke,center(0,0),center(1,0)),true);
  const two=penStrokeLines(stroke);
  assert.equal(two.length,2);
  const erase=createPenStroke(two,PEN_COLORS[3],true);
  assert.equal(applyPenStep(erase,a,b),true);
  assert.equal(penStrokeLines(erase).length,1);
  assert.deepEqual(penStrokeLines(erase)[0].a,center(0,0));
});

test('foreign or malformed strokes are rejected, duplicates are normalized',()=>{
  const segment={a:center(0,0),b:center(1,0),color:PEN_COLORS[0]};
  assert.equal(normalizePenLines([segment,{...segment,a:segment.b,b:segment.a}],9,9).length,1);
  for(const invalid of [
    {...segment,b:center(3,0)},
    {...segment,b:edge(1,1)},
    {...segment,color:'#123456'},
    {...segment,a:[-1,1]},
    {...segment,a:[1.5,1]},
    {...segment,a:[0,1]}
  ])assert.throws(()=>normalizePenLines([invalid],9,9),/pen line/i);
  assert.throws(()=>normalizePenLines({},9,9),/pen lines/i);
});
