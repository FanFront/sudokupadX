// Visible, authored-constraint deduction. Nothing from player center/corner
// marks enters candidate domains. A constraint propagates only supported
// values, then verified all-different houses can use the strengthened domains.
// This supports arbitrary naked N-tuples and forced digits in a sum group.
const unique=a=>[...new Set(a)];
const digits=n=>Array.from({length:n},(_,i)=>i+1);
const visible=(progress,i)=>progress.visible?.[i]!==false;
const noteSet=cell=>new Set((cell?.center?.length?cell.center:cell?.corner||[])
  .map(Number).filter(x=>Number.isInteger(x)&&x>=1&&x<=9));
const countBits=n=>{let c=0;while(n){n&=n-1;c++;}return c;};
function sumsPossible(lists,limit,exclude=0){
  let sums=new Set([0]);
  for(const list of lists){
    const next=new Set();
    for(const s of sums)for(const d of list){
      if(d===exclude)continue;
      if(s+d<=limit)next.add(s+d);
    }
    sums=next;
    if(!sums.size)break;
  }
  return sums;
}
function sumSupports(lists,goal){
  if(!Number.isInteger(goal)||goal<0||lists.some(list=>!list.length))
    return null;
  const pref=[new Set([0])],suff=Array(lists.length+1);
  for(const list of lists){
    const next=new Set();
    for(const s of pref.at(-1))for(const d of list)
      if(s+d<=goal)next.add(s+d);
    pref.push(next);
  }
  if(!pref.at(-1).has(goal))return null;
  suff[lists.length]=new Set([0]);
  for(let i=lists.length-1;i>=0;i--){
    const next=new Set();
    for(const s of suff[i+1])for(const d of lists[i])
      if(s+d<=goal)next.add(s+d);
    suff[i]=next;
  }
  return lists.map((list,i)=>new Set(list.filter(d=>
    [...pref[i]].some(s=>suff[i+1].has(goal-s-d)))));
}
function pairRules(puzzle,rules){
  const {rows,cols}=puzzle,pairs=[];
  function pair(a,b,test){
    if(Number.isInteger(a)&&Number.isInteger(b)&&a!==b)
      pairs.push({a,b,test});
  }
  for(const rule of rules){
    const {type,cells}=rule;
    if(type==='odd'||type==='even')continue;
    if(type==='kropki'&&cells.length===2){
      pair(...cells,rule.dot==='white'
        ?(a,b)=>Math.abs(a-b)===1:(a,b)=>Math.max(a,b)===2*Math.min(a,b));
    }else if(type==='xv'&&cells.length===2){
      pair(...cells,(a,b)=>a+b===rule.sum);
    }else if(type==='inequality'&&cells.length===2){
      pair(...cells,(a,b)=>a<b);
    }else if(type==='clone'){
      for(let j=1;j<rule.groups.length;j++)
        for(let k=0;k<rule.groups[0].length;k++)
          pair(rule.groups[0][k],rule.groups[j][k],(a,b)=>a===b);
    }else if(type==='palindrome'){
      for(let j=0;j<Math.floor(cells.length/2);j++)
        pair(cells[j],cells[cells.length-1-j],(a,b)=>a===b);
    }else if(['thermo','reverse_thermo','whisper','reverse_whisper',
      'parity_line','prime_sum'].includes(type)){
      for(let j=1;j<cells.length;j++){
        const test=type==='thermo'?(a,b)=>a<b:
          type==='reverse_thermo'?(a,b)=>a>b:
          type==='whisper'?(a,b)=>Math.abs(a-b)>=5:
          type==='reverse_whisper'?(a,b)=>Math.abs(a-b)<5:
          type==='parity_line'?(a,b)=>a%2!==b%2:
          (a,b)=>[2,3,5,7,11,13,17].includes(a+b);
        pair(cells[j-1],cells[j],test);
      }
    }else if(['anti_king','anti_knight','lava','anti_xv',
      'anti_knight_anchors','anti_whisper_anchors','anti_kropki_black']
      .includes(type)){
      const group=new Set(cells);
      const jumps=type.includes('knight')?
        [[1,2],[1,-2],[-1,2],[-1,-2],[2,1],[2,-1],[-2,1],[-2,-1]]:
        type==='anti_king'?[[1,1],[1,-1],[-1,1],[-1,-1]]:
        [[0,1],[0,-1],[1,0],[-1,0]];
      const test=type==='lava'?(a,b)=>Math.abs(a-b)>=2:
        type==='anti_xv'?(a,b)=>a+b!==5&&a+b!==10:
        type==='anti_whisper_anchors'?(a,b)=>Math.abs(a-b)<5:
        type==='anti_kropki_black'
          ?(a,b)=>Math.max(a,b)!==2*Math.min(a,b):
          (a,b)=>a!==b;
      for(const a of cells){
        const r=Math.floor(a/cols),c=a%cols;
        for(const [dr,dc] of jumps){
          const rr=r+dr,cc=c+dc,b=rr*cols+cc;
          if(rr<0||rr>=rows||cc<0||cc>=cols)continue;
          if(!['anti_knight_anchors','anti_whisper_anchors'].includes(type)
            &&!group.has(b))continue;
          pair(a,b,test);
        }
      }
    }
  }
  return pairs;
}

export function findCombinedConstraintHint(puzzle,progress,layout,state,rules,tier=4,focus=-1){
  if(tier<2)return null;
  const total=puzzle.rows*puzzle.cols,cols=puzzle.cols;
  const {houses,domains}=layout;
  const {values,candidates:baseline}=state;
  const bound=Array.from({length:total},(_,i)=>{
    if(!visible(progress,i)||!domains[i]&&!values[i])return null;
    return values[i]?[values[i]]:baseline[i]?[...baseline[i]]:null;
  });
  const houseList=houses.filter(h=>h.cells.length>=2&&h.cells.length<=12);
  const localRules=rules.filter(r=>r.cells.every(i=>visible(progress,i)&&bound[i]));
  const relevant=localRules.filter(r=>
    ['arrow','killer','little_killer','xv','kropki','thermo','renban',
      'whisper','odd','even','clone','inequality','parity_line',
      'anti_knight_anchors','anti_kropki_black','lava'].includes(r.type));
  if(!relevant.length&&!houseList.some(h=>h.cells.length>=4))return null;
  const hasNote=i=>noteSet(progress.cells[i]);
  let invalid=false,changed=false;
  function restrict(i,supported){
    const prior=bound[i];
    if(!prior)return false;
    const keep=prior.filter(d=>supported.has(d));
    if(!keep.length){invalid=true;return false;}
    if(keep.length===prior.length)return false;
    bound[i]=keep;changed=true;return true;
  }
  // Conservative fixed-point propagation. We do not use unvalidated center
  // pencil marks as premises and do not run speculative solution search.
  const pairs=pairRules(puzzle,localRules);
  let earliestSupported=null;
  for(let pass=0;pass<8;pass++){
    changed=false;
    for(const r of localRules){
      if(r.type==='odd'||r.type==='even'){
        for(const i of r.cells)restrict(i,new Set(bound[i].filter(d=>
          r.type==='odd'?d%2===1:d%2===0)));
      }
      if(r.type==='arrow'){
        const circle=r.cells[0],shaft=r.cells.slice(1);
        const supports=shaft.map(()=>new Set()),allowCircle=new Set();
        for(const sum of bound[circle]){
          const possible=sumSupports(shaft.map(i=>bound[i]),sum);
          if(!possible)continue;
          allowCircle.add(sum);
          possible.forEach((set,j)=>set.forEach(d=>supports[j].add(d)));
        }
        if(!allowCircle.size){invalid=true;break;}
        restrict(circle,allowCircle);
        shaft.forEach((i,j)=>restrict(i,supports[j]));
      }else if((r.type==='killer'||r.type==='little_killer')&&
        Number.isInteger(r.sum)){
        const supports=sumSupports(r.cells.map(i=>bound[i]),r.sum);
        if(!supports){invalid=true;break;}
        r.cells.forEach((i,j)=>restrict(i,supports[j]));
      }
      if(invalid)break;
    }
    if(invalid)break;
    for(const p of pairs){
      if(!bound[p.a]||!bound[p.b])continue;
      const left=new Set(bound[p.a].filter(a=>bound[p.b].some(b=>p.test(a,b))));
      const right=new Set(bound[p.b].filter(b=>bound[p.a].some(a=>p.test(a,b))));
      if(!left.size||!right.size){invalid=true;break;}
      restrict(p.a,left);restrict(p.b,right);
    }
    if(invalid)break;
    // Keep the first *verified* arithmetic support snapshot before later
    // hidden singles or N-tuples solve the interesting arrow shaft. It is
    // often the short human-readable "35 + 45 = 89" aha moment.
    if(pass===0)earliestSupported=bound.map(a=>a?[...a]:null);
    for(const house of houseList){
      const open=house.cells.filter(i=>bound[i]&&bound[i].length>0);
      const seen=new Set();
      for(const i of open)if(bound[i].length===1){
        const digit=bound[i][0];
        if(seen.has(digit)){invalid=true;break;}
        seen.add(digit);
        for(const j of open)if(j!==i&&bound[j].includes(digit))
          restrict(j,new Set(bound[j].filter(d=>d!==digit)));
      }
      if(invalid)break;
      if(open.length>9)continue;
      // Hall subsets of any size, not just pairs and triples. A set of k
      // distinct cells restricted to exactly k digits reserves all k digits.
      for(let mask=1;mask<(1<<open.length)-1;mask++){
        const count=countBits(mask);
        if(count<2||count>=open.length)continue;
        const reserved=new Set();
        for(let k=0;k<open.length;k++)if(mask&(1<<k))
          for(const digit of bound[open[k]])reserved.add(digit);
        if(reserved.size!==count)continue;
        for(let k=0;k<open.length;k++)if(!(mask&(1<<k))){
          const i=open[k];
          if(bound[i].some(d=>reserved.has(d)))
            restrict(i,new Set(bound[i].filter(d=>!reserved.has(d))));
        }
        if(invalid)break;
      }
      if(invalid)break;
      // Hidden N-subsets are the dual of naked N-subsets: if N digit
      // symbols can appear only in N cells of a complete house, every
      // other candidate can be removed from those cells. N=1 is a
      // hidden single, and N can grow to the whole 9×9 house.
      if(house.n===house.cells.length&&house.n<=9&&
         house.cells.every(i=>bound[i]?.length)){
        const fixed=new Set(house.cells.filter(i=>bound[i].length===1)
          .map(i=>bound[i][0]));
        const free=digits(house.n).filter(d=>!fixed.has(d));
        const openCells=house.cells.filter(i=>bound[i].length>1);
        if(free.length<=9){
          for(let mask=1;mask<(1<<free.length);mask++){
            const selected=free.filter((_,k)=>mask&(1<<k));
            const group=new Set(selected);
            const positions=openCells.filter(i=>
              bound[i].some(d=>group.has(d)));
            if(positions.length!==selected.length||
               selected.some(d=>!positions.some(i=>bound[i].includes(d))))
              continue;
            for(const i of positions)
              restrict(i,group);
            if(invalid)break;
          }
        }
      }
      if(invalid)break;
    }
    if(invalid||!changed)break;
  }
  if(invalid)return null;
  const options=[];
  const add=(method,target,removed,sources,reason,level=2,weight=0,groupKey=null)=>{
    if(!visible(progress,target)||values[target]||!removed.length)return;
    const before=baseline[target]||digits(domains[target]||9);
    const eliminated=unique(removed.filter(d=>before.includes(d))).sort((a,b)=>a-b);
    if(!eliminated.length)return;
    const remain=before.filter(d=>!eliminated.includes(d));
    if(!remain.length)return;
    const marked=hasNote(target),highlight=marked.size&&eliminated.some(d=>marked.has(d));
    const score=(sources.includes(focus)?2200:0)+(target===focus?3000:0)+
      (highlight?2500:0)+(marked.size===0?-200:0)+weight+
      (sources.length<=4?300:0);
    options.push({score,step:{
      method,cell:target,removed:eliminated,remaining:remain,before,
      sources:unique(sources).filter(i=>i!==target&&visible(progress,i)),
      reason,level,adventure:true,forceElimination:true,
      ...(groupKey?{lockedGroupKey:groupKey,lockedDigit:eliminated[0]}:{})
    }});
  };
  // General naked N-tuples made possible by the cross-constraint narrowing.
  // We compare against the *original* domain so prior propagation does not
  // hide the useful newly proved elimination.
  for(const h of houseList){
    const open=h.cells.filter(i=>bound[i]&&!values[i]&&visible(progress,i));
    if(open.length>9||open.length<3)continue;
    for(let mask=1;mask<(1<<open.length)-1;mask++){
      const n=countBits(mask);
      if(n<2||n>=open.length)continue;
      const sources=[],union=new Set();
      for(let k=0;k<open.length;k++)if(mask&(1<<k)){
        sources.push(open[k]);
        for(const d of bound[open[k]])union.add(d);
      }
      if(union.size!==n)continue;
      const set=[...union].sort((a,b)=>a-b);
      const details=sources.map(i=>'R'+(Math.floor(i/cols)+1)+'C'+(i%cols+1)+
        '∈{'+bound[i].join('、')+'}').join('、');
      for(const i of open){
        if(sources.includes(i))continue;
        add('naked_subset',i,set,sources,
          '多轮题面约束传播后，'+h.description+'中的 '+n+
          ' 格恰好被 '+n+' 个数字 '+set.join('、')+
          ' 占满：'+details+'。其他格必须排除这些数字。',
          2,400+n*20);
      }
    }
  }
  // A sum group may guarantee a digit occurs somewhere inside its shaft
  // without fixing which cell. All common all-different houses can remove
  // that digit outside the possible-holder cells (constraint -> locked digit).
  for(const rule of localRules){
    if(!['arrow','killer','little_killer'].includes(rule.type))continue;
    const shaft=rule.type==='arrow'?rule.cells.slice(1):rule.cells;
    const circles=rule.type==='arrow'?bound[rule.cells[0]]:[rule.sum];
    const lists=shaft.map(i=>bound[i]);
    if(!circles?.length||lists.some(list=>!list?.length))continue;
    const maxSum=Math.max(...circles);
    const actual=sumsPossible(lists,maxSum);
    if(!circles.some(d=>actual.has(d)))continue; // contradictory premises
    const allDigits=new Set(lists.flat());
    for(const d of allDigits){
      const without=sumsPossible(lists,maxSum,d);
      if(circles.some(sum=>without.has(sum)))continue;
      const holders=shaft.filter(i=>bound[i].includes(d));
      if(!holders.length||holders.some(i=>values[i]===d))continue;
      const sharedHouses=houseList.filter(h=>
        holders.every(i=>h.cells.includes(i))&&h.cells.some(i=>
          !shaft.includes(i)&&!values[i]&&visible(progress,i)&&
          baseline[i]?.includes(d)));
      for(const house of sharedHouses){
        // Prefer the earliest independently established domains whenever
        // they already prove this locked digit within the very same house.
        // Never use them if the early digit might still be outside the house.
        let proofLists=lists,proofCircles=circles;
        if(earliestSupported&&rule.cells.every(i=>earliestSupported[i]?.length)){
          const earlyLists=shaft.map(i=>earliestSupported[i]);
          const earlyCircles=rule.type==='arrow'
            ?earliestSupported[rule.cells[0]]:[rule.sum];
          const possible=sumsPossible(earlyLists,Math.max(...earlyCircles));
          const withoutD=sumsPossible(earlyLists,Math.max(...earlyCircles),d);
          const earlyHolders=shaft.filter((i,j)=>earlyLists[j].includes(d));
          if(earlyCircles.some(sum=>possible.has(sum))&&
             !earlyCircles.some(sum=>withoutD.has(sum))&&
             earlyHolders.every(i=>house.cells.includes(i))){
            proofLists=earlyLists;proofCircles=earlyCircles;
          }
        }
        const label=rule.type==='arrow'?'箭头求和':'求和约束';
        const fmt=i=>'R'+(Math.floor(i/cols)+1)+'C'+(i%cols+1);
        const sourceDetails=shaft.map((i,j)=>fmt(i)+'∈{'+
          proofLists[j].join('、')+'}').join('、');
        const circleDetail=rule.type==='arrow'
          ?'，圆圈 '+fmt(rule.cells[0])+'∈{'+proofCircles.join('、')+'}'
          :'，总和为 '+rule.sum;
        // Two-shaft arrows admit a compact exhaustive list that a person
        // can read and check without any hidden solver search.
        const triples=rule.type==='arrow'&&shaft.length===2
          ?proofLists[0].flatMap(a=>proofLists[1].filter(b=>
            proofCircles.includes(a+b)).map(b=>'('+a+'，'+b+'，'+(a+b)+')'))
          :[];
        const combinationsText=triples.length>0&&triples.length<=8
          ?' 合法的（'+fmt(shaft[0])+'，'+fmt(shaft[1])+'，圆圈）组合：'+
             triples.join('、')+'。'
          :'';
        const reason=label+'要求 '+sourceDetails+circleDetail+'。'+
          combinationsText+
          '如果所有这些格都不填 '+d+'，就无法满足总和；因此至少一格必有 '+d+
          '。这些可能位置同时落在'+
          unique(sharedHouses.map(h=>h.description)).join('、')+
          '中，可以从这些行、列或宫里的其他格排除 '+d+'。';
        for(const target of house.cells){
          if(!visible(progress,target)||shaft.includes(target)||values[target])continue;
          add('constraint_locked_digit',target,[d],rule.cells,reason,3,
            900+(rule.cells.includes(focus)?2800:0),
            rule.type+':'+rule.cells.join(',')+':'+d);
        }
      }
    }
  }
  options.sort((a,b)=>b.score-a.score||
    a.step.cell-b.step.cell||a.step.method.localeCompare(b.step.method));
  const chosen=options[0]?.step;
  if(chosen?.method==='constraint_locked_digit'){
    // A locked digit proves the same elimination in *every* other visible
    // cell of the shared houses. Highlight all of them while retaining
    // one precise target for conventional keyboard/board interactions.
    chosen.affectedCells=unique(options.filter(o=>
      o.step.lockedGroupKey===chosen.lockedGroupKey)
      .map(o=>o.step.cell)).sort((a,b)=>a-b);
  }
  if(chosen){
    delete chosen.lockedGroupKey;
    delete chosen.lockedDigit;
  }
  return chosen||null;
}
