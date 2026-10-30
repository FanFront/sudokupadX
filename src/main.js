import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { installExternalLinkHandler } from './external-links.js';
import {invokeBrowser} from './web-runtime.js';
import {drawArrows,drawCages,drawPathMarks,drawFog,drawDecorations,drawPuzzleLines,drawSectorBorders,getSectors,isVisible,canSelectCell,dragCellIndices,focusInitialFog} from './adventure-ui.js';
import {createCheckpoint,inspectCheckpoint,verifyCheckpoint,matchingCatalogEntry,puzzleSlug} from './checkpoint.js';
import {buildConflictHouses,detectConflicts} from './conflicts.js';
import {cellInk} from './cell-ink.js';
import {PEN_COLORS,normalizePenLines,normalizePenMarks,penNodeAt,penMarkAt,tapPenMark,tracePenNodes,straightDiagonalPenNodes,createPenStroke,applyPenStep,penStrokeLines,drawPenLines,drawPenMarks} from './pen-lines.js';
import {linksAtCell,returnDestination} from './linked-navigation.js';
import {setupOnlineLibrary} from './online-ui.js';
import {readResumePuzzle,saveResumePuzzle,fetchOnlinePuzzle} from './online-library.js';
import {parsePenpaUrl,directPenpaEntry} from './penpa-import.js';
import {RESUME_KEY,captureView,restoreView,bundledSource,cachedSource,parseResume,serializeResume} from './resume-session.js';
import {bilingualTitle,displayBilingual} from './bilingual.js';
import './style.css';

const $ = id => document.getElementById(id);
const native = !!window.__TAURI_INTERNALS__;
// Android WebViews may render behind the status bar without exposing a
// nonzero CSS safe-area inset. Apply a native-only cutout-safe fallback.
document.documentElement.classList.toggle('android-native',native && /Android/i.test(navigator.userAgent));
const CELL = 52;
const MAX_IMPORT = 8 * 1024 * 1024;
const colors = ['#f8cd75','#a9d9a1','#9fcbff','#e9b0d6','#bfb5fa'];
let puzzle = null;
let progress = null;
let selected = -1;
let selectedCells = [];
let mode = 'value';
let penLines = [];
let penMarks = [];
let penColor = PEN_COLORS[0];
let penGrid = 'center';
let penErase = false;
let alphabet = false;
let letterPage = 0;
let camera = {x:0,y:0,scale:1};
let regionMap = [];
let conflictHouses = [];
let conflicts = {valueCells:new Set(),noteSymbols:[]};
let drawQueued = false;
let pending = false;
let undoStack = [];
let redoStack = [];
let toastTimer = 0;
let saveTimer = 0;
let catalog = [], localeZh = {}, mainDictionary = {};
let currentEntry = null, navigationStack = [], matchingSectors = [], sectorCursor = 0;
let activeLinkedPuzzles = [];
let lastCompletion = false;
let showGridLines = true;
let activeSource = null;
let resumeRecord = null;
let frameSize = {width:0,height:0};
const board = $('boardCanvas');
const frame = $('boardFrame');
const ctx = board.getContext('2d', {alpha:false});
const pointers = new Map();
let gesture = null;

function cloneCell(v) {
  return {value:v.value ?? null,corner:[...(v.corner || [])],center:[...(v.center || [])],color:v.color ?? null};
}
function clearCell() { return {value:null,corner:[],center:[],color:null}; }
function refreshConflicts() {
  conflicts=detectConflicts(puzzle,progress,conflictHouses);
}
// Draw individual marks rather than a single string so only the conflicting
// candidate is red (not every corner/center note in the cell).
function drawNoteRow(entry,kind,x,y,redMarks,fogged=false) {
  const marks=entry?.[kind];
  if(!Array.isArray(marks)||marks.length===0)return;
  const centered=kind==='center';
  ctx.save();
  ctx.font='600 '+(centered?11:10)+'px sans-serif';
  ctx.textAlign='left';ctx.textBaseline=centered?'middle':'top';
  const parts=marks.slice(0,26).map(String),gap=2.5;
  const widths=parts.map(part=>ctx.measureText(part).width);
  const total=widths.reduce((sum,width)=>sum+width,0)+gap*Math.max(0,parts.length-1);
  const scale=Math.min(1,(CELL-8)/Math.max(1,total));
  const left=centered?x+CELL/2-total*scale/2:x+4;
  ctx.translate(left,centered?y+CELL*.76:y+3);
  ctx.scale(scale,1);
  let offset=0;
  for(let i=0;i<parts.length;i++){
    ctx.fillStyle=redMarks?.has(parts[i])?(fogged?'#ff8c9b':'#c82038'):
      fogged?(centered?'#e2ecfc':'#f2e9cb'):centered?'#48617e':'#325b89';
    ctx.fillText(parts[i],offset,0);
    offset+=widths[i]+gap;
  }
  ctx.restore();
}
// The original puzzle and player ink are separate layers. Visible cells are
// painted before fog; player ink in hidden cells is painted *after* fog.
function drawCellInk(index,x,y,fogLayer=false) {
  const ink=cellInk(puzzle,progress,index);
  if(!ink || ink.fogged!==fogLayer)return;
  if(ink.value){
    ctx.font=(ink.given?'700 ':'600 ')+CELL*.61+'px sans-serif';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle=conflicts.valueCells.has(index)
      ?(ink.fogged?'#ff8c9b':'#c82038')
      :ink.fogged?'#f0f6ff':ink.given?'#263345':'#2560a1';
    ctx.fillText(String(ink.value),x+CELL/2,y+CELL/2+1,CELL*.9);
  } else {
    drawNoteRow(ink,'corner',x,y,conflicts.noteSymbols[index],ink.fogged);
    drawNoteRow(ink,'center',x,y,conflicts.noteSymbols[index],ink.fogged);
  }
}
function validSymbol(s) {return /^[0-9A-Z]$/.test(s);}
function saveKey() {return puzzle ? 'sudokupadx:v1:'+puzzle.key : '';}
// The home view hides gameplay without destroying its Rust session or camera.
function updateHomeCard() {
  const source=resumeRecord?.source;
  const available=Boolean(puzzle) || Boolean(source);
  $('homeContinueSection').hidden=!available;
  if(!available)return;
  const previous=source?.type==='bundled'
    ?catalog.find(entry=>entry.id===source.id)
    :source?.type==='online'?source.entry:null;
  $('homePuzzleTitle').textContent=puzzle?.title || previous?.title || '最近导入的谜题';
  $('homePuzzleMeta').textContent=puzzle
    ?puzzle.rows+' × '+puzzle.cols+' · 进度和棋盘位置已保存'
    :'进度和棋盘位置已保存 · 点击继续恢复';
}
function showGame() {
  $('homeScreen').hidden=true;
  $('gameScreen').hidden=false;
  // Canvas is zero-sized on Home; measure it after Game becomes visible.
  resizeCanvas();
}
function showHome() {
  if(puzzle && !$('gameScreen').hidden)save();
  $('gameScreen').hidden=true;
  $('homeScreen').hidden=false;
  updateHomeCard();
}
function save() {
  if (!puzzle || !progress) return;
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(saveKey(),JSON.stringify({version:1,cells:progress.cells,penLines,penMarks}));
    // Home hides the board; retain its last measured dimensions when saving there.
    const view=captureView(camera,frame.clientWidth||frameSize.width,
      frame.clientHeight||frameSize.height,selectedCells,showGridLines);
    const resume=serializeResume(activeSource,view,navigationStack);
    if(resume) localStorage.setItem(RESUME_KEY,resume);
    $('saveLabel').textContent = '已保存到本机';
  } catch {
    $('saveLabel').textContent = '本机保存失败';
  }
}
function scheduleSave() {
  clearTimeout(saveTimer);
  $('saveLabel').textContent = '待保存';
  saveTimer=setTimeout(save,350);
}
function scheduleViewSave() {
  if (!pending && activeSource) scheduleSave();
}
document.addEventListener('visibilitychange',()=>{
  if (document.visibilityState==='hidden') save();
});
window.addEventListener('pagehide', save);
// Open original SudokuPad / Logic Masters links in the system browser on
// Android, so the OS back gesture returns to this still-running puzzle.
installExternalLinkHandler({
  root: document,
  native,
  openNative: url => openUrl(url),
  openWeb: url => window.open(url,'_blank','noopener,noreferrer'),
  save,
  notify
});
async function restoreSaved() {
  let stored;
  try {stored=JSON.parse(localStorage.getItem(saveKey()) || 'null');} catch {return;}
  if (!stored || stored.version!==1 || !Array.isArray(stored.cells) || stored.cells.length!==puzzle.cells.length) return;
  try {progress = await call('restore_progress',{cells:stored.cells});}
  catch (error) {notify('存档未载入: '+String(error));}
  try {penLines=normalizePenLines(stored.penLines??[],puzzle.rows,puzzle.cols);}
  catch {penLines=[];notify('画线存档无效，已保留数字进度');}
  try {penMarks=normalizePenMarks(stored.penMarks??[],puzzle.rows,puzzle.cols);}
  catch {penMarks=[];notify('圆圈和叉号存档无效，已保留其他进度');}
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
function updateBack(){
  const destination=returnDestination(currentEntry,catalog,navigationStack);
  const button=$('backButton');
  button.hidden=!destination;
  const label=destination?.fromStack &&
    !['main','standalone'].includes(catalog.find(entry=>entry.id===destination.id)?.kind)
      ?'返回上一谜题':'返回主谜题';
  button.setAttribute('aria-label',label);
  button.title=label;
}
function updateGridButton(){
  const button=$('gridButton');
  const label=showGridLines?'隐藏格线':'显示格线';
  button.setAttribute('aria-label',label);
  button.title=label;
  button.setAttribute('aria-pressed',String(showGridLines));
}
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
  const local=localeZh[currentEntry?.id];
  $('modalSectorTitle').textContent=sector?title:bilingualTitle(puzzle.title,local?.titleOriginal);
  $('nextSector').hidden=matchingSectors.length<2;
  $('rulesPreview').textContent=rules;
  displayBilingual($('fullRules'),rules,sector?null:local?.rulesOriginal,sector?null:local?.boardGlossary);
  // Links may be held by a larger underlying grid rather than the currently
  // displayed (smallest) overlapping story sector. Do not expose fogged links.
  activeLinkedPuzzles=eligible?linksAtCell(puzzle,progress,selected,catalog,currentEntry?.id):[];
  renderSectorLinks($('sectorLinks'),activeLinkedPuzzles);
  renderSectorLinks($('modalLinks'),activeLinkedPuzzles);
  const entrance=$('linkedPuzzleButton');
  const count=activeLinkedPuzzles.length;
  entrance.hidden=count===0;
  const label=count===1?'进入关联谜题：'+activeLinkedPuzzles[0].title:
    '查看本区域的 '+count+' 道关联谜题';
  entrance.setAttribute('aria-label',label);
  entrance.title=label;
  const badge=$('linkedPuzzleCount');
  badge.hidden=count<=1;
  badge.textContent=count>9?'9+':String(count);
}
function renderLibrary(){
  const list=$('libraryList');list.replaceChildren();
  for(const entry of catalog.filter(x=>(x.kind==='main'||x.kind==='standalone')||$('showAllPuzzles').checked)){
    const btn=document.createElement('button');btn.type='button';btn.className='library-entry';
    const title=document.createElement('strong');title.textContent=entry.title;
    const sub=document.createElement('small');sub.textContent=entry.kind==='main'?'冒险地图':entry.kind==='standalone'?'独立谜题':entry.group+' · '+(entry.kind==='boss'?'首领谜题':'支线谜题');
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
  const fromHome=$('gameScreen').hidden;
  if(currentEntry && push){
    save();navigationStack.push({id:currentEntry.id,
      view:captureView(camera,frame.clientWidth,frame.clientHeight,selectedCells,showGridLines)});
  }else if(!backState && !push) {
    if(puzzle)save();navigationStack=[];
  }
  if(fromHome)showGame();
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
    if(localeZh[id]?.author)result.puzzle.author=localeZh[id].author;
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
    activeSource=bundledSource(id);
    if(backState?.view) applyStoredView(backState.view);
    updateBack();
    save();
    resumeRecord=null;
    updateHomeCard();
    if($('rulesDialog').open)$('rulesDialog').close();
    if($('libraryDialog').open)$('libraryDialog').close();
    toast('已载入离线谜题');
  }catch(error){
    if(push)navigationStack.pop();
    if(fromHome)showHome();
    throw error;
  }finally{pending=false;}
}
async function goBack(){
  if(pending)return;
  const destination=returnDestination(currentEntry,catalog,navigationStack);
  if(!destination)return;
  save();
  // Keep the return state until the parent has loaded successfully. A missing
  // puzzle asset or failed restore must not destroy the route back.
  await openBundled(destination.id,false,destination.backState);
  if(destination.fromStack)navigationStack.pop();
  updateBack();
  save();
}

function updateInfo() {
  const original=$('originalPuzzleLink');
  original.hidden=!currentEntry?.url;
  if(currentEntry?.url) original.href=currentEntry.url;
  else original.removeAttribute('href');
  original.textContent = parsePenpaUrl(currentEntry?.url) ? '在 Penpa+ 中查看原题' : '在原版 SudokuPad 中对比此谜题';
  const lmdSource=$('lmdSourceLink');
  lmdSource.hidden=!currentEntry?.sourceUrl;
  if(currentEntry?.sourceUrl) lmdSource.href=currentEntry.sourceUrl;
  else lmdSource.removeAttribute('href');
  const local=localeZh[currentEntry?.id];
  $('puzzleTitle').textContent = bilingualTitle(puzzle.title,local?.titleOriginal);
  $('puzzleAuthor').textContent = bilingualTitle(puzzle.author || 'SudokuPad / SudokuMaker',local?.authorOriginal);
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
  undoStack=[];redoStack=[];penLines=[];penMarks=[];
  selected=-1;selectedCells=[];
  gesture=null;pointers.clear();
  buildRegions();
  updateInfo();
  await restoreSaved();
  conflictHouses=buildConflictHouses(puzzle);
  refreshConflicts();
  lastCompletion=Boolean(progress.solved);
  // Sudokuvania source URLs explicitly used setting-nogrid=1.
  // Super Sudokoid source URLs did not: retain their fine grid by default.
  showGridLines=!['digits-of-despair','lineage-of-logic'].includes(currentEntry?.id) &&
    !(currentEntry?.url && new URL(currentEntry.url).searchParams.has('setting-nogrid'));
  updateGridButton();
  updateControls();
  fit();
  if(progress.visible?.some(lit=>!lit)){
    const focus=focusInitialFog(puzzle,progress,{width:frame.clientWidth,height:frame.clientHeight});
    if(focus)camera=focus;
  }
  updateSector();
  requestDraw();
}
async function cacheActivePuzzle(input, entry = null) {
  try {
    await saveResumePuzzle(puzzle.key,input);
    activeSource=cachedSource(puzzle.key,entry);
    if(!activeSource) throw Error('缺少有效的谜题恢复信息');
  } catch(error) {
    activeSource=null;
    try {localStorage.removeItem(RESUME_KEY);} catch {}
    notify('自动恢复题面保存失败：'+String(error?.message || error));
  }
}
async function openInput(input, restoredView = null, resuming = false) {
  if (pending) return;
  if (!input || input.length>MAX_IMPORT) throw new Error('请选择小于 8 MiB 的谜题文件');
  if(puzzle)save();
  const fromHome=$('gameScreen').hidden;
  if(fromHome)showGame();
  pending=true;
  try {
    const result=await call('open_puzzle',{input,localization:null});
    currentEntry=null;navigationStack=[];mainDictionary={};
    await openResult(result);
    await cacheActivePuzzle(input);
    if(restoredView)applyStoredView(restoredView);
    updateBack();
    save();
    resumeRecord=null;
    updateHomeCard();
    if($('importDialog').open)$('importDialog').close();
    $('pasteInput').value='';
    $('filePicker').value='';
    if(!resuming)toast('谜题已导入');
  } catch(error) {if(fromHome)showHome();throw error;}
  finally {pending=false;}
}

async function openIndexedPuzzle(entry,input,offline,restoredView = null,resuming = false) {
  if (pending) throw Error('请先等待当前谜题加载结束');
  if (puzzle) save();
  const fromHome=$('gameScreen').hidden;
  if(fromHome)showGame();
  pending=true;
  try {
    // Parsing failure leaves the current Rust session intact.
    const result=await call('open_puzzle',{input,localization:null});
    currentEntry={id:'online:'+entry.id,kind:'online',title:entry.title,
      group:entry.sourceName,url:entry.puzzleUrl,sourceUrl:entry.sourceUrl || null};
    navigationStack=[];mainDictionary={};
    await openResult(result);
    await cacheActivePuzzle(input,entry);
    if(restoredView)applyStoredView(restoredView);
    updateBack();
    save();
    resumeRecord=null;
    updateHomeCard();
    if(!resuming)toast(offline?'已打开离线下载的谜题':'已打开在线谜题');
  } catch(error) {if(fromHome)showHome();throw error;}
  finally {pending=false;}
}

function updateControls() {
  $('alphabetButton').setAttribute('aria-pressed',String(alphabet));
  $('alphabetButton').textContent=alphabet?'123':'ABC';
  $('alphabetButton').setAttribute('aria-label',alphabet?'切换到数字输入':'切换到字母输入');
  $('alphabetButton').disabled=mode==='pen';
  $('letterPage').hidden=!alphabet||mode==='pen';
  $('letterPage').textContent=['A–I','J–R','S–Z'][letterPage];
  $('padTitle').textContent=mode==='pen'?'画线工具':alphabet?'字母输入 · '+(['A–I','J–R','S–Z'][letterPage]):'数字输入';
  $('palette').hidden=mode!=='color';
  $('penTools').hidden=mode!=='pen';
  $('keypad').hidden=mode==='pen';
  $('eraseButton').textContent=mode==='pen'?(penErase?'✎':'⌫'):'⌫';
  $('eraseButton').setAttribute('aria-label',mode==='pen'?(penErase?'切换绘线':'切换擦线'):'清除');
  $('eraseButton').setAttribute('aria-pressed',String(mode==='pen'&&penErase));
  document.querySelectorAll('[data-pen-color]').forEach(el=>{
    el.setAttribute('aria-pressed',String(el.dataset.penColor===penColor));
  });
  document.querySelectorAll('[data-pen-grid]').forEach(el=>{
    el.setAttribute('aria-pressed',String(el.dataset.penGrid===penGrid));
  });
  board.classList.toggle('pen-active',mode==='pen');
  board.setAttribute('aria-label',mode==='pen'?'棋盘：单指拖动画线，点击格子画圆圈，点击格线画叉号，双指平移缩放':'棋盘：单指滑选格子，双指平移缩放');
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
    btn.disabled=mode==='color'||mode==='pen';
    pad.appendChild(btn);
  }
  $('undoButton').disabled=undoStack.length===0;
  $('redoButton').disabled=redoStack.length===0;
  $('zoomLabel').textContent=Math.round(camera.scale*100)+'%';
  updateSelection();
}
function updateSelection() {
  if(mode==='pen'){
    $('selectionLabel').textContent=penErase?'擦线模式 · 单指擦除':'画线模式 · 单指描线';
    return;
  }
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
  const width=frame.clientWidth,height=frame.clientHeight;
  if(puzzle && activeSource && width>0 && height>0 &&
      frameSize.width>0 && frameSize.height>0 &&
      (width!==frameSize.width || height!==frameSize.height)){
    const before=captureView(camera,frameSize.width,frameSize.height,selectedCells,showGridLines);
    const adjusted=restoreView(before,width,height,puzzle.cells.length);
    if(adjusted) camera=adjusted.camera;
    $('zoomLabel').textContent=Math.round(camera.scale*100)+'%';
    scheduleViewSave();
  }
  if(width>0 && height>0)frameSize={width,height};
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
  scheduleViewSave();
}
function setZoom(newScale,anchorX=frame.clientWidth/2,anchorY=frame.clientHeight/2) {
  const next=Math.max(.065,Math.min(5,newScale));
  const ratio=next/camera.scale;
  camera.x=anchorX-(anchorX-camera.x)*ratio;
  camera.y=anchorY-(anchorY-camera.y)*ratio;
  camera.scale=next;
  $('zoomLabel').textContent=Math.round(next*100)+'%';
  requestDraw();
  scheduleViewSave();
}
function applyStoredView(view){
  if(!puzzle)return false;
  const restored=restoreView(view,frame.clientWidth,frame.clientHeight,puzzle.cells.length);
  if(!restored)return false;
  camera=restored.camera;
  if(restored.gridLines!==null){
    showGridLines=restored.gridLines;
    updateGridButton();
  }
  setSelection(restored.selectedCells);
  $('zoomLabel').textContent=Math.round(camera.scale*100)+'%';
  requestDraw();
  return true;
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
  // Circle-arrow rings and other authored overlays sit above the board's
  // decoration/constraints, but below the player's large and pencil digits.
  // Keeping this layer before the values prevents opaque overlay shapes from
  // obscuring givens, corner notes, or center notes.
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
  // Solver-drawn lines, circles and crosses belong beneath *all* cell ink.
  // Keep these marks visible through fog, without allowing them to obscure
  // original givens, player values or corner/center pencil marks.
  drawPenLines(ctx,penLines,CELL,clip);
  drawPenMarks(ctx,penMarks,CELL,clip);
  for(let r=r0;r<r1;r++)for(let c=c0;c<c1;c++){
    const idx=r*puzzle.cols+c;
    drawCellInk(idx,c*CELL,r*CELL,!isVisible(progress,idx));
  }
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
    displayBilingual($('completionText'),progress.completion||'已完成当前谜题。',
      localeZh[currentEntry?.id]?.msgcorrectOriginal);
    $('completionBack').hidden=!returnDestination(currentEntry,catalog,navigationStack);
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
  refreshConflicts();
}
async function edit(action,symbol='') {
  if(pending||!puzzle)return;
  const indices=selectedCells.filter(index=>puzzle.cells[index]?.given==null);
  if(!indices.length){toast(selectedCells.length?'提示数字不可修改':'请先选择格子');return;}
  pending=true;
  try {
    const before=indices.map(index=>JSON.stringify(progress.cells[index]));
    const change=indices.length===1
      ?await call('update_cell',{index:indices[0],mode:action,symbol})
      :await call('update_cells',{indices,mode:action,symbol});
    applyChange(change);
    if(indices.some((index,i)=>JSON.stringify(progress.cells[index])!==before[i])){
      undoStack.push({kind:'cell'});redoStack=[];
    }
    updateControls();scheduleSave();requestDraw();
    showCompletionIfNew();
  } catch(error){notify(error);}
  finally{pending=false;}
}
async function history(direction) {
  if(pending||!puzzle)return;
  const from=direction==='undo'?undoStack:redoStack;
  const to=direction==='undo'?redoStack:undoStack;
  const record=from.at(-1);
  if(!record)return;
  pending=true;
  try {
    if(record.kind==='pen'){
      penLines=direction==='undo'?record.before:record.after;
      penMarks=direction==='undo'?record.beforeMarks:record.afterMarks;
    }else{
      const change=await call(direction);
      applyChange(change);
      if(selectedCells.length<=1&&canSelectCell(puzzle,change.index))
        setSelection([change.index]);
    }
    from.pop();to.push(record);
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
  scheduleViewSave();
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
// A short motion is a tap, not a stroke. Do not create tiny accidental lines
// when a finger wobbles over a grid boundary while tapping an O or X.
function movePenGesture(g,p) {
  const threshold=Math.max(5,Math.min(12,CELL*camera.scale*.16));
  if(!g.dragged && pointerDistance(g.start,p)<threshold){
    g.last=p;
    return;
  }
  const from=g.dragged?g.last:g.start;
  g.dragged=true;
  let last=g.node;
  for(const next of tracePenNodes(from,p,camera,CELL,puzzle,g.grid)){
    if(last&&next)applyPenStep(g.stroke,last,next);
    last=next;
  }
  g.node=last;g.last=p;
  penLines=penStrokeLines(g.stroke);
  requestDraw();
}
function finishPenGesture(g,p,cancelled) {
  if(cancelled){
    penLines=g.stroke.before;
    penMarks=g.beforeMarks;
    requestDraw();
    return;
  }
  if(!g.samples.length || pointerDistance(g.samples.at(-1),p)>0)
    g.samples.push(p);
  movePenGesture(g,p);
  if(g.dragged){
    const diagonal=straightDiagonalPenNodes(
      g.start,p,g.samples,camera,CELL,puzzle,g.grid);
    if(diagonal){
      // Replace a spurious right-angle detour with a true diagonal, including
      // gestures that only received down/up events from Android's WebView.
      const stroke=createPenStroke(g.stroke.before,g.stroke.color,g.erasing);
      for(let i=1;i<diagonal.length;i++)
        applyPenStep(stroke,diagonal[i-1],diagonal[i]);
      g.stroke=stroke;
    }
    penLines=penStrokeLines(g.stroke);
  }else{
    const at=penMarkAt(p,camera,CELL,puzzle);
    penMarks=tapPenMark(g.beforeMarks,at,g.stroke.color,g.erasing);
  }
  if(JSON.stringify(penLines)!==JSON.stringify(g.stroke.before) ||
     penMarks!==g.beforeMarks){
    undoStack.push({kind:'pen',before:g.stroke.before,after:penLines,
      beforeMarks:g.beforeMarks,afterMarks:penMarks});
    redoStack=[];
    updateControls();scheduleSave();
  }
  requestDraw();
}
board.addEventListener('contextmenu',event=>event.preventDefault());
board.addEventListener('pointerdown',event=>{
  if(!puzzle)return;
  event.preventDefault();board.setPointerCapture(event.pointerId);
  const p=locationInFrame(event);pointers.set(event.pointerId,p);
  if(pointers.size===1){
    const panMouse=event.pointerType==='mouse' &&
      (event.button===1||event.button===2||event.shiftKey||event.altKey);
    if(!panMouse&&mode==='pen'){
      gesture={kind:'pen',start:p,last:p,samples:[p],dragged:false,
        node:penNodeAt(p,camera,CELL,puzzle,penGrid),grid:penGrid,
        beforeMarks:penMarks,erasing:penErase,
        stroke:createPenStroke(penLines,penColor,penErase)};
    }else{
      const oldSelection=[...selectedCells];
      gesture={kind:panMouse?'mouse-pan':'select',last:p,moved:false,oldSelection};
      if(!panMouse)select(gridIndex(p.x,p.y));
    }
  }else if(pointers.size===2){
    if(gesture?.kind==='pen'){
      penLines=gesture.stroke.before;
      penMarks=gesture.beforeMarks;
      requestDraw();
    }
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
    camera.x+=center.x-gesture.lastCenter.x;
    camera.y+=center.y-gesture.lastCenter.y;
    if(gesture.lastDistance>0&&distance>0)
      setZoom(camera.scale*distance/gesture.lastDistance,center.x,center.y);
    else requestDraw();
    gesture.lastCenter=center;gesture.lastDistance=distance;
    scheduleViewSave();
  }else if(pointers.size===1&&gesture.kind==='mouse-pan'){
    camera.x+=p.x-previous.x;camera.y+=p.y-previous.y;
    gesture.last=p;requestDraw();scheduleViewSave();
  }else if(pointers.size===1&&gesture.kind==='select'){
    if(pointerDistance(p,gesture.last)>0.5)gesture.moved=true;
    extendSelection(dragCellIndices(previous,p,camera,puzzle));
    gesture.last=p;
  }else if(pointers.size===1&&gesture.kind==='pen'){
    if(gesture.samples.length<4000)gesture.samples.push(p);
    movePenGesture(gesture,p);
  }
});
function endPointer(event){
  if(!pointers.has(event.pointerId))return;
  if(pointers.size===1&&gesture?.kind==='pen')
    finishPenGesture(gesture,locationInFrame(event),event.type==='pointercancel');
  pointers.delete(event.pointerId);
  if(pointers.size===1)gesture={kind:'ignore'};
  else if(pointers.size===0)gesture=null;
  scheduleViewSave();
}
board.addEventListener('pointerup',endPointer);
board.addEventListener('pointercancel',endPointer);
board.addEventListener('wheel',event=>{
  event.preventDefault();
  const p=locationInFrame(event);setZoom(camera.scale*Math.exp(-event.deltaY*.0015),p.x,p.y);
},{passive:false});

$('homeButton').addEventListener('click',showHome);
$('continueButton').addEventListener('click',async()=>{
  if(puzzle){showGame();return;}
  const record=resumeRecord;
  if(!record)return;
  $('continueButton').disabled=true;
  try{
    if(record.source.type==='bundled'){
      if(!catalog.some(entry=>entry.id===record.source.id))throw Error('内置谜题已不存在');
      await openBundled(record.source.id,false,{view:record.view});
    }else{
      const input=await readResumePuzzle(record.source.key);
      if(!input)throw Error('本机已缓存的谜题资源不存在');
      if(record.source.type==='online')
        await openIndexedPuzzle(record.source.entry,input,true,record.view,true);
      else await openInput(input,record.view,true);
    }
    navigationStack=record.stack.filter(item=>catalog.some(entry=>entry.id===item.id));
    resumeRecord=null;
    updateBack();save();updateHomeCard();
  }catch(error){
    showHome();
    notify('恢复上次谜题失败：'+String(error?.message||error));
    resumeRecord=null;
    try{localStorage.removeItem(RESUME_KEY);}catch{}
    updateHomeCard();
  }finally{$('continueButton').disabled=false;}
});
$('fitButton').addEventListener('click',()=>{fit();save();});
$('gridButton').addEventListener('click',()=>{
  showGridLines=!showGridLines;
  updateGridButton();
  requestDraw();
  save();
});
$('zoomIn').addEventListener('click',()=>{setZoom(camera.scale*1.25);save();});
$('zoomOut').addEventListener('click',()=>{setZoom(camera.scale/1.25);save();});
$('alphabetButton').addEventListener('click',()=>{alphabet=!alphabet;letterPage=0;updateControls();});
$('letterPage').addEventListener('click',()=>{letterPage=(letterPage+1)%3;updateControls();});
$('modeBar').addEventListener('click',event=>{
  const button=event.target.closest('button[data-mode]');
  if(button){mode=button.dataset.mode;updateControls();}
});
$('penTools').addEventListener('click',event=>{
  const swatch=event.target.closest('button[data-pen-color]');
  const grid=event.target.closest('button[data-pen-grid]');
  if(swatch){penColor=swatch.dataset.penColor;penErase=false;updateControls();}
  if(grid){penGrid=grid.dataset.penGrid;updateControls();}
});
$('keypad').addEventListener('click',event=>{
  const button=event.target.closest('button[data-symbol]');
  if(button&&!button.disabled)edit(mode,button.dataset.symbol);
});
$('palette').addEventListener('click',event=>{
  const button=event.target.closest('button[data-color]');
  if(button)edit('color',button.dataset.color);
});
$('eraseButton').addEventListener('click',()=>{
  if(mode==='pen'){penErase=!penErase;updateControls();}
  else edit('erase');
});
$('undoButton').addEventListener('click',()=>history('undo'));
$('redoButton').addEventListener('click',()=>history('redo'));
$('checkButton').addEventListener('click',async()=>{
  if(pending||!puzzle||!progress)return;
  pending=true;
  try{
    const result=await call('check_progress');
    let message;
    if(!result.hasSolution || (result.checked===0 && result.unverifiable>0))
      message='当前谜题缺少可用的答案数据，无法核对已填写的大数字。请参考普通冲突提示。';
    else if(result.checked===0)
      message='还没有可以核对的已填大数字。请先填写数字再检查。';
    else if(result.mistakes>0)
      message='检查结果：当前已填写的大数字存在错误。请重新检查盘面。';
    else if(result.unverifiable>0)
      message='检查结果：能够核对的已填数字均正确，但部分数字没有对应答案，尚不能完全确认。';
    else
      message='检查结果：当前已填写的大数字均正确。注意这不代表整道谜题已经完成。';
    $('checkResult').textContent=message;
    if(!$('checkDialog').open)$('checkDialog').showModal();
  }catch(error){notify('检查失败: '+String(error));}
  finally{pending=false;}
});
$('closeCheck').addEventListener('click',()=>$('checkDialog').close());
$('dismissCheck').addEventListener('click',()=>$('checkDialog').close());
function showRules(){if(!$('rulesDialog').open)$('rulesDialog').showModal();}
$('rulesButton').addEventListener('click',showRules);
$('nextSector').addEventListener('click',()=>{
  if(!matchingSectors.length)return;
  sectorCursor=(sectorCursor+1)%matchingSectors.length;updateSector();
});
setupOnlineLibrary({openPuzzle:openIndexedPuzzle,notify});
$('libraryButton').addEventListener('click',()=>{
  renderLibrary();$('libraryDialog').showModal();
});
$('closeLibrary').addEventListener('click',()=>$('libraryDialog').close());
$('showAllPuzzles').addEventListener('change',renderLibrary);
$('backButton').addEventListener('click',()=>goBack().catch(notify));
$('linkedPuzzleButton').addEventListener('click',()=>{
  if(!activeLinkedPuzzles.length || pending)return;
  if(activeLinkedPuzzles.length===1)
    openBundled(activeLinkedPuzzles[0].id,true).catch(notify);
  else showRules();
});
$('closeCompletion').addEventListener('click',()=>$('completionDialog').close());
$('completionBack').addEventListener('click',()=>{
  $('completionDialog').close();
  if(returnDestination(currentEntry,catalog,navigationStack))goBack().catch(notify);
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
    if (parsePenpaUrl(input)) {
      // Penpa+ conversion happens entirely in-app; no request to the source site.
      const entry = directPenpaEntry(input);
      const scl = await fetchOnlinePuzzle(entry);
      await openIndexedPuzzle(entry,scl,false);
      if ($('importDialog').open) $('importDialog').close();
      $('pasteInput').value='';
      $('filePicker').value='';
      toast('Penpa+ 已转换为可玩的 SudokuPad 棋盘；非数独画线/涂色玩法可能受限');
    } else {
      await openInput(input);
    }
  }catch(error){$('importError').textContent=String(error);}
});
// Cross-app checkpoints are verified against puzzle dimensions and all givens
// before calling Rust's validated restore_progress. No remote upload is involved.
$('checkpointButton').addEventListener('click',()=>{
  $('checkpointError').textContent='';
  $('checkpointDialog').showModal();
});
$('closeCheckpoint').addEventListener('click',()=>$('checkpointDialog').close());
$('exportCheckpoint').addEventListener('click',()=>{
  try{
    if(!puzzle||!progress)throw Error('请先打开一道谜题');
    save();
    const data=createCheckpoint(puzzle,currentEntry,progress,penLines,penMarks);
    const contents=JSON.stringify(data);
    $('checkpointText').value=contents;
    $('checkpointFile').value='';
    const filename='sudokupadx-'+(currentEntry?.id||'puzzle')+'-'+new Date().toISOString().slice(0,10)+'.json';
    const url=URL.createObjectURL(new Blob([contents],{type:'application/json'}));
    const link=document.createElement('a');
    link.href=url;link.download=filename;
    document.body.append(link);link.click();link.remove();
    // Android WebViews may not expose a download handler; the JSON remains
    // available for copying and for transfer through a messaging app.
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    $('checkpointError').textContent='已生成存档。若设备未下载文件，请使用“复制 JSON”。';
  }catch(error){$('checkpointError').textContent=String(error.message||error);}
});
$('copyCheckpoint').addEventListener('click',async()=>{
  try{
    if(!$('checkpointText').value.trim()&&puzzle)
      $('checkpointText').value=JSON.stringify(createCheckpoint(puzzle,currentEntry,progress,penLines,penMarks));
    const text=$('checkpointText').value.trim();
    if(!text)throw Error('没有可复制的存档');
    if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
    else {
      $('checkpointText').select();
      if(!document.execCommand('copy'))throw Error('无法自动复制，请手动选择文本');
    }
    $('checkpointError').textContent='存档已复制到剪贴板';
  }catch(error){$('checkpointError').textContent=String(error.message||error);}
});
$('importCheckpoint').addEventListener('click',async()=>{
  if(pending)return;
  const errorLabel=$('checkpointError');
  errorLabel.textContent='';
  try{
    const file=$('checkpointFile').files?.[0];
    if(file && file.size>8*1024*1024)throw Error('存档文件超过 8 MiB');
    const raw=file?await file.text():$('checkpointText').value.trim();
    const cp=inspectCheckpoint(raw);
    const target=matchingCatalogEntry(cp,catalog);
    const sameSource=puzzleSlug(currentEntry?.url)&&
      puzzleSlug(currentEntry?.url)===puzzleSlug(cp.sourceUrl);
    const sameKey=cp.key&&cp.key===puzzle?.key;
    if(!target&&!sameSource&&!sameKey)
      throw Error('找不到对应的内置谜题。请先手动打开同一谜题再导入。');
    if(!window.confirm('导入“'+(cp.title||cp.puzzleId||'存档')+
        '”会替换目标谜题当前进度。继续？'))return;
    if(target&&currentEntry?.id!==target.id)
      await openBundled(target.id,false);
    const cells=verifyCheckpoint(cp,puzzle,currentEntry);
    // Save any previous progress before importing. Rust rejects malformed
    // cells and given-cell edits without mutating the current session.
    save();
    progress=await call('restore_progress',{cells});
    penLines=cp.penLines;
    penMarks=cp.penMarks;
    undoStack=[];redoStack=[];
    refreshConflicts();
    save();lastCompletion=Boolean(progress.solved);
    selected=-1;selectedCells=[];updateControls();requestDraw();
    $('checkpointDialog').close();
    showGame();
    updateHomeCard();
    toast('存档导入成功 · '+cells.filter(c=>c.value||c.corner.length||c.center.length||c.color).length+' 格已恢复');
  }catch(error){errorLabel.textContent=String(error.message||error);}
});
document.addEventListener('keydown',event=>{
  if($('gameScreen').hidden)return;
  const active=document.activeElement;
  if(active?.matches('input,textarea')||$('importDialog').open||$('rulesDialog').open||
      $('libraryDialog').open||$('completionDialog').open||$('checkDialog').open)return;
  if(event.key==='Escape'&&navigationStack.length){
    event.preventDefault();goBack().catch(notify);return;
  }
  if((event.ctrlKey||event.metaKey)&&(event.key.toLowerCase()==='z'||event.key.toLowerCase()==='y')){
    event.preventDefault();history(event.shiftKey||event.key.toLowerCase()==='y'?'redo':'undo');return;
  }
  if(event.key==='Backspace'||event.key==='Delete'){
    event.preventDefault();
    if(mode==='pen'){penErase=!penErase;updateControls();}
    else edit('erase');
    return;
  }
  const k=event.key.toUpperCase();
  if(k.length===1&&validSymbol(k)){
    event.preventDefault();
    if(mode!=='color'&&mode!=='pen')edit(mode,k);
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
// Only the HTTPS web build uses a service worker. Android already bundles
// these assets through Tauri, so no service worker is needed there.
if(!native && import.meta.env.PROD && location.protocol==='https:' &&
   'serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register(import.meta.env.BASE_URL+'offline-sw.js')
      .catch(error=>console.warn('Offline web cache unavailable:',error));
  });
}
// Home is the default launch. Lazy resume restores the saved camera only after
// Game becomes visible and the Canvas viewport has its correct dimensions.
(async()=>{
  try{
    await loadCatalog();
    const requested=new URLSearchParams(location.search).get('puzzle');
    const explicit=catalog.find(item=>item.id===requested);
    if(explicit){await openBundled(explicit.id);return;}
    try{resumeRecord=parseResume(localStorage.getItem(RESUME_KEY));}
    catch{resumeRecord=null;}
    updateHomeCard();
  }catch(error){
    notify('首页加载失败：'+String(error?.message||error));
  }
})();
