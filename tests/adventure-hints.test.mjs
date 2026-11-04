import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import LZString from 'lz-string';
import {nextAdventureHint,gridsAndHouses} from '../src/hints/adventure.js';
import {describeHint} from '../src/hints/format.js';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
function world(rows=40,cols=50,sectors=[],extra={}){
  const n=rows*cols;
  return {puzzle:{rows,cols,cells:Array.from({length:n},()=>({given:null})),
    sectors,regions:[],cages:[],overlays:[],underlays:[],arrows:[],lines:[],
    hintRules:[],hintConstraints:[],...extra},
    progress:{cells:Array.from({length:n},()=>({value:null,center:[],corner:[]})),
      visible:Array(n).fill(false)}};
}
function sector(top,left,n=6,rules){
  return {top,left,width:n,height:n,title:n+'×'+n+' 数独',
    rules:rules||'数独——每行、每列与每个 2×3 宫填入 1 至 6。'};
}
const idx=(r,c,cols=50)=>r*cols+c;
test('Sudokuvania-style visible notes get useful next steps, not guessed placements',()=>{
  const {puzzle,progress}=world(40,50,[sector(21,0)]);
  const target=idx(21,0),source=idx(21,1);
  progress.visible[target]=progress.visible[source]=true;
  puzzle.cells[source].given='2';
  progress.cells[target].center=['2','7']; // extra mark is not a premise
  const original=JSON.stringify(progress);
  const response=nextAdventureHint(puzzle,progress,4,target);
  assert.equal(response.status,'step');
  assert.equal(response.step.cell,target);
  assert.deepEqual(response.step.removed,[2]);
  assert.ok(response.step.sources.includes(source));
  assert.equal(response.step.forceElimination,false);
  assert.equal(JSON.stringify(progress),original);
  const description=describeHint(response,puzzle.cols,progress.cells);
  assert.match(description.description,/R22C1/);
  assert.match(description.candidates,/本步可删：2/);
});
test('hidden clues cannot be observed before reveal',()=>{
  const {puzzle,progress}=world(40,50,[sector(21,0)]);
  const target=idx(21,0),source=idx(21,1);
  progress.visible[target]=true;
  puzzle.cells[source].given='2'; // still hidden!
  progress.cells[target].center=['2','7'];
  const first=nextAdventureHint(puzzle,progress,4,target);
  assert.notEqual(first.status,'step');
  progress.visible[source]=true;
  assert.equal(nextAdventureHint(puzzle,progress,4,target).step.removed[0],2);
  progress.visible[target]=false;
  assert.notEqual(nextAdventureHint(puzzle,progress,4,target).status,'step');
});
test('unrelated 9×9 sectors on the same global row are not peers',()=>{
  const a=sector(3,1,9,'标准数独：每行、每列及每个 3×3 宫填入 1 至 9。');
  const b=sector(3,20,9,'标准数独：每行、每列及每个 3×3 宫填入 1 至 9。');
  const {puzzle,progress}=world(40,50,[a,b]);
  const source=idx(3,1),target=idx(3,20);
  progress.visible[source]=progress.visible[target]=true;
  puzzle.cells[source].given='5';
  progress.cells[target].center=['5','7'];
  assert.notEqual(nextAdventureHint(puzzle,progress,4,target).status,'step');
});
test('Super Sudokoid 2 unique-only regions support safe notes without invented 1–9 singles',()=>{
  const target=idx(25,3,45),source=idx(25,4,45);
  const {puzzle,progress}=world(36,45,[],{cages:[
    {unique:true,hidden:true,cells:[[25,3],[25,4],[24,4],[24,5]]}
  ]});
  progress.visible[target]=progress.visible[source]=true;
  progress.cells[source].value='3';
  progress.cells[target].center=['3','6'];
  const hint=nextAdventureHint(puzzle,progress,5,target);
  assert.equal(hint.status,'step');
  assert.equal(hint.step.cell,target);
  assert.deepEqual(hint.step.removed,[3]);
  assert.equal(hint.step.forceElimination,true);
  assert.equal(describeHint(hint,45,progress.cells).placement,false);
});
test('visible numeric killer sum can prove a digit while decorative sums are ignored',()=>{
  const {puzzle,progress}=world(40,50,[sector(21,0,6,
    '数独每行每列和 2×3 宫含 1 至 6，杀手笼（Killer）数字相加必须等于角标。')],{
    cages:[{cells:[[21,0],[21,1]],value:3,unique:true}],
    hintConstraints:[{type:'killer',cells:[[21,0],[21,1]],sum:3,unique:true}]
  });
  const known=idx(21,0),target=idx(21,1);
  progress.visible[known]=progress.visible[target]=true;
  puzzle.cells[known].given='1';
  progress.cells[target].center=['2','4'];
  const hint=nextAdventureHint(puzzle,progress,4,target);
  assert.equal(hint.status,'step');
  assert.equal(hint.step.cell,target);
  assert.ok(hint.step.remaining.includes(2));
  assert.ok(!hint.step.remaining.includes(4) || hint.step.method==='peer_elimination');
});
test('numeric cages are not assumed to mean a sum without an unlocked killer rule',()=>{
  const {puzzle,progress}=world(40,50,[sector(21,0)],{
    cages:[{cells:[[21,0],[21,1]],value:3,unique:true}]
  });
  const source=idx(21,0),target=idx(21,1);
  progress.visible[source]=progress.visible[target]=true;
  puzzle.cells[source].given='1';
  progress.cells[target].center=['2','4'];
  assert.notEqual(nextAdventureHint(puzzle,progress,4,target).step?.method,'killer_sum');
});
test('duplicate visible numbers do not become a false proof',()=>{
  const {puzzle,progress}=world(40,50,[sector(21,0)]);
  const [a,b,c]=[idx(21,0),idx(21,1),idx(21,2)];
  for(const i of [a,b,c])progress.visible[i]=true;
  puzzle.cells[a].given='2';
  progress.cells[b].value='2';
  progress.cells[c].center=['2','4'];
  assert.equal(nextAdventureHint(puzzle,progress,4,c).status,'conflict');
});
test('kropki hints use a declared dot type rather than overlay background',()=>{
  const {puzzle,progress}=world(40,50,[sector(21,0,6,
    '数独，每行、每列每宫 1–6；白点 Kropki 相差 1。')],{
    overlays:[{center:[21.5,1],backgroundColor:'#ffffff',rounded:true,width:.25,height:.25}],
    hintConstraints:[{type:'kropki',cells:[[21,0],[21,1]],dot:'white'}]
  });
  const target=idx(21,0),source=idx(21,1);
  progress.visible[target]=progress.visible[source]=true;
  puzzle.cells[source].given='3';
  progress.cells[target].center=['1','2','4'];
  const hint=nextAdventureHint(puzzle,progress,4,target);
  assert.equal(hint.status,'step');
  assert.equal(hint.step.method,'kropki');
  assert.ok(hint.step.removed.includes(1));
});
test('unlocked Super Sudokoid rule panel permits a proved Kropki elimination',()=>{
  const target=idx(25,3,45),source=idx(25,4,45);
  const panel={top:13,left:37,width:4,height:1,title:'SCAN DOTS',
    rules:'Digits separated by a white SCAN DOT differ by exactly 1.',
    cells:[13*45+37,13*45+38,13*45+39,13*45+40]};
  const {puzzle,progress}=world(36,45,[panel],{
    cages:[{unique:true,hidden:true,cells:[[25,3],[25,4]]}],
    overlays:[{center:[25.5,4],backgroundColor:'#ffffff',width:.25,height:.25}],
    hintConstraints:[{type:'kropki',cells:[[25,3],[25,4]],dot:'white',
      unlockCells:[panel.cells[0]]}]
  });
  progress.visible[target]=progress.visible[source]=true;
  progress.cells[source].value='3';
  progress.cells[target].center=['1','2','4'];
  progress.visible[panel.cells[0]]=true;
  const step=nextAdventureHint(puzzle,progress,4,target).step;
  assert.equal(step?.method,'kropki');
  assert.ok(step.removed.includes(1));
  progress.visible[panel.cells[0]]=false;
  // A visible generic "hints" tile may mention this later rule, but that
  // must not unlock the specific SCAN DOTS technique ahead of time.
  puzzle.sectors.push({top:0,left:44,width:1,height:1,title:'提示',
    rules:'Future Kropki and whisper rules are described here.',
    cells:[44]});
  progress.visible[44]=true;
  assert.notEqual(nextAdventureHint(puzzle,progress,4,target).step?.method,'kropki');
});
test('visible German-whisper and thermometer rules give proven eliminations',()=>{
  for(const variant of ['whisper','thermo']){
    const base=sector(21,0,6,
      '标准数独。每行每列与 2×3 宫填入 1 至 6。'+variant+'（温度计或低语线）规则已解锁。');
    const line={wayPoints:[[21.5,.5],[21.5,1.5]],
      color:variant==='whisper'?'#62b873':'#b89acb',thickness:14};
    const {puzzle,progress}=world(40,50,[base],{
      lines:[line],underlays:variant==='thermo'?
        [{center:[21.5,.5],rounded:true,width:.75,height:.75}]:[],
      hintConstraints:[{type:variant,cells:[[21,0],[21,1]]}]
    });
    const known=idx(21,0),target=idx(21,1);
    progress.visible[known]=progress.visible[target]=true;
    puzzle.cells[known].given=variant==='whisper'?'1':'2';
    progress.cells[target].center=['1','4','6'];
    const hint=nextAdventureHint(puzzle,progress,4,target);
    assert.equal(hint.step?.method,variant,variant);
    // The already-entered 1 is excluded from its row before whisper logic;
    // the useful new whisper exclusion is 4. Thermo additionally excludes 1.
    assert.ok(hint.step.removed.includes(variant==='whisper'?4:1),variant);
  }
});
test('renban and between lines use typed rules regardless of display color',()=>{
  for(const variant of ['renban','between']){
    const {puzzle,progress}=world(40,50,[sector(21,0,6,
      '标准数独，每行列和 2×3 宫填 1 至 6；'+variant+' 已解锁。')],{
      lines:[{wayPoints:[[21.5,.5],[21.5,1.5],[21.5,2.5]],
        color:variant==='renban'?'#a783d6':'#85a8d8'}],
      hintConstraints:[{type:variant,cells:[[21,0],[21,1],[21,2]]}]
    });
    const a=idx(21,0),b=idx(21,1),c=idx(21,2);
    for(const i of [a,b,c])progress.visible[i]=true;
    puzzle.cells[a].given=variant==='renban'?'1':'2';
    puzzle.cells[c].given=variant==='renban'?'3':'6';
    progress.cells[b].center=variant==='renban'?['2','4']:['1','4'];
    const hint=nextAdventureHint(puzzle,progress,4,b);
    assert.equal(hint.step?.method,variant,variant);
    if(variant==='renban')assert.ok(hint.step.removed.includes(4));
  }
});
test('entropic and modular lines use three-way class logic rather than guesses',()=>{
  const variants=[
    {kind:'entropic',color:'#d8a752',values:['1','4'],marks:['2','7'],out:2},
    {kind:'modular',color:'#45a8ab',values:['1','2'],marks:['4','6'],out:4}
  ];
  for(const item of variants){
    const {puzzle,progress}=world(40,50,[sector(21,0,9,
      '9×9 标准数独：每行每列3×3宫填 1 至 9；'+item.kind+' 规则已解锁。')],{
      lines:[{wayPoints:[[21.5,.5],[21.5,1.5],[21.5,2.5]],color:'#888888'}],
      hintConstraints:[{type:item.kind,cells:[[21,0],[21,1],[21,2]]}]
    });
    const cells=[idx(21,0),idx(21,1),idx(21,2)];
    cells.forEach(i=>progress.visible[i]=true);
    puzzle.cells[cells[0]].given=item.values[0];
    puzzle.cells[cells[1]].given=item.values[1];
    progress.cells[cells[2]].center=item.marks;
    const hint=nextAdventureHint(puzzle,progress,4,cells[2]);
    assert.equal(hint.step?.method,item.kind,item.kind);
    assert.ok(hint.step.removed.includes(item.out),item.kind);
  }
});
test('arrow arithmetic never interprets the full solution as a clue',()=>{
  const {puzzle,progress}=world(40,50,[sector(21,0,6,
    '标准数独；1 至 6；arrow 箭头圈内数字等于箭杆总和。')],{
    arrows:[{wayPoints:[[21.5,.5],[21.5,1.5],[21.5,2.5]]}],
    underlays:[{center:[21.5,.5],rounded:true,width:.7,height:.7}],
    hintConstraints:[{type:'arrow',cells:[[21,0],[21,1],[21,2]]}]
  });
  const [circle,target,last]=[idx(21,0),idx(21,1),idx(21,2)];
  for(const i of [circle,target,last])progress.visible[i]=true;
  puzzle.cells[circle].given='3';
  puzzle.cells[last].given='1';
  progress.cells[target].center=['2','4'];
  const hint=nextAdventureHint(puzzle,progress,4,target);
  assert.equal(hint.step?.method,'arrow');
  assert.ok(hint.step.removed.includes(4));
});
test('a decorative colored line cannot silently become a logical rule',()=>{
  const {puzzle,progress}=world(40,50,[sector(21,0,6,
    '数独、连续线、夹心线、低语线、熵线、箭头等规则的介绍。')],{
    lines:[{wayPoints:[[21.5,.5],[21.5,1.5]],color:'#00ff00'}],
    overlays:[{center:[21.5,1],backgroundColor:'#ffffff',rounded:true}],
    cages:[{cells:[[21,0],[21,1]],value:3,unique:true}]
  });
  const a=idx(21,0),b=idx(21,1);
  progress.visible[a]=progress.visible[b]=true;
  progress.cells[a].center=['2','7'];
  assert.notEqual(nextAdventureHint(puzzle,progress,4,a).status,'step');
});
test('actual bundled adventure packages load as independent, fog-safe map puzzles',()=>{
  for(const name of [
    'digits-of-despair','lineage-of-logic',
    'super-sudokoid-1','super-sudokoid-2'
  ]){
    const raw=readFileSync(join(root,'public','puzzles',name+'.scl'),'utf8');
    const p=JSON.parse(LZString.decompressFromBase64(raw.trim().slice(3)));
    const rows=p.cells.length,cols=p.cells[0].length;
    const puzzle={rows,cols,cells:p.cells.flat().map(c=>({given:c?.value==null?null:String(c.value)})),
      cages:p.cages||[],lines:p.lines||[],overlays:p.overlays||[],
      underlays:p.underlays||[],arrows:p.arrows||[],regions:p.regions||[],
      sectors:(p.metadata.grids||[]).map(s=>({...s,cells:Array.from({length:s.width*s.height},(_,i)=>
        (s.top+Math.floor(i/s.width))*cols+s.left+i%s.width)}))};
    const lit=new Set((p.foglight||[]).map(([r,c])=>r*cols+c));
    const progress={visible:puzzle.cells.map((_,i)=>lit.has(i)),
      cells:puzzle.cells.map(()=>({value:null,center:[],corner:[]}))};
    const {houses}=gridsAndHouses(puzzle);
    assert.ok(houses.length>0,name+' should expose local unique groups');
    const hint=nextAdventureHint(puzzle,progress,4);
    assert.ok(['step','fog_stalled','stalled'].includes(hint.status),name+' status '+hint.status);
    if(hint.step){
      assert.ok(progress.visible[hint.step.cell],name+' hint target should be visible');
      assert.ok(hint.step.sources.every(i=>progress.visible[i]),name+' witnesses must be visible');
    }
  }
});
