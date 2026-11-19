// Offline, certified candidate-chain drills adapted from FanFront/sudokuCoach.
// This dialog does not modify SudokuPadX game state or player pencil notes.
import {CHAIN_COACH_TOPICS,CHAIN_COACH_TOTAL,CHAIN_TOPIC_BY_ID,
  coachExample,applyPracticeMove,topicFromLesson,validateCoachExample
} from './model.js';
import {normalizeCandidateProof,proofLinks,candidatePosition,
  describeProofLinks} from '../hints/proof-view.js';

const key='sudokupadx:chain-coach:v1';
let dialog=null,state=null;
const rc=cell=>'R'+(Math.floor(cell/9)+1)+'C'+(cell%9+1);
function element(tag,cls='',text){
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(text!=null)node.textContent=String(text);
  return node;
}
function saved(){
  try{
    const values=JSON.parse(localStorage.getItem(key)||'[]');
    return new Set(Array.isArray(values)?values.filter(v=>
      typeof v==='string'&&/^(simple-colouring|3d-medusa|x-chain|xy-chain|aic):[0-3]$/.test(v)):[]);
  }catch{return new Set();}
}
function reset(topic,index=0){
  state={topic,index,phase:'observe',reveal:false,showLinks:true,
    done:new Set(),feedback:'',wrong:false,completed:state?.completed||saved()};
}
function ensureDialog(){
  if(dialog)return;
  dialog=element('dialog','chain-coach-dialog');
  dialog.id='chainCoachDialog';
  dialog.setAttribute('aria-labelledby','chainCoachTitle');
  dialog.innerHTML=[
    '<div class="chain-coach-wrap">',
    '<header class="chain-coach-header"><div><small>SudokuPadX · 数独逻辑课堂</small>',
    '<h2 id="chainCoachTitle">链与染色训练</h2></div>',
    '<button type="button" data-action="close" aria-label="关闭训练">✕</button></header>',
    '<div class="chain-coach-toolbar"><label>技巧 <select id="chainCoachTopic"></select></label>',
    '<strong id="chainCoachIndex"></strong><span id="chainCoachProgress"></span></div>',
    '<div class="chain-coach-layout"><section class="chain-coach-board-card">',
    '<div class="chain-coach-board-head"><strong id="chainCoachBoardTitle"></strong>',
    '<span id="chainCoachStepCount"></span></div>',
    '<div id="chainCoachBoard" class="chain-coach-board" role="group" ',
    'aria-label="标准九宫数独链与染色候选图"></div>',
    '<div id="chainCoachLegend" class="chain-coach-legend" hidden>',
    '<span><i class="coach-blue"></i>蓝色</span>',
    '<span><i class="coach-purple"></i>紫色</span>',
    '<span><i class="coach-link-strong"></i>强链接</span>',
    '<span><i class="coach-link-weak"></i>弱链接</span>',
    '<button type="button" data-action="links" id="chainCoachLinks">隐藏连线</button></div>',
    '<details class="chain-coach-link-list" id="chainCoachDetails" hidden>',
    '<summary>查看每一段候选数链接</summary><ol id="chainCoachLinkList"></ol></details>',
    '</section><aside class="chain-coach-side">',
    '<strong id="chainCoachPhase"></strong><h3 id="chainCoachTechnique"></h3>',
    '<p id="chainCoachRule"></p><p id="chainCoachClue"></p>',
    '<p class="chain-coach-status" id="chainCoachStatus" role="status" aria-live="polite"></p>',
    '<div class="chain-coach-actions">',
    '<button type="button" data-action="start" id="chainCoachStart">开始练习</button>',
    '<button type="button" data-action="help" id="chainCoachHelp">显示线索</button>',
    '<button type="button" data-action="prev">上一例</button>',
    '<button type="button" data-action="next" id="chainCoachNext">下一例</button>',
    '</div><small>来自 SudokuCoach 已核验的唯一解推理回放。练习只执行候选删除，',
    '不会改变当前游戏棋盘或存档。</small></aside></div></div>'
  ].join('');
  document.body.append(dialog);
  const topicSelect=dialog.querySelector('#chainCoachTopic');
  for(const topic of CHAIN_COACH_TOPICS){
    const option=element('option','',topic.title);option.value=topic.id;
    topicSelect.append(option);
  }
  topicSelect.addEventListener('change',()=>{
    reset(topicSelect.value);render();
  });
  dialog.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(!button)return;
    const action=button.dataset.action;
    if(action){
      if(action==='close'){dialog.close();return;}
      if(action==='start'){
        state.phase='practice';state.reveal=false;state.done.clear();
        state.feedback='请选择能够证明排除的候选数。';state.wrong=false;
      }
      if(action==='help')state.reveal=!state.reveal;
      if(action==='links')state.showLinks=!state.showLinks;
      if(action==='prev'||action==='next'){
        reset(state.topic,(state.index+(action==='next'?1:3))%4);
      }
      render();return;
    }
    if(button.dataset.cell==null||button.dataset.digit==null||
       state.phase!=='practice')return;
    const cell=Number(button.dataset.cell),digit=Number(button.dataset.digit);
    const result=applyPracticeMove(coachExample(state.topic,state.index),
      state.done,cell,digit);
    if(result.accepted){
      state.done.add(cell+':'+digit);state.wrong=false;
      state.feedback='✓ '+rc(cell)+' 候选 '+digit+'：排除正确。';
      if(result.complete){
        state.phase='done';state.reveal=true;
        state.feedback='所有目标候选均已正确排除，训练完成。';
        state.completed.add(state.topic+':'+state.index);
        try{localStorage.setItem(key,JSON.stringify([...state.completed]));}catch{}
      }
    }else{
      state.wrong=true;
      state.feedback='不能由本步推出这一排除。检查强弱链接，或尝试「显示线索」。';
    }
    render();
  });
}
function proofSvg(proof){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('class','chain-coach-proof-lines');
  svg.setAttribute('viewBox','0 0 270 270');
  svg.setAttribute('aria-hidden','true');
  for(const {from,to,strong} of proofLinks(proof)){
    const a=proof.nodes[from],b=proof.nodes[to],
      p=candidatePosition(a.cell,a.digit,9,30),
      q=candidatePosition(b.cell,b.digit,9,30);
    const line=document.createElementNS('http://www.w3.org/2000/svg','line');
    for(const [name,value] of Object.entries({
      x1:p.x,y1:p.y,x2:q.x,y2:q.y
    }))line.setAttribute(name,String(value));
    line.setAttribute('class',strong?'strong':'weak');
    svg.append(line);
  }
  return svg;
}
function renderBoard(example,showProof){
  const root=dialog.querySelector('#chainCoachBoard');root.replaceChildren();
  const proof=normalizeCandidateProof(example.proof,9);
  const marked=new Map(showProof?proof.nodes.map((node,index)=>[
    node.cell+':'+node.digit,
    proof.kind==='colour'?(node.colour===0?'colour-0':'colour-1'):
      (index===0||index===proof.nodes.length-1?'end':'node')
  ]):[]);
  const targets=new Set(example.updates.map(u=>u.index+':'+u.digit));
  const revealActions=state.phase!=='practice'||state.reveal;
  for(let cell=0;cell<81;cell++){
    const value=example.board[cell];
    const box=element('div','chain-coach-cell'+
      (cell%9%3===2?' box-right':'')+
      (Math.floor(cell/9)%3===2?' box-bottom':'')+
      (example.focus.includes(cell)&&showProof?' is-focus':''));
    if(value!=='0'){
      const digit=element('strong',example.puzzle[cell]!=='0'?'given':'deduced',value);
      digit.setAttribute('aria-label',rc(cell)+' 已填 '+value);
      box.append(digit);
    }else{
      const available=new Set(example.candidates[cell]);
      const grid=element('div','chain-coach-candidates');
      for(let digit=1;digit<=9;digit++){
        const item=cell+':'+digit;
        if(!available.has(digit)){grid.append(element('span','empty'));continue;}
        const mark=marked.get(item);
        const classes=['candidate',mark?'proof-'+mark:'',
          targets.has(item)&&revealActions?'target':'',
          state.done.has(item)?'removed':''].filter(Boolean).join(' ');
        const button=element('button',classes,digit);
        button.type='button';button.dataset.cell=cell;
        button.dataset.digit=digit;
        button.setAttribute('aria-label',rc(cell)+' 候选 '+digit);
        if(state.phase!=='practice'||state.done.has(item))button.disabled=true;
        grid.append(button);
      }
      box.append(grid);
    }
    root.append(box);
  }
  if(showProof&&state.showLinks)root.append(proofSvg(proof));
}
function render(){
  if(!dialog||!state)return;
  const topic=CHAIN_TOPIC_BY_ID.get(state.topic),
    example=coachExample(state.topic,state.index);
  if(!topic||!validateCoachExample(example)){
    dialog.querySelector('#chainCoachStatus').textContent=
      '训练数据的逻辑证书未通过验证，无法加载。';
    return;
  }
  const showProof=state.phase!=='practice'||state.reveal;
  dialog.querySelector('#chainCoachTopic').value=topic.id;
  dialog.querySelector('#chainCoachIndex').textContent='例题 '+(state.index+1)+' / 4';
  dialog.querySelector('#chainCoachProgress').textContent=
    '已完成 '+state.completed.size+' / '+CHAIN_COACH_TOTAL+' 局面';
  dialog.querySelector('#chainCoachBoardTitle').textContent=
    topic.group==='colour'?'双色候选图':'强弱链接图';
  dialog.querySelector('#chainCoachStepCount').textContent=
    state.done.size+' / '+example.updates.length+' 个排除';
  dialog.querySelector('#chainCoachPhase').textContent=
    state.phase==='observe'?'观察示范':state.phase==='done'?'练习完成':'独立实战';
  dialog.querySelector('#chainCoachTechnique').textContent=topic.title;
  dialog.querySelector('#chainCoachRule').textContent=topic.rule;
  dialog.querySelector('#chainCoachClue').textContent=state.phase==='observe'?
    example.clue:state.phase==='done'?example.reason:
      state.reveal?example.clue:topic.clue;
  const message=dialog.querySelector('#chainCoachStatus');
  message.textContent=state.feedback||(state.phase==='observe'?
    '先查看蓝紫候选和强弱链接，然后在棋盘上尝试真实排除。':
    '请点击能够被证明排除的候选数。');
  message.classList.toggle('wrong',state.wrong);
  const start=dialog.querySelector('#chainCoachStart');
  start.hidden=state.phase==='practice';
  start.textContent=state.phase==='done'?'重新练习':'开始练习';
  const help=dialog.querySelector('#chainCoachHelp');
  help.hidden=state.phase!=='practice';
  help.textContent=state.reveal?'隐藏线索':'显示线索';
  dialog.querySelector('#chainCoachLegend').hidden=!showProof;
  dialog.querySelector('#chainCoachLinks').textContent=
    state.showLinks?'隐藏连线':'显示连线';
  const details=dialog.querySelector('#chainCoachDetails');
  details.hidden=!showProof;
  const list=dialog.querySelector('#chainCoachLinkList');list.replaceChildren();
  for(const description of describeProofLinks(example.proof,9)){
    list.append(element('li','',description));
  }
  renderBoard(example,showProof);
}
export function openChainCoach({topic,title}={}){
  ensureDialog();
  reset(CHAIN_TOPIC_BY_ID.has(topic)?topic:topicFromLesson(title));
  render();
  if(!dialog.open)dialog.showModal();
}
