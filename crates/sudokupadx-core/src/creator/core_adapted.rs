//! Size-independent human deductions adapted from the public MIT sudoku-core
//! techniques. Only existing SudokuPadX houses and candidate masks are used;
//! these patterns never consult the solution or assume handwritten notes.
use super::*;

impl Solver {
    /// One row conjugate and one column conjugate meet in a box. Their
    /// remote ends cannot both be false (Two-String Kite).
    pub(super) fn two_string_kite(&mut self) -> Result<bool,String> {
        let n=self.n;
        for digit in 1..=n as u8 {
            let mask=bit(digit);
            for r in 0..n {
                let row:Vec<usize>=(0..n).map(|c|r*n+c)
                    .filter(|&i|self.masks[i]&mask!=0).collect();
                if row.len()!=2 {continue;}
                for c in 0..n {
                    let col:Vec<usize>=(0..n).map(|r|r*n+c)
                        .filter(|&i|self.masks[i]&mask!=0).collect();
                    if col.len()!=2 {continue;}
                    for inner_r in 0..2 {
                        let near_row=row[inner_r];
                        let far_row=row[1-inner_r];
                        for inner_c in 0..2 {
                            let near_col=col[inner_c];
                            let far_col=col[1-inner_c];
                            let witness=[near_row,far_row,near_col,far_col];
                            if witness.iter().copied().collect::<HashSet<_>>().len()!=4 ||
                               box_id(n,near_row)!=box_id(n,near_col) {
                                continue;
                            }
                            for target in 0..n*n {
                                if witness.contains(&target)||
                                   !linked(n,target,far_row)||
                                   !linked(n,target,far_col)||
                                   count(self.masks[target])<=1||
                                   self.masks[target]&mask==0 {continue;}
                                self.reason=witness.to_vec();
                                if self.reduce(target,!mask,"two_string_kite")? {
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

    /// Two non-peer AB cells: an A-conjugate pair seen respectively by the
    /// two cells forces B into at least one wing (W-Wing).
    pub(super) fn w_wing(&mut self) -> Result<bool,String> {
        let n=self.n;
        let bivalue:Vec<usize>=(0..n*n)
            .filter(|&i|count(self.masks[i])==2).collect();
        for (i,&left) in bivalue.iter().enumerate() {
            for &right in bivalue[i+1..].iter() {
                if linked(n,left,right)||
                   self.masks[left]!=self.masks[right] {continue;}
                for bridge in values(self.masks[left],n) {
                    let bridge_mask=bit(bridge);
                    let other=self.masks[left]&!bridge_mask;
                    for house in self.units.clone() {
                        let ends:Vec<usize>=house.into_iter()
                            .filter(|&cell|self.masks[cell]&bridge_mask!=0).collect();
                        if ends.len()!=2 || ends.contains(&left)||
                           ends.contains(&right) {continue;}
                        let (a,b)=(ends[0],ends[1]);
                        if !(linked(n,left,a)&&linked(n,right,b)||
                             linked(n,left,b)&&linked(n,right,a)) {continue;}
                        for target in 0..n*n {
                            if target==left||target==right||
                               count(self.masks[target])<=1||
                               self.masks[target]&other==0||
                               !linked(n,target,left)||
                               !linked(n,target,right) {continue;}
                            self.reason=vec![left,right,a,b];
                            if self.reduce(target,!other,"w_wing")? {
                                return Ok(true);
                            }
                        }
                    }
                }
            }
        }
        Ok(false)
    }

    /// Conjugate links define opposite truth-colours. A target seeing both
    /// colours cannot hold the digit (colour trap); two same-colour peers
    /// prove that colour false (colour wrap).
    pub(super) fn simple_coloring(&mut self) -> Result<bool,String> {
        let n=self.n;
        for digit in 1..=n as u8 {
            let mask=bit(digit);
            let mut graph=vec![Vec::<usize>::new();n*n];
            for house in &self.units {
                let ends:Vec<usize>=house.iter().copied()
                    .filter(|&i|self.masks[i]&mask!=0).collect();
                if ends.len()==2 {
                    graph[ends[0]].push(ends[1]);
                    graph[ends[1]].push(ends[0]);
                }
            }
            let mut color=vec![None::<u8>;n*n];
            for start in 0..n*n {
                if graph[start].is_empty()||color[start].is_some() {continue;}
                color[start]=Some(0);
                let mut stack=vec![start];
                let mut component=Vec::new();
                let mut inconsistent=false;
                while let Some(node)=stack.pop() {
                    component.push(node);
                    let opposite=1-color[node].unwrap();
                    for &next in &graph[node] {
                        if let Some(existing)=color[next] {
                            if existing!=opposite {inconsistent=true;}
                        }else{
                            color[next]=Some(opposite);
                            stack.push(next);
                        }
                    }
                }
                // An odd strong-link cycle contradicts the premises. It
                // cannot be used as a normal Sudoku elimination certificate.
                if inconsistent {continue;}
                let mut wraps=[false,false];
                for (pos,&a) in component.iter().enumerate() {
                    for &b in component[pos+1..].iter() {
                        if color[a]==color[b] && linked(n,a,b) {
                            wraps[color[a].unwrap() as usize]=true;
                        }
                    }
                }
                for &target in &component {
                    if !wraps[color[target].unwrap() as usize]||
                       count(self.masks[target])<=1 {continue;}
                    self.reason=component.clone();
                    if self.reduce(target,!mask,"simple_coloring")? {
                        return Ok(true);
                    }
                }
                for target in 0..n*n {
                    if color[target].is_some() || self.masks[target]&mask==0||
                       count(self.masks[target])<=1 {continue;}
                    let sees_0=component.iter().any(|&node|
                        color[node]==Some(0)&&linked(n,node,target));
                    let sees_1=component.iter().any(|&node|
                        color[node]==Some(1)&&linked(n,node,target));
                    if sees_0&&sees_1 {
                        self.reason=component.clone();
                        if self.reduce(target,!mask,"simple_coloring")? {
                            return Ok(true);
                        }
                    }
                }
            }
        }
        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn local(n:usize)->Vec<Mask>{vec![full(n);n*n]}

    fn only(masks:&mut [Mask],house:&[usize],digit:u8,allowed:&[usize]) {
        for &cell in house {
            if !allowed.contains(&cell) {masks[cell]&=!bit(digit);}
        }
    }

    #[test]
    fn two_string_kite_proves_a_real_candidate_for_all_sizes() {
        // row pair A/B, column pair C/D, inner B/C in one box, target
        // sees the distant ends A/D but belongs to neither conjugate unit.
        for (n,a,b,c,d,target,col) in [
            (4,0,2,7,11,8,3),
            (6,0,1,8,14,13,2),
            (9,0,1,11,20,9,2),
        ] {
            let mut masks=local(n);
            let houses=units(n);
            only(&mut masks,&houses[0],1,&[a,b]);
            only(&mut masks,&houses[n+col],1,&[c,d]);
            assert!(masks[target]&bit(1)!=0);
            let mut engine=Solver::from_masks(n,masks,&[],4).unwrap();
            assert!(engine.two_string_kite().unwrap(),"size {n}");
            assert_eq!(engine.masks[target]&bit(1),0,"size {n}");
        }
    }

    #[test]
    fn w_wing_uses_conjugate_bridge_not_just_two_bivalues() {
        for (n,left,right,bridge_a,bridge_b,target) in [
            (4,0,6,8,10,2),
            (6,0,9,12,15,3),
            (9,0,12,18,21,3),
        ] {
            let mut masks=local(n);
            masks[left]=bit(1)|bit(2);
            masks[right]=bit(1)|bit(2);
            only(&mut masks,&units(n)[2],1,&[bridge_a,bridge_b]);
            let mut engine=Solver::from_masks(n,masks.clone(),&[],4).unwrap();
            assert!(engine.w_wing().unwrap(),"size {n}");
            assert_eq!(engine.masks[target]&bit(2),0,"size {n}");

            let mut without=Solver::from_masks(n,{
                let mut changed=masks;
                changed[2*n+1]|=bit(1); // no longer a two-position link
                changed
            },&[],4).unwrap();
            // The extra candidate removes the only certified bridge.
            assert!(!without.w_wing().unwrap(),"size {n}");
        }
    }

    #[test]
    fn coloring_trap_is_available_on_4_6_and_9() {
        for n in [4,6,9] {
            let mut masks=local(n);
            only(&mut masks,&units(n)[0],1,&[0,1]);
            let target=n; // sees both row-0 conjugates in their shared box
            assert!(masks[target]&bit(1)!=0);
            let mut engine=Solver::from_masks(n,masks,&[],4).unwrap();
            assert!(engine.simple_coloring().unwrap(),"size {n}");
            assert_eq!(engine.masks[target]&bit(1),0,"size {n}");
        }
    }
}
