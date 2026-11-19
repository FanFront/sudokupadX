// Reuse only SudokuCoach's verified unique-puzzle solver snapshots.
import {CHAIN_COACH_EXAMPLES} from './examples.js';
import {normalizeCandidateProof,proofLinks} from '../hints/proof-view.js';

export const CHAIN_COACH_TOPICS=Object.freeze([
  {id:'simple-colouring',title:'简单染色',group:'colour',
    rule:'在同一行、列或宫，某数字恰好只剩两个位置时，它们构成强链接。沿链接交替染成蓝、紫两组：若同色出现冲突，该色全部为假；若外部候选同时被两色排斥，它必定为假。',
    clue:'观察相同数字沿实线如何交替染成蓝色与紫色。'},
  {id:'3d-medusa',title:'3D Medusa 立体染色',group:'colour',
    rule:'同一格恰好两个候选时，它们也构成强链接。将同格的不同数字与同数字的行列宫强链接连接起来，交替用蓝色和紫色标记。寻找同色冲突或两色都排斥的候选。',
    clue:'同格不同数字之间也可以有强链接；检查两种颜色是否不能同时为真。'},
  {id:'x-chain',title:'X-Chain 单数链',group:'chain',
    rule:'只选定一个数字，沿实线强链接和虚线弱链接交替走。以强链接开头和结束时，链的两个端点至少一个成立，因此两端都看得见的同数候选可删去。',
    clue:'沿链交替经过强链接和弱链接，并比较紫色端点。'},
  {id:'xy-chain',title:'XY-Chain 双值链',group:'chain',
    rule:'每个双候选格内部的两数形成强链接；不同格之间同数且互斥的候选形成弱链接。交替链接后，如果两个端点是同一个数字，那么它们共同看到的候选可删去。',
    clue:'每个双值格内是强链接；格与格之间的同数链接是弱链接。'},
  {id:'aic',title:'AIC 交替推理链',group:'chain',
    rule:'强链接表示“至少一个为真”，弱链接表示“不能同时为真”。依次交替强弱链接，从一端为假推出另一端为真；由此排除与两个端点都冲突的候选。',
    clue:'观察同格异数与同数跨格的强弱链接，沿交替链追踪端点关系。'}
]);
export const CHAIN_TOPIC_BY_ID=new Map(CHAIN_COACH_TOPICS.map(topic=>[topic.id,topic]));
export const CHAIN_COACH_TOTAL=CHAIN_COACH_TOPICS.reduce((count,topic)=>
  count+(CHAIN_COACH_EXAMPLES[topic.id]?.length||0),0);

export function topicFromLesson(title=''){
  const name=String(title).toLowerCase();
  if(/medusa|立体染色|三维染色/.test(name))return '3d-medusa';
  if(/xy.?chain|双值链|双数链/.test(name))return 'xy-chain';
  if(/x.?chain|单数链/.test(name))return 'x-chain';
  if(/aic|交替推理链/.test(name))return 'aic';
  return 'simple-colouring';
}
export function coachExample(topic,index=0){
  const list=CHAIN_COACH_EXAMPLES[topic];
  if(!Array.isArray(list)||!Number.isInteger(index)||index<0||index>=list.length)
    return null;
  return list[index];
}
export function actionKey({index,digit}){return index+':'+digit;}
export function applyPracticeMove(example,done,cell,digit){
  const key=cell+':'+digit;
  if(!example||!Array.isArray(example.updates)||done.has(key))return {
    accepted:false,complete:false};
  const accepted=example.updates.some(u=>u.index===cell&&u.digit===digit&&
    u.kind==='remove');
  if(!accepted)return {accepted:false,complete:false};
  const all=example.updates.every(u=>u.kind==='remove'&&
    (done.has(actionKey(u))||actionKey(u)===key));
  return {accepted:true,complete:all};
}

const sameGroup=(a,b,n,group)=>{
  if(group==='row')return Math.floor(a/n)===Math.floor(b/n);
  if(group==='column')return a%n===b%n;
  const side=Math.sqrt(n);
  return Math.floor(Math.floor(a/n)/side)===Math.floor(Math.floor(b/n)/side)
    &&Math.floor((a%n)/side)===Math.floor((b%n)/side);
};
export function validateCoachExample(example){
  if(!example||!CHAIN_TOPIC_BY_ID.has(example.technique)||
     !/^[0-9]{81}$/.test(example.board)||
     !/^[0-9]{81}$/.test(example.puzzle)||
     !Array.isArray(example.candidates)||example.candidates.length!==81||
     !Array.isArray(example.updates)||!example.updates.length)return false;
  const proof=normalizeCandidateProof(example.proof,9);
  if(!proof||proof.kind!==CHAIN_TOPIC_BY_ID.get(example.technique).group)return false;
  if(!example.updates.every(u=>u.kind==='remove'&&Number.isInteger(u.index)&&
    u.index>=0&&u.index<81&&Number.isInteger(u.digit)&&u.digit>=1&&u.digit<=9&&
    example.candidates[u.index]?.includes(u.digit)))return false;
  for(const node of proof.nodes){
    if(!example.candidates[node.cell]?.includes(node.digit))return false;
  }
  for(const {from,to,strong} of proofLinks(proof)){
    const a=proof.nodes[from],b=proof.nodes[to];
    if(a.cell===b.cell){
      if(a.digit===b.digit)return false;
      if(strong&&example.candidates[a.cell].length!==2)return false;
    }else{
      if(a.digit!==b.digit)return false;
      if(!['row','column','box'].some(group=>sameGroup(a.cell,b.cell,9,group)))
        return false;
      if(strong && !['row','column','box'].some(group=>
        sameGroup(a.cell,b.cell,9,group)&&
        example.candidates.filter((values,i)=>
          sameGroup(i,a.cell,9,group)&&values.includes(a.digit)).length===2))
        return false;
    }
    if(proof.kind==='colour'&&a.colour===b.colour)return false;
  }
  return true;
}
