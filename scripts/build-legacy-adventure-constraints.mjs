#!/usr/bin/env node
/*
 * Version-pinned, one-time migration for four ORIGINAL SudokuPad SCL files.
 * Draw colors are NOT solver axioms. Curated author rule legends locate
 * artwork during packaging; every accepted rule must also satisfy the
 * published complete solution. Runtime uses typed manifests ONLY.
 * Regenerate with: node scripts/build-legacy-adventure-constraints.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import LZString from 'lz-string';

const root=new URL('../',import.meta.url);
const source=name=>new URL('public/puzzles/'+name+'.scl',root);
const destination=name=>new URL('public/puzzles/hint-constraints/'+name+'.json',root);

const configurations={
  'digits-of-despair':{
    legend:{
      black:{type:'kropki',dot:'black',unlock:[[4,6]]},
      whisper:{type:'whisper',unlock:[[4,1]]},
      thermo:{type:'thermo',unlock:[[3,1]]},
      factory:{type:'anti_knight',unlock:[[9,1]]}
    },
    scopes:[{kind:'factory',grid:3,height:9,width:9}],
    dots:[{backgroundColor:'#000000',kind:'black'}],
    lines:[
      {color:'#68876cff',thickness:7.68,kind:'whisper'},
      {color:'#a29b65ff',thickness:16,kind:'thermo'}
    ]
  },
  'lineage-of-logic':{
    legend:{killer:{type:'killer',unlock:[[10,0],[19,0]]}},
    killers:true
  },
  'super-sudokoid-1':{
    legend:{
      scan:{type:'kropki',dot:'white',unlock:[[2,34],[17,25]]},
      night:{type:'kropki',dot:'black',unlock:[[2,38],[33,39]]},
      whisper:{type:'whisper',unlock:[[3,34],[11,11]]},
      killer:{type:'killer',unlock:[[3,38],[23,35]]},
      fortressKing:{type:'anti_king',unlock:[[8,34],[17,7]]},
      fortressKnight:{type:'anti_knight',unlock:[[8,34],[17,7]]},
      hiddenKnight:{type:'anti_knight',unlock:[[17,7]]},
      shrine:{type:'magic_square',unlock:[[8,38]]}
    },
    scopes:[
      {kind:'fortressKing',grid:5,height:9,width:9},
      {kind:'fortressKnight',grid:5,height:9,width:9},
      {kind:'hiddenKnight',grid:16,height:6,width:6},
      {kind:'shrine',grid:15,height:3,width:3}
    ],
    dots:[
      {backgroundColor:'#FFFFFF',kind:'scan'},
      {backgroundColor:'#000000',kind:'night'}
    ],
    lines:[{color:'#67f067ff',thickness:9.6,kind:'whisper'}],
    killers:true
  },
  'super-sudokoid-2':{
    legend:{
      scan:{type:'kropki',dot:'white',unlock:[[13,37]]},
      whisper:{type:'whisper',unlock:[[13,41],[14,41]]},
      vent:{type:'reverse_thermo',unlock:[[20,41]]},
      crystal:{type:'crystal_cage',unlock:[[18,37]]}
    },
    crystalCages:[0,1,2],
    dots:[{backgroundColor:'#FFFFFF',kind:'scan'}],
    lines:[
      {color:'#67f067ff',thickness:9.6,kind:'whisper'},
      {color:'#e78f8fff',thickness:19.84,kind:'vent'}
    ]
  }
};

function fnv1a(input){
  let hash=0xcbf29ce484222325n;
  for(const character of input){ // SCL base64 is ASCII
    hash=BigInt.asUintN(64,(hash^BigInt(character.charCodeAt(0)))*0x100000001b3n);
  }
  return 'fnv1a-'+hash.toString(16).padStart(16,'0');
}
const asCell=(p,rows,cols)=>{
  if(!Array.isArray(p)||p.length!==2||!Number.isInteger(p[0])||
    !Number.isInteger(p[1])||p[0]<0||p[1]<0||p[0]>=rows||p[1]>=cols)return -1;
  return p[0]*cols+p[1];
};
function dotCells(center,rows,cols){
  if(!Array.isArray(center)||center.length!==2)return null;
  const [r,c]=center;
  const half=x=>Math.abs(x-Math.floor(x)-.5)<.025;
  const integer=x=>Math.abs(x-Math.round(x))<.025;
  const endpoints=half(r)&&integer(c)
    ?[[Math.floor(r),Math.round(c)-1],[Math.floor(r),Math.round(c)]]
    :integer(r)&&half(c)
      ?[[Math.round(r)-1,Math.floor(c)],[Math.round(r),Math.floor(c)]]
      :null;
  if(!endpoints)return null;
  const indices=endpoints.map(p=>asCell(p,rows,cols));
  return indices.every(i=>i>=0)?indices:null;
}
function lineCells(points,rows,cols){
  if(!Array.isArray(points)||points.length<2||points.length>28)return null;
  const cell=point=>Array.isArray(point)&&point.length===2&&
      Math.abs(point[0]-Math.floor(point[0])-.5)<.025&&
      Math.abs(point[1]-Math.floor(point[1])-.5)<.025
    ?[Math.floor(point[0]),Math.floor(point[1])]:null;
  const result=[],seen=new Set();
  for(let i=0;i<points.length-1;i++){
    const from=cell(points[i]),to=cell(points[i+1]);
    if(!from||!to)return null;
    const dr=to[0]-from[0],dc=to[1]-from[1];
    const count=Math.max(Math.abs(dr),Math.abs(dc));
    if(count===0||!(dr===0||dc===0||Math.abs(dr)===Math.abs(dc)))return null;
    for(let k=0;k<count;k++){
      const idx=asCell([from[0]+Math.sign(dr)*k,from[1]+Math.sign(dc)*k],rows,cols);
      if(idx<0||seen.has(idx))return null;
      seen.add(idx);result.push(idx);
    }
  }
  const last=cell(points.at(-1)),idx=last&&asCell(last,rows,cols);
  if(idx===null||idx<0||seen.has(idx))return null;
  result.push(idx);
  return result;
}
function solutionSupports(rule,solution){
  const numbers=rule.cells.map(i=>Number(solution[i]));
  if(numbers.some(n=>!Number.isInteger(n)||n<1||n>9))return false;
  const {type}=rule;
  if(type==='kropki'){
    const [a,b]=numbers;
    return rule.dot==='white'?Math.abs(a-b)===1
      :Math.max(a,b)===Math.min(a,b)*2;
  }
  if(type==='whisper')return numbers.slice(1).every((n,i)=>Math.abs(n-numbers[i])>=5);
  if(type==='thermo')return numbers.slice(1).every((n,i)=>n>numbers[i]);
  if(type==='reverse_thermo')return numbers.slice(1).every((n,i)=>n<numbers[i]);
  if(type==='killer')return numbers.reduce((a,b)=>a+b,0)===rule.sum &&
    new Set(numbers).size===numbers.length;
  if(type==='crystal_cage')return rule.groups.every(group=>
    group.reduce((sum,i)=>sum+Number(solution[i]),0)===rule.sum);
  if(type==='magic_square'){
    if(numbers.length!==9||new Set(numbers).size!==9)return false;
    const groups=[];
    for(let i=0;i<3;i++){
      groups.push([numbers[i*3],numbers[i*3+1],numbers[i*3+2]]);
      groups.push([numbers[i],numbers[i+3],numbers[i+6]]);
    }
    groups.push([numbers[0],numbers[4],numbers[8]],
      [numbers[2],numbers[4],numbers[6]]);
    return groups.every(row=>row.reduce((a,b)=>a+b,0)===15);
  }
  if(type==='anti_knight'||type==='anti_king'){
    const cols=rule.boardCols;
    for(let i=0;i<rule.cells.length;i++)for(let j=i+1;j<rule.cells.length;j++){
      const a=rule.cells[i],b=rule.cells[j];
      const dr=Math.abs(Math.floor(a/cols)-Math.floor(b/cols));
      const dc=Math.abs(a%cols-b%cols);
      const touches=type==='anti_king'?dr===1&&dc===1
        :(dr===1&&dc===2)||(dr===2&&dc===1);
      if(touches&&numbers[i]===numbers[j])return false;
    }
    return true;
  }
  return false;
}
function extract(name){
  const raw=fs.readFileSync(source(name),'utf8').trim();
  if(!raw.startsWith('scl'))throw Error(name+': expected original SCL');
  const puzzle=JSON.parse(LZString.decompressFromBase64(raw.slice(3)));
  const rows=puzzle.cells.length,cols=puzzle.cells[0].length;
  const solution=puzzle.metadata.solution;
  if(solution?.length!==rows*cols)throw Error(name+': original solution unavailable');
  const cfg=configurations[name],accepted=[],rejected=[];
  function consider(kind,cells,sourceKind,sourceIndex,extra={}){
    const legend=cfg.legend[kind];
    const rule={type:legend.type,cells,...extra,
      unlockCells:legend.unlock,sourceKind,sourceIndex};
    const item={kind,sourceKind,sourceIndex};
    if(!cells||cells.length<2||!solutionSupports(rule,solution)){
      rejected.push(item);return;
    }
    accepted.push(rule);
  }
  for(const item of cfg.dots||[]){
    puzzle.overlays?.forEach((mark,i)=>{
      if(mark.backgroundColor!==item.backgroundColor||
        Number(mark.width)<.30||Number(mark.width)>.38||
        Number(mark.height)<.30||Number(mark.height)>.38||
        mark.text)return;
      consider(item.kind,dotCells(mark.center,rows,cols),'overlays',i,
        {dot:cfg.legend[item.kind].dot});
    });
  }
  for(const item of cfg.lines||[]){
    puzzle.lines?.forEach((line,i)=>{
      if(line.color!==item.color||Math.abs(Number(line.thickness)-item.thickness)>.03)return;
      consider(item.kind,lineCells(line.wayPoints,rows,cols),'lines',i);
    });
  }
  if(cfg.killers){
    puzzle.cages?.forEach((cage,i)=>{
      if(cage.hidden===true||cage.unique!==true||
        !/^\d{1,3}$/.test(String(cage.value??''))||cage.cells.length<2||
        cage.cells.length>9)return;
      const cells=cage.cells.map(p=>asCell(p,rows,cols));
      consider('killer',cells.every(i=>i>=0)?cells:null,'cages',i,
        {sum:Number(cage.value),unique:true});
    });
  }
  for(const scope of cfg.scopes||[]){
    const grid=puzzle.metadata.grids[scope.grid];
    if(!grid||scope.width>grid.width||scope.height>grid.height||
       grid.left<0||grid.top<0)throw Error(name+': invalid scope '+scope.kind);
    const cells=Array.from({length:scope.height*scope.width},(_,i)=>
      asCell([grid.top+Math.floor(i/scope.width),grid.left+i%scope.width],
        rows,cols));
    consider(scope.kind,cells.every(i=>i>=0)?cells:null,
      'metadata.grids',scope.grid,{boardCols:cols});
  }
  for(const index of cfg.crystalCages||[]){
    const cage=puzzle.cages[index];
    if(!cage||!/^\d+$/.test(String(cage.value))||cage.cells.length<2)
      throw Error(name+': incorrect crystal cage index '+index);
    const cells=cage.cells.map(p=>asCell(p,rows,cols));
    const groupBy=fn=>[...new Set(cage.cells.map(fn))].map(v=>
      cage.cells.filter(p=>fn(p)===v).map(p=>asCell(p,rows,cols)));
    const groups=[...groupBy(([r])=>r),...groupBy(([,c])=>c)];
    consider('crystal',cells,'cages',index,
      {sum:Number(cage.value),groups});
  }
  if(accepted.length===0)throw Error(name+': no verified structural variants');
  const unique=new Set();
  for(const rule of accepted){
    const key=rule.sourceKind+'#'+rule.sourceIndex+'#'+rule.type;
    if(unique.has(key))throw Error(name+': duplicate source '+key);
    unique.add(key);
  }
  const result={
    schemaVersion:1,
    sourcePuzzleId:puzzle.id,
    sourceFingerprint:fnv1a(raw),
    sourceDimensions:[rows,cols],
    audit:{
      basis:'Author rule legend + original drawing identity; each accepted constraint checked against the solution OFFLINE',
      accepted:accepted.length,
      rejectedCandidates:rejected.length,
      byType:Object.fromEntries([...new Set(accepted.map(a=>a.type))].map(type=>
        [type,accepted.filter(a=>a.type===type).length]))
    },
    constraints:accepted
  };
  return result;
}
const args=process.argv.slice(2);
const check=args.includes('--check');
const selected=args.filter(arg=>arg!=='--check');
function normalize(value){
  if(Array.isArray(value))return value.map(normalize);
  if(value!==null&&typeof value==='object'){
    return Object.fromEntries(Object.keys(value).sort()
      .map(key=>[key,normalize(value[key])]));
  }
  return value;
}
function firstMismatch(actual,expected,location='root'){
  if(JSON.stringify(normalize(actual))===JSON.stringify(normalize(expected)))return '';
  if(actual===null||expected===null||
     typeof actual!=='object'||typeof expected!=='object')
    return location+' (actual '+JSON.stringify(actual)+
      ', expected '+JSON.stringify(expected)+')';
  const keys=[...new Set([...Object.keys(actual),...Object.keys(expected)])];
  for(const key of keys){
    if(!Object.hasOwn(actual,key)||!Object.hasOwn(expected,key))
      return location+'.'+key+' (missing or extra key)';
    const mismatch=firstMismatch(actual[key],expected[key],location+'.'+key);
    if(mismatch)return mismatch;
  }
  return location;
}
for(const name of selected.length?selected:Object.keys(configurations)){
  if(!configurations[name])throw Error('Unknown bundled adventure: '+name);
  const output=extract(name);
  const expected=JSON.stringify(output,null,2)+'\n';
  if(check){
    const actual=JSON.parse(fs.readFileSync(destination(name),'utf8'));
    const mismatch=firstMismatch(actual,output);
    if(mismatch)throw Error(name+': curated manifest differs from source at '+mismatch);
  }else{
    fs.mkdirSync(path.dirname(destination(name).pathname),{recursive:true});
    fs.writeFileSync(destination(name),expected);
  }
  console.log(check?'Verified':'Generated',name,output.sourceFingerprint,output.audit);
}
