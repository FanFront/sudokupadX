import { invoke } from '@tauri-apps/api/core';
import {invokeBrowser} from './web-runtime.js';
import {drawArrows,drawCages,drawPathMarks,drawFog,drawDecorations,drawPuzzleLines,drawSectorBorders,getSectors,getLinkedPuzzles,isVisible,canSelectCell,dragCellIndices,focusInitialFog} from './adventure-ui.js';
import './style.css';

const $ = id => document.getElementById(id);
const native = !!window.__TAURI_INTERNALS__;
const CELL = 52;
const MAX_IMPORT = 8 * 1024 * 1024;
const colors = ['#f8cd75','#a9d9a1','#9fcbff','#e9b0d6','#bfb5fa'];
let puzzle = null;
let progress = null;
let selected = -1;
let selectedCells = [];
let mode = 'value';
let alphabet = false;
let letterPage = 0;
let camera = {x:0,y:0,scale:1};
let regionMap = [];
let drawQueued = false;
let pending = false;
let undoStack = [];
let redoStack = [];
let toastTimer = 0;
let saveTimer = 0;
let catalog = [], localeZh = {}, mainDictionary = {};
let currentEntry = null, navigationStack = [], matchingSectors = [], sectorCursor = 0;
let lastCompletion = false;
let showGridLines = true;
const board = $('boardCanvas');
const frame = $('boardFrame');
const ctx = board.getContext('2d', {alpha:false});
const pointers = new Map();
let gesture = null;

function cloneCell(v) {
  return {value:v.value ?? null,corner:[...(v.corner || [])],center:[...(v.center || [])],color:v.color ?? null};
}
function clearCell() { return {value:null,corner:[],center:[],color:null}; }
function validSymbol(s) {return /^[0-9A-Z]$/.test(s);}
function saveKey() {return puzzle ? 'sudokupadx:v1:'+puzzle.key : '';}
function save() {
  if (!puzzle || !progress) return;
  clearTimeout(saveTimer);
  try {localStorage.setItem(saveKey(),JSON.stringify({version:1,cells:progress.cells}));} catch {}
  $('saveLabel').textContent = '已保存到本机';
}
function scheduleSave() {
  clearTimeout(saveTimer);
  $('saveLabel').textContent = '待保存';
  saveTimer=setTimeout(save,350);
}
document.addEventListener('visibilitychange',()=>{
  if (document.visibilityState==='hidden') save();
});
async function restoreSaved() {
  let stored;
  try {stored=JSON.parse(localStorage.getItem(saveKey()) || 'null');} catch {return;}
  if (!stored || stored.version!==1 || !Array.isArray(stored.cells) || stored.cells.length!==puzzle.cells.length) return;
  try {progress = await call('restore_progress',{cells:stored.cells});}
  catch (error) {notify('存档未载入: '+String(error));}
}
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.classList.remove('show'),2500);
}
function notify(error) {toast(String(error));}

async function call(command,args={}) {
  return native ? invoke(command,args) : invokeBrowser(command,args);
}

function buildRegions() {
  regionMap=Array(puzzle.rows*puzzle.cols).fill(-1);
  (puzzle.regions||[]).forEach((list,id)=>{
    if (!Array.isArray(list)) return;
    for (const pair of list) {
      if (!Array.isArray(pair)||pair.length<2) continue;
      const r=Number(pair[0]),c=Number(pair[1]);
      if (Number.isInteger(r)&&Number.isInteger(c)&&r>=0&&r<puzzle.rows&&c>=0&&c<puzzle.cols)
        regionMap[r*puzzle.cols+c]=id;
    }
  });
}
function translateDisplay(text) {
  return typeof text === 'string' ? (mainDictionary[text] || text) : text;
}
function updateBack(){ $('backButton').hidden=navigationStack.length===0; }
function renderSectorLinks(container,items) {
  container.replaceChildren();
  for(const entry of items){
    const btn=document.createElement('button');btn.type='button';
    btn.className='sector-link-button';btn.textContent='进入 · '+entry.title;
    btn.addEventListener('click',()=>openBundled(entry.id,true).catch(notify));
    container.appendChild(btn);
  }
}
function updateSector() {
  if(!puzzle)return;
  const eligible=selected>=0&&isVisible(progress,selected);
  matchingSectors=eligible?getSectors(puzzle,selected):[];
  if(sectorCursor>=matchingSectors.length)sectorCursor=0;
  const sector=matchingSectors[sectorCursor];
  const rules=translateDisplay(sector?.rules||puzzle.rules||'暂无规则');
  const title=sector?[sector.author,sector.title].filter(Boolean).join(' · '):'全局谜题规则';
  $('sectorHeading').textContent=title;
  $('modalSectorTitle').textContent=title;
  $('nextSector').hidden=matchingSectors.length<2;
  $('rulesPreview').textContent=rules;
  $('fullRules').textContent=rules;
  const links=eligible?getLinkedPuzzles(rules,catalog,currentEntry?.group):[];
  renderSectorLinks($('sectorLinks'),links);
  renderSectorLinks($('modalLinks'),links);
}
function renderLibrary(){
  const list=$('libraryList');list.replaceChildren();
  for(const entry of catalog.filter(x=>x.kind==='main'||$('showAllPuzzles').checked)){
    const btn=document.createElement('button');btn.type='button';btn.className='library-entry';
    const title=document.createElement('strong');title.textContent=entry.title;
    const sub=document.createElement('small');sub.textContent=entry.kind==='main'?'冒险地图':entry.group+' · '+(entry.kind==='boss'?'首领谜题':'支线谜题');
    btn.append(title,sub);
    btn.addEventListener('click',()=>openBundled(entry.id,false).catch(notify));
    list.appendChild(btn);
  }
}
async function loadCatalog(){
  const [items,translations]=await Promise.all([
    fetch('puzzles/catalog.json').then(r=>{if(!r.ok)throw Error('Missing catalog');return r.json();}),
    fetch('puzzles/locale-zh.json').then(r=>{if(!r.ok)throw Error('Missing translation metadata');return r.json();})
  ]);
  catalog=items.items||[];localeZh=translations;renderLibrary();
}
async function openBundled(id,push=false,backState=null){
  if(pending)return;
  const entry=catalog.find(e=>e.id===id);
  if(!entry)throw Error('未找到已打包谜题: '+id);
  if(currentEntry && push){
    save();navigationStack.push({id:currentEntry.id,camera:{...camera},selected,selectedCells:[...selectedCells]});
  }else if(!backState && !push) {
    if(puzzle)save();navigationStack=[];
  }
  pending=true;
  try{
    const response=await fetch(entry.file);
    if(!response.ok)throw Error('缺少离线文件: '+entry.file);
    const input=await response.text();
    const result=await call('open_puzzle',{input,localization:localeZh[id]||null});
    currentEntry=entry;
    mainDictionary={};
    if(entry.kind==='main') {
      try {
        const dict=await fetch('puzzles/i18n/'+entry.id+'.json');
        if(dict.ok) mainDictionary=await dict.json();
      } catch{}
    }
    // Display-only translations preserve Rust's puzzle constraints/solutions.
    result.puzzle.rules=translateDisplay(result.puzzle.rules);
    for(const sector of result.puzzle.sectors||[]){
      sector.rules=translateDisplay(sector.rules);
      sector.author=translateDisplay(sector.author);
      sector.title=translateDisplay(sector.title);
    }
    for(const kind of ['overlays','underlays'])
      for(const mark of result.puzzle[kind]||[])
        if(mark&&typeof mark.text==='string')mark.text=translateDisplay(mark.text);
    await openResult(result);
    if(backState){
      camera={...backState.camera};
      setSelection(backState.selectedCells?.length?backState.selectedCells:[backState.selected]);
    }
    updateBack();
    if($('rulesDialog').open)$('rulesDialog').close();
    if($('libraryDialog').open)$('libraryDialog').close();
    toast('已载入离线谜题');
  }catch(error){
    if(push)navigationStack.pop();
    throw error;
  }finally{pending=false;}
}
async function goBack(){
  const state=navigationStack.pop();
  if(!state)return;
  save();
  await openBundled(state.id,false,state);
}

function updateInfo() {
  const original=$('originalPuzzleLink');
  original.hidden=!currentEntry?.url;
  if(currentEntry?.url) original.href=currentEntry.url;
  else original.removeAttribute('href');
  $('puzzleTitle').textContent = puzzle.title;
  $('puzzleAuthor').textContent = puzzle.author || 'SudokuPad / SudokuMaker';
  $('boardMeta').textContent = puzzle.rows+' × '+puzzle.cols+' · '+(puzzle.lines||[]).length+' lines';
  updateSector();
  const warning=$('warningList');
  warning.replaceChildren();
  warning.hidden=!puzzle.warnings?.length;
  for (const message of puzzle.warnings||[]) {
    const p=document.createElement('p');
    p.textContent='⚠ '+message;
    warning.appendChild(p);
  }
}
async function openResult(result) {
  puzzle=result.puzzle;
  progress=result.progress;
  undoStack=[];redoStack=[];
  selected=-1;selectedCells=[];
  gesture=null;pointers.clear();
  buildRegions();
  updateInfo();
  await restoreSaved();
  lastCompletion=Boolean(progress.solved);
  // Sudokuvania source URLs explicitly used setting-nogrid=1.
  // Super Sudokoid source URLs did not: retain their fine grid by default.
  showGridLines=!['digits-of-despair','lineage-of-logic'].includes(currentEntry?.id);
  $('gridButton').textContent=showGridLines?'隐藏格线':'显示格线';
  updateControls();
  fit();
  if(progress.visible?.some(lit=>!lit)){
    const focus=focusInitialFog(puzzle,progress,{width:frame.clientWidth,height:frame.clientHeight});
    if(focus)camera=focus;
  }
  updateSector();
  requestDraw();
}
async function openInput(input) {
  if (pending) return;
  if (!input || input.length>MAX_IMPORT) throw new Error('请选择小于 8 MiB 的谜题文件');
  pending=true;
  try {
    const result=await call('open_puzzle',{input,localization:null});
    currentEntry=null;navigationStack=[];mainDictionary={};
    await openResult(result);
    updateBack();
    $('importDialog').close();
    $('pasteInput').value='';
    $('filePicker').value='';
    toast('谜题已导入');
  } finally {pending=false;}
}

function updateControls() {
  $('alphabetButton').setAttribute('aria-pressed',String(alphabet));
  $('alphabetButton').textContent=alphabet?'123 数字':'ABC 字母';
  $('letterPage').hidden=!alphabet;
  $('letterPage').textContent='字母 '+(letterPage+1)+'/3';
  $('padTitle').textContent=alphabet?'字母输入 · '+(['A–I','J–R','S–Z'][letterPage]):'数字输入';
  $('palette').hidden=mode!=='color';
  document.querySelectorAll('[data-mode]').forEach(el=>{
    el.classList.toggle('active',el.dataset.mode===mode);
    el.setAttribute('aria-pressed',String(el.dataset.mode===mode));
  });
  const keys=alphabet?'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.slice(letterPage*9,(letterPage+1)*9).split(''):['1','2','3','4','5','6','7','8','9','0'];
  const pad=$('keypad');
  pad.replaceChildren();
  for (const symbol of keys) {
    const btn=document.createElement('button');
    btn.type='button';btn.textContent=symbol;btn.dataset.symbol=symbol;
    btn.disabled=mode==='color';
    pad.appendChild(btn);
  }
  $('undoButton').disabled=!progress?.canUndo;
  $('redoButton').disabled=!progress?.canRedo;
  $('zoomLabel').textContent=Math.round(camera.scale*100)+'%';
  updateSelection();
}
function updateSelection() {
  if (!puzzle||selected<0) {
    $('selectionLabel').textContent='选择一个格子';
    if(puzzle)updateSector();
    return;
  }
  const row=Math.floor(selected/puzzle.cols)+1,col=selected%puzzle.cols+1;
  const fogged=!isVisible(progress,selected);
  $('selectionLabel').textContent='R'+row+'C'+col+
    (selectedCells.length>1?' · 已选 '+selectedCells.length+' 格':
      fogged?' · 迷雾':puzzle.cells[selected].given!==null?' · 提示':'');
  updateSector();
}

function requestDraw() {
  if(drawQueued) return;
  drawQueued=true;
  requestAnimationFrame(()=>{drawQueued=false;draw();});
}
function resizeCanvas() {
  const bounds=frame.getBoundingClientRect();
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const w=Math.max(1,Math.round(bounds.width*dpr)),h=Math.max(1,Math.round(bounds.height*dpr));
  if(board.width!==w||board.height!==h){board.width=w;board.height=h;}
  requestDraw();
}
function fit() {
  if(!puzzle) return;
  const w=frame.clientWidth,h=frame.clientHeight;
  camera.scale=Math.max(.08,Math.min(2.2,(w-48)/(puzzle.cols*CELL),(h-48)/(puzzle.rows*CELL)));
  camera.x=(w-puzzle.cols*CELL*camera.scale)/2;
  camera.y=(h-puzzle.rows*CELL*camera.scale)/2;
  updateControls();
  requestDraw();
}
function setZoom(newScale,anchorX=frame.clientWidth/2,anchorY=frame.clientHeight/2) {
  const next=Math.max(.065,Math.min(5,newScale));
  const ratio=next/camera.scale;
  camera.x=anchorX-(anchorX-camera.x)*ratio;
  camera.y=anchorY-(anchorY-camera.y)*ratio;
  camera.scale=next;
  $('zoomLabel').textContent=Math.round(next*100)+'%';
  requestDraw();
}
function gridIndex(x,y) {
  if(!puzzle) return -1;
  const c=Math.floor(((x-camera.x)/camera.scale)/CELL);
  const r=Math.floor(((y-camera.y)/camera.scale)/CELL);
  return r>=0&&c>=0&&r<puzzle.rows&&c<puzzle.cols?r*puzzle.cols+c:-1;
}
function draw() {
  if(!puzzle||!progress||!ctx)return;
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const w=board.width/dpr,h=board.height/dpr;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#dfe9e6';ctx.fillRect(0,0,w,h);
  ctx.setTransform(dpr*camera.scale,0,0,dpr*camera.scale,dpr*camera.x,dpr*camera.y);
  const clip={
    left:Math.max(0,-camera.x/camera.scale),top:Math.max(0,-camera.y/camera.scale),
    right:(w-camera.x)/camera.scale,bottom:(h-camera.y)/camera.scale
  };
  const c0=Math.max(0,Math.floor(clip.left/CELL)-1),c1=Math.min(puzzle.cols,Math.ceil(clip.right/CELL)+1);
  const r0=Math.max(0,Math.floor(clip.top/CELL)-1),r1=Math.min(puzzle.rows,Math.ceil(clip.bottom/CELL)+1);
  ctx.fillStyle='#fbfdfb';ctx.fillRect(0,0,puzzle.cols*CELL,puzzle.rows*CELL);
  drawPathMarks(ctx,puzzle.underlays);
  drawDecorations(ctx,puzzle.underlays,clip);
  drawPuzzleLines(ctx,puzzle.lines,clip,'underlay');
  for(let r=r0;r<r1;r++)for(let c=c0;c<c1;c++){
    const idx=r*puzzle.cols+c,entry=progress.cells[idx]||clearCell();
    const x=c*CELL,y=r*CELL;
    if(entry.color){ctx.fillStyle=entry.color;ctx.fillRect(x+1,y+1,CELL-2,CELL-2);}
    if(selectedCells.includes(idx)){ctx.fillStyle='#a0d5eb6d';ctx.fillRect(x,y,CELL,CELL);}
    if(showGridLines) {
      ctx.strokeStyle='#bec7c9';ctx.lineWidth=.65;ctx.strokeRect(x,y,CELL,CELL);
    }
  }
  // Region boundaries follow the imported region membership, not a guessed 3×3 layout.
  if(showGridLines && regionMap.some(v=>v>=0)){
    ctx.strokeStyle='#3d566b';ctx.lineWidth=2.6;
    ctx.beginPath();
    for(let r=r0;r<r1;r++)for(let c=c0;c<c1;c++){
      const idx=r*puzzle.cols+c,id=regionMap[idx];
      if(id<0)continue;
      const x=c*CELL,y=r*CELL;
      if(r===0||regionMap[idx-puzzle.cols]!==id){ctx.moveTo(x,y);ctx.lineTo(x+CELL,y);}
      if(c===0||regionMap[idx-1]!==id){ctx.moveTo(x,y);ctx.lineTo(x,y+CELL);}
      if(r===puzzle.rows-1||regionMap[idx+puzzle.cols]!==id){ctx.moveTo(x,y+CELL);ctx.lineTo(x+CELL,y+CELL);}
      if(c===puzzle.cols-1||regionMap[idx+1]!==id){ctx.moveTo(x+CELL,y);ctx.lineTo(x+CELL,y+CELL);}
    }
    ctx.stroke();
  }
  drawPuzzleLines(ctx,puzzle.lines,clip);
  drawArrows(ctx,puzzle,clip);
  drawCages(ctx,puzzle,clip);
  for(let r=r0;r<r1;r++)for(let c=c0;c<c1;c++){
    const idx=r*puzzle.cols+c;
    const given=puzzle.cells[idx].given,entry=progress.cells[idx]||clearCell();
    const x=c*CELL,y=r*CELL;
    const value=given??entry.value;
    if(value){
      ctx.font=(given?'700 ':'600 ')+CELL*.61+'px sans-serif';
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=given?'#263345':'#2560a1';
      ctx.fillText(String(value),x+CELL/2,y+CELL/2+1,CELL*.9);
    }
    if(entry.corner?.length){
      ctx.fillStyle='#325b89';ctx.font='600 10px sans-serif';ctx.textAlign='left';ctx.textBaseline='top';
      ctx.fillText(entry.corner.join(' ').slice(0,16),x+4,y+3,CELL-6);
    }
    if(entry.center?.length){
      ctx.fillStyle='#48617e';ctx.font='600 11px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(entry.center.join(' ').slice(0,17),x+CELL/2,y+CELL*.76,CELL-6);
    }
  }
  drawPathMarks(ctx,puzzle.overlays);
  drawDecorations(ctx,puzzle.overlays,clip);
  drawPuzzleLines(ctx,puzzle.lines,clip,'overlay');
  // Source-authored cell-grids paths are the canonical adventure walls.
  // Do not add speculative rectangles around story metadata when they exist.
  const authoredBorders=(puzzle.lines||[]).some(line=>line?.target==='cell-grids');
  if(!authoredBorders)drawSectorBorders(ctx,puzzle.sectors,clip);
  drawFog(ctx,puzzle,progress,clip);
  // Keep deliberate scene outlines visible through the fog without exposing
  // hidden clues. They are independent of the optional fine grid lines.
  if(authoredBorders)drawPuzzleLines(ctx,puzzle.lines,clip,'grid');
  for(const index of selectedCells){
    const x=(index%puzzle.cols)*CELL,y=Math.floor(index/puzzle.cols)*CELL;
    // Highlight covered cells without exposing their contents.
    ctx.strokeStyle=isVisible(progress,index)?'#137fbc':'#ffcf73';
    ctx.lineWidth=index===selected?3.5:2.4;
    ctx.strokeRect(x+1,y+1,CELL-2,CELL-2);
  }
  if(showGridLines){
    ctx.strokeStyle='#263c51';ctx.lineWidth=3;
    ctx.strokeRect(0,0,puzzle.cols*CELL,puzzle.rows*CELL);
  }
}

function showCompletionIfNew(){
  const solved=Boolean(progress?.solved);
  if(solved&&!lastCompletion){
    $('completionText').textContent=progress.completion||'已完成当前谜题。';
    $('completionBack').hidden=navigationStack.length===0;
    if(!$('completionDialog').open)$('completionDialog').showModal();
  }
  lastCompletion=solved;
}
function applyChange(change) {
  const changed=Array.isArray(change.changes)?change.changes:[{index:change.index,cell:change.cell}];
  for(const entry of changed)progress.cells[entry.index]=entry.cell;
  progress.canUndo=change.canUndo;progress.canRedo=change.canRedo;
  if(Array.isArray(change.visible))progress.visible=change.visible;
  progress.solved=Boolean(change.solved);
  progress.completion=change.completion??null;
}
async function edit(action,symbol='') {
  if(pending||!puzzle)return;
  const indices=selectedCells.filter(index=>puzzle.cells[index]?.given==null);
  if(!indices.length){toast(selectedCells.length?'提示数字不可修改':'请先选择格子');return;}
  pending=true;
  try {
    const change=indices.length===1
      ?await call('update_cell',{index:indices[0],mode:action,symbol})
      :await call('update_cells',{indices,mode:action,symbol});
    applyChange(change);
    updateControls();scheduleSave();requestDraw();
    showCompletionIfNew();
  } catch(error){notify(error);}
  finally{pending=false;}
}
async function history(direction) {
  if(pending||!puzzle)return;
  pending=true;
  try {
    const change=await call(direction);
    applyChange(change);
    if(selectedCells.length<=1&&canSelectCell(puzzle,change.index))
      setSelection([change.index]);
    // setSelection is a no-op when the active cell stays the same. Undo/redo
    // still changed the engine's history flags and visible cell contents.
    updateControls();
    requestDraw();
    scheduleSave();
    showCompletionIfNew();
  } catch(error){notify(error);}
  finally{pending=false;}
}
function setSelection(indices) {
  const valid=[...new Set(indices.filter(index=>canSelectCell(puzzle,index)))];
  if(valid.length===selectedCells.length&&valid.every((id,i)=>id===selectedCells[i]))return;
  const next=valid.at(-1)??-1;
  if(next!==selected)sectorCursor=0;
  selectedCells=valid;selected=next;
  updateSelection();requestDraw();
  board.focus({preventScroll:true});
}
function select(index) {setSelection(index<0?[]:[index]);}
function extendSelection(indices) {
  const set=new Set(selectedCells),next=[...selectedCells];
  for(const index of indices){
    if(canSelectCell(puzzle,index)&&!set.has(index)){
      next.push(index);set.add(index);
    }
  }
  if(next.length!==selectedCells.length)setSelection(next);
}
function locationInFrame(event) {
  const b=frame.getBoundingClientRect();
  return {x:event.clientX-b.left,y:event.clientY-b.top};
}
function pointerDistance(a,b) {return Math.hypot(a.x-b.x,a.y-b.y);}
function pointerCenter(a,b) {return {x:(a.x+b.x)/2,y:(a.y+b.y)/2};}
board.addEventListener('contextmenu',event=>event.preventDefault());
board.addEventListener('pointerdown',event=>{
  if(!puzzle)return;
  event.preventDefault();board.setPointerCapture(event.pointerId);
  const p=locationInFrame(event);pointers.set(event.pointerId,p);
  if(pointers.size===1){
    const panMouse=event.pointerType==='mouse' &&
      (event.button===1||event.button===2||event.shiftKey||event.altKey);
    const oldSelection=[...selectedCells];
    gesture={kind:panMouse?'mouse-pan':'select',last:p,moved:false,oldSelection};
    if(!panMouse)select(gridIndex(p.x,p.y));
  }else if(pointers.size===2){
    if(gesture?.kind==='select'&&!gesture.moved)setSelection(gesture.oldSelection);
    const [a,b]=[...pointers.values()];
    gesture={kind:'transform',lastCenter:pointerCenter(a,b),lastDistance:pointerDistance(a,b)};
  }else gesture={kind:'ignore'};
});
board.addEventListener('pointermove',event=>{
  if(!pointers.has(event.pointerId)||!gesture)return;
  const p=locationInFrame(event),previous=pointers.get(event.pointerId);
  pointers.set(event.pointerId,p);
  if(pointers.size===2&&gesture.kind==='transform'){
    const [a,b]=[...pointers.values()];
    const center=pointerCenter(a,b),distance=pointerDistance(a,b);
    // Two fingers pan with their midpoint, and pinch to zoom.
    camera.x+=center.x-gesture.lastCenter.x;
    camera.y+=center.y-gesture.lastCenter.y;
    if(gesture.lastDistance>0&&distance>0)
      setZoom(camera.scale*distance/gesture.lastDistance,center.x,center.y);
    else requestDraw();
    gesture.lastCenter=center;gesture.lastDistance=distance;
  }else if(pointers.size===1&&gesture.kind==='mouse-pan'){
    camera.x+=p.x-previous.x;camera.y+=p.y-previous.y;
    gesture.last=p;requestDraw();
  }else if(pointers.size===1&&gesture.kind==='select'){
    if(Math.hypot(p.x-gesture.last.x,p.y-gesture.last.y)>0.5)gesture.moved=true;
    extendSelection(dragCellIndices(previous,p,camera,puzzle));
    gesture.last=p;
  }
});
function endPointer(event){
  if(!pointers.has(event.pointerId))return;
  pointers.delete(event.pointerId);
  if(pointers.size===1)gesture={kind:'ignore'};
  else if(pointers.size===0)gesture=null;
}
board.addEventListener('pointerup',endPointer);
board.addEventListener('pointercancel',endPointer);
board.addEventListener('wheel',event=>{
  event.preventDefault();
  const p=locationInFrame(event);setZoom(camera.scale*Math.exp(-event.deltaY*.0015),p.x,p.y);
},{passive:false});

$('fitButton').addEventListener('click',fit);
$('gridButton').addEventListener('click',()=>{
  showGridLines=!showGridLines;
  $('gridButton').textContent=showGridLines?'隐藏格线':'显示格线';
  requestDraw();
});
$('zoomIn').addEventListener('click',()=>setZoom(camera.scale*1.25));
$('zoomOut').addEventListener('click',()=>setZoom(camera.scale/1.25));
$('alphabetButton').addEventListener('click',()=>{alphabet=!alphabet;letterPage=0;updateControls();});
$('letterPage').addEventListener('click',()=>{letterPage=(letterPage+1)%3;updateControls();});
$('modeBar').addEventListener('click',event=>{
  const button=event.target.closest('button[data-mode]');
  if(button){mode=button.dataset.mode;updateControls();}
});
$('keypad').addEventListener('click',event=>{
  const button=event.target.closest('button[data-symbol]');
  if(button&&!button.disabled)edit(mode,button.dataset.symbol);
});
$('palette').addEventListener('click',event=>{
  const button=event.target.closest('button[data-color]');
  if(button)edit('color',button.dataset.color);
});
$('eraseButton').addEventListener('click',()=>edit('erase'));
$('undoButton').addEventListener('click',()=>history('undo'));
$('redoButton').addEventListener('click',()=>history('redo'));
function showRules(){if(!$('rulesDialog').open)$('rulesDialog').showModal();}
$('rulesButton').addEventListener('click',showRules);
$('nextSector').addEventListener('click',()=>{
  if(!matchingSectors.length)return;
  sectorCursor=(sectorCursor+1)%matchingSectors.length;updateSector();
});
$('libraryButton').addEventListener('click',()=>{
  renderLibrary();$('libraryDialog').showModal();
});
$('closeLibrary').addEventListener('click',()=>$('libraryDialog').close());
$('showAllPuzzles').addEventListener('change',renderLibrary);
$('backButton').addEventListener('click',()=>goBack().catch(notify));
$('closeCompletion').addEventListener('click',()=>$('completionDialog').close());
$('completionBack').addEventListener('click',()=>{
  $('completionDialog').close();
  if(navigationStack.length)goBack().catch(notify);
});
$('moreRules').addEventListener('click',showRules);
$('closeRules').addEventListener('click',()=>$('rulesDialog').close());
$('dismissRules').addEventListener('click',()=>$('rulesDialog').close());
$('importButton').addEventListener('click',()=>{
  $('importError').textContent='';
  $('importDialog').showModal();
});
$('cancelImport').addEventListener('click',()=>$('importDialog').close());
$('confirmImport').addEventListener('click',async()=>{
  try{
    const file=$('filePicker').files?.[0];
    const input=file?await file.text():$('pasteInput').value.trim();
    await openInput(input);
  }catch(error){$('importError').textContent=String(error);}
});
$('demoButton').addEventListener('click',async()=>{
  if(pending)return;
  try{
    if(puzzle)save();
    currentEntry=null;navigationStack=[];mainDictionary={};
    await openResult(await call('load_demo'));updateBack();toast('示例已打开');
  }catch(error){notify(error);}
});
document.addEventListener('keydown',event=>{
  const active=document.activeElement;
  if(active?.matches('input,textarea')||$('importDialog').open||$('rulesDialog').open||
      $('libraryDialog').open||$('completionDialog').open)return;
  if(event.key==='Escape'&&navigationStack.length){
    event.preventDefault();goBack().catch(notify);return;
  }
  if((event.ctrlKey||event.metaKey)&&(event.key.toLowerCase()==='z'||event.key.toLowerCase()==='y')){
    event.preventDefault();history(event.shiftKey||event.key.toLowerCase()==='y'?'redo':'undo');return;
  }
  if(event.key==='Backspace'||event.key==='Delete'){event.preventDefault();edit('erase');return;}
  const k=event.key.toUpperCase();
  if(k.length===1&&validSymbol(k)){
    event.preventDefault();
    if(mode!=='color')edit(mode,k);
    return;
  }
  const delta={ArrowUp:-puzzle?.cols,ArrowDown:puzzle?.cols,ArrowLeft:-1,ArrowRight:1}[event.key];
  if(delta&&puzzle){
    event.preventDefault();
    const next=Math.max(0,Math.min(puzzle.cells.length-1,(selected<0?0:selected)+delta));
    select(next);
  }
});
new ResizeObserver(resizeCanvas).observe(frame);
resizeCanvas();
$('runtimeBadge').textContent=native?'Rust / Tauri':'Rust / WASM';
(async()=>{
  try{
    await loadCatalog();
    // A shareable URL selects any bundled puzzle, e.g. ?puzzle=super-sudokoid-2.
    // Unrecognized puzzle IDs safely fall back to the first adventure map.
    const requested=new URLSearchParams(location.search).get('puzzle');
    const entry=catalog.find(item=>item.id===requested);
    await openBundled(entry?.id || 'digits-of-despair');
  }catch(error){
    notify('内置谜题加载失败: '+String(error));
    try{await openResult(await call('load_demo'));}catch(e){notify(e);}
  }
})();
