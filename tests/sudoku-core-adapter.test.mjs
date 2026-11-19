import test from 'node:test';
import assert from 'node:assert/strict';
import {
  eligibleClassicNine,currentClassicBoard,adaptCoreTeaching,
  chooseClassicHint,formatClassicAnalysis
} from '../src/hints/sudoku-core-adapter.js';

function puzzle(){
  return {
    rows:9,cols:9,cells:Array.from({length:81},()=>({given:null})),
    hintRules:[],regions:Array.from({length:9},(_,k)=>
      Array.from({length:9},(_,j)=>[
        Math.floor(k/3)*3+Math.floor(j/3),
        k%3*3+j%3
      ])),
    cages:[],lines:[],arrows:[],underlays:[],overlays:[]
  };
}
const notes=()=>Array.from({length:81},()=>({value:null,center:[],corner:[]}));
const preview=()=>Array.from({length:81},()=>[1,2,3]);

test('sudoku-core only runs for fully visible, certified classic 9x9',()=>{
  assert.equal(eligibleClassicNine(puzzle(),Array(81).fill(true)),true);
  for(const [field,value] of [
    ['hintRules',[{type:'killer',cells:[0,1],sum:3}]],
    ['cages',[{cells:[0,1]}]],
    ['lines',[{wayPoints:[0,1]}]],
    ['hintConstraints',[{type:'anti_knight'}]],
    ['regions',[]],
    ['bossGates',[{cell:0}]]
  ]){
    const changed=puzzle();changed[field]=value;
    assert.equal(eligibleClassicNine(changed),false,field);
  }
  assert.equal(eligibleClassicNine(puzzle(),[false]),false);
  const legacy=puzzle();delete legacy.hintRules;
  assert.equal(eligibleClassicNine(legacy),false);
  const small=puzzle();small.rows=6;small.cols=6;
  assert.equal(eligibleClassicNine(small),false);
});

test('board adapter refuses conflicts between givens and player values',()=>{
  const p=puzzle();p.cells[0].given='6';
  const cells=notes();cells[1].value='3';
  assert.deepEqual(currentClassicBoard(p,cells).slice(0,3),[6,3,null]);
  cells[0].value='2';
  assert.equal(currentClassicBoard(p,cells),null);
});

test('multi-cell eliminations only reuse the same digit per target',()=>{
  const tip={
    strategy:'W-Wing Strategy',label:'W-Wing',
    previewCandidates:preview(),
    relatedCells:[4,5],
    step:{updates:[
      {index:20,eliminatedCandidate:2},
      {index:21,eliminatedCandidate:2},
      {index:22,eliminatedCandidate:3}
    ],patternCells:[12,13]}
  };
  const result=adaptCoreTeaching(tip,Array(81).fill(null),4);
  assert.equal(result.step.method,'w_wing');
  assert.deepEqual(result.step.removed,[2]);
  assert.deepEqual(result.step.affectedCells,[20,21]);
  assert.equal(result.step.forceElimination,true);
  assert.equal(result.step.source,'sudoku-core');
  assert.deepEqual(result.step.sources,[12,13,4,5]);
  assert.equal(adaptCoreTeaching(tip,Array(81).fill(null),3),null);
});

test('naked single is an explicit placement, not a fake multi-candidate mask',()=>{
  const lists=preview();lists[15]=[8];
  const result=adaptCoreTeaching({
    strategy:'Visual Elimination Strategy',label:'Naked Single',
    previewCandidates:lists,
    step:{updates:[{index:15,filledValue:8}]}
  },Array(81).fill(null),1);
  assert.deepEqual(result.step.before,[8]);
  assert.deepEqual(result.step.removed,[]);
  assert.equal(result.step.placement,true);
});

test('uniqueness-dependent moves require an independently certified unique solution',()=>{
  const tip={strategy:'Unique Rectangle Strategy',previewCandidates:preview(),
    step:{updates:[{index:10,eliminatedCandidate:1}]}};
  assert.equal(adaptCoreTeaching(tip,Array(81).fill(null),4,false),null);
  assert.equal(adaptCoreTeaching(tip,Array(81).fill(null),4,true).step.method,'unique_rectangle');
  const guessing={...tip,strategy:'Nishio Forcing Chain Strategy'};
  assert.equal(adaptCoreTeaching(guessing,Array(81).fill(null),5,true),null);
});

test('the merge retains Rust placements and skips unmarked duplicate removals',()=>{
  const base={status:'step',level:1,step:{
    method:'hidden_single',cell:0,before:[1,2],remaining:[2],removed:[1]
  }};
  const core={status:'step',level:4,step:{
    method:'w_wing',cell:4,before:[1,2,3],remaining:[1,3],removed:[2],
    forceElimination:true
  }};
  assert.equal(chooseClassicHint(base,core,notes()),base);
  const rustElim={status:'step',step:{method:'x_wing',cell:0,
    before:[1,2],remaining:[1],removed:[2],forceElimination:true}};
  assert.equal(chooseClassicHint(rustElim,core,notes()),rustElim);
  const withNotes=notes();withNotes[4].center=['2'];
  assert.equal(chooseClassicHint(rustElim,core,withNotes),core);
});

test('analysis report distinguishes unsolvable, incomplete and rated boards',()=>{
  assert.match(formatClassicAnalysis({hasSolution:false}).title,/无法求解/);
  assert.match(formatClassicAnalysis({hasSolution:true,hasUniqueSolution:true,
    difficulty:'L8',hardestTechnique:'W-Wing Strategy',usedStrategies:[
      {title:'W-Wing Strategy',freq:1}
    ]}).description,/L8/);
});


test('upstream matching chain/colour certificates survive the normal hint adapter',()=>{
  for(const kind of ['colour','chain']){
    const proof=kind==='colour'?{
      kind,nodes:[{cell:0,digit:1,colour:0},{cell:1,digit:1,colour:1}],
      edges:[{from:0,to:1,strong:true}]
    }:{
      kind,nodes:[{cell:0,digit:1},{cell:1,digit:1},
        {cell:2,digit:1},{cell:3,digit:1}],
      edges:[{from:0,to:1,strong:true},{from:1,to:2,strong:false},
        {from:2,to:3,strong:true}]
    };
    const tip={strategy:kind==='colour'?'Simple Colouring Strategy':'X-Chain Strategy',
      label:kind,previewCandidates:Array.from({length:81},()=>[1,2,3]),
      step:{updates:[{index:20,eliminatedCandidate:1}],proof}};
    const hint=adaptCoreTeaching(tip,Array(81).fill(null),4);
    assert.equal(hint.step.proof.kind,kind);
    assert.equal(hint.step.proof.nodes.length,proof.nodes.length);
  }
});
