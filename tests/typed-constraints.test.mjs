import test from 'node:test';
import assert from 'node:assert/strict';
import {typedConstraints} from '../src/hints/constraint-data.js';

const rows=40,cols=50;
const visible=Array(rows*cols).fill(false);
const progress={visible};
const puzzle={rows,cols,hintRules:[],hintConstraints:[],lines:[]};
const i=(r,c)=>r*cols+c;

test('structured rules remain unchanged when artwork color is modified',()=>{
  const p={...puzzle,
    lines:[{color:'#00ff00',wayPoints:[[21.5,.5],[21.5,1.5]]}],
    hintConstraints:[{type:'between',cells:[[21,0],[21,1],[21,2]]}]};
  const snapshot={visible:[...visible]};
  for(const cell of [i(21,0),i(21,1),i(21,2)])snapshot.visible[cell]=true;
  const before=typedConstraints(p,snapshot);
  p.lines[0].color='#ff00ff';
  const after=typedConstraints(p,snapshot);
  assert.deepEqual(before,after);
  assert.deepEqual(before[0],{type:'between',cells:[i(21,0),i(21,1),i(21,2)]});
});

test('lines, dots, and cages without explicit typed data cannot become solver rules',()=>{
  const snapshot={visible:[...visible]};
  snapshot.visible[i(21,0)]=snapshot.visible[i(21,1)]=true;
  const p={...puzzle,lines:[{color:'#008000',wayPoints:[[21.5,.5],[21.5,1.5]]}],
    cages:[{cells:[[21,0],[21,1]],value:3}],
    overlays:[{center:[21.5,1],backgroundColor:'#ffffff'}]};
  assert.deepEqual(typedConstraints(p,snapshot),[]);
});

test('fog hides unpublished constraints and concealed witnesses',()=>{
  const snapshot={visible:[...visible]};
  snapshot.visible[i(21,0)]=snapshot.visible[i(21,1)]=true;
  const unlock=i(13,37);
  const p={...puzzle,hintConstraints:[
    {type:'kropki',cells:[[21,0],[21,1]],dot:'white',unlockCells:[unlock]}
  ]};
  assert.deepEqual(typedConstraints(p,snapshot),[]);
  snapshot.visible[unlock]=true;
  assert.equal(typedConstraints(p,snapshot).length,1);
  snapshot.visible[i(21,1)]=false;
  assert.deepEqual(typedConstraints(p,snapshot),[]);
});

test('typed generator rules and ordered arrow circles are accepted',()=>{
  const snapshot={visible:[...visible]};
  for(const cell of [i(21,0),i(21,1),i(21,2)])snapshot.visible[cell]=true;
  const p={...puzzle,hintRules:[{type:'renban',cells:[i(21,0),i(21,1),i(21,2)]}],
    hintConstraints:[{type:'arrow',circle:[[21,0]],shaft:[[21,1],[21,2]]}]};
  assert.equal(typedConstraints(p,snapshot).length,2);
  assert.deepEqual(typedConstraints(p,snapshot)[1].cells,[i(21,0),i(21,1),i(21,2)]);
});

test('invalid, ambiguous and out-of-range constraint records are rejected',()=>{
  const snapshot={visible:Array(rows*cols).fill(true)};
  const bad=[
    {type:'whisper',cells:[[21,0],[21,0]]},
    {type:'killer',cells:[[21,0],[21,1]],sum:'3'},
    {type:'kropki',cells:[[21,0],[21,1]]},
    {type:'xv',cells:[[21,0],[21,1]],sum:9},
    {type:'between',cells:[[21,0],[99,2]]},
    {type:'unknown',cells:[[21,0],[21,1]]},
    {type:'region_sum',cells:[[21,0],[21,1]],segments:[[[21,0]],[[21,0]]]}
  ];
  assert.deepEqual(typedConstraints({...puzzle,hintConstraints:bad},snapshot),[]);
});
