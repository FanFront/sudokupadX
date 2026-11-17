//! Advanced, no-guess Sudopedia deductions for Android and Web.
//! The same invariant as the Python curriculum holds: a source is a
//! visible candidate relation, not an assumed answer or a search branch.
use super::*;
use std::collections::{BTreeSet, VecDeque};

fn bits(cells:&[usize])->u128 {
    cells.iter().fold(0u128,|a,&i|a|(1u128<<i))
}
fn weak(n:usize,a:usize,b:usize)->bool {
    let ac=a/9;let bc=b/9;let ad=a%9;let bd=b%9;
    (ac==bc && ad!=bd) || (ad==bd && ac!=bc && linked(n,ac,bc))
}

impl Solver {
    pub(super) fn advanced_patterns(&mut self)->Result<bool,String>{
        if self.n!=9{return Ok(false);}
        if self.wxyz_wing_ext()?{return Ok(true);}
        if self.sue_de_coq_ext()?{return Ok(true);}
        if self.empty_rectangle_ext()?{return Ok(true);}
        if self.medusa_ext()?{return Ok(true);}
        if self.aic_ext()?{return Ok(true);}
        if self.general_fish_ext()?{return Ok(true);}
        Ok(false)
    }

    fn wxyz_wing_ext(&mut self)->Result<bool,String>{
        for pivot in 0..81{
            if count(self.masks[pivot])!=4{continue;}
            for z in values(self.masks[pivot],9){
                let others:Vec<_>=values(self.masks[pivot]&!bit(z),9);
                if others.len()!=3{continue;}
                let choices:Vec<Vec<usize>>=others.iter().map(|&d|
                    (0..81).filter(|&i|i!=pivot&&linked(9,i,pivot)
                        && self.masks[i]==(bit(d)|bit(z))).collect()
                ).collect();
                if choices.iter().any(Vec::is_empty){continue;}
                for &a in &choices[0]{
                    for &b in &choices[1]{
                        for &c in &choices[2]{
                            if a==b||a==c||b==c{continue;}
                            for cell in 0..81{
                                if [pivot,a,b,c].contains(&cell)
                                    ||![pivot,a,b,c].iter().all(|&i|linked(9,cell,i))
                                    {continue;}
                                self.reason=vec![pivot,a,b,c];
                                if self.reduce(cell,!bit(z),"wxyz_wing")?{
                                    return Ok(true);
                                }
                            }
                        }
                    }
                }
            }
        }
        Ok(false)
    }

    fn sue_de_coq_ext(&mut self)->Result<bool,String>{
        let houses=self.units.clone();
        for line in 0..18{
            for box_id in 18..27{
                let cross:Vec<usize>=houses[line].iter().copied()
                    .filter(|c|houses[box_id].contains(c)).collect();
                if cross.len()<2{continue;}
                let line_wings:Vec<usize>=houses[line].iter().copied()
                    .filter(|i|!houses[box_id].contains(i)
                        && count(self.masks[*i])==2).collect();
                let box_wings:Vec<usize>=houses[box_id].iter().copied()
                    .filter(|i|!houses[line].contains(i)
                        && count(self.masks[*i])==2).collect();
                for pair in combinations(&cross,2){
                    if pair.iter().any(|&i|count(self.masks[i])<2){continue;}
                    let digits=self.masks[pair[0]]|self.masks[pair[1]];
                    if count(digits)!=4{continue;}
                    for &a in &line_wings{
                        if self.masks[a]&!digits!=0{continue;}
                        for &b in &box_wings{
                            if self.masks[a]&self.masks[b]!=0
                                || self.masks[a]|self.masks[b]!=digits {continue;}
                            let source=vec![pair[0],pair[1],a,b];
                            for &target in &houses[line] {
                                if pair.contains(&target)||target==a{continue;}
                                self.reason=source.clone();
                                if self.reduce(target,!self.masks[a],"sue_de_coq")?{
                                    return Ok(true);
                                }
                            }
                            for &target in &houses[box_id] {
                                if pair.contains(&target)||target==b{continue;}
                                self.reason=source.clone();
                                if self.reduce(target,!self.masks[b],"sue_de_coq")?{
                                    return Ok(true);
                                }
                            }
                        }
                    }
                }
            }
        }
        Ok(false)
    }

    fn empty_rectangle_ext(&mut self)->Result<bool,String>{
        for digit in 1..=9{
            for box_no in 0..9{
                let house=self.units[18+box_no].clone();
                let possible:Vec<_>=house.iter().copied().filter(
                    |&c|self.masks[c]&bit(digit)!=0).collect();
                if possible.len()<2{continue;}
                let rows:BTreeSet<_>=house.iter().map(|&c|c/9).collect();
                let cols:BTreeSet<_>=house.iter().map(|&c|c%9).collect();
                for &row in &rows{for &col in &cols{
                    if !possible.iter().all(|&c|c/9==row||c%9==col)
                        || !possible.iter().any(|&c|c/9==row&&c%9!=col)
                        || !possible.iter().any(|&c|c%9==col&&c/9!=row)
                        {continue;}
                    for outer_col in 0..9{
                        if cols.contains(&outer_col){continue;}
                        let x=row*9+outer_col;
                        if self.masks[x]&bit(digit)==0{continue;}
                        let options:Vec<_>=self.units[9+outer_col].iter().copied()
                            .filter(|&i|self.masks[i]&bit(digit)!=0).collect();
                        if options.len()!=2||!options.contains(&x){continue;}
                        let y=if options[0]==x{options[1]}else{options[0]};
                        let target=y/9*9+col;
                        if house.contains(&target){continue;}
                        self.reason=possible.iter().copied().chain([x,y]).collect();
                        if self.reduce(target,!bit(digit),"empty_rectangle")?{
                            return Ok(true);
                        }
                    }
                    for outer_row in 0..9{
                        if rows.contains(&outer_row){continue;}
                        let x=outer_row*9+col;
                        if self.masks[x]&bit(digit)==0{continue;}
                        let options:Vec<_>=self.units[outer_row].iter().copied()
                            .filter(|&i|self.masks[i]&bit(digit)!=0).collect();
                        if options.len()!=2||!options.contains(&x){continue;}
                        let y=if options[0]==x{options[1]}else{options[0]};
                        let target=row*9+y%9;
                        if house.contains(&target){continue;}
                        self.reason=possible.iter().copied().chain([x,y]).collect();
                        if self.reduce(target,!bit(digit),"empty_rectangle")?{
                            return Ok(true);
                        }
                    }
                }}
            }
        }
        Ok(false)
    }

    fn strong_candidate_graph(&self)->Vec<BTreeSet<usize>>{
        let mut graph=vec![BTreeSet::new();729];
        for cell in 0..81{
            if count(self.masks[cell])==2 {
                let ds=values(self.masks[cell],9);
                let a=cell*9+(ds[0]-1) as usize;
                let b=cell*9+(ds[1]-1) as usize;
                graph[a].insert(b);graph[b].insert(a);
            }
        }
        for house in &self.units {
            for d in 1..=9u8{
                let cs:Vec<_>=house.iter().copied()
                    .filter(|&i|self.masks[i]&bit(d)!=0).collect();
                if cs.len()==2{
                    let a=cs[0]*9+(d-1) as usize;
                    let b=cs[1]*9+(d-1) as usize;
                    graph[a].insert(b);graph[b].insert(a);
                }
            }
        }
        graph
    }

    fn color_components(&self, graph:&[BTreeSet<usize>])
        ->Vec<Vec<(usize,u8)>>{
        let mut seen=vec![false;729];let mut result=Vec::new();
        for start in 0..729{
            if seen[start]||graph[start].is_empty(){continue;}
            let mut colors=vec![None;729];
            let mut queue=VecDeque::from([start]);
            let mut nodes=Vec::new();let mut consistent=true;
            colors[start]=Some(0);
            while let Some(node)=queue.pop_front(){
                nodes.push(node);
                for &other in &graph[node]{
                    match colors[other]{
                        Some(shade) => if shade==colors[node].unwrap(){consistent=false;},
                        None=>{
                            colors[other]=Some(1-colors[node].unwrap());
                            queue.push_back(other);
                        }
                    }
                }
            }
            for &node in &nodes{seen[node]=true;}
            if consistent && nodes.len()>=4 {
                result.push(nodes.into_iter().map(|node|
                    (node,colors[node].unwrap())).collect());
            }
        }
        result
    }

    fn medusa_ext(&mut self)->Result<bool,String>{
        let graph=self.strong_candidate_graph();
        for component in self.color_components(&graph){
            if component.iter().map(|(node,_)|node%9).collect::<BTreeSet<_>>().len()<2{
                continue;
            }
            let sides:Vec<Vec<usize>>=(0..=1).map(|color|
                component.iter().filter(|(_,c)|*c==color)
                    .map(|(node,_)|*node).collect()
            ).collect();
            let reason:Vec<usize>=component.iter().map(|(node,_)|node/9).collect();
            for (shade,group) in sides.iter().enumerate(){
                if combinations(group,2).iter().any(|pair|weak(9,pair[0],pair[1])){
                    for &node in group{
                        self.reason=reason.clone();
                        let digit=(node%9+1) as u8;
                        if self.reduce(node/9,!bit(digit),"medusa_wrap")?{
                            return Ok(true);
                        }
                    }
                    let _=shade;
                }
            }
            let active:BTreeSet<_>=component.iter().map(|(node,_)|*node).collect();
            for cell in 0..81{
                for digit in values(self.masks[cell],9){
                    let node=cell*9+(digit-1) as usize;
                    if active.contains(&node){continue;}
                    if sides.iter().all(|side|side.iter().any(|&other|weak(9,node,other))){
                        self.reason=reason.clone();
                        if self.reduce(cell,!bit(digit),"medusa_trap")?{
                            return Ok(true);
                        }
                    }
                }
            }
        }
        Ok(false)
    }

    fn aic_ext(&mut self)->Result<bool,String>{
        let graph=self.strong_candidate_graph();
        let active:Vec<usize>=(0..729).filter(|&i|!graph[i].is_empty()).collect();
        if active.is_empty(){return Ok(false);}
        let mut weak_all=vec![BTreeSet::new();729];
        for &node in &active{
            let cell=node/9;let digit=(node%9+1) as u8;
            for other in 0..81{
                if other!=cell&&linked(9,cell,other)&&
                    self.masks[other]&bit(digit)!=0{
                    weak_all[node].insert(other*9+(digit-1) as usize);
                }
            }
            for d in values(self.masks[cell]&!bit(digit),9){
                weak_all[node].insert(cell*9+(d-1) as usize);
            }
        }
        let active_set: BTreeSet<usize>=active.iter().copied().collect();
        let mut total=0usize;
        for &start in &active{
            let mut queue=VecDeque::from([vec![start]]);
            let mut examined=0;
            while let Some(path)=queue.pop_front(){
                examined+=1;total+=1;
                if examined>600||total>18000{break;}
                let node=*path.last().unwrap();
                let edges=path.len()-1;
                if edges>=3&&edges%2==1{
                    for &target in weak_all[start].intersection(&weak_all[node]){
                        if path.contains(&target){continue;}
                        self.reason=path.iter().map(|c|c/9).collect();
                        let digit=(target%9+1) as u8;
                        if self.reduce(target/9,!bit(digit),"aic")?{
                            return Ok(true);
                        }
                    }
                }
                if edges>=7{continue;}
                let neighbors:BTreeSet<usize>=if edges%2==0{
                    graph[node].clone()
                }else{
                    weak_all[node].intersection(&active_set).copied().collect()
                };
                for next in neighbors{
                    if !path.contains(&next){
                        let mut continuation=path.clone();
                        continuation.push(next);
                        queue.push_back(continuation);
                    }
                }
            }
            if total>18000{break;}
        }
        Ok(false)
    }

    fn general_fish_ext(&mut self)->Result<bool,String>{
        let house_bits:Vec<u128>=self.units.iter().map(|house|bits(house)).collect();
        let mut covers=Vec::new();
        for size in 2..=3{
            covers.push(combinations(&(0..27).collect::<Vec<_>>(),size)
                .into_iter().filter(|houses|combinations(houses,2).iter().all(
                    |p|house_bits[p[0]]&house_bits[p[1]]==0
                )).collect::<Vec<_>>());
        }
        for digit in 1..=9u8{
            let positions:Vec<Vec<usize>>=self.units.iter().map(|house|
                house.iter().copied().filter(|&i|self.masks[i]&bit(digit)!=0)
                    .collect()).collect();
            let eligible:Vec<usize>=(0..27).filter(|&i|
                (2..=4).contains(&positions[i].len())).collect();
            let mut checked=0usize;
            for size in 2..=3{
                for base in combinations(&eligible,size){
                    if combinations(&base,2).iter().any(
                        |pair|house_bits[pair[0]]&house_bits[pair[1]]!=0) {
                        continue;
                    }
                    let candidate_cells:Vec<usize>=base.iter().flat_map(
                        |&i|positions[i].iter().copied()).collect();
                    let candidate_bits=bits(&candidate_cells);
                    if candidate_cells.len()>size*4{continue;}
                    for cover in &covers[size-2]{
                        checked+=1;
                        if checked>90_000{break;}
                        if cover.iter().any(|i|base.contains(i)){continue;}
                        let has_box_base=base.iter().any(|&i|i>=18);
                        let has_box_cover=cover.iter().any(|&i|i>=18);
                        if !(has_box_base||has_box_cover){continue;}
                        let cover_bits=cover.iter().fold(0u128,|a,&i|a|house_bits[i]);
                        if candidate_bits & !cover_bits != 0 {continue;}
                        if cover.iter().any(|&i|candidate_bits&house_bits[i]==0){
                            continue;
                        }
                        let method=if has_box_base && has_box_cover {
                            "mutant_fish"
                        }else{
                            "franken_fish"
                        };
                        self.reason=candidate_cells.clone();
                        for cell in 0..81{
                            if cover_bits & (1u128<<cell)==0 ||
                                candidate_bits & (1u128<<cell)!=0 {continue;}
                            if self.reduce(cell,!bit(digit),method)? {
                                return Ok(true);
                            }
                        }
                    }
                    if checked>90_000{break;}
                }
                if checked>90_000{break;}
            }
        }
        Ok(false)
    }
}
