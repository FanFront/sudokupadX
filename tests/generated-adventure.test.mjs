import test from 'node:test';
import assert from 'node:assert/strict';
import {getLinkedPuzzles} from '../src/adventure-ui.js';
import {linksAtCell,returnDestination} from '../src/linked-navigation.js';

const main='generated-adventure-1';
const boss='generated-adventure-1-boss-1';
const catalog=[
  {id:main,kind:'main',group:main,file:'puzzles/generated/generated-adventure-1.json'},
  {id:boss,kind:'boss',group:main,parent:main,
   file:'puzzles/generated/generated-adventure-1-boss-1.json'}
];

test('generated boss links resolve locally without fabricated external URLs',()=>{
  assert.deepEqual(getLinkedPuzzles('Boss: sudokupadx:puzzle/'+boss,catalog).map(x=>x.id),[boss]);
  assert.equal(returnDestination(catalog[1],catalog,[]).id,main);
});

test('fog hides generated boss entrances until the sector is visible',()=>{
  const puzzle={
    rows:27,cols:27,rules:'Explore',cells:Array.from({length:729},()=>({given:null})),
    sectors:[{title:'Gate',left:0,top:0,width:9,height:9,
      cells:Array.from({length:81},(_,i)=>Math.floor(i/9)*27+i%9),
      rules:'Boss: sudokupadx:puzzle/'+boss}]
  };
  const progress={visible:Array(729).fill(false)};
  assert.deepEqual(linksAtCell(puzzle,progress,0,catalog,main),[]);
  progress.visible[0]=true;
  assert.deepEqual(linksAtCell(puzzle,progress,0,catalog,main).map(x=>x.id),[boss]);
});

test('embedded BOSS cell is the directly selectable entrance, and fog hides it',()=>{
  const puzzle={
    rows:27,cols:27,rules:'Explore',
    cells:Array.from({length:729},()=>({given:null})),
    sectors:[],
    bossGates:[{bossId:boss,cell:[4,5],reward:'7',seed:20261102,reveals:[]}]
  };
  const progress={visible:Array(729).fill(false)};
  const index=4*27+5;
  assert.deepEqual(linksAtCell(puzzle,progress,index,catalog,main),[]);
  progress.visible[index]=true;
  assert.deepEqual(linksAtCell(puzzle,progress,index,catalog,main).map(x=>x.id),[boss]);
});

test('boss stays undiscovered until the embedded cell emerges from fog',()=>{
  const puzzle={
    rows:27,cols:27,rules:'Explore',
    cells:Array.from({length:729},()=>({given:null})),
    sectors:[{title:'Gate',left:0,top:0,width:9,height:9,
      cells:Array.from({length:81},(_,i)=>Math.floor(i/9)*27+i%9),
      rules:'Boss: sudokupadx:puzzle/'+boss}],
    bossGates:[{bossId:boss,cell:[2,1],seed:20261102,rewardVersion:3,
      reward:'7',reveals:[]}]
  };
  const progress={visible:Array(729).fill(false)};
  progress.visible[0]=true;
  const bossIndex=2*27+1;
  assert.deepEqual(linksAtCell(puzzle,progress,0,catalog,main),[],
    'a visible ordinary cell must not expose the boss link from sector rules');
  assert.deepEqual(linksAtCell(puzzle,progress,bossIndex,catalog,main),[]);
  progress.visible[bossIndex]=true;
  assert.deepEqual(linksAtCell(puzzle,progress,bossIndex,catalog,main)
    .map(x=>x.id),[boss]);
});
