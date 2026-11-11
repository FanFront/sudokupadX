import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { installExternalLinkHandler } from './external-links.js';
import {invokeBrowser} from './web-runtime.js';
import {drawArrows,drawCages,drawPathMarks,drawFog,drawDecorations,drawPuzzleLines,drawSectorBorders,getSectors,isVisible,canSelectCell,dragCellIndices,focusInitialFog} from './adventure-ui.js';
import {createCheckpoint,inspectCheckpoint,verifyCheckpoint,matchingCatalogEntry,puzzleSlug} from './checkpoint.js';
import {buildConflictHouses,detectConflicts} from './conflicts.js';
import {buildCenterCandidateUpdates,buildRedNoteRemovalUpdates} from './quick-notes.js';
import {cellInk} from './cell-ink.js';
import {TAP_MOVE_TOLERANCE,cellLargeValue,isHighlightedNumber,advanceNumberHighlight} from './number-highlight.js';
import {PEN_COLORS,normalizePenLines,normalizePenMarks,penNodeAt,penMarkAt,tapPenMark,tracePenNodes,straightDiagonalPenNodes,createPenStroke,applyPenStep,penStrokeLines,drawPenLines,drawPenMarks} from './pen-lines.js';
import {linksAtCell,returnDestination} from './linked-navigation.js';
import {markBossCleared,lockedBossGate,bossGateAt,applyBossReveals} from './boss-gates.js';
import {editableCellIndices} from './fog-editing.js';
import {variantKeypadSymbols} from './variant-keypad.js';
import {setupOnlineLibrary} from './online-ui.js';
import {filterBundledEntries, bundledEntrySubtitle} from './bundled-library.js';
import {setupLessonPage} from './lesson-page.js';
import {setupCreatorUI} from './creator/ui.js';
import {computeBrowserHint,computeAdventureHint} from './hints/runner.js';
import {usesTypedHintEngine} from './hints/mode.js';
import {findPencilSubsetHint,preferPencilSubset} from './hints/pencil-subsets.js';
import {adventureHintCoverage} from './hints/coverage.js';
import {describeHint} from './hints/format.js';
import {listCreated,readCreated,createdCatalogEntries} from './creator/storage.js';
import {createLessonPractice,checkLessonMove} from './lesson-puzzles.js';
import {readResumePuzzle,saveResumePuzzle,deleteResumePuzzle,fetchOnlinePuzzle} from './online-library.js';
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
let highlightedNumber = null;
let lastBoardTap = null;
let currentHint = null;
let hintTask = null;
let hintSerial = 0;
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
let activeRawInput = null;
let lessonPractice = null;
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
function clearHint(){
  hintSerial++;
  if(hintTask){hintTask.cancel?.();hintTask=null;}
  currentHint=null;
  $('hintPanel').hidden=true;
  requestDraw();
}
function focusHintTarget(index){
  if(index<0||!puzzle||!frame.clientWidth||!frame.clientHeight)return;
  const x=(index%puzzle.cols+.5)*CELL*camera.scale+camera.x;
  const y=(Math.floor(index/puzzle.cols)+.5)*CELL*camera.scale+camera.y;
  const margin=Math.min(75,frame.clientWidth*.2,frame.clientHeight*.2);
  if(x>=margin&&x<=frame.clientWidth-margin&&
     y>=margin&&y<=frame.clientHeight-margin)return;
  camera.x=frame.clientWidth/2-(index%puzzle.cols+.5)*CELL*camera.scale;
  camera.y=frame.clientHeight/2-(Math.floor(index/puzzle.cols)+.5)*CELL*camera.scale;
  scheduleViewSave();
}
async function requestHint(){
  if(!puzzle||!progress||pending||lessonPractice)return;
  const serial=++hintSerial;
  if(hintTask){hintTask.cancel?.();hintTask=null;}
  currentHint=null;
  $('hintPanel').hidden=false;
  $('hintTitle').textContent='正在计算逻辑步骤…';
  $('hintDescription').textContent='正在基于当前大数字与题面规则验证下一步，并跳过中心候选数中已经完成的排除。';
  $('hintCandidates').textContent='';
  requestDraw();
  const tier=Number($('hintTier').value);
  const focus=selected;
  const visible=[...progress.visible];
  const cells=progress.cells.map(cloneCell);
  const typed=usesTypedHintEngine(puzzle);
  $('hintSupportNote').textContent=typed
    ?'绿色：依据格；橙色：目标格。旧版冒险与首领题采用题目明确声明的约束类型，不会根据颜色猜测规则；迷雾下的数字不参与推理。此路径不使用等级 5 穷举。'
    :'绿色：依据格；橙色：目标格。中心/角标手记只用来跳过重复排除，不作为已证明的事实。提示不改盘面。';
  const coverage=adventureHintCoverage(currentEntry?.id);
  if(coverage?.status==='partial'){
    const missing=coverage.unmodelled;
    $('hintSupportNote').textContent+=' 本题尚未完整支持：'+
      missing.slice(0,3).join('、')+
      (missing.length>3?' 等':'')+
      '。本次只显示能够从已核验规则独立证明的步骤。';
  }
  try{
    // Legacy standalone 9×9 linked/Boss SCLs lack local-generator solverRules.
    // Route them to independently verified typed constraints on both platforms.
    const task=typed
      ?computeAdventureHint(puzzle,{cells,visible},tier,focus)
      :native?{promise:call('hint_step',{tier})}
        :computeBrowserHint(activeRawInput,cells,tier);
    hintTask=task;
    const baseResult=await task.promise;
    if(serial!==hintSerial)return;
    hintTask=null;
    // Center-note 34/35/45 triples work on Rust and adventure paths.
    // Unverified pencil lists remain conditional, not solver axioms.
    const pencil=findPencilSubsetHint(puzzle,{cells,visible},tier,focus);
    const result=preferPencilSubset(baseResult,pencil,focus,cells);
    const data=describeHint(result,puzzle.cols,cells);
    $('hintSupportNote').textContent+=' 建议等级：A 确定数字 ＞ B 批量排除 ＞ C 单一排除；技巧等级是使用的推理复杂度，与建议等级不同。';
    if(result?.step?.assumptionBased)
      $('hintSupportNote').textContent+=' 本次为条件式中心手记推理，'+
        '请先核实紫色格候选数已列全；它不是已验证的必然排除。';
    currentHint=result.status==='step'?data:null;
    if(typed&&currentHint)focusHintTarget(data.target);
    $('hintTitle').textContent=data.title;
    $('hintDescription').textContent=data.description;
    $('hintCandidates').textContent=data.candidates;
    requestDraw();
  }catch(error){
    if(serial!==hintSerial)return;
    hintTask=null;
    $('hintTitle').textContent='无法安全提示';
    $('hintDescription').textContent=String(error?.message||error);
    $('hintCandidates').textContent='';
    requestDraw();
  }
}

function refreshConflicts() {
  // Tutorial candidates deliberately include the one to eliminate.
  // Treat them as a staged logical state rather than flashing red hints.
  conflicts=lessonPractice
    ?{valueCells:new Set(),noteSymbols:[]}
    :detectConflicts(puzzle,progress,conflictHouses);
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
    :source?.type==='online'?source.entry:
      source?.type==='imported'?catalog.find(e=>e.id===source.key):null;
  $('homePuzzleTitle').textContent=puzzle?.title || previous?.title || '最近导入的谜题';
  $('homePuzzleMeta').textContent=puzzle
    ?puzzle.rows+' × '+puzzle.cols
    :'恢复棋盘与解题进度';
}
function showGame() {
  $('lessonScreen').hidden=true;
  $('homeScreen').hidden=true;
  $('gameScreen').hidden=false;
  // Canvas is zero-sized on Home; measure it after Game becomes visible.
  resizeCanvas();
}
function showHome() {
  if(puzzle && !$('gameScreen').hidden)save();
  $('gameScreen').hidden=true;
  $('lessonScreen').hidden=true;
  $('homeScreen').hidden=false;
  updateHomeCard();
}
function save() {
  // Practice exercises never overwrite the last played puzzle, session
  // resume pointer, checkpoints, or normal puzzle save namespace.
  if (lessonPractice || !puzzle || !progress) return;
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
  const entries=filterBundledEntries(catalog, {
    category:$('bundledCategory').value,
    query:$('bundledSearch').value,
    showLinked:$('showAllPuzzles').checked
  });
  $('bundledResultCount').textContent=entries.length
    ?entries.length+' 道谜题'
    :'没有符合条件的谜题';
  for(const entry of entries){
    const btn=document.createElement('button');btn.type='button';btn.className='library-entry';
    const title=document.createElement('strong');title.textContent=entry.title;
    const sub=document.createElement('small');sub.textContent=bundledEntrySubtitle(entry);
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
  // Generated adventures are produced by scripts/generate_adventure.py
  // during dev/build/test. Keep the original bundled catalog immutable.
  let generated={items:[]};
  try {
    const response=await fetch('puzzles/generated/catalog-entries.json');
    if(response.ok)generated=await response.json();
  } catch {}
  let variants={items:[]};
  try {
    const response=await fetch('puzzles/variants/catalog-entries.json');
    if(response.ok)variants=await response.json();
  } catch {}
  let batch9={items:[]};
  try {
    const response=await fetch('puzzles/batch9/catalog-entries.json');
    if(response.ok)batch9=await response.json();
  } catch {}
  let singleRules={items:[]};
  try {
    const response=await fetch('puzzles/single-rule/catalog-entries.json');
    if(response.ok)singleRules=await response.json();
  } catch {}
  let advanced={items:[]};
  try {
    const response=await fetch('puzzles/advanced/catalog-entries.json');
    if(response.ok)advanced=await response.json();
  } catch {}
  catalog=[...(items.items||[]),...(generated.items||[]),...(variants.items||[]),...(batch9.items||[]),...(singleRules.items||[]),...(advanced.items||[])];
  localeZh=translations;
  try{await syncCreatedCatalog(await listCreated());}
  catch(error){console.warn('Personal Sudoku database unavailable:',error);renderLibrary();}
}
async function openBundled(id,push=false,backState=null){
  if(pending)return;
  const entry=catalog.find(e=>e.id===id);
  if(!entry)throw Error('未找到已打包谜题: '+id);
  if(entry.group==='personal-created'){
    const record=await readCreated(id);
    if(!record)throw Error('本机保存的生成题已被删除');
    await openInput(JSON.stringify(record.puzzle),backState?.view);
    if($('libraryDialog').open)$('libraryDialog').close();
    return;
  }
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
    activeRawInput=input;
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
  clearHint();
  puzzle=result.puzzle;
  progress=result.progress;
  undoStack=[];redoStack=[];penLines=[];penMarks=[];
  selected=-1;selectedCells=[];
  highlightedNumber=null;lastBoardTap=null;
  gesture=null;pointers.clear();
  buildRegions();
  updateInfo();
  await restoreSaved();
  // A restored completed boss must still award its permanent gate code.
  markBossCleared(puzzle,progress,localStorage);
  applyBossReveals(puzzle,progress,localStorage);
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
    activeRawInput=input;
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
    activeRawInput=input;
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
  $('padTitle').textContent=mode==='pen'?'画线工具':mode==='color'?'颜色标记':
    alphabet?'字母输入 · '+(['A–I','J–R','S–Z'][letterPage]):'数字输入';
  $('palette').hidden=mode!=='color';
  $('penTools').hidden=mode!=='pen';
  $('keypad').hidden=mode==='pen'||mode==='color';
  $('eraseButton').textContent=mode==='pen'?(penErase?'✎':'⌫'):'⌫';
  $('eraseButton').setAttribute('aria-label',mode==='pen'?(penErase?'切换绘线':'切换擦线'):'清除');
  $('eraseButton').title=$('eraseButton').getAttribute('aria-label');
  $('eraseButton').setAttribute('aria-pressed',String(mode==='pen'&&penErase));
  document.querySelectorAll('[data-pen-color]').forEach(el=>{
    el.setAttribute('aria-pressed',String(el.dataset.penColor===penColor));
  });
  document.querySelectorAll('[data-pen-grid]').forEach(el=>{
    el.setAttribute('aria-pressed',String(el.dataset.penGrid===penGrid));
  });
  board.classList.toggle('pen-active',mode==='pen');
  board.setAttribute('aria-label',mode==='pen'?'棋盘：单指拖动画线，点击格子画圆圈，点击格线画叉号，双指平移缩放':'棋盘：单指滑选格子，双击数字高亮相同数字，再双击取消，双指平移缩放');
  document.querySelectorAll('[data-mode]').forEach(el=>{
    el.classList.toggle('active',el.dataset.mode===mode);
    el.setAttribute('aria-pressed',String(el.dataset.mode===mode));
  });
  const keys=variantKeypadSymbols(puzzle,currentEntry,alphabet,letterPage);
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
  $('hintButton').disabled=Boolean(lessonPractice);
  $('autoCenterButton').disabled=Boolean(lessonPractice);
  $('clearRedNotesButton').disabled=Boolean(lessonPractice) ||
    !conflicts.noteSymbols?.some(marks=>marks?.size);
  const typed=usesTypedHintEngine(puzzle);
  const small=puzzle.rows<=9&&puzzle.cols<=9&&puzzle.rows!==9;
  for(const option of $('hintTier').options){
    option.disabled=(typed&&Number(option.value)===5)||
      (small&&Number(option.value)>2);
  }
  if(small&&Number($('hintTier').value)>2)$('hintTier').value='2';
  if(typed&&Number($('hintTier').value)===5)$('hintTier').value='4';
  $('zoomLabel').textContent=Math.round(camera.scale*100)+'%';
  updateSelection();
}
function updateSelection() {
  const highlightLabel=highlightedNumber===null?'':' · 高亮 '+highlightedNumber;
  if(mode==='pen'){
    $('selectionLabel').textContent=(penErase?'擦线模式 · 单指擦除':'画线模式 · 单指描线')+highlightLabel;
    return;
  }
  if (!puzzle||selected<0) {
    $('selectionLabel').textContent='选择一个格子'+highlightLabel;
    if(puzzle)updateSector();
    return;
  }
  const row=Math.floor(selected/puzzle.cols)+1,col=selected%puzzle.cols+1;
  const fogged=!isVisible(progress,selected);
  $('selectionLabel').textContent='R'+row+'C'+col+
    (selectedCells.length>1?' · 已选 '+selectedCells.length+' 格':
      fogged?' · 迷雾':puzzle.cells[selected].given!==null?' · 提示':'')+highlightLabel;
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
  // Keep the viewport's off-board margins: authored arrows and sum clues
  // can sit just outside the first row or column. Cell iteration is clamped
  // separately below, but artwork must not be culled at row/column zero.
  const clip={
    left:-camera.x/camera.scale,top:-camera.y/camera.scale,
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
    if(lessonPractice?.focus.includes(idx)){
      ctx.fillStyle='#90d5e754';
      ctx.fillRect(x+2,y+2,CELL-4,CELL-4);
    }
    if(lessonPractice?.goal.index===idx){
      ctx.fillStyle='#ffca7366';
      ctx.fillRect(x+1,y+1,CELL-2,CELL-2);
    }
    if(currentHint?.sources.includes(idx)){
      ctx.fillStyle=currentHint.assumptionBased?'#ad85da66':'#4bcc9c55';
       ctx.fillRect(x+2,y+2,CELL-4,CELL-4);
    }
    if(currentHint?.affectedCells?.includes(idx)&&currentHint.target!==idx){
      ctx.fillStyle='#ffad5b66';
      ctx.fillRect(x+2,y+2,CELL-4,CELL-4);
    }
    if(currentHint?.target===idx){
      ctx.fillStyle=currentHint.assumptionBased?'#cba3ee88':'#ffad5b88';
       ctx.fillRect(x+2,y+2,CELL-4,CELL-4);
    }
    if(selectedCells.includes(idx)){ctx.fillStyle='#a0d5eb6d';ctx.fillRect(x,y,CELL,CELL);}
    // Highlight matching visible givens/entries beneath authored constraints.
    if(highlightedNumber!==null && isVisible(progress,idx) &&
       isHighlightedNumber(puzzle,progress,idx,highlightedNumber)){
      ctx.fillStyle='#ffc95e9c';ctx.fillRect(x+2,y+2,CELL-4,CELL-4);
    }
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
  // Fogged player entries can be highlighted, but fogged original givens
  // must not be revealed: isHighlightedNumber uses cellInk's fog filtering.
  if(highlightedNumber!==null){
    for(let r=r0;r<r1;r++)for(let c=c0;c<c1;c++){
      const idx=r*puzzle.cols+c;
      if(!isVisible(progress,idx) &&
         isHighlightedNumber(puzzle,progress,idx,highlightedNumber)){
        ctx.fillStyle='#ffc95e9c';
        ctx.fillRect(c*CELL+2,r*CELL+2,CELL-4,CELL-4);
      }
    }
  }
  // Solver-drawn lines, circles and crosses belong beneath *all* cell ink.
  // Keep these marks visible through fog, without allowing them to obscure
  // original givens, player values or corner/center pencil marks.
  drawPenLines(ctx,penLines,CELL,clip);
  drawPenMarks(ctx,penMarks,CELL,clip);
  for(let r=r0;r<r1;r++)for(let c=c0;c<c1;c++){
    const idx=r*puzzle.cols+c;
    drawCellInk(idx,c*CELL,r*CELL,!isVisible(progress,idx));
  }
  if(currentHint && currentHint.target>=0){
    ctx.save();
    for(const source of currentHint.sources){
      const x=(source%puzzle.cols)*CELL,y=Math.floor(source/puzzle.cols)*CELL;
      ctx.strokeStyle=currentHint.assumptionBased?'#8c6cb6':'#169a74';
       ctx.lineWidth=2.5;
       if(currentHint.assumptionBased)ctx.setLineDash([4,3]);
      ctx.strokeRect(x+2,y+2,CELL-4,CELL-4);
    }
    for(const other of currentHint.affectedCells||[]){
      if(other===currentHint.target||other<0||other>=puzzle.rows*puzzle.cols)
        continue;
      const x=(other%puzzle.cols)*CELL,y=Math.floor(other/puzzle.cols)*CELL;
      ctx.setLineDash([3,3]);ctx.strokeStyle='#ea8433';ctx.lineWidth=2;
      ctx.strokeRect(x+3,y+3,CELL-6,CELL-6);
    }
    const index=currentHint.target;
    const x=(index%puzzle.cols)*CELL,y=Math.floor(index/puzzle.cols)*CELL;
    ctx.setLineDash(currentHint.assumptionBased?[4,3]:[]);
     ctx.strokeStyle=currentHint.assumptionBased?'#945dc4':'#ea8433';
     ctx.lineWidth=3.5;
    ctx.strokeRect(x+2,y+2,CELL-4,CELL-4);
    const mark=currentHint.placement?'✓':
      '−'+currentHint.removed.join(',');
    ctx.font='bold 10px sans-serif';
    ctx.textAlign='right';ctx.textBaseline='bottom';
    const chipWidth=Math.min(CELL-6,ctx.measureText(mark).width+6);
    ctx.fillStyle='#fff6eb';ctx.fillRect(x+CELL-chipWidth-3,y+CELL-16,chipWidth,14);
    ctx.fillStyle='#c3422c';ctx.fillText(mark,x+CELL-5,y+CELL-4,CELL-8);
    ctx.restore();
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
  if(lessonPractice)return;
  const solved=Boolean(progress?.solved);
  if(solved&&!lastCompletion){
    markBossCleared(puzzle,progress,localStorage);
    displayBilingual($('completionText'),progress.completion||'已完成当前谜题。',
      localeZh[currentEntry?.id]?.msgcorrectOriginal);
    $('completionBack').hidden=!returnDestination(currentEntry,catalog,navigationStack);
    if(!$('completionDialog').open)$('completionDialog').showModal();
  }
  lastCompletion=solved;
}
function applyChange(change) {
  clearHint();
  const changed=Array.isArray(change.changes)?change.changes:[{index:change.index,cell:change.cell}];
  for(const entry of changed)progress.cells[entry.index]=entry.cell;
  progress.canUndo=change.canUndo;progress.canRedo=change.canRedo;
  if(Array.isArray(change.visible))progress.visible=change.visible;
  applyBossReveals(puzzle,progress,localStorage);
  progress.solved=Boolean(change.solved);
  progress.completion=change.completion??null;
  refreshConflicts();
}
async function edit(action,symbol='') {
  clearNumberHighlight();
  if(pending||!puzzle)return;
  // Boss reward digits still require completing the linked puzzle, but
  // ordinary pencil marks/colours/erasure are never locked by the boss or
  // fog. A concealed authored clue behaves like an empty editable cell.
  if(action==='value'&&selectedCells.some(index=>bossGateAt(puzzle,index) &&
      !isVisible(progress,index))){
    toast('该首领入口尚未探索');return;
  }
  if(action==='value'&&selectedCells.some(index=>lockedBossGate(puzzle,index,localStorage))){
    toast('请先完成关联首领谜题，取得通关数字');return;
  }
  const indices=editableCellIndices(puzzle,progress,selectedCells,action);
  if(!indices.length){
    if(!selectedCells.length)toast('请先选择格子');
    return;
  }
  pending=true;
  try {
    const before=indices.map(index=>JSON.stringify(progress.cells[index]));
    const practiceBefore=lessonPractice?progress.cells.map(cell=>({
      value:cell.value,center:[...(cell.center||[])]
    })):null;
    const change=indices.length===1
      ?await call('update_cell',{index:indices[0],mode:action,symbol})
      :await call('update_cells',{indices,mode:action,symbol});
    applyChange(change);
    if(indices.some((index,i)=>JSON.stringify(progress.cells[index])!==before[i])){
      undoStack.push({kind:'cell'});redoStack=[];
    }
    if(lessonPractice&&!lessonPractice.completed &&
       checkLessonMove(lessonPractice,practiceBefore,progress.cells,
                       action,symbol,indices)){
      lessonPractice.completed=true;
      $('lessonPracticeStatus').textContent='✓ 推理正确！'+lessonPractice.explanation;
      $('lessonPracticeStatus').classList.add('complete');
      lessonPage.markPracticed(lessonPractice.id);
    }
    updateControls();scheduleSave();requestDraw();
    showCompletionIfNew();
  } catch(error){notify(error);}
  finally{pending=false;}
}
// Quick pencil actions always work across the visible board. An existing
// center list represents the player's own deductions and is not overwritten.
async function quickNotes(kind) {
  clearNumberHighlight();
  if(pending||!puzzle||!progress||lessonPractice)return;
  const updates=kind==='fill'
    ?buildCenterCandidateUpdates(puzzle,progress,conflictHouses)
    :buildRedNoteRemovalUpdates(progress,conflicts);
  if(!updates.length){
    toast(kind==='fill'?'没有需要自动填写的空白中心候选数':'没有需要清理的红色候选数');
    return;
  }
  pending=true;
  try{
    const change=await call('update_notes',{updates});
    applyChange(change);
    if(change.changes?.length){
      undoStack.push({kind:'cell'});
      redoStack=[];
    }
    updateControls();scheduleSave();requestDraw();
    toast(kind==='fill'
      ?'已为 '+change.changes.length+' 格填写中心候选数（仅按已知不重复规则排除）'
      :'已从 '+change.changes.length+' 格清理红色候选数');
  }catch(error){notify(error);}
  finally{pending=false;}
}
async function history(direction) {
  clearNumberHighlight();
  clearHint();
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
// Number focus is a temporary clue-finding aid, not a persistent mark.
function clearNumberHighlight(resetTap=true) {
  if(resetTap)lastBoardTap=null;
  if(highlightedNumber===null)return;
  highlightedNumber=null;
  updateSelection();
  requestDraw();
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
// Other controls (keypad, toolbar, dialogs) dismiss number highlighting.
document.addEventListener('pointerdown',event=>{
  if(event.target!==board)clearNumberHighlight();
},true);
board.addEventListener('pointerdown',event=>{
  if(!puzzle)return;
  const highlightBeforeTap=highlightedNumber;
  // A tap, drag, or pinch dismisses the highlight immediately. Retain
  // the previous tap so the second click can still activate a new number.
  clearNumberHighlight(false);
  event.preventDefault();board.setPointerCapture(event.pointerId);
  const p=locationInFrame(event);pointers.set(event.pointerId,p);
  if(pointers.size===1){
    const panMouse=event.pointerType==='mouse' &&
      (event.button===1||event.button===2||event.shiftKey||event.altKey);
    if(panMouse||mode==='pen')lastBoardTap=null;
    if(!panMouse&&mode==='pen'){
      gesture={kind:'pen',start:p,last:p,samples:[p],dragged:false,
        node:penNodeAt(p,camera,CELL,puzzle,penGrid),grid:penGrid,
        beforeMarks:penMarks,erasing:penErase,
        stroke:createPenStroke(penLines,penColor,penErase)};
    }else{
      const oldSelection=[...selectedCells];
      const startIndex=gridIndex(p.x,p.y);
      gesture={kind:panMouse?'mouse-pan':'select',start:p,last:p,moved:false,
        tapMoved:false,startIndex,oldSelection,highlightBeforeTap};
      if(!panMouse)select(startIndex);
    }
  }else if(pointers.size===2){
    lastBoardTap=null;
    if(gesture?.kind==='pen'){
      penLines=gesture.stroke.before;
      penMarks=gesture.beforeMarks;
      requestDraw();
    }
    if(gesture?.kind==='select'&&!gesture.moved)setSelection(gesture.oldSelection);
    const [a,b]=[...pointers.values()];
    gesture={kind:'transform',lastCenter:pointerCenter(a,b),lastDistance:pointerDistance(a,b)};
  }else {lastBoardTap=null;gesture={kind:'ignore'};}
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
    if(pointerDistance(p,gesture.start)>TAP_MOVE_TOLERANCE)gesture.tapMoved=true;
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
  if(pointers.size===1&&gesture?.kind==='select'){
    const p=locationInFrame(event),index=gridIndex(p.x,p.y);
    if(event.type==='pointerup' && !gesture.tapMoved &&
       pointerDistance(p,gesture.start)<=TAP_MOVE_TOLERANCE &&
       index>=0 && index===gesture.startIndex &&
       selectedCells.length===1 && selected===index){
      const tap={index,x:p.x,y:p.y,time:event.timeStamp,
        pointerType:event.pointerType,value:cellLargeValue(puzzle,progress,index)};
      const result=advanceNumberHighlight(lastBoardTap,tap,gesture.highlightBeforeTap);
      lastBoardTap=result.previousTap;
      if(result.selectedNumber!==highlightedNumber){
        highlightedNumber=result.selectedNumber;
        updateSelection();requestDraw();
      }
    }else lastBoardTap=null;
  }else lastBoardTap=null;
  pointers.delete(event.pointerId);
  if(pointers.size===1)gesture={kind:'ignore'};
  else if(pointers.size===0)gesture=null;
  scheduleViewSave();
}
board.addEventListener('pointerup',endPointer);
board.addEventListener('pointercancel',endPointer);
board.addEventListener('wheel',event=>{
  clearNumberHighlight();
  event.preventDefault();
  const p=locationInFrame(event);setZoom(camera.scale*Math.exp(-event.deltaY*.0015),p.x,p.y);
},{passive:false});

// The native Rust/Tauri engine owns a single active game. Preserve the
// entire existing puzzle state before temporarily loading a lesson board;
// the lesson never touches the user's cached puzzle or resume pointer.
function snapshotForLesson(){
  if(!puzzle)return null;
  if(!activeRawInput)throw Error('当前谜题还没有可恢复的原始数据');
  return {
    input:activeRawInput,puzzle,source:activeSource,entry:currentEntry,
    cells:progress.cells.map(cloneCell),penLines:[...penLines],
    penMarks:[...penMarks],camera:{...camera},
    selectedCells:[...selectedCells],gridLines:showGridLines,
    stack:navigationStack.map(item=>({...item})),
    dictionary:mainDictionary,mode,alphabet,letterPage,
    resumeRecord,lastCompletion
  };
}
function practiceBanner(active){
  clearHint();
  $('lessonPracticeBar').hidden=!active;
  $('checkButton').disabled=Boolean(active);
  $('backButton').hidden=Boolean(active)||$('backButton').hidden;
  if(!active){
    $('lessonPracticeStatus').classList.remove('complete');
    return;
  }
  $('lessonPracticeName').textContent='第 '+active.id+' 课 · '+active.goalLabel;
  $('lessonPracticeStatus').textContent=active.task;
  $('lessonPracticeStatus').classList.remove('complete');
  $('lessonPracticeHint').textContent='查看思路';
}
async function beginLessonPractice(id){
  if(pending||lessonPractice)throw Error('当前正在载入另一道谜题');
  const practice=createLessonPractice(id);
  if(puzzle)save();
  const previous=snapshotForLesson();
  lessonPractice={...practice,previous,completed:false};
  activeSource=null;activeRawInput=practice.input;
  currentEntry=null;navigationStack=[];mainDictionary={};
  $('lessonScreen').hidden=true;
  showGame();
  pending=true;
  try{
    const result=await call('open_puzzle',{input:practice.input,localization:null});
    await openResult(result);
    progress=await call('restore_progress',{cells:practice.seed});
    conflictHouses=buildConflictHouses(puzzle);
    refreshConflicts();
    mode=practice.goal.kind==='fill'?'value':'center';
    alphabet=false;
    letterPage=0;
    lastCompletion=false;
    updateControls();
    setSelection([practice.goal.index]);
    practiceBanner(lessonPractice);
    updateBack();
    requestDraw();
  }catch(error){
    try{await restoreOriginalAfterLesson();}catch(restoreError){
      notify('原谜题恢复失败：'+String(restoreError));
    }
    $('lessonScreen').hidden=false;
    $('gameScreen').hidden=true;
    throw error;
  }finally{pending=false;}
}
async function restoreOriginalAfterLesson(){
  const former=lessonPractice?.previous??null;
  if(former){
    // Reopen the exact original raw puzzle in the same Rust/WASM engine,
    // then reinstate its saved cells and UI view. Undo/redo stacks
    // deliberately reset: the engine history belongs to the old session.
    await call('open_puzzle',{input:former.input,
      localization:former.entry?.id?localeZh[former.entry.id]||null:null});
    puzzle=former.puzzle;
    progress=await call('restore_progress',{cells:former.cells});
    currentEntry=former.entry;activeSource=former.source;
    activeRawInput=former.input;
    navigationStack=former.stack;
    mainDictionary=former.dictionary;
    penLines=former.penLines;penMarks=former.penMarks;
    camera={...former.camera};
    selectedCells=[...former.selectedCells];
    selected=selectedCells.at(-1)??-1;
    showGridLines=former.gridLines;
    mode=former.mode;alphabet=former.alphabet;letterPage=former.letterPage;
    resumeRecord=former.resumeRecord;lastCompletion=former.lastCompletion;
    undoStack=[];redoStack=[];
    buildRegions();
    updateInfo();
    conflictHouses=buildConflictHouses(puzzle);
  }else{
    puzzle=null;progress=null;
    currentEntry=null;activeSource=null;activeRawInput=null;
    navigationStack=[];mainDictionary={};
    penLines=[];penMarks=[];selected=-1;selectedCells=[];
    undoStack=[];redoStack=[];lastCompletion=false;
  }
  lessonPractice=null;
  practiceBanner(null);
  if(puzzle){
    refreshConflicts();
    updateBack();updateGridButton();updateControls();requestDraw();
    save();
  }
  updateHomeCard();
}
async function endLessonPractice(){
  if(!lessonPractice||pending)return;
  pending=true;
  try{
    await restoreOriginalAfterLesson();
    lessonPage.returnFromPractice();
  }finally{pending=false;}
}
async function resetLessonPractice(){
  if(!lessonPractice||pending)return;
  pending=true;
  try{
    progress=await call('restore_progress',{cells:lessonPractice.seed});
    undoStack=[];redoStack=[];
    lessonPractice.completed=false;
    practiceBanner(lessonPractice);
    refreshConflicts();updateControls();
    setSelection([lessonPractice.goal.index]);
    requestDraw();
  }finally{pending=false;}
}
// Lessons are a separate page; opening them never unloads the puzzle or
// resets the camera/progress. The rules shortcut saves before hiding play.
const lessonPage=setupLessonPage({
  showHome,showGame,
  launchPractice:lesson=>beginLessonPractice(lesson.id)
});
$('lessonButton').addEventListener('click',()=>lessonPage.open());
$('lessonPracticeReturn').addEventListener('click',()=>endLessonPractice().catch(notify));
$('lessonPracticeReset').addEventListener('click',()=>resetLessonPractice().catch(notify));
$('lessonPracticeHint').addEventListener('click',()=>{
  if(!lessonPractice)return;
  const shown=$('lessonPracticeHint').textContent==='收起思路';
  $('lessonPracticeHint').textContent=shown?'查看思路':'收起思路';
  $('lessonPracticeStatus').textContent=shown?lessonPractice.task:
    '思路：'+lessonPractice.explanation;
});
$('lessonFromRulesButton').addEventListener('click',()=>{
  if($('rulesDialog').open)$('rulesDialog').close();
  if(lessonPractice){endLessonPractice().catch(notify);return;}
  save();
  lessonPage.open();
});
$('homeButton').addEventListener('click',()=>{
  if(lessonPractice)endLessonPractice().catch(notify);
  else showHome();
});
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
  if(button){mode=button.dataset.mode;lastBoardTap=null;updateControls();}
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
$('autoCenterButton').addEventListener('click',()=>quickNotes('fill'));
$('clearRedNotesButton').addEventListener('click',()=>quickNotes('clear'));
$('undoButton').addEventListener('click',()=>history('undo'));
$('redoButton').addEventListener('click',()=>history('redo'));
$('hintButton').addEventListener('click',requestHint);
$('hintClose').addEventListener('click',clearHint);
$('hintTier').addEventListener('change',()=>{if(!$('hintPanel').hidden)requestHint();});
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
// Local-generated puzzle entries live in their own IndexedDB store,
 // but participate in the ordinary library filters without any network.
 async function syncCreatedCatalog(records){
   catalog=[...catalog.filter(entry=>entry.group!=='personal-created'),
     ...createdCatalogEntries(records)];
   renderLibrary();updateHomeCard();
 }
 async function openCreatedRecord(record){
   await openInput(JSON.stringify(record.puzzle));
   if($('libraryDialog').open)$('libraryDialog').close();
 }
 async function handleDeletedCreated(id){
   try{localStorage.removeItem('sudokupadx:v1:'+id);}catch{}
   try{
     const resume=parseResume(localStorage.getItem(RESUME_KEY));
     if(resume?.source?.key===id)localStorage.removeItem(RESUME_KEY);
   }catch{}
   await deleteResumePuzzle(id);
   if(puzzle?.key===id){
     // Deleting the active puzzle must not allow save()/pagehide to silently
     // recreate a removed checkpoint or the last-session pointer.
     puzzle=null;progress=null;currentEntry=null;activeSource=null;
     activeRawInput=null;resumeRecord=null;navigationStack=[];
     showHome();
   }
 }
 const personalCreator=setupCreatorUI({
   openPuzzle:openCreatedRecord,
   onCatalogChanged:syncCreatedCatalog,
   handleDelete:handleDeletedCreated,
   notify
 });
 $('libraryButton').addEventListener('click',()=>{
   renderLibrary();$('libraryDialog').showModal();
 });
$('closeLibrary').addEventListener('click',()=>$('libraryDialog').close());
$('showAllPuzzles').addEventListener('change',renderLibrary);
$('bundledCategory').addEventListener('change',renderLibrary);
$('bundledSearch').addEventListener('input',renderLibrary);
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
    clearHint();
    markBossCleared(puzzle,progress,localStorage);
    applyBossReveals(puzzle,progress,localStorage);
    penLines=cp.penLines;
    penMarks=cp.penMarks;
    undoStack=[];redoStack=[];
    refreshConflicts();
    save();lastCompletion=Boolean(progress.solved);
    selected=-1;selectedCells=[];
    highlightedNumber=null;lastBoardTap=null;
    updateControls();requestDraw();
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
  clearNumberHighlight();
  if(event.key==='Escape'&&!$('hintPanel').hidden){
    event.preventDefault();clearHint();return;
  }
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
