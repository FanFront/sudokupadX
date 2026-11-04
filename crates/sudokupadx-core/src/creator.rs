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
        "modular"|"between"|"region_sum"|
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
            methods:BTreeMap::new(),trace})
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
        let before=self.masks[i],after=before&allowed;
        if after==0 {return Err("候选数字无解".into());}
        if before==after {return Ok(false);}
        self.masks[i]=after;
        *self.methods.entry(method.to_owned()).or_default()+=1;
        if self.trace {
            self.steps.push(Step{method:method.to_owned(),cell:i,
                removed:values(before&!after,self.n),
                remaining:values(after,self.n)});
        }
        Ok(true)
    }
    fn binary(&mut self,a:usize,b:usize,kind:&str,
              relation:impl Fn(u8,u8)->bool)->Result<bool,String>{
        let mut left=0,right=0;
        for x in values(self.masks[a],self.n) {
            for y in values(self.masks[b],self.n) {
                if relation(x,y) {left|=bit(x);right|=bit(y);}
            }
        }
        let x=self.reduce(a,left,kind)?;
        Ok(self.reduce(b,right,kind)?||x)
    }
    fn rule(&mut self,rule:&Rule)->Result<bool,String>{
        let cells=&rule.cells;
        if cells.iter().any(|&i|i>=self.n*self.n)||cells.len()<2 {
            return Err("变体坐标错误".into());
        }
        match rule.kind.as_str() {
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
                    changed|=self.reduce(i,!seen,"peer_elimination")?;
                }
            }
            for d in 1..=self.n as u8{
                let positions:Vec<_>=house.iter().copied()
                    .filter(|&i|self.masks[i]&bit(d)!=0).collect();
                if positions.is_empty(){return Err("某个数字没有候选位置".into());}
                if positions.len()==1{
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
            for size in 2..=3 {
                for selected in combinations(&unsolved,size){
                    let union=selected.iter().fold(0,|a,&i|a|self.masks[i]);
                    if count(union)!=size as u32 {continue;}
                    for &cell in &house {
                        if !selected.contains(&cell) {
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
                    for cell in locations{
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
               out:&mut Vec<(usize,Mask)>,max_depth:usize) {
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
                            out.push((cell,bit(target)));
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
        for (cell,mask) in eliminations{
            changed|=self.reduce(cell,!mask,"xy_chain")?;
        }
        Ok(changed)
    }
    fn run(mut self)->Result<Proof,String>{
        for iteration in 0..150 {
            let mut changed=self.houses()?;
            for rule in self.rules.clone(){changed|=self.rule(&rule)?;}
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
