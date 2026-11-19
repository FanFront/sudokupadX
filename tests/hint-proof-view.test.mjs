import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCandidateProof,proofLinks,candidatePosition,
  describeProofLinks,drawProofLinks,drawProofNodes} from '../src/hints/proof-view.js';

test('strong/weak links from original SudokuCoach chain remain alternating',()=>{
  const proof=normalizeCandidateProof({kind:'chain',nodes:[
    {cell:0,digit:1},{cell:0,digit:2},{cell:1,digit:2},
    {cell:1,digit:3},{cell:10,digit:3},{cell:10,digit:1}
  ]},9);
  assert.deepEqual(proofLinks(proof).map(x=>x.strong),[true,false,true,false,true]);
  assert.match(describeProofLinks(proof,9)[0],/R1C1/);
  assert.match(describeProofLinks(proof,9)[1],/弱链接/);
});

test('color links support both coach pair edges and Rust explicit edges',()=>{
  const coach={kind:'colour',nodes:[
    {cell:0,digit:1,colour:0},{cell:1,digit:1,colour:1}
  ],edges:[[0,1]]};
  const rust={...coach,edges:[{from:0,to:1,strong:true}]};
  for(const data of [coach,rust]){
    const parsed=normalizeCandidateProof(data,4);
    assert.ok(parsed);
    assert.deepEqual(parsed.edges,[{from:0,to:1,strong:true}]);
  }
});

test('proof positions scale without assuming 9x9 or 3x3 boxes',()=>{
  const pos4=candidatePosition(4,3,4,52);
  assert.equal(pos4.y,52+39);
  const pos6=candidatePosition(7,6,6,52);
  assert.equal(pos6.x,52+52/6*5);
  const pos9=candidatePosition(10,5,9,52);
  assert.equal(pos9.x,52+26);
});

test('malformed proofs are never painted or displayed',()=>{
  const valid={kind:'colour',nodes:[
    {cell:0,digit:1,colour:0},{cell:1,digit:1,colour:1}
  ],edges:[[0,1]]};
  assert.equal(normalizeCandidateProof({...valid,nodes:[{cell:81,digit:2}]},9),null);
  assert.equal(normalizeCandidateProof({...valid,edges:[[0,55]]},9),null);
  assert.equal(normalizeCandidateProof({...valid,edges:[[0,0]]},9),null);
  assert.equal(normalizeCandidateProof({...valid,nodes:[{cell:0,digit:1,colour:3},
    valid.nodes[1]]},9),null);
  assert.equal(normalizeCandidateProof({...valid,kind:'search'},9),null);
});

test('canvas paints links before candidate nodes and respects fog visibility',()=>{
  const calls=[];
  const ctx={save(){calls.push('save');},restore(){calls.push('restore');},
    beginPath(){},moveTo(){},lineTo(){},stroke(){calls.push('stroke');},
    setLineDash(){},roundRect(){},fill(){calls.push('fill');},
    fillText(){},set strokeStyle(x){},set fillStyle(x){},
    set lineWidth(x){},set font(x){},set textAlign(x){},
    set textBaseline(x){},set lineCap(x){}};
  const proof={kind:'colour',nodes:[
    {cell:0,digit:1,colour:0},{cell:1,digit:1,colour:1}
  ],edges:[[0,1]]};
  drawProofLinks(ctx,proof,4,52,true,cell=>cell===0);
  assert.equal(calls.includes('stroke'),false);
  drawProofNodes(ctx,proof,4,52,cell=>cell===0);
  assert.equal(calls.filter(x=>x==='fill').length,1);
});
