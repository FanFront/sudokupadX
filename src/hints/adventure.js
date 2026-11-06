// Conservative, read-only hint engine for overlapping adventure Sudoku maps.
// Every inference is derived from *visible* values and explicitly authored
// all-different sets and explicitly typed variants, not colors or fogged givens.
import {typedConstraints} from './constraint-data.js';
import {findCombinedConstraintHint} from './constraint-propagation.js';
import {hintImpact} from './priority.js';

const SIZES=new Set([4,6,9]);
const whole=n=>Array.from({length:n},(_,i)=>i+1);
const distinct=a=>[...new Set(a)];
function combinations(items,k){
  if(k===0)return [[]];
  if(items.length<k)return [];
  const out=[];
  for(let i=0;i<=items.length-k;i++){
    for(const tail of combinations(items.slice(i+1),k-1))out.push([items[i],...tail]);
  }
  return out;
}
const digit=(value,n=9)=>/^[1-9]$/.test(String(value??''))&&Number(value)<=n?Number(value):0;
const isVisible=(progress,i)=>progress.visible?.[i]!==false;
const noteDigits=(cell,n)=>distinct((cell?.center?.length?cell.center:cell?.corner||[])
  .map(x=>digit(x,n)).filter(Boolean));
const point=(pair,rows,cols)=>{
  if(!Array.isArray(pair)||pair.length<2)return -1;
  const [r,c]=pair;
  return Number.isInteger(r)&&Number.isInteger(c)&&r>=0&&c>=0&&r<rows&&c<cols
    ?r*cols+c:-1;
};
// The source SCL line and overlay collections contain render instructions.
// They are not a source of solver axioms. Variant rules come from typed data.
function squareSector(s,rows,cols){
  if(!SIZES.has(s?.width)||s.width!==s.height||
     ![s.top,s.left].every(Number.isInteger)||s.top<0||s.left<0||
     s.top+s.height>rows||s.left+s.width>cols)return false;
  const rules=s.rules||'';
  if(!/sudoku|数独|宫|box|row.*col/i.test(rules)||
     /fillomino|数填方|not a sudoku|无数独规则/i.test(rules))return false;
  // A 9x9 story panel describing a different-size puzzle is not proof that
  // the 9x9 rectangle has standard 9x9 row/column restrictions.
  const range=rules.match(/(?:填入|digits?|数字)[^。\n]{0,40}1\s*(?:至|到|–|-|~|through|to)\s*(\d+)/i);
  if(range&&Number(range[1])!==s.width)return false;
  return true;
}
function explicitlyClassicalNine(puzzle){
  if(puzzle.rows!==9||puzzle.cols!==9)return false;
  const description=String(puzzle.rules||'');
  if(/not a sudoku|no sudoku rules|不是.*数独|无数独规则|非数独|not standard sudoku/i.test(description))
    return false;
  // The authored phrase "ordinary/standard Sudoku" explicitly includes
  // classic row/column/box rules, even when it does not spell them out.
  if(/标准数独|普通数独|standard sudoku|classic sudoku|regular sudoku/i
      .test(description))return true;
  // SudokuMaker commonly writes "each row, column and box", with
  // "each" appearing only once. The second word is still an explicit
  // column constraint, not an inference from any drawing/color.
  const rows=/(每行|各行|each row|every row|all rows)/i.test(description);
  const columns=/(每列|各列|each column|every column|all columns)/i
    .test(description)||
    /\brows?\s*[,，、]\s*(?:and\s+)?(?:columns?|cols?)\b/i.test(description);
  return rows&&columns;
}
function hiddenRegionLayout(puzzle){
  // A number grid whose jigsaw regions are part of the *puzzle* must not
  // acquire those regions from a solved/author-private layout. Until the
  // player actually establishes the partition, only shown row/column rules
  // and separately typed clues may support a hint.
  const text=String(puzzle.rules||'');
  return /(?:区域|宫|星系)[^。\n]{0,28}(?:自行推导|待推断|未知|自行构建|自行划分)|(?:deduce|construct|unknown|hidden)[^.!\n]{0,45}(?:regions?|region boundaries|jigsaw)/i
    .test(text);
}
function gridsAndHouses(puzzle,typedRules=[]){
  const {rows,cols}=puzzle,total=rows*cols;
  const domains=Array(total).fill(0),houses=[],seen=new Set();
  const authoredRegions=hiddenRegionLayout(puzzle)?[]:puzzle.regions||[];
  const add=(indices,kind,n,description)=>{
    const members=distinct(indices.filter(i=>Number.isInteger(i)&&i>=0&&i<total));
    if(members.length<2)return;
    const key=[...members].sort((a,b)=>a-b).join(',');
    if(seen.has(key))return;
    seen.add(key);houses.push({cells:members,kind,n,description});
  };
  const sectors=(puzzle.sectors||[]).filter(s=>squareSector(s,rows,cols));
  // Standalone linked puzzles are regular 9×9 boards, not giant sectors.
  // The explicit author rule / typed declaration establishes the domain.
  // Variant-only artwork NEVER establishes full-board Sudoku restrictions.
  const classic=typedRules.some(rule=>rule.type==='classic_sudoku')||
    explicitlyClassicalNine(puzzle);
  if(classic){
    for(let i=0;i<81;i++)domains[i]=9;
    for(let r=0;r<9;r++){
      add(whole(9).map(c=>r*9+c-1),'row',9,'标准数独第 '+(r+1)+' 行');
      add(whole(9).map(c=>(c-1)*9+r),'column',9,
        '标准数独第 '+(r+1)+' 列');
    }
    const regions=authoredRegions.filter(group=>
      Array.isArray(group)&&group.length===9);
    const listed=regions.map(group=>group.map(pair=>point(pair,rows,cols)));
    const valid=listed.length===9&&listed.flat().length===81&&
      new Set(listed.flat()).size===81&&listed.flat().every(i=>i>=0);
    if(valid)listed.forEach((cells,index)=>add(cells,'box',9,
      '标准数独第 '+(index+1)+' 宫'));
    else if(/(每宫|每个宫|每个九宫格|box|3[×x]3)/i.test(puzzle.rules||'')||
      typedRules.some(rule=>rule.type==='classic_sudoku')){
      for(let r=0;r<9;r+=3)for(let c=0;c<9;c+=3)
        add(Array.from({length:9},(_,i)=>(r+Math.floor(i/3))*9+c+i%3),
          'box',9,'标准数独 3×3 宫');
    }
    sectors.push({top:0,left:0,width:9,height:9,
      title:'9×9 完整数独',rules:'标准数独'});
  }
  for(const s of (puzzle.sectors||[]).filter(s=>squareSector(s,rows,cols))){
    const n=s.width;
    for(let r=0;r<n;r++)for(let c=0;c<n;c++){
      const i=(s.top+r)*cols+s.left+c;
      domains[i]=domains[i]?Math.min(domains[i],n):n;
    }
    const title=s.title||n+'×'+n+' 数独';
    for(let i=0;i<n;i++){
      add(whole(n).map(v=>(s.top+i)*cols+s.left+v-1),'row',n,title+'第 '+(i+1)+' 行');
      add(whole(n).map(v=>(s.top+v-1)*cols+s.left+i),'column',n,title+'第 '+(i+1)+' 列');
    }
    const text=s.rules||'';
    if(!/irregular|jigsaw|不规则|无宫|no boxes|latin square/i.test(text)){
      let h=n===9?3:n===4?2:2,w=n===9?3:n===4?2:3;
      if(n===6){
        const explicit=text.match(/([23])\s*[×xX*]\s*([23])\s*(?:宫|box|region)/i);
        if(explicit&&Number(explicit[1])*Number(explicit[2])===6){
          h=Number(explicit[1]);w=Number(explicit[2]);
        }
      }
      for(let r=0;r<n;r+=h)for(let c=0;c<n;c+=w){
        add(Array.from({length:h*w},(_,j)=>
          (s.top+r+Math.floor(j/w))*cols+s.left+c+j%w),'box',n,
          title+' · '+h+'×'+w+' 宫');
      }
    }
  }
  for(const region of authoredRegions){
    if(Array.isArray(region)){
      const cells=region.map(p=>point(p,rows,cols));
      const n=SIZES.has(cells.length)?cells.length:0;
      add(cells,'region',n,'题面标示的不重复区域');
    }
  }
  for(const cage of puzzle.cages||[]){
    if(cage?.unique!==true||!Array.isArray(cage.cells))continue;
    const cells=cage.cells.map(p=>point(p,rows,cols));
    if(cells.length<=9) add(cells,'unique',0,'题面指定的不重复组');
  }
  return {domains,houses,sectors};
}
function runCandidates(puzzle,progress,houses,domains){
  const total=puzzle.rows*puzzle.cols;
  const values=Array(total).fill(0),candidates=Array(total).fill(null),peers=Array.from({length:total},()=>[]);
  for(let i=0;i<total;i++){
    if(isVisible(progress,i)){
      values[i]=digit(puzzle.cells[i]?.given??progress.cells[i]?.value,9);
    }
    if(domains[i]&&values[i]===0)candidates[i]=whole(domains[i]);
  }
  for(const house of houses){
    for(const i of house.cells){
      if(values[i])continue;
      for(const j of house.cells){
        if(i!==j&&values[j]&&isVisible(progress,j)){
          peers[i].push({digit:values[j],source:j,house});
        }
      }
    }
  }
  for(let i=0;i<total;i++)if(candidates[i]){
    const excluded=new Set(peers[i].map(p=>p.digit));
    candidates[i]=candidates[i].filter(d=>!excluded.has(d));
    if(!candidates[i].length)candidates[i]=null;
  }
  return {values,candidates,peers};
}
function score(step,notes,focus,tier,variant=false){
  if(step.level>tier)return -Infinity;
  const marked=notes[step.cell]||[];
  const impact=hintImpact(step,marked);
  if(!impact.rank)return -Infinity;
  // Impact category dominates focus, note presence, method and technique level.
  let points=impact.rank*100000+impact.count*1800;
  // An unmarked empty cell may have many theoretical exclusions from 1..9.
  // These are not actual player progress: prefer a proved deletion from a
  // written candidate (including advanced variant rules) instead. Keep such
  // unmarked hints only as a fallback for players who do not use notes.
  if(!marked.length&&impact.rank!==3)points-=400000;
  if(marked.length)points+=150;
  if(variant)points+=160;
  if(step.cell===focus)points+=400;
  else if(focus>=0)points+=Math.max(0,90-Math.abs(step.cell-focus));
  return points-step.level*7;
}
function chooseStep(puzzle,progress,domains,houses,sectors,state,tier,focus){
  const {rows,cols}=puzzle,total=rows*cols,{values,candidates,peers}=state;
  const notes=Array.from({length:total},(_,i)=>noteDigits(progress.cells[i],domains[i]||9));
  const options=[];
  const add=(method,cell,removed,remaining,sources,reason,level=1,variant=false,beforeOverride=null)=>{
    if(!isVisible(progress,cell)||values[cell]||!removed.length)return;
    const original=beforeOverride||candidates[cell]||whole(domains[cell]||9);
    const allowed=remaining||original.filter(d=>!removed.includes(d));
    if(!allowed.length)return;
    const step={method,cell,removed:distinct(removed),remaining:allowed,
      before:original,sources:distinct(sources.filter(i=>i>=0&&isVisible(progress,i))),
      reason,level,adventure:true,forceElimination:!domains[cell]};
    const rank=score(step,notes,focus,tier,variant);
    if(Number.isFinite(rank))options.push({step,rank});
  };
  // A candidate already excluded by a visible digit is not a useful hint
  // unless the player still has that digit in their notes.
  for(let i=0;i<total;i++)if(isVisible(progress,i)&&!values[i]){
    const known=peers[i];
    const initial=whole(domains[i]||9);
    const unique=distinct(known.map(p=>p.digit)).filter(d=>initial.includes(d));
    if(unique.length){
      // These exclusions all follow independently from visible fixed digits.
      // Offer one actionable batch instead of repeating a one-digit hint.
      const witnesses=unique.map(d=>known.find(p=>p.digit===d));
      add(witnesses.every(p=>p.house.kind==='magic')?'magic_square':'peer_elimination',
        i,unique,initial.filter(v=>!unique.includes(v)),
        witnesses.map(p=>p.source),
        '目标格所在已验证不重复组中已填入 '+unique.join('、')+
        '，因此这些数字都不能再填入目标格。',1,
        witnesses.some(p=>p.house.kind==='magic'),initial);
    }
    if(candidates[i]?.length===1){
      const d=candidates[i][0];
      add('naked_single',i,initial.filter(v=>v!==d),[d],
        known.filter(p=>p.digit!==d).map(p=>p.source),
        '根据目标格所在各行、列和宫（或其他不重复组）内已知数字的排除，唯一剩下的候选数是 '+d+'。',1,false,initial);
    }
  }
  const completeHouses=houses.filter(h=>h.n&&h.cells.length===h.n);
  for(const house of completeHouses){
    for(const d of whole(house.n)){
      if(house.cells.some(i=>values[i]===d))continue;
      const places=house.cells.filter(i=>values[i]===0&&
        candidates[i]?.includes(d));
      if(places.length!==1)continue;
      const i=places[0];
      if(!isVisible(progress,i))continue;
      const original=candidates[i]||[];
      if(original.length<=1)continue;
      add('hidden_single',i,original.filter(v=>v!==d),[d],
        house.cells.filter(j=>j!==i&&values[j]>0),
        house.description+'中只有目标格还能填写 '+d+'。',1);
    }
  }
  if(tier>=2){
    // Level 2: candidate-set arguments are computed from the full set of
    // admissible digits, not from untrusted handwritten notes.
    for(const house of completeHouses){
      const open=house.cells.filter(i=>!values[i]&&candidates[i]?.length>1);
      for(let count=2;count<Math.min(9,open.length);count++){
        for(const subset of combinations(open.filter(i=>isVisible(progress,i)),count)){
          const union=distinct(subset.flatMap(i=>candidates[i]));
          if(union.length!==count)continue;
          for(const target of open){
            if(subset.includes(target)||!isVisible(progress,target))continue;
            const before=candidates[target],remaining=before.filter(d=>!union.includes(d));
            if(remaining.length===before.length)continue;
            add('naked_subset',target,before.filter(d=>union.includes(d)),
              remaining,subset,house.description+'中这 '+count+' 格的候选数恰好只有 '+
              union.join('、')+'，这些数不能再出现在该组其他格。',2,true);
          }
        }
        // Hidden pairs/triples: precisely count where the selected digits
        // can appear within one complete row, column or box.
        const available=whole(house.n).filter(d=>
          !house.cells.some(i=>values[i]===d));
        for(const ds of combinations(available,count)){
          const places=house.cells.filter(i=>!values[i]&&
            candidates[i]?.some(v=>ds.includes(v)));
          if(places.length!==count||
             ds.some(d=>!places.some(i=>candidates[i]?.includes(d)))||
             places.some(i=>!isVisible(progress,i)))continue;
          for(const target of places){
            const before=candidates[target],remaining=before.filter(d=>ds.includes(d));
            if(remaining.length===before.length)continue;
            add('hidden_subset',target,before.filter(d=>!ds.includes(d)),
              remaining,places.filter(i=>i!==target),
              house.description+'中数字 '+ds.join('、')+' 只会出现在这些格，因此可排除其他候选。',2,true);
          }
        }
      }
    }
    // Index memberships first so a giant adventure map does not compare
    // every house with hundreds of unrelated distant houses.
    const houseMembership=Array.from({length:total},()=>[]);
    completeHouses.forEach((h,j)=>h.cells.forEach(i=>houseMembership[i].push(j)));
    // Locked candidates across intersecting complete houses. The covered
    // region must contain ALL positions of a digit in the source house.
    for(let a=0;a<completeHouses.length;a++){
      const from=completeHouses[a];
      const touching=distinct(from.cells.flatMap(i=>houseMembership[i]));
      for(const b of touching){
        if(a===b)continue;
        const dest=completeHouses[b],shared=from.cells.filter(i=>dest.cells.includes(i));
        if(shared.length<2||shared.length===from.cells.length)continue;
        for(const d of whole(Math.min(from.n,dest.n))){
          if(from.cells.some(i=>values[i]===d))continue;
          const sources=from.cells.filter(i=>candidates[i]?.includes(d));
          if(sources.length<2||sources.some(i=>!shared.includes(i)||!isVisible(progress,i)))
            continue;
          for(const target of dest.cells){
            if(shared.includes(target)||!candidates[target]?.includes(d)||
               !isVisible(progress,target))continue;
            add('locked_candidate',target,[d],
              candidates[target].filter(x=>x!==d),sources,
              from.description+'中的 '+d+' 只在与'+dest.description+
              '的交集中出现，因而可从交集外排除 '+d+'。',2,true);
          }
        }
      }
    }
  }
  if(tier>=3){
    // Fish are scoped to one explicit 9×9 Sudoku grid. Never form a fish
    // across physically separate grids that merely share global coordinates.
    for(const s of sectors){
      if(s.width!==9)continue;
      for(let axis=0;axis<2;axis++)for(let d=1;d<=9;d++){
        const lines=Array.from({length:9},(_,r)=>Array.from({length:9},(_,c)=>
          axis===0?(s.top+r)*cols+s.left+c:(s.top+c)*cols+s.left+r));
        const locations=lines.map(line=>line.filter(i=>candidates[i]?.includes(d)));
        for(let size=2;size<=Math.min(tier>=4?4:3,4);size++){
          const eligible=whole(9).map(x=>x-1).filter(i=>
            locations[i].length>=2&&locations[i].length<=size&&
            locations[i].every(j=>isVisible(progress,j)));
          for(const base of combinations(eligible,size)){
            const cover=distinct(base.flatMap(i=>locations[i].map(j=>axis===0?
              j%cols-s.left:Math.floor(j/cols)-s.top)));
            if(cover.length!==size)continue;
            const method=['','', 'x_wing','swordfish','jellyfish'][size];
            const level=size===4?4:3,sources=base.flatMap(i=>locations[i]);
            for(let line=0;line<9;line++){
              if(base.includes(line))continue;
              for(const c of cover){
                const target=lines[line][c];
                if(!candidates[target]?.includes(d)||!isVisible(progress,target))continue;
                add(method,target,[d],candidates[target].filter(x=>x!==d),
                  sources,'在此 9×9 数独内，'+size+' 条行或列把 '+d+
                  ' 限制在相同的 '+size+' 条交叉单位中，其他位置不能再填 '+d+'。',level,true);
              }
            }
          }
        }
      }
    }
  }
  function relation(a,b,method,test,description){
    if(!isVisible(progress,a)||!isVisible(progress,b))return;
    // A neighboring cell without a proven 1..N domain must not be
    // constrained by player pencil notes. At least one side needs a
    // grounded domain or a visible placed digit to establish an exclusion.
    if(!domains[a]&&!domains[b]&&!values[a]&&!values[b])return;
    const ca=values[a]?[values[a]]:(candidates[a]||whole(domains[a]||9));
    const cb=values[b]?[values[b]]:(candidates[b]||whole(domains[b]||9));
    if(!ca.length||!cb.length)return;
    const keepA=ca.filter(x=>cb.some(y=>test(x,y)));
    const keepB=cb.filter(y=>ca.some(x=>test(x,y)));
    if(!keepA.length||!keepB.length)return;
    if(!values[a])add(method,a,ca.filter(v=>!keepA.includes(v)),keepA,[b],description,1,true);
    if(!values[b])add(method,b,cb.filter(v=>!keepB.includes(v)),keepB,[a],description,1,true);
  }
  // Exact sum support via prefix/suffix dynamic programming. Unlike
  // 9^N tuple enumeration this remains inexpensive for 9-cell diagonals,
  // large cages and sandwich interiors. Relaxing all-different only makes
  // the result conservative (never a false elimination).
  function sumSupports(indices,goal,forceFirst=null){
    if(indices.some(i=>!isVisible(progress,i)))return null;
    const lists=indices.map((cell,k)=>{
      const found=values[cell]?[values[cell]]:
        candidates[cell]||whole(domains[cell]||9);
      return k===0&&forceFirst!==null?found.filter(d=>d===forceFirst):found;
    });
    if(lists.some(list=>list.length===0))return null;
    const n=lists.length,prefix=[new Set([0])],suffix=Array(n+1);
    for(let k=0;k<n;k++){
      const next=new Set();
      for(const sum of prefix[k])for(const d of lists[k])
        if(sum+d<=goal)next.add(sum+d);
      prefix.push(next);
    }
    if(!prefix[n].has(goal))return null;
    suffix[n]=new Set([0]);
    for(let k=n-1;k>=0;k--){
      const next=new Set();
      for(const sum of suffix[k+1])for(const d of lists[k])
        if(sum+d<=goal)next.add(sum+d);
      suffix[k]=next;
    }
    return lists.map((list,k)=>new Set(list.filter(d=>
      [...prefix[k]].some(left=>suffix[k+1].has(goal-left-d)))));
  }
  function proveSum(indices,goal,method,reason){
    const supported=sumSupports(indices,goal);
    if(!supported)return;
    for(let j=0;j<indices.length;j++){
      const cell=indices[j],before=candidates[cell];
      if(!before)continue;
      const keep=before.filter(d=>supported[j].has(d));
      add(method,cell,before.filter(d=>!keep.includes(d)),keep,
        indices.filter(i=>i!==cell),reason,2,true);
    }
  }
  // Type, cell sequence, numeric values and optional fog unlock conditions
  // are all taken directly from authored constraint records. In particular,
  // no line, dot or cage becomes a rule because of its display color.
  const constraints=[];
  for(const rule of typedConstraints(puzzle,progress)){
    const {cells,type}=rule;
    // Direct two-cell relations and regional neighbor rules are handled
    // without brute-force search. Each elimination has a concrete witness
    // and never assumes invisible digits or a guessed visual rule.
    if(['palindrome','parity_line','prime_sum','reverse_whisper'].includes(type)){
      for(let j=0;j<Math.floor((type==='palindrome'?cells.length:0)/2);j++)
        relation(cells[j],cells[cells.length-1-j],'palindrome',
          (x,y)=>x===y,'回文线以中心对称的两格必须填写相同数字。');
      if(type!=='palindrome')for(let j=1;j<cells.length;j++){
        const relationTest=type==='parity_line'
          ?(x,y)=>(x%2)!==(y%2)
          :type==='prime_sum'
            ?(x,y)=>[2,3,5,7,11,13,17].includes(x+y)
            :(x,y)=>Math.abs(x-y)<5;
        const description=type==='parity_line'
          ?'奇偶线相邻数字必须一奇一偶。'
          :type==='prime_sum'?'相邻数字之和必须是质数。'
            :'反低语线相邻数字的差必须小于 5。';
        relation(cells[j-1],cells[j],type,relationTest,description);
      }
      continue;
    }
    if(type==='odd'||type==='even'){
      for(const cell of cells){
        if(values[cell]||!isVisible(progress,cell))continue;
        const before=candidates[cell]||whole(domains[cell]||9);
        const keep=before.filter(d=>type==='odd'?d%2===1:d%2===0);
        add(type,cell,before.filter(d=>!keep.includes(d)),keep,[],
          type==='odd'?'题目明确将此格标记为奇数。':
            '题目明确将此格标记为偶数。',1,true);
      }
      continue;
    }
    if(type==='inequality'){
      relation(cells[0],cells[1],type,(x,y)=>x<y,
        '结构化不等号指定第一个格的数字严格小于第二个格。');
      continue;
    }
    if(type==='clone'){
      const groups=rule.groups;
      for(let k=0;k<groups[0].length;k++)for(let j=1;j<groups.length;j++)
        relation(groups[0][k],groups[j][k],type,(a,b)=>a===b,
          '克隆区域中相同位置的数字必须完全相同。');
      continue;
    }
    if(type==='indexing_rows'){
      // Row-based column indexing: at RrCc digit X implies RrCX=C.
      // The marked rule is global and should never be inferred from the
      // displayed book illustration alone.
      for(let row=0;row<9;row++)for(let col=0;col<9;col++){
        const witness=row*9+col;
        if(!isVisible(progress,witness)||!values[witness])continue;
        const target=row*9+values[witness]-1,digitNeeded=col+1;
        if(!isVisible(progress,target)||values[target])continue;
        const before=candidates[target]||whole(9);
        if(!before.includes(digitNeeded))continue;
        add(type,target,before.filter(d=>d!==digitNeeded),
          [digitNeeded],[witness],
          '同行的 '+(col+1)+' 列填了 '+values[witness]+
          '，因此该行第 '+values[witness]+' 列必须填 '+(col+1)+'。',
          2,true);
      }
      continue;
    }
    if(type==='ambiguous_thermo'){
      // A damaged thermometer can point either way, but must still be
      // strictly monotonic in one entire direction, not switch mid-line.
      const lists=cells.map(i=>values[i]?[values[i]]:
        candidates[i]||whole(domains[i]||9));
      if(cells.some(i=>!isVisible(progress,i))||
         lists.some(list=>list.length===0))continue;
      const supported=cells.map(()=>new Set()),assign=[];
      let valid=false;
      const walk=(k,ascending)=>{
        if(k===cells.length){
          valid=true;
          assign.forEach((d,j)=>supported[j].add(d));
          return;
        }
        for(const d of lists[k]){
          if(k>0&&(ascending?d<=assign[k-1]:d>=assign[k-1]))continue;
          assign.push(d);walk(k+1,ascending);assign.pop();
        }
      };
      walk(0,true);walk(0,false);
      if(!valid)continue;
      for(let j=0;j<cells.length;j++){
        const cell=cells[j],before=candidates[cell];
        if(!before)continue;
        const keep=before.filter(d=>supported[j].has(d));
        add(type,cell,before.filter(d=>!keep.includes(d)),keep,
          cells.filter(i=>i!==cell),
          '破损温度计的圆头虽然未知，但整条线必须沿某一个方向严格递增。两种方向都不允许的候选数可以排除。',
          2,true);
      }
      continue;
    }
    if(type==='classic_sudoku')continue;
    if(type==='anti_kropki_black'||type==='anti_whisper_anchors'){
      const anchors=type==='anti_kropki_black'?cells:cells;
      const group=new Set(cells);
      for(const a of anchors){
        const r=Math.floor(a/cols),c=a%cols;
        const adjacent=type==='anti_kropki_black'?
          [[1,0],[0,1]]:[[1,0],[-1,0],[0,1],[0,-1]];
        for(const [dr,dc] of adjacent){
          const rr=r+dr,cc=c+dc;
          if(rr<0||rr>=rows||cc<0||cc>=cols)continue;
          const b=rr*cols+cc;
          if(type==='anti_kropki_black'&&!group.has(b))continue;
          relation(a,b,type,type==='anti_kropki_black'
            ?(x,y)=>Math.max(x,y)!==2*Math.min(x,y)
            :(x,y)=>Math.abs(x-y)<5,
            type==='anti_kropki_black'
              ?'反黑点规则：任意正交相邻两格的数字不能成 2:1 倍数关系。'
              :'灰色格与任一正交邻格的数字差不能达到 5。');
        }
      }
      continue;
    }
    if(type==='anti_knight_anchors'){
      // Only marked alien/enemy cells are anchors. Every surrounding
      // chess-knight neighbor, whether or not also marked, is constrained.
      const jumps=[[1,2],[1,-2],[-1,2],[-1,-2],
        [2,1],[2,-1],[-2,1],[-2,-1]];
      for(const a of cells){
        const r=Math.floor(a/cols),c=a%cols;
        for(const [dr,dc] of jumps){
          const nr=r+dr,nc=c+dc;
          if(nr<0||nr>=rows||nc<0||nc>=cols)continue;
          relation(a,nr*cols+nc,'anti_knight_anchors',(x,y)=>x!==y,
            '蓝色敌人格不能与马步距离的任意邻格填入相同数字。');
        }
      }
      continue;
    }
    if(['anti_king','anti_knight','anti_xv','lava'].includes(type)){
      const group=new Set(cells),required=type;
      for(const a of cells){
        const r=Math.floor(a/cols),c=a%cols;
        const offsets=required==='anti_knight'
          ?[[1,2],[1,-2],[2,1],[2,-1]]
          :required==='anti_king'
            ?[[1,1],[1,-1]]
            :[[0,1],[1,0]];
        for(const [dr,dc] of offsets){
          const nr=r+dr,nc=c+dc;
          if(nr<0||nc<0||nr>=rows||nc>=cols)continue;
          const b=nr*cols+nc;
          if(!group.has(b))continue;
          if(required==='anti_xv')
            relation(a,b,type,(x,y)=>x+y!==5&&x+y!==10,
              '反 XV 区域中的正交相邻格数字和不能为 5 或 10。');
          else if(required==='lava')
            relation(a,b,type,(x,y)=>Math.abs(x-y)>=2,
              '相邻岩浆格的数字差至少为 2。');
          else
            relation(a,b,type,(x,y)=>x!==y,
              required==='anti_knight'
                ?'反马规则：马步相邻的两个格子不能有相同数字。'
                :'反王规则：对角相邻格不能有相同数字。');
        }
      }
      continue;
    }
    if(type==='shadow_lower'||type==='greater_neighbors'){
      for(let j=1;j<cells.length;j++){
        const smaller=type==='shadow_lower';
        relation(cells[0],cells[j],type,(x,y)=>smaller?x<y:x>y,
          smaller?'暗格数字必须小于指定的相邻普通格数字。'
            :'高值格数字必须大于指定的相邻格数字。');
      }
      continue;
    }
    if(type==='zipline'){
      const mid=Math.floor(cells.length/2);
      for(let j=0;j<mid;j++){
        const triple=[cells[mid],cells[j],cells[cells.length-1-j]];
        if(triple.every(i=>values[i]||candidates[i]?.length))
          constraints.push({method:'zipline',cells:triple,unique:false,
            check:arr=>arr[0]===arr[1]+arr[2],
            reason:'拉链线中距中心等远的两格数字之和等于中心格数字。'});
      }
      continue;
    }
    if(type==='magic_square'){
      // A normal 3×3 magic square contains digits 1..9 exactly once;
      // each row, column and both diagonals sum to 15.
      for(let i=0;i<cells.length;i++)for(let j=i+1;j<cells.length;j++)
        relation(cells[i],cells[j],type,(a,b)=>a!==b,
          '魔方阵中 1 至 9 各出现一次，两个格不能重复。');
      const groups=[];
      for(let i=0;i<3;i++){
        groups.push([cells[i*3],cells[i*3+1],cells[i*3+2]]);
        groups.push([cells[i],cells[3+i],cells[6+i]]);
      }
      groups.push([cells[0],cells[4],cells[8]],
        [cells[2],cells[4],cells[6]]);
      for(const triple of groups)if(triple.every(i=>values[i]||candidates[i]?.length))
        constraints.push({method:'magic_square',cells:triple,unique:true,goal:15,
          check:arr=>arr.reduce((a,b)=>a+b,0)===15,
          reason:'魔方阵的每行、每列和两条主对角线的数字之和都是 15。'});
      continue;
    }
    if(type==='crystal_cage'){
      for(const group of rule.groups){
        if(group.length<2||group.length>5||
           group.some(i=>!isVisible(progress,i)))continue;
        const missing=group.filter(i=>!values[i]);
        // Wall cells need not belong to a classic Sudoku domain. If every
        // other cell in one crystal row/column is known, the last *positive*
        // candidate can still be checked without assuming blank=impossible.
        if(missing.length===1){
          const target=missing[0];
          const needed=rule.sum-group.filter(i=>i!==target)
            .reduce((sum,i)=>sum+values[i],0);
          if(needed>=1&&needed<=9)
            add('crystal_cage',target,whole(9).filter(x=>x!==needed),
              [needed],group.filter(i=>i!==target),
              '晶体笼这一行或列总和为 '+rule.sum+
              '，减去已填数字后，这格只可能是 '+needed+'。',1,true);
        }
        if(group.some(i=>!values[i]&&!candidates[i]))continue;
        constraints.push({method:'crystal_cage',cells:group,unique:false,
          goal:rule.sum,
          check:arr=>arr.reduce((a,b)=>a+b,0)===rule.sum,
          reason:'晶体笼每条指定的行或列数字之和必须为 '+rule.sum+'。'});
      }
      continue;
    }
    if(type==='renban'){
      if(cells.length>9||cells.some(i=>!isVisible(progress,i)))continue;
      const lists=cells.map(i=>values[i]?[values[i]]:
        candidates[i]||whole(domains[i]||9));
      const m=cells.length,maximum=Math.max(...cells.map(i=>domains[i]||9));
      if(m>maximum||lists.some(list=>!list.length))continue;
      const supported=lists.map(()=>new Set()),seenIntervals=[];
      function matching(start,forcedAt=-1,forcedDigit=0){
        const allowed=lists.map((list,i)=>list.filter(d=>
          d>=start&&d<start+m&&
          (i!==forcedAt||d===forcedDigit)));
        if(allowed.some(a=>!a.length))return false;
        const owner=Array(maximum+1).fill(-1);
        const visit=(i,visited)=>{
          for(const d of allowed[i]){
            if(visited.has(d))continue;
            visited.add(d);
            if(owner[d]<0||visit(owner[d],visited)){
              owner[d]=i;return true;
            }
          }
          return false;
        };
        return allowed.every((_,i)=>visit(i,new Set()));
      }
      for(let first=1;first+m-1<=maximum;first++){
        if(matching(first))seenIntervals.push(first);
      }
      if(!seenIntervals.length)continue;
      for(let j=0;j<m;j++)for(const d of lists[j]){
        if(seenIntervals.some(start=>matching(start,j,d)))
          supported[j].add(d);
      }
      for(let j=0;j<m;j++){
        const cell=cells[j],prior=candidates[cell];
        if(!prior)continue;
        const keep=prior.filter(d=>supported[j].has(d));
        add(type,cell,prior.filter(d=>!keep.includes(d)),keep,
          cells.filter(i=>i!==cell),
          '连续线中所有数字必须恰好构成一段互不重复的连续整数，排除无法参与任何完整匹配的候选数。',
          2,true);
      }
      continue;
    }
    if(type==='little_killer'){
      proveSum(cells,rule.sum,type,
        '小杀手斜线上全部数字之和等于 '+rule.sum+'；对角线允许重复数字。');
      continue;
    }
    if(type==='x_sums'){
      const lead=cells[0],before=values[lead]?[values[lead]]:
        candidates[lead]||whole(domains[lead]||9);
      const possible=before.filter(n=>sumSupports(cells.slice(0,n),rule.sum,n));
      if(!values[lead])
        add(type,lead,before.filter(d=>!possible.includes(d)),possible,
          cells.slice(1).filter(i=>isVisible(progress,i)),
          '从提示所在边向内数前 N 格的和为 '+rule.sum+
          '，其中 N 就是首格的数字。',2,true);
      else if(possible.length){
        const n=values[lead];
        proveSum(cells.slice(0,n),rule.sum,type,
          '本行或列的首格是 '+n+'，因此靠近外侧的前 '+n+
          ' 格数字之和等于 '+rule.sum+'。');
      }
      continue;
    }
    if(type==='sandwich'){
      if(cells.some(i=>!isVisible(progress,i)))continue;
      const left=cells.findIndex(i=>values[i]===1);
      const right=cells.findIndex(i=>values[i]===9);
      if(left<0||right<0||left===right)continue;
      const interior=cells.slice(Math.min(left,right)+1,Math.max(left,right));
      if(interior.length){
        proveSum(interior,rule.sum,type,
          '两端数字 1 和 9 已确定，其间格子的数字之和等于 '+rule.sum+'。');
      }
      continue;
    }
    if(type==='skyscraper'){
      // True skyline visibility is counted only when all nine distinct
      // numbers form a proven row/column house. Search permutations in a
      // bounded worker; an unfinished search never licenses elimination.
      if(cells.length!==9||cells.some(i=>!isVisible(progress,i))||
         !houses.some(h=>h.n===9&&h.cells.length===9&&
           cells.every(i=>h.cells.includes(i))))continue;
      const lists=cells.map(i=>values[i]?[values[i]]:candidates[i]||[]);
      if(lists.some(list=>!list.length))continue;
      const seenDigits=Array(9).fill(0),assign=[],supports=cells.map(()=>new Set());
      let remainingBudget=500000,aborted=false,valid=false;
      const walk=(k,tallest,seenCount)=>{
        if(--remainingBudget<0){aborted=true;return;}
        // Only heights strictly above the tallest building can create
        // another visible building, even if all remaining cells are free.
        if(seenCount>rule.count||
           seenCount+Math.min(9-k,9-tallest)<rule.count)return;
        if(k===9){
          if(seenCount===rule.count){
            valid=true;
            assign.forEach((d,j)=>supports[j].add(d));
          }
          return;
        }
        for(const d of lists[k]){
          if(seenDigits[d])continue;
          seenDigits[d]=1;assign.push(d);
          walk(k+1,Math.max(tallest,d),seenCount+(d>tallest?1:0));
          assign.pop();seenDigits[d]=0;
          if(aborted)return;
        }
      };
      walk(0,0,0);
      if(aborted||!valid)continue;
      for(let k=0;k<9;k++){
        const cell=cells[k],before=candidates[cell];
        if(!before)continue;
        const keep=before.filter(d=>supports[k].has(d));
        add(type,cell,before.filter(d=>!keep.includes(d)),keep,
          cells.filter(i=>i!==cell),
          '从题目箭头方向看去，只有 '+rule.count+
          ' 栋楼可见；高数字会遮挡后方较小的数字。',3,true);
      }
      continue;
    }
    if(type==='arrow'){
      // An arrow has one circle digit and any number of shaft digits. Every
      // full-shaft sum is supported by exact DP, not by a 5-cell cutoff.
      const circle=cells[0],shaft=cells.slice(1);
      if(cells.some(i=>!isVisible(progress,i)))continue;
      const possibleCircle=values[circle]?[values[circle]]:
        candidates[circle]||whole(domains[circle]||9);
      const circleKeep=new Set(),shaftKeep=shaft.map(()=>new Set());
      for(const n of possibleCircle){
        const support=sumSupports(shaft,n);
        if(!support)continue;
        circleKeep.add(n);
        support.forEach((set,j)=>set.forEach(d=>shaftKeep[j].add(d)));
      }
      if(!circleKeep.size||shaftKeep.some(set=>set.size===0))continue;
      const explanation='圆圈中的数字必须等于整条箭杆上数字之和；'+
        '排除不能被另一侧剩余数字组合支持的候选。';
      const before=candidates[circle];
      if(before){
        const keep=before.filter(d=>circleKeep.has(d));
        add(type,circle,before.filter(d=>!keep.includes(d)),keep,
          shaft,explanation,1,true);
      }
      for(let j=0;j<shaft.length;j++){
        const cell=shaft[j],prior=candidates[cell];
        if(!prior)continue;
        const keep=prior.filter(d=>shaftKeep[j].has(d));
        add(type,cell,prior.filter(d=>!keep.includes(d)),keep,
          cells.filter(i=>i!==cell),explanation,1,true);
      }
      continue;
    }
    if(type==='killer'&&cells.length>5){
      proveSum(cells,rule.sum,'killer_sum',
        '该杀手笼内数字之和等于 '+rule.sum+
        '；在所有可能的和中都不存在的候选可排除。');
      continue;
    }
    if(type==='kropki'){
      const [a,b]=cells;
      if(rule.dot==='white')
        relation(a,b,'kropki',(x,y)=>Math.abs(x-y)===1,
          '白点两端必须相差 1。');
      else
        relation(a,b,'kropki',(x,y)=>Math.max(x,y)===2*Math.min(x,y),
          '黑点两端的数字必须为 1:2。');
      continue;
    }
    if(type==='xv'){
      const [a,b]=cells,sum=rule.sum;
      relation(a,b,'xv',(x,y)=>x+y===sum,
        '题目指定这两格的数字之和为 '+sum+'。');
      continue;
    }
    if(type==='whisper'||type==='thermo'||type==='reverse_thermo'){
      for(let j=1;j<cells.length;j++){
        if(type==='whisper')
          relation(cells[j-1],cells[j],'whisper',
            (x,y)=>Math.abs(x-y)>=5,
            '低语线相邻两格的数字相差至少 5。');
        else if(type==='thermo')
          relation(cells[j-1],cells[j],'thermo',(x,y)=>x<y,
            '已注明的温度计从圆头开始严格递增。');
        else
          relation(cells[j-1],cells[j],'reverse_thermo',(x,y)=>x>y,
            '已标注的热风口线从圆头开始严格递减。');
      }
      continue;
    }
    if(cells.length>5)continue; // Finite local proof budget for large maps.
    const eligible=cells.every(i=>values[i]||candidates[i]?.length);
    if(!eligible)continue;
    if(type==='killer'){
      const goal=rule.sum;
      constraints.push({method:'killer_sum',cells,unique:rule.unique,goal,
        check:arr=>arr.reduce((a,b)=>a+b,0)===goal,
        reason:'明确标注的杀手笼总和是 '+goal+
          (rule.unique?'，各格数字不能重复。':'。')});
    }else if(type==='renban'){
      constraints.push({method:'renban',cells,unique:true,
        check:arr=>Math.max(...arr)-Math.min(...arr)===arr.length-1,
        reason:'连续数线的数字是一组互不重复的连续整数。'});
    }else if(type==='between'&&cells.length>=3){
      constraints.push({method:'between',cells,unique:false,
        check:arr=>{
          const low=Math.min(arr[0],arr[arr.length-1]);
          const high=Math.max(arr[0],arr[arr.length-1]);
          return arr.slice(1,-1).every(x=>x>low&&x<high);
        },
        reason:'夹心线中间的数字必须介于两个端点之间。'});
    }else if(type==='arrow'&&cells.length>=3){
      constraints.push({method:'arrow',cells,unique:false,
        check:arr=>arr[0]===arr.slice(1).reduce((sum,x)=>sum+x,0),
        reason:'箭头圆圈的数字等于箭杆数字之和。'});
    }else if(type==='region_sum'){
      const indices=rule.segments.map(group=>group.map(i=>cells.indexOf(i)));
      constraints.push({method:'region_sum',cells,unique:false,
        check:arr=>{
          const sums=indices.map(group=>group.reduce((sum,i)=>sum+arr[i],0));
          return sums.every(s=>s===sums[0]);
        },reason:'结构化区域和线注明各段数字的总和相同。'});
    }else if(type==='entropic'||type==='modular'){
      const n=domains[cells[0]];
      if(!n||cells.some(i=>domains[i]!==n)||n%3!==0||cells.length<3)continue;
      for(let j=0;j+2<cells.length;j++){
        const segment=cells.slice(j,j+3);
        const group=type==='entropic'
          ?d=>Math.floor((d-1)/(n/3))
          :d=>(d-1)%3;
        constraints.push({method:type,cells:segment,unique:false,
          check:arr=>new Set(arr.map(group)).size===3,
          reason:type==='entropic'
            ?'熵线连续三格分别来自三个不同数字区间。'
            :'模三线连续三格对 3 的余数互不相同。'});
      }
    }
  }
  // Tiny arithmetic/sequence constraints are exhaustively enumerated, but
  // only to generate *supported candidates*, never a speculative solution.
  for(const rule of constraints){
    const {cells}=rule,poss=cells.map(i=>values[i]?[values[i]]:candidates[i]||[]);
    if(poss.some(x=>!x.length))continue;
    let budget=30000,stopped=false;
    const supported=cells.map(()=>new Set()),assign=[];
    const walk=k=>{
      if(--budget<0){stopped=true;return;}
      if(k===cells.length){
        if(rule.check(assign))for(let j=0;j<cells.length;j++)supported[j].add(assign[j]);
        return;
      }
      for(const d of poss[k]){
        if(rule.unique&&assign.includes(d))continue;
        if(rule.goal!==undefined&&assign.reduce((a,b)=>a+b,0)+d>rule.goal)continue;
        assign.push(d);walk(k+1);assign.pop();
        if(stopped)return;
      }
    };
    walk(0);
    if(stopped||supported.some(s=>s.size===0))continue;
    for(let j=0;j<cells.length;j++){
      const i=cells[j],original=candidates[i];
      if(!original)continue;
      const keep=original.filter(d=>supported[j].has(d));
      add(rule.method,i,original.filter(d=>!keep.includes(d)),keep,
        cells.filter(x=>x!==i),rule.reason,1,true);
    }
  }
  // Select a reproducible first proof; no guess/exhaustive solution search.
  options.sort((a,b)=>b.rank-a.rank||a.step.level-b.step.level||a.step.cell-b.step.cell);
  return options[0]?.step||null;
}
export function nextAdventureHint(puzzle,progress,tier=4,focus=-1){
  const rows=puzzle?.rows,cols=puzzle?.cols;
  if(!Number.isInteger(rows)||!Number.isInteger(cols)||!Array.isArray(puzzle.cells)||
     !Array.isArray(progress?.cells)||rows*cols!==puzzle.cells.length||
     rows*cols!==progress.cells.length||rows>160||cols>160||
     !Number.isInteger(tier)||tier<1||tier>5){
    return {status:'unsupported',level:0,step:null};
  }
  const activeRules=typedConstraints(puzzle,progress);
  const {domains,houses,sectors}=gridsAndHouses(puzzle,activeRules);
  // The 3×3 magic square in Super Sudokoid is a *separate* digit system,
  // not a Sudoku sector: its author explicitly requires digits 1..9 once.
  // Build that domain from the typed rule rather than visual 3×3 artwork.
  for(const rule of activeRules)if(rule.type==='magic_square'){
    for(const i of rule.cells)domains[i]=Math.max(domains[i],9);
    houses.push({cells:rule.cells,kind:'magic',n:9,
      description:'三阶魔方阵中 1 至 9 各出现一次'});
  }
  if(!houses.length&&!activeRules.length)
    return {status:'unsupported',level:0,step:null};
  const state=runCandidates(puzzle,progress,houses,domains);
  // Visible duplicate digits contradict an all-different rule: no logical
  // deduction from an inconsistent premise should be suggested.
  for(const house of houses){
    const placed=house.cells.map(i=>state.values[i]).filter(Boolean);
    if(distinct(placed).length!==placed.length)
      return {status:'conflict',level:0,step:null};
  }
  const step=chooseStep(puzzle,progress,domains,houses,sectors,state,
    Math.min(tier,4),focus);
  // Join independently proven variant arithmetic with Sudoku all-different
  // reasoning. A sum group can guarantee a digit within a house without
  // fixing which of its arrow-shaft cells contains it.
  const combined=findCombinedConstraintHint(puzzle,progress,
    {domains,houses},state,activeRules,Math.min(tier,4),focus);
  // Keep a direct, immediately explained variant proof if one exists.
  // Generalized N-subsets should not drown out arrow/thermo/clone/odd hints
  // just because both methods can eliminate the focused candidate.
  const basic=['peer_elimination','locked_candidate',
    'hidden_single','naked_subset'].includes(step?.method);
  const relevant=combined?.sources.includes(focus)||combined?.cell===focus;
  const notesAt=i=>noteDigits(progress.cells[i],domains[i]||9);
  const basicImpact=step?hintImpact(step,notesAt(step.cell)).rank:0;
  const combinedImpact=combined?hintImpact(combined,notesAt(combined.cell)).rank:0;
  // A direct placement must never be displaced by a multi-cell elimination.
  // Within the same impact category, retain the existing variant relevance.
  const preferCombined=Boolean(combined)&&combinedImpact>0&&
    (combinedImpact>basicImpact||
      (combinedImpact===basicImpact&&
        (combined.method==='constraint_locked_digit'
          ? (relevant||basic)
          : (basic&&relevant))));
  if(preferCombined){
    return {status:'step',level:combined.level,step:combined};
  }
  if(step)return {status:'step',level:step.level,step};
  return {status:progress.visible?.some(flag=>flag===false)
    ?'fog_stalled':'stalled',level:Math.min(tier,4),step:null};
}
export {gridsAndHouses};
