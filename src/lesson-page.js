import guideMarkdown from '../docs/techniques.zh-CN.md?raw';
import {STAGES, parseLessonGuide, filterLessons, EXERCISES} from './lesson-data.js';
import {hasVerifiedLessonPractice} from './lesson-puzzles.js';

const PROGRESS_KEY='sudokupadx:lessons:v1';
const LAST_KEY='sudokupadx:lesson-last:v1';

function element(tag, className='', text='') {
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text)node.textContent=text;
  return node;
}

// Render only a controlled subset of Markdown. Never assign guide Markdown
// to innerHTML: even if the local guide is later modified, tutorial content
// cannot inject active DOM, scripts, or arbitrary URL schemes.
function addInline(parent, value) {
  const text=String(value);
  const pattern=/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  let previous=0;
  for(const match of text.matchAll(pattern)){
    if(match.index>previous)parent.append(document.createTextNode(text.slice(previous,match.index)));
    const token=match[0];
    if(token.startsWith('**')){
      parent.append(element('strong','',token.slice(2,-2)));
    }else if(token.startsWith('`')){
      parent.append(element('code','',token.slice(1,-1)));
    }else{
      const parts=token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      if(parts){
        const link=element('a','',parts[1]);
        link.href=parts[2];link.target='_blank';link.rel='noopener noreferrer';
        parent.append(link);
      }else parent.append(document.createTextNode(token));
    }
    previous=match.index+token.length;
  }
  if(previous<text.length)parent.append(document.createTextNode(text.slice(previous)));
}
function markdownParagraph(container, text, className=''){
  const p=element('p',className);
  addInline(p,text);
  container.append(p);
}
export function renderLessonContent(markdown, root) {
  root.replaceChildren();
  const lines=markdown.replace(/\r\n?/g,'\n').split('\n');
  let i=0;
  while(i<lines.length){
    const raw=lines[i],line=raw.trim();
    if(!line){i++;continue;}
    if(line.startsWith('```')){
      const code=[];
      i++;
      while(i<lines.length&&!lines[i].trim().startsWith('```'))code.push(lines[i++]);
      const pre=element('pre','lesson-code');
      pre.append(element('code','',code.join('\n')));
      root.append(pre);
      i++;
      continue;
    }
    if(line.startsWith('|') && i+1<lines.length && /^\|?\s*:?[-]{3,}/.test(lines[i+1].trim())){
      const table=element('table','lesson-table');
      const parseRow=value=>value.trim().replace(/^\||\|$/g,'').split('|').map(s=>s.trim());
      const header=element('thead'),headRow=element('tr');
      for(const item of parseRow(line)){
        const th=element('th');addInline(th,item);headRow.append(th);
      }
      header.append(headRow);table.append(header);
      const body=element('tbody');i+=2;
      while(i<lines.length&&lines[i].trim().startsWith('|')){
        const row=element('tr');
        for(const item of parseRow(lines[i])){
          const cell=element('td');addInline(cell,item);row.append(cell);
        }
        body.append(row);i++;
      }
      table.append(body);
      const scroller=element('div','lesson-table-scroll');scroller.append(table);root.append(scroller);
      continue;
    }
    if(/^---+$/.test(line)){root.append(element('hr'));i++;continue;}
    if(/^#{1,5} /.test(line)){
      const level=Math.min(4,Math.max(3,line.match(/^#+/)[0].length));
      const heading=element('h'+level);addInline(heading,line.replace(/^#+\s+/,''));root.append(heading);i++;
      continue;
    }
    if(/^>/.test(line)){
      const quote=[];
      while(i<lines.length&&/^>/.test(lines[i].trim()))quote.push(lines[i++].trim().replace(/^>\s?/,''));
      markdownParagraph(root,quote.join(' '),'lesson-quote');
      continue;
    }
    const listStart=line.match(/^(?:[-*]\s+|\d+\.\s+)/);
    if(listStart){
      const ordered=/^\d+\./.test(line), list=element(ordered?'ol':'ul','lesson-bullets');
      while(i<lines.length){
        const value=lines[i].trim();
        if(!/^(?:[-*]\s+|\d+\.\s+)/.test(value))break;
        const li=element('li');addInline(li,value.replace(/^(?:[-*]|\d+\.)\s+/,''));list.append(li);i++;
      }
      root.append(list);
      continue;
    }
    const paragraph=[line];i++;
    while(i<lines.length){
      const value=lines[i].trim();
      if(!value||/^([#>|]|[-*]\s|\d+\.\s|```|---+$)/.test(value))break;
      paragraph.push(value);i++;
    }
    markdownParagraph(root,paragraph.join(' '));
  }
  return root;
}

function getCompleted(storage) {
  try {
    const value=JSON.parse(storage.getItem(PROGRESS_KEY)||'[]');
    return new Set(Array.isArray(value)?value.filter(x=>Number.isInteger(x)&&x>=1&&x<=25):[]);
  } catch {return new Set();}
}

export function setupLessonPage({showHome,showGame,launchPractice,
                                 storage=localStorage}={}) {
  const $=id=>document.getElementById(id);
  const all=parseLessonGuide(guideMarkdown);
  if(all.length!==25)throw new Error('中文课程必须包含完整的 25 节');
  const completed=getCompleted(storage);
  let selected=all[0];
  let filter='all',query='', origin='home',practiceLoading=false;

  try {
    const last=Number(storage.getItem(LAST_KEY));
    selected=all.find(item=>item.id===last)||selected;
  } catch {}
  const saveProgress=()=>{
    try{
      storage.setItem(PROGRESS_KEY,JSON.stringify([...completed].sort((a,b)=>a-b)));
      storage.setItem(LAST_KEY,String(selected.id));
    }catch{/* private browsing still allows lessons to run */}
  };

  const stageLabel=lesson=>STAGES.find(stage=>stage.id===lesson.stage)?.title||'课程';
  function renderCounts(){
    $('lessonProgressText').textContent='已学 '+completed.size+' / '+all.length+' 课';
    $('lessonProgressBar').style.width=(completed.size/all.length*100).toFixed(1)+'%';
  }
  function renderFilters(){
    const root=$('lessonFilters');
    root.replaceChildren();
    const options=[{id:'all',title:'全部'},...STAGES.map(s=>({id:s.id,title:s.short}))];
    for(const stage of options){
      const button=element('button','lesson-filter',stage.title);
      button.type='button';button.dataset.stage=stage.id;
      button.setAttribute('aria-pressed',String(filter===stage.id));
      root.append(button);
    }
  }
  function renderList(){
    const root=$('lessonList');root.replaceChildren();
    const filtered=filterLessons(all,query,filter);
    $('lessonResultCount').textContent=filtered.length+' 节课程';
    if(!filtered.length){
      root.append(element('p','lesson-empty','没有找到匹配课程，试试其他关键词。'));
      return;
    }
    for(const lesson of filtered){
      const button=element('button','lesson-entry');
      button.type='button';button.dataset.id=String(lesson.id);
      button.setAttribute('aria-current',lesson.id===selected.id?'true':'false');
      const mark=element('span','lesson-entry-index',String(lesson.id).padStart(2,'0'));
      const info=element('span','lesson-entry-copy');
      info.append(element('strong','',lesson.title));
      info.append(element('small','',stageLabel(lesson)));
      button.append(mark,info);
      if(completed.has(lesson.id))button.append(element('span','lesson-entry-done','✓'));
      root.append(button);
    }
  }
  function renderExercise(){
    const root=$('lessonExercise');
    root.replaceChildren();
    if(!EXERCISES[selected.id])return;
    const verified=hasVerifiedLessonPractice(selected.id);
    const heading=element('div','lesson-exercise-heading');
    heading.append(element('strong','',
      verified?'进入真实棋盘练习':'练习验证中'));
    heading.append(element('span','',
      verified?'来自求解器实际推理步骤':'未发布不可靠的候选数示例'));
    const body=element('div','lesson-exercise-body');
    if(verified){
      body.append(element('p','lesson-exercise-context',
        '本课使用经过唯一解与无猜测推理验证的棋盘。候选数来自真实的求解中间状态，蓝色标记提示关联格，黄色格是操作目标。'));
      body.append(element('p','lesson-exercise-context',
        '请在棋盘中完成一次真实的填数或候选删除；遇到困难时可查看推理讲解。'));
      const start=element('button','lesson-start-practice',
        practiceLoading?'正在准备训练棋盘…':'进入练习棋盘');
      start.id='lessonStartPractice';
      start.type='button';
      start.disabled=practiceLoading;
      body.append(start);
    }else{
      body.append(element('p','lesson-exercise-context',
        '此技巧目前还没有通过完整盘面、唯一解及指定推理步骤三重验证的练习。为避免误导，暂不展示原先手工编造的候选数棋盘。理论讲解仍可阅读。'));
    }
    const status=element('p','lesson-practice-message',
      verified?'不会覆盖正在游玩的谜题；返回课程时恢复原来的棋盘。':
        '需要有可复现的求解器推理证明，才能开放这一节的实战练习。');
    status.id='lessonPracticeFeedback';
    status.setAttribute('role','status');
    body.append(status);
    root.append(heading,body);
  }

  function renderDetail(){
    $('lessonStage').textContent=stageLabel(selected);
    $('lessonTitle').textContent=selected.id+'. '+selected.title;
    $('lessonSummary').textContent='第 '+selected.id+' 课 / 共 '+all.length+' 课';
    renderLessonContent(selected.content,$('lessonReading'));
    $('lessonComplete').textContent=completed.has(selected.id)?'✓ 已掌握 · 点击取消':'标记为已掌握';
    $('lessonComplete').setAttribute('aria-pressed',String(completed.has(selected.id)));
    $('lessonPrev').disabled=selected.id===all[0].id;
    $('lessonNext').disabled=selected.id===all[all.length-1].id;
    renderExercise();
    renderCounts();
  }
  function select(id,{scroll=true}={}){
    const next=all.find(item=>item.id===Number(id));
    if(!next)return;
    selected=next;
    saveProgress();
    renderList();renderDetail();
    if(scroll)$('lessonDetail').scrollTop=0;
  }
  function open(){
    origin=$('gameScreen').hidden?'home':'game';
    if(origin==='game'){
      // Board state and camera remain alive; caller saves before hiding.
      $('gameScreen').hidden=true;
    }
    $('homeScreen').hidden=true;
    $('lessonScreen').hidden=false;
    renderFilters();select(selected.id,{scroll:false});
  }
  function close(){
    $('lessonScreen').hidden=true;
    if(origin==='game')showGame();
    else showHome();
  }
  $('lessonBack').addEventListener('click',close);
  $('lessonSearch').addEventListener('input',event=>{
    query=event.target.value;
    renderList();
  });
  $('lessonFilters').addEventListener('click',event=>{
    const button=event.target.closest('button[data-stage]');
    if(!button)return;
    filter=button.dataset.stage;
    renderFilters();renderList();
  });
  $('lessonList').addEventListener('click',event=>{
    const button=event.target.closest('button[data-id]');
    if(button)select(button.dataset.id);
  });
  $('lessonPrev').addEventListener('click',()=>select(selected.id-1));
  $('lessonNext').addEventListener('click',()=>select(selected.id+1));
  $('lessonComplete').addEventListener('click',()=>{
    if(completed.has(selected.id))completed.delete(selected.id);
    else completed.add(selected.id);
    saveProgress();renderList();renderDetail();
  });
  $('lessonExercise').addEventListener('click',async event=>{
    const button=event.target.closest('#lessonStartPractice');
    if(!button||practiceLoading)return;
    if(typeof launchPractice!=='function'){
      $('lessonPracticeFeedback').textContent='训练引擎尚未连接。';
      return;
    }
    practiceLoading=true;
    button.disabled=true;
    try{
      await launchPractice(selected);
    }catch(error){
      $('lessonPracticeFeedback').textContent='训练棋盘加载失败：'+
        String(error?.message||error);
    }finally{
      practiceLoading=false;
      if(!$('lessonScreen').hidden)renderExercise();
    }
  });
  function markPracticed(id){
    if(!all.some(lesson=>lesson.id===Number(id)))return;
    completed.add(Number(id));
    saveProgress();
    renderCounts();renderList();
    if(selected.id===Number(id))renderDetail();
  }
  function returnFromPractice(){
    $('gameScreen').hidden=true;
    $('homeScreen').hidden=true;
    $('lessonScreen').hidden=false;
    renderFilters();renderList();renderDetail();
  }

  document.addEventListener('keydown',event=>{
    if($('lessonScreen').hidden)return;
    if(event.key==='Escape'){
      event.preventDefault();close();
    }
  });
  return {open,close,lessons:all,markPracticed,returnFromPractice};
}
