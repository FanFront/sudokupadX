/* Offline, deterministic candidate solver for the player-facing creator.
 * Level 1: singles + local variant propagation. 2: subsets and locked
 * candidates. 3: fish, XY-Wing and Skyscraper. 4: Jellyfish, XYZ-Wing
 * and XY chains. 5: independent depth-first search, NEVER called a
 * no-guess proof. This client curriculum is intentionally documented
 * separately from the more extensive Python offline catalogue.
 *
 * Every deduction uses printed givens and constraints only. The completed
 * grid passed to the generator is never consulted by this solver.
 */
export const BOXES = {4:[2,2],6:[2,3],9:[3,3]};
export const VARIANT_NAMES = {
  killer:'杀手笼', kropki:'黑白点', thermo:'温度计', renban:'连续线',
  whisper:'耳语线', arrow:'箭头', xv:'V/X 标记',
  entropic:'熵线', modular:'模三线', between:'夹心线',
  region_sum:'区域和线'
};
export const TECHNIQUES = {
  peer_elimination:{name:'同行同列同宫排除',tier:1},
  hidden_single:{name:'隐性唯一数',tier:1},
  killer_sum:{name:'杀手笼组合',tier:1},
  kropki:{name:'黑白点关系',tier:1},
  thermo:{name:'温度计递增',tier:1},
  renban:{name:'连续线',tier:1},
  whisper:{name:'耳语线',tier:1},
  arrow:{name:'箭头求和',tier:1},
  xv:{name:'五与十标记',tier:1},
  entropic:{name:'熵线',tier:1},
  modular:{name:'模三线',tier:1},
  between:{name:'夹心线',tier:1},
  region_sum:{name:'区域和线',tier:1},
  naked_subset:{name:'显性数对／数组',tier:2},
  hidden_subset:{name:'隐性数对／数组',tier:2},
  locked_candidate:{name:'区块锁定候选',tier:2},
  x_wing:{name:'X-Wing',tier:3},
  swordfish:{name:'Swordfish',tier:3},
  xy_wing:{name:'XY-Wing',tier:3},
  skyscraper:{name:'Skyscraper',tier:3},
  jellyfish:{name:'Jellyfish',tier:4},
  xyz_wing:{name:'XYZ-Wing',tier:4},
  xy_chain:{name:'XY-Chain',tier:4}
};
export const FULL = n => (1<<n)-1;
export const bit = digit => 1<<(digit-1);
export const has = (mask,digit) => Boolean(mask & bit(digit));
export const popcount = x => {let n=0;for(;x;x&=x-1)n++;return n;};
export const digits = (mask,n=9) => {
  const out=[];for(let digit=1;digit<=n;digit++)if(has(mask,digit))out.push(digit);
  return out;
};
const firstDigit = mask => Math.log2(mask)+1;
const subsetOf = (a,b) => (a & b) === a;
const BOX_ID = (n,i) => {
  const [h,w] = BOXES[n];
  return Math.floor(Math.floor(i/n)/h)*(n/w)+Math.floor(i%n/w);
};
const isPeer = (n,a,b) => a!==b &&
  (Math.floor(a/n)===Math.floor(b/n) || a%n===b%n || BOX_ID(n,a)===BOX_ID(n,b));
export function structure(n) {
  if(!BOXES[n])throw Error('仅支持 4×4、6×6、9×9');
  const [h,w]=BOXES[n],houses=[], peers=Array.from({length:n*n},()=>new Set());
  for(let r=0;r<n;r++)houses.push(Array.from({length:n},(_,c)=>r*n+c));
  for(let c=0;c<n;c++)houses.push(Array.from({length:n},(_,r)=>r*n+c));
  for(let r=0;r<n;r+=h)for(let c=0;c<n;c+=w){
    const cells=[];for(let dr=0;dr<h;dr++)for(let dc=0;dc<w;dc++)
      cells.push((r+dr)*n+c+dc);
    houses.push(cells);
  }
  for(const unit of houses)for(const i of unit)for(const j of unit)
    if(i!==j)peers[i].add(j);
  const intersections=[];
  for(let a=0;a<houses.length;a++)for(let b=a+1;b<houses.length;b++){
    const shared=houses[a].filter(i=>houses[b].includes(i));
    if(shared.length>1&&shared.length<n)intersections.push([a,b,new Set(shared)]);
  }
  return {houses,peers,intersections};
}
const structures=new Map();
const getStructure = n => {
  if(!structures.has(n)) structures.set(n,structure(n));
  return structures.get(n);
};

function* combinations(items,size,start=0,prefix=[]) {
  if(!size){yield prefix;return;}
  for(let i=start;i<=items.length-size;i++)
    yield* combinations(items,size-1,i+1,[...prefix,items[i]]);
}
function permutations(items) {
  if(items.length===0)return [[]];
  const result=[];for(let i=0;i<items.length;i++)
    for(const tail of permutations(items.filter((_,j)=>j!==i)))
      result.push([items[i],...tail]);
  return result;
}
const GROUP_PERMUTATIONS = permutations([0,1,2]);
const validDomains = (n,domains) => Array.isArray(domains) &&
  domains.length===n*n && domains.every(x=>Number.isInteger(x)&&x>0&&(x & ~FULL(n))===0);

function pruneVariant(n,masks,rule,cut,peers) {
  const cells=rule.cells,kind=rule.type;
  let changed=false;
  function pairFilter(a,b,rel) {
    const ca=digits(masks[a],n),cb=digits(masks[b],n);
    const possible=[];
    for(const x of ca)for(const y of cb)if(rel(x,y))possible.push([x,y]);
    if(!possible.length)throw Error('变体规则与候选数冲突');
    let sa=0,sb=0;for(const [x,y] of possible){sa|=bit(x);sb|=bit(y);}
    changed=cut(a,sa,kind)||changed;
    changed=cut(b,sb,kind)||changed;
  }
  if(kind==='thermo'||kind==='whisper') {
    for(let i=1;i<cells.length;i++){
      pairFilter(cells[i-1],cells[i],kind==='thermo'
        ?(a,b)=>a<b:(a,b)=>Math.abs(a-b)>=5);
    }
    return changed;
  }
  if(kind==='kropki'){
    const rel=rule.kind==='white'?(a,b)=>Math.abs(a-b)===1:
      (a,b)=>Math.max(a,b)===2*Math.min(a,b);
    pairFilter(cells[0],cells[1],rel);
    return changed;
  }
  if(kind==='xv'){
    pairFilter(cells[0],cells[1],(a,b)=>a+b===rule.sum);
    return changed;
  }
  if(kind==='entropic'||kind==='modular'){
    const supports=cells.map(()=>0);
    for(const order of GROUP_PERMUTATIONS){
      if(!cells.every((i,k)=>digits(masks[i],n).some(d=>
        (kind==='entropic'?Math.floor((d-1)/(n/3)):(d-1)%3)===order[k%3])))continue;
      cells.forEach((i,k)=>{
        for(const d of digits(masks[i],n)){
          const cls=kind==='entropic'?Math.floor((d-1)/(n/3)):(d-1)%3;
          if(cls===order[k%3])supports[k]|=bit(d);
        }
      });
    }
    for(let i=0;i<cells.length;i++)changed=cut(cells[i],supports[i],kind)||changed;
    return changed;
  }

  // Feasible complete assignments to a small visible rule. Only values
  // that occur in a feasible assignment survive; no guess is committed.
  const support=cells.map(()=>0),chosen=[],doms=cells.map(i=>digits(masks[i],n));
  let found=0;
  function validAssignment() {
    if(kind==='killer')return chosen.reduce((a,b)=>a+b,0)===rule.sum &&
      new Set(chosen).size===chosen.length;
    if(kind==='renban')return new Set(chosen).size===chosen.length &&
      Math.max(...chosen)-Math.min(...chosen)===cells.length-1;
    if(kind==='arrow')return chosen[0]===chosen.slice(1).reduce((a,b)=>a+b,0);
    if(kind==='between'){
      const min=Math.min(chosen[0],chosen.at(-1)),max=Math.max(chosen[0],chosen.at(-1));
      return chosen.slice(1,-1).every(d=>d>min&&d<max);
    }
    if(kind==='region_sum'){
      const sums=[];let last=BOX_ID(n,cells[0]),sum=0;
      cells.forEach((i,j)=>{
        const box=BOX_ID(n,i);
        if(box!==last){sums.push(sum);sum=0;last=box;}
        sum+=chosen[j];
      });sums.push(sum);
      return sums.length>1&&sums.every(s=>s===sums[0]);
    }
    throw Error('不支持的变体：'+kind);
  }
  function visit(depth) {
    if(depth===cells.length){
      if(!validAssignment())return;
      found++;
      chosen.forEach((d,k)=>{support[k]|=bit(d);});
      return;
    }
    for(const d of doms[depth]){
      if(kind==='killer'&&chosen.includes(d))continue;
      if(kind==='renban'&&chosen.includes(d))continue;
      if((kind==='between'||kind==='region_sum'||kind==='arrow') &&
         chosen.some((previous,j)=>previous===d&&peers[cells[j]].has(cells[depth])))continue;
      if(kind==='arrow'&&depth>0&&
         chosen.slice(1).reduce((a,b)=>a+b,0)+d>n)continue;
      chosen.push(d);visit(depth+1);chosen.pop();
    }
  }
  visit(0);
  if(!found)throw Error('变体规则无有效组合');
  for(let k=0;k<cells.length;k++)
    changed=cut(cells[k],support[k],kind==='killer'?'killer_sum':kind)||changed;
  return changed;
}

/* All values returned are reproducible from the actual displayed board.
 * The algorithm NEVER uses the author's hidden answer. */
export function deduce(n,givens,rules=[],{
  maxTier=4, disabledMethods=[], trace=false, domains=null
}={}) {
  if(!BOXES[n]||maxTier<1||maxTier>4)throw Error('不支持的技巧等级');
  const {houses,peers,intersections}=getStructure(n), full=FULL(n);
  const masks=domains?[...domains]:Array(n*n).fill(full);
  if(!validDomains(n,masks))throw Error('候选数不合法');
  for(const [key,value] of Object.entries(givens||{})){
    const i=Number(key);if(!Number.isInteger(i)||i<0||i>=n*n||
      !Number.isInteger(value)||value<1||value>n)throw Error('给定数字无效');
    masks[i]=bit(value);
  }
  const disabled=new Set(disabledMethods),counts={},steps=[];
  function cut(i,allowed,method,source=null){
    if(disabled.has(method)||(TECHNIQUES[method]?.tier||1)>maxTier)return false;
    const before=masks[i],after=before&allowed;
    if(!after)throw Error('候选数全部排除');
    if(before===after)return false;
    masks[i]=after;counts[method]=(counts[method]||0)+1;
    if(trace)steps.push({cell:i,method,source,
      removed:digits(before&~after,n),remaining:digits(after,n)});
    return true;
  }
  function pairsAndLocked() {
    let changed=false;
    for(let hi=0;hi<houses.length;hi++){
      const house=houses[hi], unsolved=house.filter(i=>popcount(masks[i])>1);
      for(const size of [2,3]){
        for(const selected of combinations(unsolved,size)){
          let union=0;for(const i of selected)union|=masks[i];
          if(popcount(union)!==size)continue;
          const part=new Set(selected);
          for(const i of house)if(!part.has(i))
            changed=cut(i,~union,'naked_subset',{house:hi,cells:selected,size})||changed;
        }
        const all=Array.from({length:n},(_,i)=>i+1);
        for(const chosen of combinations(all,size)){
          const dmask=chosen.reduce((m,d)=>m|bit(d),0);
          const locations=house.filter(i=>masks[i]&dmask);
          if(locations.length!==size || chosen.some(d=>!locations.some(i=>has(masks[i],d))))continue;
          for(const i of locations)changed=cut(i,dmask,'hidden_subset',
            {house:hi,digits:chosen,size})||changed;
        }
      }
    }
    for(const [a,b,common] of intersections)
      for(const [from,to] of [[a,b],[b,a]]){
        for(let d=1;d<=n;d++){
          const positions=houses[from].filter(i=>has(masks[i],d));
          if(!positions.length||!positions.every(i=>common.has(i)))continue;
          for(const i of houses[to])if(!common.has(i))
            changed=cut(i,~bit(d),'locked_candidate',
              {sourceHouse:from,targetHouse:to,digit:d})||changed;
        }
      }
    return changed;
  }
  function fish(maxSize) {
    let changed=false;
    if(n!==9)return false;
    for(let axis=0;axis<2;axis++)for(let d=1;d<=n;d++){
      const base=Array.from({length:n},(_,line)=>{
        const covers=[];for(let c=0;c<n;c++){
          const i=axis===0?line*n+c:c*n+line;
          if(has(masks[i],d))covers.push(c);
        }
        return covers;
      });
      for(let size=2;size<=maxSize;size++){
        const eligible=Array.from({length:n},(_,i)=>i)
          .filter(i=>base[i].length>=2&&base[i].length<=size);
        if(eligible.length<size)continue;
        for(const chosen of combinations(eligible,size)){
          const cover=new Set(chosen.flatMap(i=>base[i]));
          if(cover.size!==size)continue;
          const method={2:'x_wing',3:'swordfish',4:'jellyfish'}[size];
          for(let line=0;line<n;line++)if(!chosen.includes(line))
            for(const c of cover){
              const i=axis===0?line*n+c:c*n+line;
              changed=cut(i,~bit(d),method,{axis,bases:chosen,covers:[...cover],digit:d})||changed;
            }
        }
      }
    }
    return changed;
  }
  function xyWing() {
    let changed=false;
    const bi=Array.from({length:n*n},(_,i)=>i).filter(i=>popcount(masks[i])===2);
    for(const p of bi){
      const [a,b]=digits(masks[p],n), adjacent=bi.filter(w=>peers[p].has(w));
      for(const x of adjacent){
        const intersection=masks[x]&masks[p];
        if(popcount(intersection)!==1)continue;
        const start=firstDigit(intersection),z=firstDigit(masks[x]&~intersection);
        const other=start===a?b:a;
        for(const y of adjacent){
          if(x===y||!has(masks[y],other)||!has(masks[y],z)||
             popcount(masks[y])!==2)continue;
          for(const i of peers[x])if(peers[y].has(i)&&i!==p&&i!==x&&i!==y)
            changed=cut(i,~bit(z),'xy_wing',{pivot:p,wing1:x,wing2:y,digit:z})||changed;
        }
      }
    }
    return changed;
  }
  function skyscraper() {
    if(n!==9)return false;
    let changed=false;
    for(let axis=0;axis<2;axis++)for(let d=1;d<=9;d++){
      const locs=Array.from({length:9},(_,line)=>{
        const covers=[];for(let col=0;col<9;col++){
          const i=axis===0?line*9+col:col*9+line;
          if(has(masks[i],d))covers.push(col);
        }return covers;
      });
      for(let a=0;a<9;a++)if(locs[a].length===2)
        for(let b=a+1;b<9;b++)if(locs[b].length===2){
          const shared=locs[a].filter(c=>locs[b].includes(c));
          if(shared.length!==1)continue;
          const roofA=locs[a].find(c=>c!==shared[0]);
          const roofB=locs[b].find(c=>c!==shared[0]);
          const x=axis===0?a*9+roofA:roofA*9+a;
          const y=axis===0?b*9+roofB:roofB*9+b;
          for(const i of peers[x])if(i!==y&&peers[y].has(i))
            changed=cut(i,~bit(d),'skyscraper',{axis,rows:[a,b],digit:d})||changed;
        }
    }
    return changed;
  }
  function xyzWing(){
    let changed=false;
    const bi=Array.from({length:n*n},(_,i)=>i).filter(i=>popcount(masks[i])===2);
    const tri=Array.from({length:n*n},(_,i)=>i).filter(i=>popcount(masks[i])===3);
    for(const p of tri){
      const adjacent=bi.filter(i=>peers[p].has(i)&&subsetOf(masks[i],masks[p]));
      for(let a=0;a<adjacent.length;a++)for(let b=a+1;b<adjacent.length;b++){
        const x=adjacent[a],y=adjacent[b],shared=masks[x]&masks[y];
        if(popcount(shared)!==1 || (masks[x]|masks[y])!==masks[p])continue;
        for(const i of peers[p])if(peers[x].has(i)&&peers[y].has(i))
          changed=cut(i,~shared,'xyz_wing',{pivot:p,wing1:x,wing2:y})||changed;
      }
    }
    return changed;
  }
  function xyChains() {
    let changed=false;
    const bi=Array.from({length:n*n},(_,i)=>i).filter(i=>popcount(masks[i])===2);
    const bivaluePeers=new Map(bi.map(i=>[i,bi.filter(j=>peers[i].has(j))]));
    // A genuine alternating strong/weak implication path on bivalue cells.
    for(const start of bi)for(const target of digits(masks[start],n)){
      const other=firstDigit(masks[start]&~bit(target));
      function dfs(i,link,visited,depth) {
        if(depth>=6)return;
        for(const next of bivaluePeers.get(i)){
          if(visited.has(next)||!has(masks[next],link))continue;
          const nextLink=firstDigit(masks[next]&~bit(link));
          if(next!==start&&nextLink===target&&depth>=1){
            for(const cell of peers[start])
              if(cell!==next&&!visited.has(cell)&&peers[next].has(cell))
                changed=cut(cell,~bit(target),'xy_chain',
                  {start,end:next,target,path:[...visited,next]})||changed;
          }else{
            const newVisited=new Set(visited);newVisited.add(next);
            dfs(next,nextLink,newVisited,depth+1);
          }
        }
      }
      dfs(start,other,new Set([start]),0);
    }
    return changed;
  }

  for(let iteration=0;iteration<220;iteration++){
    let changed=false;
    for(let hi=0;hi<houses.length;hi++){
      const house=houses[hi];
      let seen=0;
      for(const i of house)if(popcount(masks[i])===1){
        if(seen&masks[i])throw Error('标准数独重复数字');
        seen|=masks[i];
      }
      for(const i of house)if(popcount(masks[i])>1)
        changed=cut(i,~seen,'peer_elimination',hi)||changed;
      for(let d=1;d<=n;d++){
        const places=house.filter(i=>has(masks[i],d));
        if(!places.length)throw Error('标准数独缺少候选数字');
        if(places.length===1)
          changed=cut(places[0],bit(d),'hidden_single',hi)||changed;
      }
    }
    for(const rule of rules)changed=pruneVariant(n,masks,rule,cut,peers)||changed;
    if(maxTier>=2)changed=pairsAndLocked()||changed;
    if(!changed&&maxTier>=3){
      changed=fish(3)||changed;
      if(!changed)changed=xyWing()||changed;
      if(!changed)changed=skyscraper()||changed;
    }
    if(!changed&&maxTier>=4){
      changed=fish(4)||changed;
      if(!changed)changed=xyzWing()||changed;
      if(!changed)changed=xyChains()||changed;
    }
    if(!changed)break;
    if(iteration===219)throw Error('求解步骤超出限制');
  }
  const solved=masks.every(x=>popcount(x)===1);
  return {solved,domains:masks,
    values:solved?masks.map(firstDigit):null,techniques:counts,trace:steps};
}

/* Search serves ONLY uniqueness validation and optional level-5 puzzles.
 * It is never evidence of a level-1..4 logical solve. */
export function countSolutions(n,givens,rules=[],limit=2,{maxNodes=25000}={}) {
  const start=Array(n*n).fill(FULL(n));
  for(const [key,value] of Object.entries(givens||{}))start[Number(key)]=bit(value);
  let nodes=0,first=null;
  function visit(domains) {
    if(++nodes>maxNodes)throw Error('搜索复杂度超过本机安全限额；请重试或增加规则');
    let result;
    try {result=deduce(n,{},rules,{maxTier:2,domains});}
    catch {return 0;}
    if(result.solved){
      if(!first)first=result.values;
      return 1;
    }
    const choices=result.domains;
    let cell=-1,size=n+1;
    for(let i=0;i<n*n;i++){
      const k=popcount(choices[i]);
      if(k>1&&k<size){size=k;cell=i;}
    }
    let total=0;
    for(const d of digits(choices[cell],n)){
      const next=choices.slice();next[cell]=bit(d);
      total+=visit(next);
      if(total>=limit)return total;
    }
    return total;
  }
  const count=visit(start);
  return {count,solution:first,nodes};
}
export function logicalTier(n,givens,rules) {
  for(let tier=1;tier<=4;tier++)
    if(deduce(n,givens,rules,{maxTier:tier}).solved)return tier;
  return 5;
}
