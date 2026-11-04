// Conservative, read-only hint engine for overlapping adventure Sudoku maps.
// Every inference is derived from *visible* values and explicitly authored
// all-different / variant marks; never from the solution or fogged givens.
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
const cellPoint=(p,rows,cols)=>{
  if(!Array.isArray(p)||p.length<2)return -1;
  const [r,c]=p;
  return Number.isFinite(r)&&Number.isFinite(c)&&Math.abs(r-Math.floor(r)-.5)<.025
    &&Math.abs(c-Math.floor(c)-.5)<.025
    ?point([Math.floor(r),Math.floor(c)],rows,cols):-1;
};
const phrase=(s,pattern)=>pattern.test(s||'');
function colorRGB(text){
  const hex=String(text||'').replace(/^#/,'');
  if(!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex))return null;
  return [0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));
}
function colorTag(color){
  const rgb=colorRGB(color);
  if(!rgb)return '';
  const [r,g,b]=rgb;
  if(g>r*1.3&&g>b*1.13)return 'green';
  if(b>r*1.2&&b>g*1.05)return 'blue';
  if(r>b*1.25&&g>b*1.1&&Math.abs(r-g)<100)return 'gold';
  if(b>g*.9&&r>g*.9&&Math.abs(r-b)<95)return 'purple';
  if(g>r*1.15&&b>r*1.1&&Math.abs(g-b)<65)return 'teal';
  return '';
}
const keyword={
  kropki:/kropki|黑白点|白点|黑点|scan dot|dots differ/i,
  xv:/(?:\bXV\b|roman numeral|罗马数字|罗马数|[VX]标记)/i,
  whisper:/whisper|低语|耳语|vine/i,
  thermo:/thermo|温度计/i,
  renban:/renban|连续数线|连续线|连数线/i,
  entropic:/entropic|熵线/i,
  modular:/modular|模三线/i,
  between:/between line|夹心线|介于.*两端/i,
  arrow:/arrow|箭头/i,
  region_sum:/region.sum|区域和线|等和线/i
};
function ruleAvailable(puzzle,progress,kind,cells){
  const pattern=keyword[kind],cols=puzzle.cols;
  if(!pattern)return false;
  for(const s of puzzle.sectors||[]){
    if(!pattern.test(s.rules||''))continue;
    const covered=Array.isArray(s.cells)?s.cells:
      Array.from({length:Math.min(32,(s.width||0)*(s.height||0))},(_,i)=>
        (s.top+Math.floor(i/s.width))*cols+s.left+i%s.width);
    // Locked story panels may contain future rule descriptions in the source,
    // but they have no authority until at least one panel cell is revealed.
    if(!covered.some(i=>isVisible(progress,i)))continue;
    const local=cells.every(i=>{
      const row=Math.floor(i/cols),col=i%cols;
      return row>=s.top&&row<s.top+s.height&&col>=s.left&&col<s.left+s.width;
    });
    const rulePanel=s.width*s.height<=8 &&
      (/rule|规则|scan dot|whisper vine|thermo|renban|kropki|modular|entropic|between/i
        .test(s.title||'') || s.width===1);
    if(local||rulePanel)return true;
  }
  return false;
}
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
function gridsAndHouses(puzzle){
  const {rows,cols}=puzzle,total=rows*cols;
  const domains=Array(total).fill(0),houses=[],seen=new Set();
  const add=(indices,kind,n,description)=>{
    const members=distinct(indices.filter(i=>Number.isInteger(i)&&i>=0&&i<total));
    if(members.length<2)return;
    const key=[...members].sort((a,b)=>a-b).join(',');
    if(seen.has(key))return;
    seen.add(key);houses.push({cells:members,kind,n,description});
  };
  const sectors=(puzzle.sectors||[]).filter(s=>squareSector(s,rows,cols));
  for(const s of sectors){
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
  for(const region of puzzle.regions||[]){
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
function lineCells(line,rows,cols){
  const marks=line?.wayPoints||line?.points;
  if(!Array.isArray(marks)||marks.length<2||marks.length>10)return [];
  const cells=marks.map(p=>cellPoint(p,rows,cols));
  if(cells.some(i=>i<0)||distinct(cells).length!==cells.length)return [];
  for(let j=1;j<cells.length;j++){
    const a=cells[j-1],b=cells[j],dr=Math.abs(Math.floor(a/cols)-Math.floor(b/cols)),dc=Math.abs(a%cols-b%cols);
    if(Math.max(dr,dc)!==1)return [];
  }
  return cells;
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
function markedDots(puzzle,progress,sectors){
  const {rows,cols}=puzzle,output=[];
  for(const mark of puzzle.overlays||[]){
    const center=mark?.center;
    if(!Array.isArray(center)||center.length!==2)continue;
    const [r,c]=center;
    const halfR=Math.abs(r-Math.floor(r)-.5)<.025;
    const halfC=Math.abs(c-Math.floor(c)-.5)<.025;
    const intR=Math.abs(r-Math.round(r))<.025;
    const intC=Math.abs(c-Math.round(c))<.025;
    let a=-1,b=-1;
    if(halfR&&intC){a=point([Math.floor(r),Math.round(c)-1],rows,cols);b=point([Math.floor(r),Math.round(c)],rows,cols);}
    if(intR&&halfC){a=point([Math.round(r)-1,Math.floor(c)],rows,cols);b=point([Math.round(r),Math.floor(c)],rows,cols);}
    if(a<0||b<0||!isVisible(progress,a)||!isVisible(progress,b))continue;
    const txt=String(mark.text||'').trim().toUpperCase();
    let kind=null;
    if(txt==='V'||txt==='X')kind='xv';
    else{
      const rgb=colorRGB(mark.backgroundColor);
      if(rgb&&rgb.every(v=>v>=240))kind='white';
      if(rgb&&rgb.every(v=>v<=50))kind='black';
    }
    if(!kind)continue;
    const family=kind==='xv'?'xv':'kropki';
    if(!ruleAvailable(puzzle,progress,family,[a,b]))continue;
    output.push({a,b,kind});
  }
  return output;
}
function score(step,notes,focus,tier,variant=false){
  if(step.level>tier)return -Infinity;
  const marked=notes[step.cell]||[];
  const usable=step.removed.filter(d=>marked.includes(d));
  if(marked.length&&usable.length===0&&step.remaining.length!==1)return -Infinity;
  let points=marked.length&&usable.length?1200:0;
  if(step.remaining.length===1)points+=850;
  if(variant)points+=160;
  if(step.cell===focus)points+=400;
  else if(focus>=0)points+=Math.max(0,90-Math.abs(step.cell-focus));
  if(marked.length===0&&step.remaining.length>1)points-=200;
  return points-step.level*7;
}
function chooseStep(puzzle,progress,domains,houses,sectors,state,tier,focus){
  const {rows,cols}=puzzle,total=rows*cols,{values,candidates,peers}=state;
  const notes=Array.from({length:total},(_,i)=>noteDigits(progress.cells[i],domains[i]||9));
  const options=[];
  const add=(method,cell,removed,remaining,sources,reason,level=1,variant=false)=>{
    if(!isVisible(progress,cell)||values[cell]||!removed.length)return;
    const original=candidates[cell]||whole(domains[cell]||9);
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
    const unique=distinct(known.map(p=>p.digit));
    for(const d of unique){
      const witness=known.find(p=>p.digit===d);
      if(witness) add('peer_elimination',i,[d],
        initial.filter(v=>v!==d),[witness.source],
        '依据'+witness.house.description+'的数字不重复规则，已填的 '+d+' 不能再次出现在目标格。');
    }
    if(candidates[i]?.length===1){
      const d=candidates[i][0];
      add('naked_single',i,initial.filter(v=>v!==d),[d],
        known.filter(p=>p.digit!==d).map(p=>p.source),
        '根据目标格所在各行、列和宫（或其他不重复组）内已知数字的排除，唯一剩下的候选数是 '+d+'。');
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
      for(const count of [2,3]){
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
    // Locked candidates across intersecting complete houses. The covered
    // region must contain ALL positions of a digit in the source house.
    for(let a=0;a<completeHouses.length;a++){
      const from=completeHouses[a];
      for(let b=0;b<completeHouses.length;b++){
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
  for(const {a,b,kind} of markedDots(puzzle,progress,sectors)){
    if(kind==='white')relation(a,b,'kropki',(x,y)=>Math.abs(x-y)===1,'白点两端的数字相差 1；其他数字无法与另一端的候选组成合法配对。');
    else if(kind==='black')relation(a,b,'kropki',(x,y)=>Math.max(x,y)===2*Math.min(x,y),'黑点两端数字为 1:2；其他数字无法与另一端的候选配对。');
    else relation(a,b,'xv',(x,y)=>x+y===(kind==='V'?5:10),'罗马数字 '+kind+' 表示两格数字之和为 '+(kind==='V'?5:10)+'。');
  }
  // Published numeric killer sums. Hidden cages and decorative labels are
  // deliberately excluded, even when their raw metadata is accessible.
  const constraints=[];
  for(const cage of puzzle.cages||[]){
    if(cage.hidden===true||!Array.isArray(cage.cells))continue;
    const text=String(cage.value??'');
    if(!/^\d{1,3}$/.test(text))continue;
    const cells=cage.cells.map(pair=>point(pair,rows,cols));
    if(cells.length<2||cells.length>5||cells.some(i=>i<0||!isVisible(progress,i)||!candidates[i]&&!values[i]))continue;
    constraints.push({method:'killer_sum',cells,goal:Number(text),
      unique:cage.unique===true,
      check:arr=>arr.reduce((a,b)=>a+b,0)===Number(text),
      reason:'题面杀手笼总和为 '+text+'，'+(cage.unique===true?'各格不能重复，':'')+'候选必须能够组成这一总和。'});
  }
  // Explicitly explained line rules only, within an unlocked Sudoku grid.
  for(const line of puzzle.lines||[]){
    const cells=lineCells(line,rows,cols);
    if(cells.length<2||cells.some(i=>!isVisible(progress,i)))continue;
    const matched=sectors.find(s=>cells.every(i=>{
      const r=Math.floor(i/cols),c=i%cols;
      return r>=s.top&&r<s.top+s.height&&c>=s.left&&c<s.left+s.width;
    }));
    const color=colorTag(line.color),rgb=colorRGB(line.color);
    if(ruleAvailable(puzzle,progress,'whisper',cells)&&color==='green'){
      for(let k=1;k<cells.length;k++)
        relation(cells[k-1],cells[k],'whisper',(a,b)=>Math.abs(a-b)>=5,
          '低语线相邻两格必须相差至少 5。');
    }
    if(cells.length<=5&&ruleAvailable(puzzle,progress,'renban',cells)&&
      color==='blue'&&(!rgb||rgb[0]>=95)){
      constraints.push({method:'renban',cells,unique:true,
        check:arr=>Math.max(...arr)-Math.min(...arr)===arr.length-1,
        reason:'连续数线必须包含一组不重复的连续整数。'});
    }
    if(cells.length<=5&&ruleAvailable(puzzle,progress,'between',cells)&&color==='purple'){
      constraints.push({method:'between',cells,unique:false,
        check:arr=>{
          const lo=Math.min(arr[0],arr[arr.length-1]),hi=Math.max(arr[0],arr[arr.length-1]);
          return arr.slice(1,-1).every(v=>v>lo&&v<hi);
        },reason:'夹心线中间的数字必须严格介于两个端点之间。'});
    }
    if(cells.length<=9&&ruleAvailable(puzzle,progress,'thermo',cells)){
      // A line is a thermometer only when the pictured bulb is attached to
      // its first cell. Color alone is never enough.
      const head=line.wayPoints?.[0];
      const bulb=(puzzle.underlays||[]).some(mark=>
        Array.isArray(mark.center)&&Math.abs(mark.center[0]-head?.[0])<.03&&
        Math.abs(mark.center[1]-head?.[1])<.03&&mark.rounded===true&&
        Number(mark.width)>0.35&&Number(mark.width)<1.1);
      if(bulb)for(let j=1;j<cells.length;j++)
        relation(cells[j-1],cells[j],'thermo',(a,b)=>a<b,
          '温度计必须从圆头到尾端严格递增。');
    }
    if(cells.length>=3&&cells.length<=9&&
        ruleAvailable(puzzle,progress,'entropic',cells)&&color==='gold'&&
        matched&&matched.width%3===0){
      const width=matched.width;
      const group=d=>Math.floor((d-1)/(width/3));
      for(let j=0;j+2<cells.length;j++)constraints.push({
        method:'entropic',cells:cells.slice(j,j+3),unique:false,
        check:arr=>new Set(arr.map(group)).size===3,
        reason:'熵线每个连续三格分别来自三个不同的数字区间。'
      });
    }
    if(cells.length>=3&&cells.length<=9&&
        ruleAvailable(puzzle,progress,'modular',cells)&&color==='teal'){
      for(let j=0;j+2<cells.length;j++)constraints.push({
        method:'modular',cells:cells.slice(j,j+3),unique:false,
        check:arr=>new Set(arr.map(d=>(d-1)%3)).size===3,
        reason:'模三线连续三个数字对 3 的余数必须互不相同。'
      });
    }
    if(cells.length>=3&&cells.length<=5&&matched&&
        ruleAvailable(puzzle,progress,'region_sum',cells)&&
        color==='blue'&&rgb&&rgb[0]<95){
      const n=matched.width,h=n===9?3:n===4?2:2,w=n===9?3:n===4?2:3;
      const box=i=>{
        const r=Math.floor(i/cols)-matched.top,c=i%cols-matched.left;
        return Math.floor(r/h)*Math.floor(n/w)+Math.floor(c/w);
      };
      const segments=[];
      for(const i of cells){
        if(!segments.length||box(i)!==box(segments[segments.length-1].at(-1)))
          segments.push([]);
        segments.at(-1).push(i);
      }
      if(segments.length>=2){
        const sizes=segments.map(s=>s.length);
        constraints.push({method:'region_sum',cells,unique:false,
          check:arr=>{
            let k=0;
            const sums=sizes.map(n=>{
              const sum=arr.slice(k,k+n).reduce((a,b)=>a+b,0);k+=n;return sum;
            });
            return sums.every(sum=>sum===sums[0]);
          },reason:'区域和线被宫界分成几段，每段数字之和相同。'});
      }
    }
  }
  for(const arrow of puzzle.arrows||[]){
    const cells=lineCells(arrow,rows,cols);
    if(cells.length<3||cells.length>5||
       cells.some(i=>!isVisible(progress,i)||(!values[i]&&!candidates[i]))||
       !ruleAvailable(puzzle,progress,'arrow',cells))continue;
    const start=arrow.wayPoints?.[0];
    const bulb=(puzzle.underlays||[]).some(mark=>
      Array.isArray(mark.center)&&Math.abs(mark.center[0]-start?.[0])<.03&&
      Math.abs(mark.center[1]-start?.[1])<.03&&mark.rounded===true);
    if(!bulb)continue;
    constraints.push({method:'arrow',cells,unique:false,
      check:arr=>arr[0]===arr.slice(1).reduce((a,b)=>a+b,0),
      reason:'箭头圆圈内的数字等于箭杆上所有数字之和。'});
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
  const {domains,houses,sectors}=gridsAndHouses(puzzle);
  if(!houses.length)return {status:'unsupported',level:0,step:null};
  const state=runCandidates(puzzle,progress,houses,domains);
  const step=chooseStep(puzzle,progress,domains,houses,sectors,state,
    Math.min(tier,4),focus);
  if(step)return {status:'step',level:step.level,step};
  return {status:progress.visible?.some(flag=>flag===false)
    ?'fog_stalled':'stalled',level:Math.min(tier,4),step:null};
}
export {gridsAndHouses};
