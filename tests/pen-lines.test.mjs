import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PEN_COLORS,normalizePenLines,normalizePenMarks,penNodeAt,penMarkAt,
  tapPenMark,tracePenNodes,straightDiagonalPenNodes,
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

test('diagonal R1C1 to R2C2 and R1C2 to R2C1 remain single diagonal lines',()=>{
  for(const [start,end,expectedA,expectedB] of [
    [{x:26,y:26},{x:78,y:78},center(0,0),center(1,1)],
    [{x:78,y:26},{x:26,y:78},center(1,0),center(0,1)]
  ]){
    const nodes=straightDiagonalPenNodes(start,end,
      [start,{x:(start.x+end.x)/2+1,y:(start.y+end.y)/2-1},end],
      camera,52,puzzle,'center');
    assert.deepEqual(nodes,[expectedA,expectedB]);
    const stroke=createPenStroke([],PEN_COLORS[1]);
    assert.equal(applyPenStep(stroke,...nodes),true);
    assert.deepEqual(penStrokeLines(stroke),[{a:expectedA,b:expectedB,color:PEN_COLORS[1]}]);
  }
});

test('small finger jitter on a diagonal is corrected, but deliberate right angles stay',()=>{
  const start={x:26,y:26},end={x:78,y:78};
  assert.deepEqual(straightDiagonalPenNodes(start,end,
    [start,{x:53,y:49},end],camera,52,puzzle,'center'),
    [center(0,0),center(1,1)]);
  assert.equal(straightDiagonalPenNodes(start,end,
    [start,{x:78,y:26},end],camera,52,puzzle,'center'),null);
  // Even if the WebView only sends down/up, the release still joins cells.
  assert.deepEqual(straightDiagonalPenNodes(start,end,[start,end],camera,52,puzzle,'center'),
    [center(0,0),center(1,1)]);
  assert.deepEqual(straightDiagonalPenNodes({x:0,y:0},{x:104,y:104},
    [{x:0,y:0},{x:104,y:104}],camera,52,puzzle,'edge'),
    [edge(0,0),edge(1,1),edge(2,2)]);
});

test('taps choose cell centers, edge midpoints or grid intersections',()=>{
  assert.deepEqual(penMarkAt({x:26,y:26},camera,52,puzzle),[1,1]);
  assert.deepEqual(penMarkAt({x:52,y:26},camera,52,puzzle),[2,1]);
  assert.deepEqual(penMarkAt({x:26,y:52},camera,52,puzzle),[1,2]);
  assert.deepEqual(penMarkAt({x:52,y:52},camera,52,puzzle),[2,2]);
  assert.deepEqual(penMarkAt({x:99,y:148},{x:47,y:96,scale:2},52,puzzle),[1,1]);
  assert.equal(penMarkAt({x:500,y:500},camera,52,puzzle),null);
});

test('cell tap cycles circle, X and clear while grid-line tap starts with X',()=>{
  let marks=[];
  const centerPoint=[1,1],edgePoint=[2,1];
  marks=tapPenMark(marks,centerPoint,PEN_COLORS[2]);
  assert.deepEqual(marks,[{at:centerPoint,type:'circle',color:PEN_COLORS[2]}]);
  marks=tapPenMark(marks,centerPoint,PEN_COLORS[2]);
  assert.equal(marks[0].type,'cross');
  marks=tapPenMark(marks,centerPoint,PEN_COLORS[2]);
  assert.deepEqual(marks,[]);
  marks=tapPenMark(marks,edgePoint,PEN_COLORS[3]);
  assert.equal(marks[0].type,'cross');
  marks=tapPenMark(marks,edgePoint,PEN_COLORS[3]);
  assert.equal(marks[0].type,'circle');
  marks=tapPenMark(marks,edgePoint,PEN_COLORS[3]);
  assert.deepEqual(marks,[]);
});

test('eraser only removes selected mark and marks stay in bounds for saves',()=>{
  const cell=tapPenMark([],[1,1],PEN_COLORS[0]);
  const two=tapPenMark(cell,[2,1],PEN_COLORS[4]);
  assert.equal(two.length,2);
  const removed=tapPenMark(two,[2,1],PEN_COLORS[1],true);
  assert.deepEqual(removed,cell);
  assert.equal(tapPenMark(removed,[2,1],PEN_COLORS[1],true),removed);
  assert.deepEqual(normalizePenMarks(two,9,9),two);
  for(const mark of [
    {at:[-1,1],type:'circle',color:PEN_COLORS[0]},
    {at:[20,1],type:'cross',color:PEN_COLORS[0]},
    {at:[2.2,1],type:'cross',color:PEN_COLORS[0]},
    {at:[1,1],type:'dot',color:PEN_COLORS[0]},
    {at:[1,1],type:'cross',color:'#abc'}
  ])assert.throws(()=>normalizePenMarks([mark],9,9),/pen mark/i);
  assert.throws(()=>normalizePenMarks({},9,9),/pen mark/i);
});
