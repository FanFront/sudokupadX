//! Readable single-digit links and bivalue pairing patterns.
//! These rules do not try hypothetical candidate assignments.
use super::{bit, box_id, count, linked, sole, values, Mask, Solver};
use std::collections::{BTreeMap, VecDeque};

impl Solver {
    /// Two conjugate pairs (row and column) whose inner tips share a box.
    pub(super) fn two_string_kites(&mut self)->Result<bool,String>{
        if self.n!=9{return Ok(false);}
        let mut changed=false;
        for digit in 1..=9u8 {
            for row in 0..9 {
                let r:Vec<usize>=(0..9)
                    .map(|col|row*9+col)
                    .filter(|&cell|self.masks[cell]&bit(digit)!=0).collect();
                if r.len()!=2{continue;}
                for col in 0..9{
                    let c:Vec<usize>=(0..9)
                        .map(|r|r*9+col)
                        .filter(|&cell|self.masks[cell]&bit(digit)!=0).collect();
                    if c.len()!=2{continue;}
                    for ri in 0..2{
                        for ci in 0..2{
                            let a=r[ri];let b=c[ci];
                            let tip_a=r[1-ri];let tip_b=c[1-ci];
                            if a==b||tip_a==tip_b||box_id(9,a)!=box_id(9,b)||
                               a/9==b/9||a%9==b%9 {continue;}
                            for target in 0..81{
                                if [a,b,tip_a,tip_b].contains(&target) ||
                                   self.masks[target]&bit(digit)==0 ||
                                   !linked(9,target,tip_a) ||
                                   !linked(9,target,tip_b) {continue;}
                                self.reason=vec![a,b,tip_a,tip_b];
                                changed|=self.reduce(
                                    target,!bit(digit),"two_string_kite")?;
                            }
                        }
                    }
                }
            }
        }
        Ok(changed)
    }

    /// AB endpoints, connected by a conjugate link for A, force B.
    pub(super) fn w_wings(&mut self)->Result<bool,String>{
        if self.n!=9{return Ok(false);}
        let mut changed=false;
        let units=self.units.clone();
        for a in 0..81{
            if count(self.masks[a])!=2{continue;}
            for b in a+1..81{
                if self.masks[a]!=self.masks[b]||linked(9,a,b){continue;}
                for x in values(self.masks[a],9){
                    let y=sole(self.masks[a]&!bit(x));
                    for house in &units{
                        let positions:Vec<usize>=house.iter().copied()
                            .filter(|&cell|self.masks[cell]&bit(x)!=0).collect();
                        if positions.len()!=2{continue;}
                        let (p,q)=(positions[0],positions[1]);
                        if [p,q].contains(&a)||[p,q].contains(&b){continue;}
                        let bridge=(linked(9,a,p)&&linked(9,b,q))||
                                   (linked(9,a,q)&&linked(9,b,p));
                        if !bridge{continue;}
                        for target in 0..81{
                            if [a,b,p,q].contains(&target)||
                               self.masks[target]&bit(y)==0||
                               !linked(9,target,a)||!linked(9,target,b){
                                continue;
                            }
                            self.reason=vec![a,b,p,q];
                            changed|=self.reduce(target,!bit(y),"w_wing")?;
                        }
                    }
                }
            }
        }
        Ok(changed)
    }

    /// Remote pairs form a consistent bipartite graph of equal bivalue cells.
    /// A target seeing opposite parities cannot use either digit.
    pub(super) fn remote_pairs(&mut self)->Result<bool,String>{
        if self.n!=9{return Ok(false);}
        let mut changed=false;
        let mut groups:BTreeMap<Mask,Vec<usize>>=BTreeMap::new();
        for cell in 0..81{
            if count(self.masks[cell])==2{
                groups.entry(self.masks[cell]).or_default().push(cell);
            }
        }
        for (digits,cells) in groups{
            if cells.len()<4{continue;}
            let mut colors:BTreeMap<usize,u8>=BTreeMap::new();
            for &start in &cells{
                if colors.contains_key(&start){continue;}
                let mut component=vec![start];
                let mut queue=VecDeque::from([start]);
                colors.insert(start,0);
                let mut consistent=true;
                while let Some(node)=queue.pop_front(){
                    for &next in &cells{
                        if next==node||!linked(9,node,next){continue;}
                        let shade=1-colors[&node];
                        if let Some(&old)=colors.get(&next){
                            if old!=shade{consistent=false;}
                        }else{
                            colors.insert(next,shade);
                            component.push(next);
                            queue.push_back(next);
                        }
                    }
                }
                if !consistent||component.len()<4{continue;}
                for &a in &component{
                    for &b in &component{
                        if colors[&a]==colors[&b]||linked(9,a,b){continue;}
                        for target in 0..81{
                            if component.contains(&target)||
                               self.masks[target]&digits==0||
                               !linked(9,target,a)||!linked(9,target,b){
                                continue;
                            }
                            self.reason=component.clone();
                            changed|=self.reduce(target,!digits,"remote_pairs")?;
                        }
                    }
                }
            }
        }
        Ok(changed)
    }

    /// Two-color conjugate-link inference, with trap and wrap consequences.
    pub(super) fn simple_colors(&mut self)->Result<bool,String>{
        if self.n!=9{return Ok(false);}
        let mut changed=false;
        let units=self.units.clone();
        for digit in 1..=9u8 {
            let mut graph=vec![Vec::<usize>::new();81];
            for house in &units{
                let positions:Vec<usize>=house.iter().copied()
                    .filter(|&cell|self.masks[cell]&bit(digit)!=0).collect();
                if positions.len()==2{
                    let (a,b)=(positions[0],positions[1]);
                    graph[a].push(b);
                    graph[b].push(a);
                }
            }
            let mut colors=vec![None::<u8>;81];
            for start in 0..81{
                if graph[start].is_empty()||colors[start].is_some(){continue;}
                let mut queue=VecDeque::from([start]);
                colors[start]=Some(0);
                let mut component=vec![start];
                let mut consistent=true;
                while let Some(node)=queue.pop_front(){
                    for &other in &graph[node]{
                        let shade=1-colors[node].unwrap();
                        match colors[other]{
                            Some(old) if old!=shade=>consistent=false,
                            None=>{
                                colors[other]=Some(shade);
                                component.push(other);
                                queue.push_back(other);
                            },
                            _=>(),
                        }
                    }
                }
                if !consistent||component.len()<4{continue;}
                let (left,right):(Vec<_>,Vec<_>)=component.iter()
                    .copied().partition(|&cell|colors[cell]==Some(0));
                for (shade,group) in [left.clone(),right.clone()].iter()
                    .enumerate(){
                    if group.iter().enumerate().any(|(i,&a)|
                        group[i+1..].iter().any(|&b|linked(9,a,b))){
                        for &cell in group{
                            self.reason=component.clone();
                            changed|=self.reduce(
                                cell,!bit(digit),"color_wrap")?;
                        }
                    }
                    let _=shade;
                }
                for target in 0..81{
                    if colors[target].is_some()||
                       self.masks[target]&bit(digit)==0{continue;}
                    if left.iter().any(|&cell|linked(9,target,cell))&&
                       right.iter().any(|&cell|linked(9,target,cell)){
                        self.reason=component.clone();
                        changed|=self.reduce(
                            target,!bit(digit),"color_trap")?;
                    }
                }
            }
        }
        Ok(changed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn i(row:usize,col:usize)->usize{(row-1)*9+col-1}
    fn domains()->Vec<Mask>{vec![(1u16<<9)-1;81]}
    fn masks(vals:&[u8])->Mask{vals.iter().fold(0,|acc,&d|acc|bit(d))}
    fn solver(domains:Vec<Mask>)->Solver{
        let mut solver=Solver::from_masks(9,domains,&[],4).unwrap();
        solver.trace=true;solver
    }
    #[test]
    fn detects_two_string_kite(){
        let mut d=domains();
        for col in 1..=9{
            if col!=2&&col!=8{d[i(2,col)]&=!bit(4);}
        }
        for row in 1..=9{
            if row!=3&&row!=8{d[i(row,3)]&=!bit(4);}
        }
        let mut s=solver(d);
        s.two_string_kites().unwrap();
        assert_eq!(s.masks[i(8,8)]&bit(4),0);
        assert!(s.steps.iter().any(|step|step.method=="two_string_kite"));
    }
    #[test]
    fn detects_w_wing(){
        let mut d=domains();
        d[i(2,2)]=masks(&[1,5]);
        d[i(7,8)]=masks(&[1,5]);
        for row in 1..=9{
            if row!=2&&row!=7{d[i(row,5)]&=!bit(1);}
        }
        let mut s=solver(d);
        s.w_wings().unwrap();
        assert_eq!(s.masks[i(7,2)]&bit(5),0);
        assert!(s.steps.iter().any(|step|step.method=="w_wing"));
    }
}
