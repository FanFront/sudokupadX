//! Offline, locally seeded Sudoku authoring shared by Android (native Rust)
//! and the browser (the same core compiled to WebAssembly).
//!
//! A level is the *lowest implemented deduction tier* that completes the
//! printed puzzle. Level 5 is explicitly NOT a human-style proof: it means
//! level 4 stalls but a separately bounded exhaustive solver finds one answer.
//! The author's solution is never used in deductions or uniqueness checks.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet, HashSet};

const DIGITS: usize = 9;
type Mask = u16;
fn bit(d: u8) -> Mask { 1u16 << (d - 1) }
fn full(n: usize) -> Mask { (1u16 << n) - 1 }
fn values(mask: Mask, n: usize) -> Vec<u8> {
    (1..=n as u8).filter(|d| mask & bit(*d) != 0).collect()
}
fn count(mask: Mask) -> u32 { mask.count_ones() }
fn sole(mask: Mask) -> u8 { mask.trailing_zeros() as u8 + 1 }
fn boxes(n: usize) -> (usize,usize) {
    match n { 4 => (2,2),6 => (2,3),9 => (3,3),_ => unreachable!() }
}
fn box_id(n: usize, i: usize) -> usize {
    let (h,w) = boxes(n);
    (i / n / h) * (n / w) + (i % n / w)
}
fn linked(n: usize, a: usize, b: usize) -> bool {
    a / n == b / n || a % n == b % n || box_id(n,a) == box_id(n,b)
}
fn units(n: usize) -> Vec<Vec<usize>> {
    let (h,w) = boxes(n);
    let mut output = Vec::new();
    for r in 0..n { output.push((0..n).map(|c|r*n+c).collect()); }
    for c in 0..n { output.push((0..n).map(|r|r*n+c).collect()); }
    for r in (0..n).step_by(h) { for c in (0..n).step_by(w) {
        output.push((0..h).flat_map(|dr|(0..w).map(move |dc|(r+dr)*n+c+dc)).collect());
    }}
    output
}
fn combinations(items: &[usize], k: usize) -> Vec<Vec<usize>> {
    if k==0 {return vec![vec![]];}
    if k>items.len() {return vec![];}
    let mut result=Vec::new();
    for (i,&first) in items.iter().enumerate() {
        for mut tail in combinations(&items[i+1..],k-1) {
            tail.insert(0,first);
            result.push(tail);
        }
    }
    result
}

#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Rule {
    #[serde(rename="type")]
    pub kind: String,
    pub cells: Vec<usize>,
    #[serde(skip_serializing_if="Option::is_none")]
    pub sum: Option<u16>,
    #[serde(skip_serializing_if="Option::is_none")]
    pub dot: Option<String>,
}
impl Rule {
    fn new(kind: &str,cells: Vec<usize>) -> Self {
        Self {kind:kind.to_owned(),cells,sum:None,dot:None}
    }
}
#[derive(Clone,Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct Step {
    pub method: String,
    pub cell: usize,
    pub removed: Vec<u8>,
    pub remaining: Vec<u8>,
    pub before: Vec<u8>,
    pub sources: Vec<usize>,
}
#[derive(Clone,Debug)]
struct Proof {
    solved: bool,
    values: Vec<u8>,
    masks: Vec<Mask>,
    methods: BTreeMap<String,usize>,
    trace: Vec<Step>,
}
fn level_of(method: &str) -> u8 {
    match method {
        "naked_subset"|"hidden_subset"|"locked_candidate" => 2,
        "x_wing"|"swordfish"|"xy_wing"|"skyscraper" => 3,
        "jellyfish"|"xyz_wing"|"xy_chain" => 4,
        _ => 1,
    }
}
fn allowed_focus(method: &str) -> bool {
    matches!(method,
        "peer_elimination"|"hidden_single"|"killer_sum"|"kropki"|
        "thermo"|"renban"|"whisper"|"arrow"|"xv"|"entropic"|
        "modular"|"between"|"region_sum"|"parity"|"inequality"|
        "clone"|"thermo_unknown"|"little_killer"|
        "anti_knight_anchors"|"anti_whisper_anchors"|
        "naked_subset"|"hidden_subset"|"locked_candidate"|
        "x_wing"|"swordfish"|"xy_wing"|"skyscraper"|
        "jellyfish"|"xyz_wing"|"xy_chain")
}

struct Solver {
    n: usize,
    masks: Vec<Mask>,
    rules: Vec<Rule>,
    units: Vec<Vec<usize>>,
    tier: u8,
    disabled: Option<String>,
    steps: Vec<Step>,
    methods: BTreeMap<String,usize>,
    trace: bool,
    reason: Vec<usize>,
}
impl Solver {
    fn new(n:usize,givens:&[u8],rules:&[Rule],tier:u8,trace:bool,
           disabled:Option<&str>) -> Result<Self,String> {
        if !matches!(n,4|6|9)||!(1..=4).contains(&tier)||givens.len()!=n*n {
            return Err("数独尺寸、技巧等级或题面不合法".into());
        }
        let mut masks=vec![full(n);n*n];
        for (i,&d) in givens.iter().enumerate(){
            if d>n as u8 {return Err("提示数字超出范围".into());}
            if d!=0 {masks[i]=bit(d);}
        }
        Ok(Self{n,masks,rules:rules.to_vec(),units:units(n),tier,
            disabled:disabled.map(str::to_owned),steps:vec![],
            methods:BTreeMap::new(),trace,reason:vec![]})
    }
    fn from_masks(n:usize,masks:Vec<Mask>,rules:&[Rule],tier:u8)
        -> Result<Self,String> {
        if masks.len()!=n*n||masks.iter().any(|&m|m==0||m&!full(n)!=0) {
            return Err("候选数字无效".into());
        }
        let mut self_=Self::new(n,&vec![0;n*n],rules,tier,false,None)?;
        self_.masks=masks;
        Ok(self_)
    }
    fn reduce(&mut self,i:usize,allowed:Mask,method:&str)->Result<bool,String>{
        if self.disabled.as_deref()==Some(method)||level_of(method)>self.tier {
            return Ok(false);
        }
        let before=self.masks[i];let after=before&allowed;
        if after==0 {return Err("候选数字无解".into());}
        if before==after {return Ok(false);}
        self.masks[i]=after;
        *self.methods.entry(method.to_owned()).or_default()+=1;
        if self.trace {
            self.steps.push(Step{method:method.to_owned(),cell:i,
                removed:values(before&!after,self.n),
                remaining:values(after,self.n),
                before:values(before,self.n),sources:self.reason.clone()});
        }
        Ok(true)
    }
    fn binary(&mut self,a:usize,b:usize,kind:&str,
              relation:impl Fn(u8,u8)->bool)->Result<bool,String>{
        let mut left=0;let mut right=0;
        for x in values(self.masks[a],self.n) {
            for y in values(self.masks[b],self.n) {
                if relation(x,y) {left|=bit(x);right|=bit(y);}
            }
        }
        let x=self.reduce(a,left,kind)?;
        Ok(self.reduce(b,right,kind)?||x)
    }
    // Check either possible orientation of a missing-bulb thermometer.
    // Prefix/suffix feasibility is exact for monotone lines and never guesses.
    fn monotone_support(&self,cells:&[usize],ascending:bool)->Vec<Mask>{
        let len=cells.len();
        let mut forward=vec![vec![false;self.n+1];len];
        let mut backward=vec![vec![false;self.n+1];len];
        for d in values(self.masks[cells[0]],self.n){forward[0][d as usize]=true;}
        for k in 1..len{
            for d in values(self.masks[cells[k]],self.n){
                forward[k][d as usize]=(1..=self.n).any(|p|
                    forward[k-1][p] && (if ascending {p<d as usize}else{p>d as usize}));
            }
        }
        for d in values(self.masks[*cells.last().unwrap()],self.n){
            backward[len-1][d as usize]=true;
        }
        for k in (0..len-1).rev(){
            for d in values(self.masks[cells[k]],self.n){
                backward[k][d as usize]=(1..=self.n).any(|next|
                    backward[k+1][next] &&
                    (if ascending {d as usize<next}else{d as usize>next}));
            }
        }
        (0..len).map(|k|
            (1..=self.n as u8).filter(|&d|
                forward[k][d as usize]&&backward[k][d as usize])
                .fold(0,|mask,d|mask|bit(d))
        ).collect()
    }
    // Prefix/suffix sum DP handles full-length diagonal clues in polynomial
    // time. Relaxing non-repetition here is safe: it can only retain extras.
    fn sum_support(&self,cells:&[usize],target:u16)->Vec<Mask>{
        let len=cells.len();let limit=target as usize;
        if limit==0||limit>self.n*len{return vec![0;len];}
        let mut before=vec![vec![false;limit+1];len+1];
        let mut after=vec![vec![false;limit+1];len+1];
        before[0][0]=true;after[len][0]=true;
        for k in 0..len{
            for sum in 0..=limit{
                if !before[k][sum]{continue;}
                for d in values(self.masks[cells[k]],self.n){
                    let next=sum+d as usize;
                    if next<=limit{before[k+1][next]=true;}
                }
            }
        }
        for k in (0..len).rev(){
            for sum in 0..=limit{
                if !after[k+1][sum]{continue;}
                for d in values(self.masks[cells[k]],self.n){
                    let next=sum+d as usize;
                    if next<=limit{after[k][next]=true;}
                }
            }
        }
        (0..len).map(|k|{
            let mut mask=0;
            for d in values(self.masks[cells[k]],self.n){
                let digit=d as usize;
                if digit<=limit&&(0..=limit-digit).any(|sum|
                    before[k][sum]&&after[k+1][limit-sum-digit]){
                    mask|=bit(d);
                }
            }
            mask
        }).collect()
    }
    fn rule(&mut self,rule:&Rule)->Result<bool,String>{
        let cells=&rule.cells;
        if cells.is_empty()||cells.iter().any(|&i|i>=self.n*self.n)||
            (cells.len()<2&&!matches!(rule.kind.as_str(),
                "parity"|"anti_knight_anchors"|"anti_whisper_anchors")){
            return Err("变体坐标错误".into());
        }
        match rule.kind.as_str() {
            "parity"=>{
                if cells.len()!=1{return Err("奇偶标记只关联一个格".into());}
                let odd=match rule.dot.as_deref(){
                    Some("odd")=>true,Some("even")=>false,
                    _=>return Err("奇偶标记缺少类型".into())
                };
                let allowed=(1..=self.n as u8).filter(|d|(*d%2==1)==odd)
                    .fold(0,|m,d|m|bit(d));
                self.reduce(cells[0],allowed,"parity")
            },
            "inequality"|"clone"=>{
                if cells.len()!=2{return Err("比较规则需要两个格".into());}
                if rule.kind=="inequality"{
                    self.binary(cells[0],cells[1],"inequality",|a,b|a<b)
                }else{
                    if linked(self.n,cells[0],cells[1]){
                        return Err("同值克隆不能占据同一行列宫".into());
                    }
                    self.binary(cells[0],cells[1],"clone",|a,b|a==b)
                }
            },
            "anti_knight_anchors"|"anti_whisper_anchors"=>{
                if cells.len()!=1{return Err("局部锚点只关联一个格".into());}
                let anchor=cells[0];let mut changed=false;
                let neighborhood=if rule.kind=="anti_knight_anchors"{
                    knight_neighbors(self.n,anchor)
                }else{neighbors(self.n,anchor)};
                for other in neighborhood{
                    changed|=if rule.kind=="anti_knight_anchors"{
                        self.binary(anchor,other,"anti_knight_anchors",|a,b|a!=b)?
                    }else{
                        self.binary(anchor,other,"anti_whisper_anchors",
                            |a,b|a.abs_diff(b)<5)?
                    };
                }
                Ok(changed)
            },
            "thermo_unknown"=>{
                if cells.len()<3||cells.len()>5{
                    return Err("无圆头温度计长度必须为 3–5".into());
                }
                let asc=self.monotone_support(cells,true);
                let desc=self.monotone_support(cells,false);
                let mut changed=false;
                for (k,&cell) in cells.iter().enumerate(){
                    changed|=self.reduce(cell,asc[k]|desc[k],"thermo_unknown")?;
                }
                Ok(changed)
            },
            "little_killer"=>{
                if cells.len()<2||cells.len()>self.n||rule.sum.unwrap_or(0)==0{
                    return Err("小杀手斜线求和无效".into());
                }
                let first=(cells[1]/self.n).checked_sub(cells[0]/self.n);
                let col_up=cells[1]%self.n>cells[0]%self.n;
                if first!=Some(1)||cells.windows(2).any(|p|
                    p[1]/self.n!=p[0]/self.n+1 ||
                    (p[0]%self.n).abs_diff(p[1]%self.n)!=1 ||
                    (p[1]%self.n>p[0]%self.n)!=col_up){
                    return Err("小杀手必须沿同一条斜线向下延伸".into());
                }
                let supported=self.sum_support(cells,rule.sum.unwrap());
                let mut changed=false;
                for (k,&cell) in cells.iter().enumerate(){
                    changed|=self.reduce(cell,supported[k],"little_killer")?;
                }
                Ok(changed)
            },
            "kropki" => {
                match rule.dot.as_deref(){
                    Some("white")=>self.binary(cells[0],cells[1],"kropki",
                        |a,b|a.abs_diff(b)==1),
                    Some("black")=>self.binary(cells[0],cells[1],"kropki",
                        |a,b|a.max(b)==2*a.min(b)),
                    _=>Err("黑白点类型错误".into())
                }
            },
            "xv"=>self.binary(cells[0],cells[1],"xv",
                |a,b|a as u16+b as u16==rule.sum.unwrap_or(0)),
            "thermo"|"whisper" => {
                let mut changed=false;
                for pair in cells.windows(2) {
                    let delta=if rule.kind=="thermo" {
                        self.binary(pair[0],pair[1],"thermo",|a,b|a<b)?
                    }else{
                        self.binary(pair[0],pair[1],"whisper",|a,b|a.abs_diff(b)>=5)?
                    };
                    changed|=delta;
                }
                Ok(changed)
            },
            "entropic"|"modular" => {
                if self.n%3!=0 {return Err("该规则不支持此尺寸".into());}
                let orders=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
                let mut support=vec![0u16;cells.len()];
                for order in orders {
                    let cls=|d:u8| -> usize {
                        if rule.kind=="entropic" {
                            (d as usize-1)/(self.n/3)
                        }else{(d as usize-1)%3}
                    };
                    if cells.iter().enumerate().all(|(k,&i)|
                        values(self.masks[i],self.n).iter()
                            .any(|&d|cls(d)==order[k%3]))
                    {
                        for (k,&i) in cells.iter().enumerate() {
                            for d in values(self.masks[i],self.n) {
                                if cls(d)==order[k%3]{support[k]|=bit(d);}
                            }
                        }
                    }
                }
                let mut changed=false;
                for (i,&cell) in cells.iter().enumerate(){
                    changed|=self.reduce(cell,support[i],&rule.kind)?;
                }
                Ok(changed)
            },
            "killer"|"renban"|"arrow"|"between"|"region_sum" => {
                if cells.len()>5{return Err("变体路径过长".into());}
                let mut supports=vec![0u16;cells.len()];
                let mut chosen=Vec::new();
                let mut remaining=40000usize;
                self.enumerate(rule,0,&mut chosen,&mut supports,&mut remaining)?;
                let mut changed=false;
                let method=if rule.kind=="killer" {"killer_sum"}else{&rule.kind};
                for (k,&cell) in cells.iter().enumerate(){
                    changed|=self.reduce(cell,supports[k],method)?;
                }
                Ok(changed)
            },
            _=>Err(format!("当前生成器暂不支持 {}",rule.kind))
        }
    }
    fn enumerate(&self,rule:&Rule,depth:usize,chosen:&mut Vec<u8>,
        supports:&mut [Mask],budget:&mut usize)->Result<(),String>{
        if *budget==0 {return Err("约束搜索超过安全限额".into());}
        *budget-=1;
        if depth==rule.cells.len(){
            let valid=match rule.kind.as_str(){
                "killer"=>chosen.iter().map(|&d|d as u16).sum::<u16>()==
                    rule.sum.unwrap_or(0) &&
                    chosen.iter().copied().collect::<HashSet<_>>().len()==chosen.len(),
                "renban"=>chosen.iter().copied().collect::<HashSet<_>>().len()==chosen.len()
                    && chosen.iter().max().unwrap()-chosen.iter().min().unwrap()
                        ==chosen.len() as u8-1,
                "arrow"=>chosen[0] as u16==
                    chosen[1..].iter().map(|&d|d as u16).sum::<u16>(),
                "between"=>{
                    let low=chosen[0].min(*chosen.last().unwrap());
                    let high=chosen[0].max(*chosen.last().unwrap());
                    chosen[1..chosen.len()-1].iter().all(|&d|low<d&&d<high)
                },
                "region_sum"=>{
                    let mut sums=Vec::new();
                    let mut previous=box_id(self.n,rule.cells[0]);let mut sum=0u16;
                    for (k,&cell) in rule.cells.iter().enumerate(){
                        let b=box_id(self.n,cell);
                        if b!=previous{sums.push(sum);sum=0;previous=b;}
                        sum+=chosen[k] as u16;
                    }
                    sums.push(sum);
                    sums.len()>1 && sums.iter().all(|&x|x==sums[0])
                },
                _=>false
            };
            if valid {for (i,&d) in chosen.iter().enumerate(){supports[i]|=bit(d);}}
            return Ok(());
        }
        let cell=rule.cells[depth];
        for d in values(self.masks[cell],self.n){
            if rule.kind=="killer"||rule.kind=="renban"{
                if chosen.contains(&d){continue;}
            }
            if rule.kind=="killer" &&
                chosen.iter().map(|&x|x as u16).sum::<u16>()+d as u16
                    >rule.sum.unwrap_or(0) {continue;}
            if rule.kind=="arrow"&&depth>0 &&
                chosen[1..].iter().map(|&x|x as u16).sum::<u16>()
                    +d as u16>self.n as u16 {continue;}
            if chosen.iter().enumerate().any(|(k,&old)|
                old==d&&linked(self.n,cell,rule.cells[k])) {continue;}
            chosen.push(d);
            self.enumerate(rule,depth+1,chosen,supports,budget)?;
            chosen.pop();
        }
        Ok(())
    }
    fn houses(&mut self)->Result<bool,String>{
        let mut changed=false;
        for house in self.units.clone(){
            let mut seen=0;
            for &i in &house {
                if count(self.masks[i])==1{
                    if seen&self.masks[i]!=0{return Err("数独某行列宫出现重复数字".into());}
                    seen|=self.masks[i];
                }
            }
            for &i in &house{
                if count(self.masks[i])>1{
                    self.reason=house.iter().copied().filter(|&other|
                        count(self.masks[other])==1 &&
                        self.masks[other]&self.masks[i]!=0).collect();
                    changed|=self.reduce(i,!seen,"peer_elimination")?;
                }
            }
            for d in 1..=self.n as u8{
                let positions:Vec<_>=house.iter().copied()
                    .filter(|&i|self.masks[i]&bit(d)!=0).collect();
                if positions.is_empty(){return Err("某个数字没有候选位置".into());}
                if positions.len()==1{
                    self.reason=house.clone();
                    changed|=self.reduce(positions[0],bit(d),"hidden_single")?;
                }
            }
        }
        Ok(changed)
    }
    fn subsets(&mut self)->Result<bool,String>{
        let mut changed=false;
        for house in self.units.clone(){
            let unsolved:Vec<_>=house.iter().copied()
                .filter(|&i|count(self.masks[i])>1).collect();
            // All 9×9 naked/hidden N-subsets, not only pairs and triples.
            // N=8 is meaningful as the dual of a hidden single; on 4×4
            // and 6×6 boards the maximum follows their actual domain.
            for size in 2..self.n {
                for selected in combinations(&unsolved,size){
                    let union=selected.iter().fold(0,|a,&i|a|self.masks[i]);
                    if count(union)!=size as u32 {continue;}
                    for &cell in &house {
                        if !selected.contains(&cell) {
                            self.reason=selected.clone();
                            changed|=self.reduce(cell,!union,"naked_subset")?;
                        }
                    }
                }
                let all:Vec<usize>=(1..=self.n).collect();
                for chosen in combinations(&all,size){
                    let union=chosen.iter().fold(0,|a,&d|a|bit(d as u8));
                    let locations:Vec<_>=house.iter().copied()
                        .filter(|&i|self.masks[i]&union!=0).collect();
                    if locations.len()!=size||chosen.iter().any(|&d|
                        !locations.iter().any(|&i|self.masks[i]&bit(d as u8)!=0))
                        {continue;}
                    for &cell in &locations{
                        self.reason=locations.clone();
                        changed|=self.reduce(cell,union,"hidden_subset")?;
                    }
                }
            }
        }
        for a in 0..self.units.len(){
            for b in (a+1)..self.units.len(){
                let common:Vec<usize>=self.units[a].iter().copied()
                    .filter(|i|self.units[b].contains(i)).collect();
                if common.len()<2||common.len()>=self.n {continue;}
                for (source,dest) in [(a,b),(b,a)]{
                    for digit in 1..=self.n as u8{
                        let positions:Vec<_>=self.units[source].iter().copied()
                            .filter(|&i|self.masks[i]&bit(digit)!=0).collect();
                        if positions.is_empty()||
                           !positions.iter().all(|p|common.contains(p)){continue;}
                        for cell in self.units[dest].clone(){
                            if !common.contains(&cell){
                                self.reason=positions.clone();
                                changed|=self.reduce(cell,!bit(digit),"locked_candidate")?;
                            }
                        }
                    }
                }
            }
        }
        Ok(changed)
    }
    fn fish(&mut self,max_size:usize)->Result<bool,String>{
        if self.n!=9 {return Ok(false);}
        let mut changed=false;
        for axis in 0..2 {for digit in 1..=9u8{
            let locations:Vec<Vec<usize>>=(0..9).map(|line|
                (0..9).filter(|&col|{
                    let cell=if axis==0{line*9+col}else{col*9+line};
                    self.masks[cell]&bit(digit)!=0
                }).collect()
            ).collect();
            for size in 2..=max_size{
                let possible:Vec<usize>=(0..9)
                    .filter(|&i|locations[i].len()>=2&&locations[i].len()<=size)
                    .collect();
                let method=match size {2=>"x_wing",3=>"swordfish",_=>"jellyfish"};
                for base in combinations(&possible,size){
                    let covers:BTreeSet<usize>=base.iter()
                        .flat_map(|&i|locations[i].iter().copied()).collect();
                    if covers.len()!=size{continue;}
                    for line in 0..9{
                        if base.contains(&line){continue;}
                        for &cover in &covers{
                            let cell=if axis==0{line*9+cover}else{cover*9+line};
                            self.reason=base.iter().flat_map(|&i|
                                locations[i].iter().map(move |&col|
                                    if axis==0{i*9+col}else{col*9+i})).collect();
                            changed|=self.reduce(cell,!bit(digit),method)?;
                        }
                    }
                }
            }
        }}
        Ok(changed)
    }
    fn xy_wing(&mut self)->Result<bool,String>{
        if self.n!=9{return Ok(false);}
        let mut changed=false;
        let bivalues:Vec<usize>=(0..81).filter(|&i|count(self.masks[i])==2).collect();
        for &pivot in &bivalues{
            let adjacent:Vec<_>=bivalues.iter().copied()
                .filter(|&j|linked(9,pivot,j)).collect();
            for &a in &adjacent{
                let common=self.masks[pivot]&self.masks[a];
                if count(common)!=1{continue;}
                let other=self.masks[pivot]&!common;
                let z=self.masks[a]&!common;
                for &b in &adjacent{
                    if b==a||self.masks[b]!=(other|z) {continue;}
                    for cell in 0..81{
                        if cell!=pivot&&cell!=a&&cell!=b &&
                           linked(9,cell,a)&&linked(9,cell,b){
                            self.reason=vec![pivot,a,b];
                            changed|=self.reduce(cell,!z,"xy_wing")?;
                        }
                    }
                }
            }
        }
        Ok(changed)
    }
    fn skyscraper(&mut self)->Result<bool,String>{
        if self.n!=9{return Ok(false);}
        let mut changed=false;
        for axis in 0..2 {for digit in 1..=9u8 {
            let links:Vec<Vec<usize>>=(0..9).map(|line|
                (0..9).filter(|&col|{
                    let cell=if axis==0{line*9+col}else{col*9+line};
                    self.masks[cell]&bit(digit)!=0
                }).collect()).collect();
            for a in 0..9{
                if links[a].len()!=2{continue;}
                for b in a+1..9{
                    if links[b].len()!=2{continue;}
                    let shared:Vec<_>=links[a].iter().copied()
                        .filter(|c|links[b].contains(c)).collect();
                    if shared.len()!=1{continue;}
                    let ca=*links[a].iter().find(|&&c|c!=shared[0]).unwrap();
                    let cb=*links[b].iter().find(|&&c|c!=shared[0]).unwrap();
                    let roof_a=if axis==0{a*9+ca}else{ca*9+a};
                    let roof_b=if axis==0{b*9+cb}else{cb*9+b};
                    for cell in 0..81{
                        if cell!=roof_a&&cell!=roof_b&&
                            linked(9,cell,roof_a)&&linked(9,cell,roof_b){
                            self.reason=vec![roof_a,roof_b,
                                if axis==0{a*9+shared[0]}else{shared[0]*9+a},
                                if axis==0{b*9+shared[0]}else{shared[0]*9+b}];
                            changed|=self.reduce(cell,!bit(digit),"skyscraper")?;
                        }
                    }
                }
            }
        }}
        Ok(changed)
    }
    fn xyz_wing(&mut self)->Result<bool,String>{
        if self.n!=9{return Ok(false);}
        let mut changed=false;
        let two:Vec<usize>=(0..81).filter(|&i|count(self.masks[i])==2).collect();
        for pivot in 0..81{
            if count(self.masks[pivot])!=3{continue;}
            let wings:Vec<usize>=two.iter().copied()
                .filter(|&i|linked(9,pivot,i)&&self.masks[i]&!self.masks[pivot]==0)
                .collect();
            for x in 0..wings.len(){for y in x+1..wings.len(){
                let a=wings[x];let b=wings[y];
                let shared=self.masks[a]&self.masks[b];
                if count(shared)!=1||(self.masks[a]|self.masks[b])!=self.masks[pivot]
                    {continue;}
                for cell in 0..81{
                    if cell!=pivot&&cell!=a&&cell!=b&&
                        linked(9,cell,pivot)&&linked(9,cell,a)&&linked(9,cell,b){
                        self.reason=vec![pivot,a,b];
                        changed|=self.reduce(cell,!shared,"xyz_wing")?;
                    }
                }
            }}
        }
        Ok(changed)
    }
    fn xy_chains(&mut self)->Result<bool,String>{
        if self.n!=9{return Ok(false);}
        // Paths of bivalue strong links alternating across weak peer links.
        // A path starting with candidate d and ending with candidate d
        // excludes d from cells seeing both ends.
        let snapshot=self.masks.clone();
        let mut eliminations=Vec::new();
        fn dfs(masks:&[Mask],path:&mut Vec<usize>,link:u8,target:u8,
               out:&mut Vec<(usize,Mask,Vec<usize>)>,max_depth:usize) {
            if path.len()>=max_depth{return;}
            let current=*path.last().unwrap();
            for next in 0..81{
                if path.contains(&next)||count(masks[next])!=2||
                    !linked(9,current,next)||masks[next]&bit(link)==0 {continue;}
                let next_link=sole(masks[next]&!bit(link));
                if next_link==target&&path.len()>=2{
                    let start=path[0];
                    for cell in 0..81{
                        if cell!=start&&cell!=next&&
                            linked(9,cell,start)&&linked(9,cell,next){
                            let mut witness=path.clone();
                            witness.push(next);
                            out.push((cell,bit(target),witness));
                        }
                    }
                }else{
                    path.push(next);
                    dfs(masks,path,next_link,target,out,max_depth);
                    path.pop();
                }
            }
        }
        for i in 0..81{
            if count(snapshot[i])!=2{continue;}
            for target in values(snapshot[i],9){
                let link=sole(snapshot[i]&!bit(target));
                dfs(&snapshot,&mut vec![i],link,target,&mut eliminations,6);
            }
        }
        let mut changed=false;
        for (cell,mask,witness) in eliminations{
            self.reason=witness;
            changed|=self.reduce(cell,!mask,"xy_chain")?;
        }
        Ok(changed)
    }
    fn run(mut self)->Result<Proof,String>{
        for iteration in 0..150 {
            let mut changed=self.houses()?;
            for rule in self.rules.clone(){
                self.reason=rule.cells.clone();
                changed|=self.rule(&rule)?;
            }
            if self.tier>=2{changed|=self.subsets()?;}
            if !changed && self.tier>=3{
                changed|=self.fish(3)?;
                if !changed{changed|=self.xy_wing()?;}
                if !changed{changed|=self.skyscraper()?;}
            }
            if !changed && self.tier>=4{
                changed|=self.fish(4)?;
                if !changed{changed|=self.xyz_wing()?;}
                if !changed{changed|=self.xy_chains()?;}
            }
            if !changed{break;}
            if iteration==149{return Err("无猜测求解步数超出安全限制".into());}
        }
        let solved=self.masks.iter().all(|&mask|count(mask)==1);
        Ok(Proof{
            solved,values:if solved{self.masks.iter().map(|&x|sole(x)).collect()}
                else{vec![]},
            masks:self.masks,methods:self.methods,trace:self.steps
        })
    }
}
fn solve(n:usize,givens:&[u8],rules:&[Rule],tier:u8,
         trace:bool,disabled:Option<&str>)->Result<Proof,String>{
    Solver::new(n,givens,rules,tier,trace,disabled)?.run()
}
/// One verified deduction from the exact same Rust candidate engine used
/// by the generator. Player pencil marks are annotations, not solver axioms.
#[derive(Clone,Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct HintResponse {
    pub status: String,
    pub step: Option<Step>,
    pub level: u8,
}

pub fn next_hint(n:usize,grid:&[u8],rules:&[Rule],tier:u8)
    -> Result<HintResponse,String> {
    next_hint_with_notes(n,grid,rules,tier,&[])
}

/// Use center (or fallback corner) notes to avoid re-teaching eliminations
/// already recorded on the board. Notes are NEVER passed into the deduction
/// solver as assumed facts: incomplete notes must not create false proofs.
pub fn next_hint_with_notes(n:usize,grid:&[u8],rules:&[Rule],tier:u8,
    notes:&[Vec<u8>]) -> Result<HintResponse,String> {
    if !matches!(n,4|6|9) || !(1..=5).contains(&tier) || grid.len()!=n*n {
        return Err("仅支持 4×4 / 6×6 / 9×9 与提示等级 1–5".into());
    }
    if (!notes.is_empty() && notes.len()!=n*n) ||
       notes.iter().flatten().any(|&digit|digit==0||digit>n as u8) {
        return Err("玩家候选标记格式错误".into());
    }
    if rules.len()>100 || rules.iter().any(|rule|
        !matches!(rule.kind.as_str(),
            "killer"|"kropki"|"thermo"|"renban"|"whisper"|
            "arrow"|"xv"|"entropic"|"modular"|"between"|"region_sum") ||
        rule.cells.len()<2 || rule.cells.iter().any(|&i|i>=n*n)) {
        return Err("存在无法安全解释的变体规则".into());
    }
    let proof=solve(n,grid,rules,tier.min(4),true,None)?;
    if proof.solved && proof.trace.is_empty() {
        return Ok(HintResponse{status:"complete".into(),step:None,level:0});
    }
    // The solver trace begins from all possible digits, while the player may
    // have already crossed out many of them in center notes. The earliest raw
    // elimination is often redundant (e.g. remove 1 from annotated {2,7}).
    // Prefer a proven removal that still appears in a player's notes.
    let noted_progress=proof.trace.iter().find(|step|
        notes.get(step.cell).is_some_and(|candidates|
            !candidates.is_empty() && step.removed.iter().any(|digit|
                candidates.contains(digit))));
    // When no written candidate can be removed, a genuine determined digit
    // is more useful than another elementary reduction of a blank cell.
    let placement=proof.trace.iter().enumerate().find(|(idx,step)|
        step.remaining.len()==1 && step.before.len()>1 &&
        proof.trace[..*idx].iter().all(|prior|
            level_of(&prior.method)==1)).map(|(_,step)|step);
    // When there are annotations, do not fall back to eliminating candidates
    // that were *already absent* from the marked cell. Instead pick another
    // cell for which the player has not recorded candidates.
    let unannotated=proof.trace.iter().find(|step|
        notes.get(step.cell).is_none_or(|candidates|candidates.is_empty()));
    let chosen=noted_progress.or(placement)
        .or_else(||proof.trace.iter().find(|step|
            step.remaining.len()==1 && step.before.len()>1))
        .or(unannotated)
        .or_else(||if notes.is_empty(){proof.trace.first()}else{None});
    if let Some(step)=chosen {
        return Ok(HintResponse{
            status:"step".into(),level:level_of(&step.method),step:Some(step.clone())
        });
    }
    // The solver may still have deductions, but all candidate removals are
    // already absent from every annotated cell. Never recycle a stale hint or
    // pretend these notes are validated premises for deeper techniques.
    if !proof.trace.is_empty() && (tier<5 || proof.solved){
        return Ok(HintResponse{
            status:"notes_current".into(),step:None,level:tier.min(4)});
    }
    // If tier 4 genuinely stalled and all of its already-recorded
    // eliminations are redundant, an explicitly requested tier 5 may still
    // try a bounded search proof for one of the remaining handwritten digits.
    if tier<5 {
        return Ok(HintResponse{status:"stalled".into(),step:None,level:tier});
    }
    // Tier 5 is a deliberately separate, bounded proof by contradiction,
    // NOT a fabricated human-technique deduction. We only remove a tested
    // candidate after exhaustively proving that its branch has no solution.
    let (solutions,answer)=match exact_count(n,grid,rules,20_000) {
        Ok(result)=>result,
        Err(_)=>return Ok(HintResponse{
            status:"search_limit".into(),step:None,level:5}),
    };
    if solutions!=1 {
        return Ok(HintResponse{status:"not_unique".into(),step:None,level:5});
    }
    let mut choices:Vec<usize>=(0..n*n)
        .filter(|&i|count(proof.masks[i])>1).collect();
    choices.sort_by_key(|&i|(
        notes.get(i).is_none_or(|marked|marked.is_empty()),
        count(proof.masks[i])
    ));
    for &cell in choices.iter().take(4) {
        let candidates=values(proof.masks[cell],n);
        let prioritized=notes.get(cell).filter(|marked|!marked.is_empty());
        for candidate in candidates {
            if candidate==answer[cell] ||
                prioritized.is_some_and(|marked|!marked.contains(&candidate)) {
                continue;
            }
            let mut hypothetical=grid.to_vec();
            hypothetical[cell]=candidate;
            if let Ok((0,_))=exact_count(n,&hypothetical,rules,20_000) {
                let after=proof.masks[cell]&!bit(candidate);
                return Ok(HintResponse{status:"step".into(),level:5,
                    step:Some(Step{method:"search_contradiction".into(),cell,
                        removed:vec![candidate],remaining:values(after,n),
                        before:values(proof.masks[cell],n),sources:vec![cell]})});
            }
        }
    }
    Ok(HintResponse{status:"search_limit".into(),step:None,level:5})
}

/// Exact solution counting is separate from the deduction-only proof.
fn exact_count(n:usize,givens:&[u8],rules:&[Rule],node_limit:usize)
    -> Result<(usize,Vec<u8>),String>{
    let start=Solver::new(n,givens,rules,1,false,None)?.masks;
    let mut nodes=0usize;let mut answer=vec![];
    fn branch(n:usize,masks:Vec<Mask>,rules:&[Rule],nodes:&mut usize,
              max_nodes:usize,answer:&mut Vec<u8>)->Result<usize,String>{
        *nodes+=1;
        if *nodes>max_nodes {return Err("精确验证搜索超出本机计算上限".into());}
        let proof=match Solver::from_masks(n,masks,rules,1)?.run(){
            Ok(value)=>value,
            Err(_)=>return Ok(0)
        };
        if proof.solved{
            if answer.is_empty(){*answer=proof.values;}
            return Ok(1);
        }
        let index=(0..n*n).filter(|&i|count(proof.masks[i])>1)
            .min_by_key(|&i|count(proof.masks[i])).unwrap();
        let mut total=0;
        for d in values(proof.masks[index],n){
            let mut next=proof.masks.clone();next[index]=bit(d);
            total+=branch(n,next,rules,nodes,max_nodes,answer)?;
            if total>=2{return Ok(2);}
        }
        Ok(total)
    }
    let solutions=branch(n,start,rules,&mut nodes,node_limit,&mut answer)?;
    Ok((solutions,answer))
}

#[derive(Clone,Debug,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct CreateRequest {
    pub id: String,
    pub size: usize,
    pub tier: u8,
    #[serde(default)]
    pub variants: Vec<String>,
    #[serde(default)]
    pub focus: Option<String>,
    #[serde(default)]
    pub density: Option<String>,
    #[serde(default)]
    pub seed: Option<u64>,
    #[serde(default)]
    pub attempts: Option<usize>,
}
#[derive(Clone,Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct CreateResponse {
    pub puzzle: Value,
    pub details: Value,
}

const SUPPORTED: &[&str] = &[
    "killer","kropki","thermo","renban","whisper","arrow","xv",
    "entropic","modular","between","region_sum",
    "parity","inequality","clone","thermo_unknown","little_killer",
    "anti_knight_anchors","anti_whisper_anchors"
];
fn supports(n:usize,kind:&str)->bool{
    if !SUPPORTED.contains(&kind){return false;}
    if n==4 {matches!(kind,"killer"|"kropki"|"thermo"|"renban"|"arrow"|"xv"|
        "parity"|"inequality"|"clone"|"thermo_unknown")}
    else if n==6 {kind!="whisper"&&kind!="anti_whisper_anchors"}
    else {true}
}
fn zh_name(kind:&str)->&'static str {
    match kind{
        "killer"=>"杀手笼","kropki"=>"黑白点","thermo"=>"温度计",
        "renban"=>"连续线","whisper"=>"耳语线","arrow"=>"箭头",
        "xv"=>"V/X 标记","entropic"=>"熵线","modular"=>"模三线",
        "between"=>"夹心线","region_sum"=>"区域和线",
        "parity"=>"奇偶标记","inequality"=>"不等号",
        "clone"=>"克隆同值格","thermo_unknown"=>"无圆头温度计",
        "little_killer"=>"小杀手斜线和",
        "anti_knight_anchors"=>"反马步锚点",
        "anti_whisper_anchors"=>"反耳语锚点",_=>"普通数独"
    }
}
fn zh_rule(kind:&str)->&'static str{
    match kind{
        "killer"=>"每个虚线笼的数字之和等于角标，笼内不能有重复数字。",
        "kropki"=>"白点两侧数字相差 1，黑点两侧数字之比为 1:2；没标点的地方不受额外限制。",
        "thermo"=>"温度计上的数字从圆头到末端严格递增。",
        "renban"=>"蓝色连续线上数字不重复且形成连续整数集合，顺序可以任意。",
        "whisper"=>"耳语线相邻数字之差至少为 5。",
        "arrow"=>"橙色箭头的直线上数字之和等于圆头的数字。",
        "xv"=>"V 标记两格和为 5，X 标记两格和为 10。",
        "entropic"=>"任意连续三格分别属于三个等宽数字区间。",
        "modular"=>"任意连续三格除以 3 后的余数各不相同。",
        "between"=>"夹心线上内部数字必须严格介于两端圆圈数字之间。",
        "region_sum"=>"一条区域和线按宫界分段，各段数字之和相同。",
        "parity"=>"紫色圆形标记格为奇数、蓝色方形标记格为偶数；未标记的格不受限制。",
        "inequality"=>"相邻两格之间的不等号尖端指向较小数字。",
        "clone"=>"每一对同色底纹的克隆格数字相同；不同颜色的克隆对互不关联。",
        "thermo_unknown"=>"无圆头温度计沿整条线从一端到另一端严格递增，方向未知，但不能中途反向。",
        "little_killer"=>"斜线上的所有数字之和等于起点处的小号角标；同一斜线上允许重复（标准数独规则仍生效）。",
        "anti_knight_anchors"=>"棋马标记格与相距一个马步的每个格数字均不相同；普通格不额外受限。",
        "anti_whisper_anchors"=>"灰色锚点与其上下左右相邻格的数字差必须小于 5。",
        _=>""
    }
}
struct Rng(u64);
impl Rng {
    fn new(seed:u64)->Self{Self(if seed==0{0x6a09e667f3bcc909}else{seed})}
    fn next(&mut self)->u64{
        // Deterministic xorshift64*: stable on native and wasm32 targets.
        let mut x=self.0;
        x^=x>>12;x^=x<<25;x^=x>>27;self.0=x;
        x.wrapping_mul(0x2545f4914f6cdd1d)
    }
    fn range(&mut self,upper:usize)->usize {
        if upper<=1 {0}else{(self.next() as usize)%upper}
    }
    fn shuffle<T>(&mut self,data:&mut [T]){
        for i in (1..data.len()).rev(){let j=self.range(i+1);data.swap(i,j);}
    }
}
fn make_solution(n:usize,rng:&mut Rng)->Vec<u8>{
    let (h,w)=boxes(n);
    let mut band:Vec<usize>=(0..n/h).collect();rng.shuffle(&mut band);
    let mut stack:Vec<usize>=(0..n/w).collect();rng.shuffle(&mut stack);
    let mut rows=Vec::new();
    for group in band {
        let mut inner:Vec<usize>=(group*h..group*h+h).collect();
        rng.shuffle(&mut inner);rows.extend(inner);
    }
    let mut cols=Vec::new();
    for group in stack{
        let mut inner:Vec<usize>=(group*w..group*w+w).collect();
        rng.shuffle(&mut inner);cols.extend(inner);
    }
    let mut digits:Vec<u8>=(1..=n as u8).collect();rng.shuffle(&mut digits);
    let mut grid=Vec::with_capacity(n*n);
    for r in rows {
        for &c in &cols {grid.push(digits[(r*w+r/h+c)%n]);}
    }
    grid
}
fn neighbors(n:usize,i:usize)->Vec<usize>{
    let mut out=Vec::new();let r=i/n;let c=i%n;
    if r>0 {out.push(i-n);}
    if r+1<n {out.push(i+n);}
    if c>0 {out.push(i-1);}
    if c+1<n {out.push(i+1);}
    out
}
fn knight_neighbors(n:usize,i:usize)->Vec<usize>{
    let r=i/n;let c=i%n;let mut out=Vec::new();
    for (dr,dc) in [(1,2),(2,1),(1,-2),(2,-1),
                    (-1,2),(-2,1),(-1,-2),(-2,-1)] {
        let nr=r as isize+dr;let nc=c as isize+dc;
        if nr>=0&&nc>=0&&(nr as usize)<n&&(nc as usize)<n{
            out.push(nr as usize*n+nc as usize);
        }
    }
    out
}
fn path_valid(n:usize,solution:&[u8],rule:&Rule)->bool{
    let ds:Vec<u8>=rule.cells.iter().map(|&i|solution[i]).collect();
    let len=ds.len();
    match rule.kind.as_str(){
        "thermo"=>ds.windows(2).all(|p|p[0]<p[1]),
        "thermo_unknown"=>ds.windows(2).all(|p|p[0]<p[1]) ||
            ds.windows(2).all(|p|p[0]>p[1]),
        "whisper"=>ds.windows(2).all(|p|p[0].abs_diff(p[1])>=5),
        "renban"=>ds.iter().copied().collect::<HashSet<_>>().len()==len &&
            *ds.iter().max().unwrap()-*ds.iter().min().unwrap()==len as u8-1,
        "arrow"=>ds[0] as u16==ds[1..].iter().map(|&d|d as u16).sum::<u16>(),
        "between"=>{
            let lo=ds[0].min(ds[len-1]);let hi=ds[0].max(ds[len-1]);
            ds[1..len-1].iter().all(|&d|lo<d&&d<hi)
        },
        "entropic"|"modular"=>{
            ds.windows(3).all(|window|{
                let classes:BTreeSet<usize>=window.iter().map(|&d|
                    if rule.kind=="entropic"{(d as usize-1)/(n/3)}
                    else{(d as usize-1)%3}).collect();
                classes.len()==3
            })
        },
        "region_sum"=>{
            let mut sums=Vec::new();let mut b=box_id(n,rule.cells[0]);let mut sum=0u16;
            for (&cell,&digit) in rule.cells.iter().zip(ds.iter()){
                let next=box_id(n,cell);
                if next!=b {sums.push(sum);sum=0;b=next;}
                sum+=digit as u16;
            }
            sums.push(sum);sums.len()>1&&sums.iter().all(|&s|s==sums[0])
        },
        _=>false
    }
}
fn candidates(n:usize,solution:&[u8],kind:&str,rng:&mut Rng)->Vec<Rule>{
    let mut found=Vec::new();let mut seen=HashSet::new();
    if kind=="parity"{
        for i in 0..n*n{
            let mut mark=Rule::new(kind,vec![i]);
            mark.dot=Some((if solution[i]%2==0{"even"}else{"odd"}).to_string());
            found.push(mark);
        }
    }else if kind=="anti_knight_anchors"||kind=="anti_whisper_anchors"{
        for i in 0..n*n{
            let neighbors=if kind=="anti_knight_anchors"{
                knight_neighbors(n,i)
            }else{neighbors(n,i)};
            if !neighbors.is_empty()&&neighbors.iter().all(|&other|
                if kind=="anti_knight_anchors"{solution[i]!=solution[other]}
                else{solution[i].abs_diff(solution[other])<5}){
                found.push(Rule::new(kind,vec![i]));
            }
        }
    }else if kind=="clone"{
        for a in 0..n*n{
            for b in a+1..n*n{
                if !linked(n,a,b)&&solution[a]==solution[b]{
                    found.push(Rule::new(kind,vec![a,b]));
                }
            }
        }
    }else if kind=="little_killer"{
        // Only true border-entering straight diagonals, not arbitrary
        // zigzags or sums derived from nonvisible cells.
        for r in 0..n{
            for c in 0..n{
                for dc in [-1isize,1]{
                    if !(r==0||(dc==1&&c==0)||(dc==-1&&c==n-1)){continue;}
                    let mut cells=Vec::new();let mut row=r;let mut col=c as isize;
                    while row<n&&col>=0&&(col as usize)<n{
                        cells.push(row*n+col as usize);row+=1;col+=dc;
                    }
                    if cells.len()<3{continue;}
                    let mut rule=Rule::new(kind,cells);
                    rule.sum=Some(rule.cells.iter().map(|&i|solution[i] as u16).sum());
                    found.push(rule);
                }
            }
        }
    }else if kind=="killer"||kind=="kropki"||kind=="xv"||kind=="inequality"{
        for a in 0..n*n{
            for b in neighbors(n,a) {
                if b<=a {continue;}
                let x=solution[a];let y=solution[b];
                if kind=="inequality" {
                    if x!=y {
                        found.push(Rule::new(kind,if x<y {vec![a,b]}else{vec![b,a]}));
                    }
                }else if kind=="kropki" {
                    if x.abs_diff(y)==1{
                        let mut r=Rule::new(kind,vec![a,b]);
                        r.dot=Some("white".into());found.push(r);
                    }
                    if x.max(y)==2*x.min(y){
                        let mut r=Rule::new(kind,vec![a,b]);
                        r.dot=Some("black".into());found.push(r);
                    }
                }else if kind=="xv" {
                    if x as u16+y as u16==5||x as u16+y as u16==10 {
                        let mut r=Rule::new(kind,vec![a,b]);r.sum=Some(x as u16+y as u16);
                        found.push(r);
                    }
                }else if x!=y {
                    let mut r=Rule::new(kind,vec![a,b]);r.sum=Some(x as u16+y as u16);
                    found.push(r);
                    for c in neighbors(n,b){
                        if c==a||solution[c]==x||solution[c]==y{continue;}
                        let mut r=Rule::new(kind,vec![a,b,c]);
                        r.sum=Some(x as u16+y as u16+solution[c] as u16);
                        found.push(r);
                    }
                }
            }
        }
    }else{
        let length=if kind=="arrow"{3}else if kind=="between"||kind=="region_sum"{4}
            else{3+rng.range(2)};
        // Random guided walks; a valid visible relationship is required.
        for _ in 0..4500 {
            let mut path=vec![rng.range(n*n)];
            while path.len()<length{
                let mut next=neighbors(n,*path.last().unwrap());
                next.retain(|cell|!path.contains(cell));
                if next.is_empty(){break;}
                path.push(next[rng.range(next.len())]);
            }
            if path.len()!=length{continue;}
            let clue=Rule::new(kind,path);
            if !path_valid(n,solution,&clue){continue;}
            let forward=clue.cells.iter().map(|x|x.to_string())
                .collect::<Vec<_>>().join(",");
            if !seen.insert(forward){continue;}
            found.push(clue);
        }
    }
    rng.shuffle(&mut found);
    found
}
fn create_rules(n:usize,solution:&[u8],selected:&[String],
                density:&str,rng:&mut Rng)->Vec<Rule>{
    if selected.is_empty(){return vec![];}
    let target=match density{
        "light"=>(n*n+12)/12,
        "heavy"=>(n*n+3)/4,
        _=>(n*n+5)/7
    };
    let per=(target/selected.len()).max(1);
    let mut out=Vec::new();
    let mut occupied=HashSet::new();
    let mut used_edges=HashSet::new();
    let mut clone_cells=HashSet::new();
    for kind in selected{
        let options=candidates(n,solution,kind,rng);
        let mut added=0;
        for rule in options{
            if added >= (if kind=="clone"{per.min(8)}else{per}) {break;}
            if kind=="killer"&&rule.cells.iter().any(|c|occupied.contains(c)){continue;}
            if kind=="clone"&&rule.cells.iter().any(|c|clone_cells.contains(c)){continue;}
            let edges:Vec<_>=rule.cells.windows(2).map(|p|
                (p[0].min(p[1]),p[0].max(p[1]))).collect();
            if edges.iter().any(|edge|used_edges.contains(&(kind.clone(),*edge))){
                continue;
            }
            if kind=="killer"{occupied.extend(rule.cells.iter().copied());}
            if kind=="clone"{clone_cells.extend(rule.cells.iter().copied());}
            for edge in edges{used_edges.insert((kind.clone(),edge));}
            added+=1;out.push(rule);
        }
    }
    out
}
fn givens_grid(n:usize,solution:&[u8],rules:&[Rule],tier:u8,
               rng:&mut Rng)->Vec<u8>{
    let mut givens=solution.to_vec();
    let mut cells:Vec<usize>=(0..n*n).collect();rng.shuffle(&mut cells);
    for i in cells{
        let digit=givens[i];givens[i]=0;
        let acceptable=if tier==5{
            exact_count(n,&givens,rules,8000)
                .map(|(count,_)|count==1).unwrap_or(false)
        }else{
            solve(n,&givens,rules,tier,false,None)
                .map(|p|p.solved&&p.values==solution).unwrap_or(false)
        };
        if !acceptable {givens[i]=digit;}
    }
    givens
}
fn certify(n:usize,givens:&[u8],solution:&[u8],rules:&[Rule],
           tier:u8,focus:Option<&str>) -> Option<Proof>{
    let full=solve(n,givens,rules,tier.min(4),true,None).ok()?;
    if tier<5{
        if !full.solved||full.values!=solution{return None;}
        if tier>1 && solve(n,givens,rules,tier-1,false,None).ok()?.solved{return None;}
        if tier>1 && !full.trace.iter().any(|step|level_of(&step.method)==tier){
            return None;
        }
        if let Some(method)=focus{
            if !full.methods.contains_key(method){return None;}
            let without=solve(n,givens,rules,tier,false,Some(method)).ok()?;
            if without.solved{return None;}
        }
    }else if full.solved {
        // Level 5 is search-required relative to this level-4 curriculum.
        return None;
    }
    let (counted,answer)=exact_count(n,givens,rules,20000).ok()?;
    if counted!=1||answer!=solution {return None;}
    if !rules.is_empty() {
        let (without,_)=exact_count(n,givens,&[],20000).ok()?;
        if without!=2{return None;} // Rules must actually disambiguate.
    }
    Some(full)
}
fn point(n:usize,cell:usize)->Value{json!([cell/n,cell%n])}
fn centers(n:usize,cells:&[usize])->Vec<Value>{
    cells.iter().map(|&i|json!([(i/n) as f64+0.5,(i%n) as f64+0.5]))
        .collect()
}
fn render(n:usize,rules:&[Rule])->(Vec<Value>,Vec<Value>,Vec<Value>,Vec<Value>,Vec<Value>){
    let mut cages=Vec::new();
    let mut lines=Vec::new();
    let mut overlays=Vec::new();
    let mut underlays=Vec::new();
    let mut arrows=Vec::new();
    let clone_colors=["#ffdbbb","#c3e9f2","#ebc5f5","#ceeac0",
        "#f6d0df","#e4dfac","#c5d2ff","#ffd3b2"];
    let mut clone_number=0usize;
    for rule in rules{
        let cells=&rule.cells;
        let path=centers(n,cells);
        match rule.kind.as_str(){
            "parity"=>{
                let odd=rule.dot.as_deref()==Some("odd");
                underlays.push(json!({"center":path[0],"width":0.76,
                    "height":0.76,"rounded":odd,
                    "backgroundColor":if odd{"#e9d7f3"}else{"#d4e8f7"},
                    "borderColor":if odd{"#925eab"}else{"#4c80a8"},
                    "borderSize":1.8}));
            },
            "inequality"=>{
                let (a,b)=(cells[0],cells[1]);
                let mid=[((a/n+b/n) as f64)/2.0+0.5,
                    ((a%n+b%n) as f64)/2.0+0.5];
                let mark=if a/n==b/n{
                    if a%n<b%n{"<"}else{">"}
                }else if a/n<b/n{"∧"}else{"∨"};
                overlays.push(json!({"center":mid,"width":0.35,
                    "height":0.35,"backgroundColor":"#fffaf2",
                    "text":mark,"textColor":"#875438","fontSize":18}));
            },
            "clone"=>{
                let color=clone_colors[clone_number%clone_colors.len()];
                clone_number+=1;
                for center in &path{
                    underlays.push(json!({"center":center,"width":0.90,
                        "height":0.90,"rounded":true,
                        "backgroundColor":color,"borderColor":"#6b677c",
                        "borderSize":1.8}));
                }
            },
            "anti_knight_anchors"|"anti_whisper_anchors"=>{
                let knight=rule.kind=="anti_knight_anchors";
                underlays.push(json!({"center":path[0],"width":0.89,
                    "height":0.89,"rounded":true,
                    "backgroundColor":if knight{"#f8dbbe"}else{"#dddddd"},
                    "borderColor":if knight{"#c77b31"}else{"#777777"},
                    "borderSize":1.7}));
                let row=(cells[0]/n) as f64;let col=(cells[0]%n) as f64;
                overlays.push(json!({"center":[row+0.15,col+0.17],
                    "width":0.27,"height":0.27,
                    "text":if knight{"♘"}else{"W"},
                    "textColor":if knight{"#9b531d"}else{"#555555"},
                    "fontSize":11}));
            },
            "little_killer"=>{
                lines.push(json!({"wayPoints":path,"target":"underlay",
                    "thickness":5,"color":"#ba7d44"}));
                let row=(cells[0]/n) as f64;let col=(cells[0]%n) as f64;
                overlays.push(json!({"center":[row+0.16,col+0.20],
                    "width":0.35,"height":0.30,
                    "rounded":true,"backgroundColor":"#fff4dc",
                    "borderColor":"#b58b4d","borderSize":0.8,
                    "text":rule.sum.unwrap_or(0).to_string(),
                    "textColor":"#68401d","fontSize":12}));
            },
            "thermo_unknown"=>{
                lines.push(json!({"wayPoints":path,"target":"underlay",
                    "thickness":13,"color":"#c293bf"}));
            },
            "killer"=>cages.push(json!({"cells":cells.iter().map(|&i|point(n,i))
                .collect::<Vec<_>>(),"value":rule.sum.unwrap_or(0).to_string(),
                "unique":true,"outlineC":"#3e668b","fontC":"#234e73"})),
            "kropki"|"xv"=>{
                let (a,b)=(cells[0],cells[1]);
                let mid=[((a/n+b/n) as f64)/2.0+0.5,
                    ((a%n+b%n) as f64)/2.0+0.5];
                if rule.kind=="kropki"{
                    overlays.push(json!({"center":mid,"width":0.22,"height":0.22,
                        "rounded":true,"backgroundColor":
                            if rule.dot.as_deref()==Some("white"){"#ffffff"}
                            else{"#28262d"},
                        "borderColor":"#28262d","borderSize":1.3}));
                }else{
                    overlays.push(json!({"center":mid,"width":0.35,"height":0.35,
                        "rounded":true,"backgroundColor":"#fff9db",
                        "borderColor":"#ae8c35","borderSize":1.2,
                        "text":if rule.sum==Some(5){"V"}else{"X"},
                        "textColor":"#614e18","fontSize":18}));
                }
            },
            "arrow"=>{
                arrows.push(json!({"wayPoints":path,"color":"#d29754",
                    "thickness":4,"headLength":0.18}));
                underlays.push(json!({"center":path[0],"width":0.75,"height":0.75,
                    "rounded":true,"backgroundColor":"#fff6e4",
                    "borderColor":"#d29754","borderSize":2}));
            },
            _=>{
                let (color,thickness)=match rule.kind.as_str(){
                    "thermo"=>("#b89acb",20),"renban"=>("#85a8d8",16),
                    "whisper"=>("#7abe9a",12),"region_sum"=>("#3b619c",10),
                    "entropic"=>("#d8a752",10),"modular"=>("#45a8ab",10),
                    "between"=>("#a783d6",8),_=>continue
                };
                lines.push(json!({"wayPoints":path,"target":"underlay",
                    "thickness":thickness,"color":color}));
                if rule.kind=="thermo"{
                    underlays.push(json!({"center":path[0],"width":0.65,
                        "height":0.65,"rounded":true,
                        "backgroundColor":color,"borderColor":"#7c5b9a","borderSize":1}));
                }
                if rule.kind=="between"{
                    for end in [path.first().unwrap(),path.last().unwrap()] {
                        underlays.push(json!({"center":end,"width":0.72,
                            "height":0.72,"rounded":true,"backgroundColor":"#f8f3ff",
                            "borderColor":color,"borderSize":2}));
                    }
                }
            }
        }
    }
    (cages,lines,underlays,overlays,arrows)
}

fn render_puzzle(request:&CreateRequest,seed:u64,givens:&[u8],
                 solution:&[u8],rules:&[Rule],proof:&Proof,attempt:usize)
                 -> CreateResponse{
    let n=request.size;
    let (h,w)=boxes(n);
    let regions:Vec<Value>=(0..n).step_by(h).flat_map(|r|
        (0..n).step_by(w).map(move |c|
            json!((0..h).flat_map(|dr|(0..w).map(move |dc|
                [r+dr,c+dc])).collect::<Vec<_>>())
        )).collect();
    let cells:Vec<Value>=(0..n).map(|r|json!(
        (0..n).map(|c|if givens[r*n+c]==0 {json!({})}
            else{json!({"value":givens[r*n+c].to_string()})}
        ).collect::<Vec<_>>())).collect();
    let (cages,lines,underlays,overlays,arrows)=render(n,rules);
    let mut description=format!("标准数独：每行、每列和每个 {}×{} 宫都恰好包含 1–{}。\n",h,w,n);
    for kind in &request.variants{
        description.push_str(&format!("{}：{}\n",zh_name(kind),zh_rule(kind)));
    }
    if request.tier==5{
        description.push_str("技巧等级 5：客户端前四级逻辑技巧无法完成此题，唯一解由精确搜索确认。可能需要尝试、穷举或更高阶逻辑。");
    }else if request.tier==1{
        description.push_str("技巧等级 1：基础排除、隐性唯一数和变体局部逻辑即可完成，无需猜测。");
    }else{
        description.push_str(&format!("技巧等级 {}：已证明前一级技巧无法完成，当前技巧可以无猜测完成。",request.tier));
    }
    let title=format!("本机创作 · {}×{} · 级别 {} · {}",n,n,request.tier,
        if request.variants.is_empty(){"经典数独".into()}
        else{request.variants.iter().map(|k|zh_name(k)).collect::<Vec<_>>().join(" + ")});
    let solution_text=solution.iter().map(|digit|digit.to_string())
        .collect::<String>();
    let given_count=givens.iter().filter(|&&d|d!=0).count();
    let methods=proof.methods.clone();
    let logic=json!({"minimumTier":request.tier,
        "requiresGuessing":if request.tier==5{Value::Null}else{json!(false)},
        "mayNeedSearch":request.tier==5,
        "clientCurriculum":true,"searchCertified":true,
        "techniques":methods,"focusTechnique":request.focus});
    let puzzle=json!({
        "id":request.id,"cells":cells,"regions":regions,"cages":cages,
        "lines":lines,"overlays":overlays,"underlays":underlays,"arrows":arrows,
        "metadata":{
            "title":title,"author":"SudokuPadX 本机生成器","rules":description,
            "solution":solution_text,"msgcorrect":"完成！这是你在本机生成的唯一解谜题。",
            "variantFamily":"personal-created",
            "variantTypes":request.variants,
            "generatorSeed":seed,"generatorAttempt":attempt,
            "solverRules":rules,
            "logicProfile":logic
        }
    });
    CreateResponse{
        puzzle,
        details:json!({"id":request.id,"title":title,"size":n,"tier":request.tier,
            "givens":given_count,"marks":rules.len(),
            "variants":request.variants,"focus":request.focus,
            "seed":seed,"attempt":attempt,"searchRequired":request.tier==5,
            "techniques":proof.methods,"steps":proof.trace.len()})
    }
}

/// Generate on the current device. The UI must call it on a background Rust
/// thread (Android) or a dedicated Worker (browser WASM).
pub fn generate_puzzle(request: CreateRequest)->Result<CreateResponse,String>{
    if !matches!(request.size,4|6|9)||!(1..=5).contains(&request.tier){
        return Err("仅支持 4×4 / 6×6 / 9×9 与技巧等级 1–5".into());
    }
    if request.id.is_empty()||request.id.len()>120||
        !request.id.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-'){
        return Err("生成谜题编号无效".into());
    }
    if request.variants.len()>SUPPORTED.len() ||
       request.variants.iter().collect::<HashSet<_>>().len()!=request.variants.len() ||
       request.variants.iter().any(|k|!supports(request.size,k)){
        return Err("含有重复或当前尺寸不支持的变体规则".into());
    }
    if request.tier>=3&&request.size!=9{
        return Err("当前等级 3–5 仅开放 9×9；4×4 与 6×6 使用等级 1–2".into());
    }
    let density=request.density.as_deref().unwrap_or("medium");
    if !matches!(density,"light"|"medium"|"heavy"){
        return Err("标记密度需为 light / medium / heavy".into());
    }
    if let Some(method)=request.focus.as_deref(){
        if !allowed_focus(method)||level_of(method)>request.tier||
            request.tier==5{
            return Err("选择的重点技巧不属于当前等级".into());
        }
    }
    let attempts=request.attempts.unwrap_or(24);
    if attempts==0||attempts>80{return Err("尝试次数需在 1–80 之间".into());}
    let seed=request.seed.unwrap_or(20261104);
    let mut rng=Rng::new(seed);
    for attempt in 1..=attempts {
        let solution=make_solution(request.size,&mut rng);
        let rules=create_rules(request.size,&solution,&request.variants,density,&mut rng);
        if rules.iter().map(|r|r.kind.as_str()).collect::<HashSet<_>>().len()
            !=request.variants.len() {continue;}
        let givens=givens_grid(request.size,&solution,&rules,request.tier,&mut rng);
        if let Some(proof)=certify(request.size,&givens,&solution,&rules,
                                  request.tier,request.focus.as_deref()){
            return Ok(render_puzzle(&request,seed,&givens,&solution,&rules,&proof,attempt));
        }
    }
    Err(format!("{} 次尝试均未生成严格满足等级 {} 的唯一解题目。可增加尝试次数、调整规则数量/密度或换一个随机种子；不会伪造技巧等级。",attempts,request.tier))
}

#[cfg(test)]
mod tests{
    use super::*;
    #[test]
    fn solved_grids_are_real_sudokus(){
        for n in [4,6,9]{
            let mut rng=Rng::new(4321);
            for _ in 0..8{
                let sol=make_solution(n,&mut rng);
                assert_eq!(sol.len(),n*n);
                for unit in units(n){
                    assert_eq!(unit.iter().map(|&i|sol[i])
                        .collect::<BTreeSet<_>>().len(),n);
                }
            }
        }
    }
    #[test]
    fn authored_rules_are_consistent_with_the_solution(){
        let mut rng=Rng::new(82371);
        let sol=make_solution(9,&mut rng);
        for kind in SUPPORTED {
            let rules=create_rules(9,&sol,&[kind.to_string()],"medium",&mut rng);
            assert!(!rules.is_empty(),"Missing authored family: {kind}");
            assert!(solve(9,&sol,&rules,1,false,None).unwrap().solved,
                "Invalid printed {kind} rules");
        }
    }
    #[test]
    fn exact_counter_detects_unconstrained_ambiguity(){
        let givens=vec![0;16];
        assert_eq!(exact_count(4,&givens,&[],500).unwrap().0,2);
    }
    #[test]
    fn generate_classic_four_by_four_and_load_with_existing_core(){
        let request=CreateRequest{
            id:"personal-demo-1".into(),size:4,tier:1,variants:vec![],
            focus:None,density:Some("light".into()),seed:Some(9932),
            attempts:Some(3),
        };
        let output=generate_puzzle(request).unwrap();
        assert_eq!(output.details["tier"],1);
        let raw=serde_json::to_string(&output.puzzle).unwrap();
        let loaded=crate::load(&raw).unwrap();
        assert_eq!(loaded.rows,4);
        assert_eq!(loaded.cols,4);
        assert_eq!(loaded.key,"personal-demo-1");
        assert!(loaded.hint_rules.as_ref().is_some_and(Vec::is_empty));
        let mut session=crate::Session::new(loaded);
        let (n,initial_grid,_,_)=session.hint_input().unwrap();
        let first_blank=initial_grid.iter().position(|&digit|digit==0).unwrap();
        session.apply(first_blank,"center","2").unwrap();
        let (n,grid,rules,notes)=session.hint_input().unwrap();
        assert_eq!(notes.len(),n*n);
        assert_eq!(notes[first_blank],vec![2],
            "The live hint snapshot must carry the player's center notes");
        assert_eq!(grid[first_blank],0,
            "Writing center notes must never become a solver given");
        let response=next_hint_with_notes(n,&grid,&rules,1,&notes).unwrap();
        assert_eq!(response.status,"step");
        let step=response.step.unwrap();
        assert_eq!(level_of(&step.method),1);
        assert!(step.cell<n*n && !step.removed.is_empty());
        let answer=output.puzzle["metadata"]["solution"].as_str().unwrap();
        let digit=answer.as_bytes()[step.cell]-b'0';
        assert!(!step.removed.contains(&digit),
            "Hint must not eliminate the known correct digit");
        assert!(step.sources.iter().all(|&cell|cell<n*n));
    }
    #[test]
    fn hint_never_repeats_elimination_missing_from_center_notes(){
        let n=9;
        let mut grid=vec![0;n*n];
        grid[1]=1;
        let mut notes=vec![Vec::new();n*n];
        notes[0]=vec![2,7];
        let hint=next_hint_with_notes(n,&grid,&[],1,&notes).unwrap();
        let step=hint.step.unwrap();
        assert_ne!(step.cell,0,
            "Removing 1 from R1C1 is redundant once its notes say 2 and 7");
        assert_eq!(hint.level,1);
    }
    #[test]
    fn hint_prioritizes_provable_elimination_of_a_marked_candidate(){
        let n=9;
        let mut grid=vec![0;n*n];
        grid[1]=2;
        let mut notes=vec![Vec::new();n*n];
        notes[0]=vec![2,7];
        let hint=next_hint_with_notes(n,&grid,&[],1,&notes).unwrap();
        let step=hint.step.unwrap();
        assert_eq!(step.cell,0);
        assert_eq!(step.removed,vec![2]);
        assert!(step.remaining.contains(&7));
    }
    #[test]
    fn general_naked_and_hidden_quadruples_are_real_tier_two_deductions(){
        let mut masks=vec![full(9);81];
        masks[0]=bit(1)|bit(2);
        masks[1]=bit(1)|bit(3);
        masks[2]=bit(2)|bit(4);
        masks[3]=bit(3)|bit(4);
        masks[4]=bit(1)|bit(2)|bit(3)|bit(4)|bit(5);
        let mut solver=Solver::from_masks(9,masks,&[],2).unwrap();
        assert!(solver.subsets().unwrap());
        assert_eq!(solver.masks[4],bit(5),
            "Four cells restricted to 1,2,3,4 reserve all four digits");

        let mut other=vec![full(9);81];
        let allowed=bit(1)|bit(2)|bit(3)|bit(4);
        for cell in 0..4 {other[cell]=allowed|bit(6);}
        let outside=bit(5)|bit(6)|bit(7)|bit(8)|bit(9);
        for cell in 4..9 {other[cell]=outside;}
        let mut hidden=Solver::from_masks(9,other,&[],2).unwrap();
        assert!(hidden.subsets().unwrap());
        for cell in 0..4 {
            assert_eq!(hidden.masks[cell]&!allowed,0,
                "Four digits restricted to four cells remove outside digits");
        }
    }

    #[test]
    fn incomplete_handwritten_candidates_cannot_force_a_false_single(){
        let n=9;
        let grid=vec![0;n*n];
        let mut notes=vec![Vec::new();n*n];
        notes[0]=vec![7]; // A one-digit note is not a confirmed placement.
        let hint=next_hint_with_notes(n,&grid,&[],1,&notes).unwrap();
        assert_eq!(hint.status,"stalled");
        assert!(hint.step.is_none());
    }
    #[test]
    fn correctly_annotated_eliminations_are_not_replayed(){
        let n=4;
        let mut grid=vec![0;n*n];
        grid[1]=1;
        let mut notes=vec![vec![2,3,4];n*n];
        notes[1].clear();
        let hint=next_hint_with_notes(n,&grid,&[],1,&notes).unwrap();
        assert_eq!(hint.status,"notes_current");
        assert!(hint.step.is_none());
    }
    #[test]
    fn level_five_is_a_real_unique_hard_classic_not_a_mocked_label(){
        // A known 23-given very hard classical Sudoku: the printed rules
        // and givens alone feed both the deduction solver and exact counter.
        let rows=[
            "1....7.9.",".3..2...8","..96..5..","..53..9..",
            ".1..8...2","6....4...","3......1.",".4......7",
            "..7...3.."
        ];
        let givens:Vec<u8>=rows.join("").chars().map(|c|
            c.to_digit(10).unwrap_or(0) as u8).collect();
        let (solutions,answer)=exact_count(9,&givens,&[],20000).unwrap();
        assert_eq!(solutions,1);
        assert!(!solve(9,&givens,&[],4,false,None).unwrap().solved,
            "Level 4 must genuinely stall before claiming level 5");
        assert!(certify(9,&givens,&answer,&[],5,None).is_some());
        assert!(certify(9,&answer,&answer,&[],5,None).is_none(),
            "Full grid cannot be mislabeled level 5");
    }
    #[test]
    fn reject_unsupported_and_false_technique_labels(){
        let request=CreateRequest{
            id:"personal-invalid".into(),size:4,tier:5,variants:vec![],
            focus:None,density:None,seed:Some(2),attempts:Some(2)
        };
        assert!(generate_puzzle(request).is_err());
        assert!(!allowed_focus("invented_method"));
    }
}
