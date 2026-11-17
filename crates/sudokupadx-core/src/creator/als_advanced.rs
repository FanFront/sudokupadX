//! Bounded Almost Locked Set (ALS) wing, chain and blossom deductions.
//! Every ALS is N cells in one house with N+1 possible digits.
use super::*;
use std::collections::{HashSet,BTreeSet};

#[derive(Clone)]
struct Als { cells:Vec<usize>,digits:Mask }

impl Solver {
    fn als_nodes_ext(&self)->Vec<Als>{
        let mut nodes=Vec::new();
        let mut seen=HashSet::<Vec<usize>>::new();
        for house in &self.units{
            let eligible:Vec<usize>=house.iter().copied()
                .filter(|&i|(2..=4).contains(&count(self.masks[i]))).collect();
            for size in 1..=3{
                for cells in combinations(&eligible,size){
                    let union=cells.iter().fold(0,|a,&i|a|self.masks[i]);
                    if count(union)!=size as u32+1 {continue;}
                    if seen.insert(cells.clone()){
                        nodes.push(Als{cells,digits:union});
                    }
                }
            }
        }
        nodes.sort_by(|a,b|a.cells.len().cmp(&b.cells.len()).then(a.cells.cmp(&b.cells)));
        nodes.truncate(125);
        nodes
    }

    fn als_links_ext(&self,nodes:&[Als])->Vec<Vec<(usize,u8)>>{
        let mut links=vec![vec![];nodes.len()];
        for a in 0..nodes.len(){
            for b in a+1..nodes.len(){
                if nodes[a].cells.iter().any(|i|nodes[b].cells.contains(i)){continue;}
                for d in values(nodes[a].digits&nodes[b].digits,9){
                    let ac:Vec<_>=nodes[a].cells.iter().copied()
                        .filter(|&i|self.masks[i]&bit(d)!=0).collect();
                    let bc:Vec<_>=nodes[b].cells.iter().copied()
                        .filter(|&i|self.masks[i]&bit(d)!=0).collect();
                    if ac.iter().all(|&i|bc.iter().all(|&j|linked(9,i,j))){
                        links[a].push((b,d));
                        links[b].push((a,d));
                    }
                }
            }
        }
        links
    }

    fn als_eliminate_ext(&mut self,nodes:&[Als],ends:&[usize],digit:u8,
        method:&str,sources:&[usize])->Result<bool,String>{
        let positions:Vec<_>=ends.iter().flat_map(|&i|nodes[i].cells.iter().copied())
            .filter(|&cell|self.masks[cell]&bit(digit)!=0).collect();
        if positions.is_empty(){return Ok(false);}
        for target in 0..81{
            if ends.iter().any(|&i|nodes[i].cells.contains(&target))
                ||self.masks[target]&bit(digit)==0{continue;}
            if positions.iter().all(|&cell|target!=cell&&linked(9,target,cell)){
                self.reason=sources.to_vec();
                if self.reduce(target,!bit(digit),method)?{return Ok(true);}
            }
        }
        Ok(false)
    }

    pub(super) fn als_advanced(&mut self)->Result<bool,String>{
        if self.n!=9{return Ok(false);}
        let nodes=self.als_nodes_ext();
        if nodes.len()<3{return Ok(false);}
        let links=self.als_links_ext(&nodes);
        // ALS-XY-Wing: each of two different RCDs to the central ALS
        // forces a shared candidate Z in one of the two outer ALSs.
        let mut budget=0usize;
        for center in 0..nodes.len(){
            for &(a,x) in &links[center]{
                for &(c,y) in &links[center]{
                    budget+=1;if budget>6500{break;}
                    if a>=c||x==y||nodes[a].cells.iter().any(
                        |i|nodes[c].cells.contains(i)){continue;}
                    let common=nodes[a].digits&nodes[c].digits&!bit(x)&!bit(y);
                    for z in values(common,9){
                        let reason:Vec<_>=[a,center,c].iter()
                            .flat_map(|&i|nodes[i].cells.iter().copied()).collect();
                        if self.als_eliminate_ext(&nodes,&[a,c],z,
                            "als_xy_wing",&reason)?{return Ok(true);}
                    }
                }
            }
        }
        // Four ALSs linked by three different consecutive RCDs:
        // a missing endpoint digit propagates to the other endpoint.
        budget=0;
        for a in 0..nodes.len(){
            for &(b,x) in &links[a]{
                for &(c,y) in &links[b]{
                    if a==c||x==y||nodes[a].cells.iter().any(
                        |i|nodes[c].cells.contains(i)){continue;}
                    for &(d,w) in &links[c]{
                        budget+=1;if budget>5000{break;}
                        if [a,b,c].contains(&d)||y==w||
                            [a,b].iter().any(|&i|nodes[i].cells.iter().any(
                                |cell|nodes[d].cells.contains(cell))) {continue;}
                        let common=nodes[a].digits&nodes[d].digits&!bit(x)&!bit(w);
                        for z in values(common,9){
                            let reason:Vec<_>=[a,b,c,d].iter()
                                .flat_map(|&i|nodes[i].cells.iter().copied()).collect();
                            if self.als_eliminate_ext(&nodes,&[a,d],z,
                                "als_xy_chain",&reason)?{return Ok(true);}
                        }
                    }
                }
            }
        }
        // Three distinct stem candidates each see the RCD occurrences
        // in a different ALS petal. Every stem assignment puts the
        // common digit Z in at least one petal.
        for stem in 0..81{
            if count(self.masks[stem])!=3 {continue;}
            let digits=values(self.masks[stem],9);
            let choices:Vec<Vec<usize>>=digits.iter().map(|&d|
                (0..nodes.len()).filter(|&i|{
                    let group=&nodes[i];
                    group.cells.len()<=2&&group.digits&bit(d)!=0&&
                        !group.cells.contains(&stem)&&
                        group.cells.iter().filter(|&&cell|
                            self.masks[cell]&bit(d)!=0).all(
                            |&cell|linked(9,stem,cell))
                }).take(10).collect()).collect();
            if choices.iter().any(Vec::is_empty){continue;}
            for &a in &choices[0]{
                for &b in &choices[1]{
                    for &c in &choices[2]{
                        if a==b||a==c||b==c ||
                            [(&nodes[a],&nodes[b]),(&nodes[a],&nodes[c]),
                             (&nodes[b],&nodes[c])].iter().any(|(x,y)|
                                x.cells.iter().any(|cell|y.cells.contains(cell)))
                            {continue;}
                        let common=nodes[a].digits&nodes[b].digits&nodes[c].digits&
                            !self.masks[stem];
                        for z in values(common,9){
                            let positions:Vec<_>=[a,b,c].iter()
                                .flat_map(|&i|nodes[i].cells.iter().copied())
                                .filter(|&cell|self.masks[cell]&bit(z)!=0).collect();
                            let reason:Vec<_>=std::iter::once(stem).chain(
                                [a,b,c].iter().flat_map(|&i|
                                    nodes[i].cells.iter().copied())).collect();
                            for target in 0..81{
                                if target==stem||[a,b,c].iter().any(
                                    |&i|nodes[i].cells.contains(&target))
                                    ||self.masks[target]&bit(z)==0 {continue;}
                                if positions.iter().all(|&i|linked(9,target,i)){
                                    self.reason=reason.clone();
                                    if self.reduce(target,!bit(z),"death_blossom")? {
                                        return Ok(true);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        Ok(false)
    }
}
