//! Bounded, proof-carrying classic Sudoku patterns used by both creator and hints.
//! All eliminations follow local candidate geometry, never an answer key or guess.
use super::{bit, box_id, combinations, count, linked, values, Mask, Solver};

fn at(axis: usize, line: usize, cross: usize) -> usize {
    if axis == 0 { line * 9 + cross } else { cross * 9 + line }
}

impl Solver {
    /// X-Wing through Jellyfish with a single-box fin (including Sashimi).
    pub(super) fn finned_fish(&mut self) -> Result<bool, String> {
        if self.n != 9 { return Ok(false); }
        let mut changed = false;
        for axis in 0..2 {
            for digit in 1..=9u8 {
                let locations: Vec<Vec<usize>> = (0..9).map(|line|
                    (0..9).filter(|&cross|
                        self.masks[at(axis,line,cross)] & bit(digit) != 0
                    ).collect()
                ).collect();
                for size in 2..=4 {
                    let possible: Vec<usize> = (0..9).filter(
                        |&line| locations[line].len() >= 2 &&
                                locations[line].len() <= size + 3
                    ).collect();
                    for base in combinations(&possible,size) {
                        let mut union: Vec<usize> = base.iter()
                            .flat_map(|&line| locations[line].iter().copied())
                            .collect();
                        union.sort_unstable();
                        union.dedup();
                        if union.len() <= size || union.len() > size + 3 {
                            continue;
                        }
                        for cover in combinations(&union,size) {
                            let fins: Vec<usize> = base.iter().flat_map(|&line|
                                locations[line].iter()
                                    .filter(|cross| !cover.contains(cross))
                                    .map(move |&cross| at(axis,line,cross))
                            ).collect();
                            if fins.is_empty() || fins.len() > 3 ||
                               !fins.iter().all(|&cell|
                                   box_id(9,cell) == box_id(9,fins[0])) {
                                continue;
                            }
                            let sashimi = base.iter().any(|&line|
                                !locations[line].iter().any(
                                    |cross| cover.contains(cross)));
                            let method = match (size,sashimi) {
                                (2,false)=>"finned_x_wing",
                                (3,false)=>"finned_swordfish",
                                (4,false)=>"finned_jellyfish",
                                (2,true)=>"sashimi_x_wing",
                                (3,true)=>"sashimi_swordfish",
                                (4,true)=>"sashimi_jellyfish",
                                _=>unreachable!(),
                            };
                            for other in 0..9 {
                                if base.contains(&other) { continue; }
                                for &cross in &cover {
                                    let target = at(axis,other,cross);
                                    if self.masks[target] & bit(digit) == 0 ||
                                       !fins.iter().all(|&fin|
                                           linked(9,target,fin)) {
                                        continue;
                                    }
                                    let mut witness: Vec<usize> = base.iter()
                                        .flat_map(|&line| cover.iter().map(
                                            move |&col| at(axis,line,col)))
                                        .collect();
                                    witness.extend(fins.iter().copied());
                                    witness.retain(|&cell|self.masks[cell] &
                                                   bit(digit) != 0);
                                    self.reason = witness;
                                    changed |= self.reduce(
                                        target,!bit(digit),method)?;
                                }
                            }
                        }
                    }
                }
            }
        }
        Ok(changed)
    }

    /// Empty Rectangle: one box contains d only in a row+column cross.
    /// A conjugate pair on a remote row forbids the crossing row target.
    pub(super) fn empty_rectangle(&mut self) -> Result<bool, String> {
        if self.n != 9 { return Ok(false); }
        let mut changed = false;
        for axis in 0..2 {
            for digit in 1..=9u8 {
                for top in [0,3,6] {
                    for left in [0,3,6] {
                        let rows: Vec<_> = (top..top+3).collect();
                        let cols: Vec<_> = (left..left+3).collect();
                        let mut positions: Vec<(usize,usize)> = Vec::new();
                        for &r in &rows {
                            for &c in &cols {
                                if self.masks[at(axis,r,c)] & bit(digit) != 0 {
                                    positions.push((r,c));
                                }
                            }
                        }
                        if positions.len() < 2 {continue;}
                        for &r in &rows {
                            for &c in &cols {
                                if !positions.iter().all(|&(x,y)|x==r||y==c) ||
                                   !positions.iter().any(|&(x,y)|x==r&&y!=c) ||
                                   !positions.iter().any(|&(x,y)|y==c&&x!=r) {
                                    continue;
                                }
                                for outer in 0..9 {
                                    if rows.contains(&outer) {continue;}
                                    let pair: Vec<usize> = (0..9).filter(|&col|
                                        self.masks[at(axis,outer,col)] &
                                        bit(digit) != 0
                                    ).collect();
                                    if pair.len()!=2||!pair.contains(&c) {
                                        continue;
                                    }
                                    let other = pair.iter().copied().find(
                                        |&col|col!=c).unwrap();
                                    if cols.contains(&other) {continue;}
                                    let target=at(axis,r,other);
                                    if self.masks[target] & bit(digit)==0 {
                                        continue;
                                    }
                                    self.reason=positions.iter().map(|&(row,col)|
                                        at(axis,row,col)).chain(pair.iter()
                                        .map(|&col|at(axis,outer,col))).collect();
                                    changed|=self.reduce(
                                        target,!bit(digit),"empty_rectangle")?;
                                }
                            }
                        }
                    }
                }
            }
        }
        Ok(changed)
    }

    /// A four-cell four-digit wing. For each non-Z digit, all occurrences
    /// within the four cells mutually see one another. Thus if Z were absent,
    /// only three different digits could occupy four cells: impossible.
    pub(super) fn wxyz_wing(&mut self) -> Result<bool, String> {
        if self.n != 9 {return Ok(false);}
        let mut changed=false;
        let bivalue:Vec<usize>=(0..81).filter(|&cell|
            (2..=3).contains(&count(self.masks[cell]))).collect();
        for pivot in 0..81 {
            if count(self.masks[pivot])<3{continue;}
            let arms:Vec<usize>=bivalue.iter().copied()
                .filter(|&cell|cell!=pivot&&linked(9,pivot,cell))
                .collect();
            for selected in combinations(&arms,3){
                let group=vec![pivot,selected[0],selected[1],selected[2]];
                let digits:Mask=group.iter().fold(0,|acc,&i|
                    acc|self.masks[i]);
                if count(digits)!=4 {continue;}
                if (0..4).all(|a|(a+1..4).all(|b|
                    linked(9,group[a],group[b]))) {
                    continue; // Prefer naked quads.
                }
                for z in values(digits,9){
                    if !values(digits & !bit(z),9).iter().all(|&other|{
                        let occurrences:Vec<usize>=group.iter().copied()
                            .filter(|&cell|self.masks[cell]&bit(other)!=0)
                            .collect();
                        (0..occurrences.len()).all(|a|
                            (a+1..occurrences.len()).all(|b|
                                linked(9,occurrences[a],occurrences[b])))
                    }) {continue;}
                    let zcells:Vec<usize>=group.iter().copied()
                        .filter(|&cell|self.masks[cell]&bit(z)!=0).collect();
                    for target in 0..81 {
                        if group.contains(&target) ||
                           self.masks[target]&bit(z)==0 ||
                           !zcells.iter().all(|&cell|
                                linked(9,target,cell)) {continue;}
                        self.reason=group.clone();
                        changed|=self.reduce(target,!bit(z),"wxyz_wing")?;
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

    fn domains()->Vec<Mask>{vec![bit(1)|bit(2)|bit(3)|bit(4)|bit(5)|bit(6)|bit(7)|bit(8)|bit(9);81]}
    fn mask(digits:&[u8])->Mask{digits.iter().fold(0,|acc,&d|acc|bit(d))}
    fn i(row:usize,col:usize)->usize{(row-1)*9+col-1}
    fn proof(masks:Vec<Mask>)->Solver{
        let mut solver=Solver::from_masks(9,masks,&[],4).unwrap();
        solver.trace=true;
        solver
    }
    #[test]
    fn detects_empty_rectangle(){
        let mut masks=domains();
        for row in 1..=3{
            for col in 1..=3{
                if ![(1,2),(1,3),(2,1),(3,1)].contains(&(row,col)){
                    masks[i(row,col)]&=!bit(7);
                }
            }
        }
        for col in 1..=9{
            if col!=1&&col!=5{masks[i(5,col)]&=!bit(7);}
        }
        let mut solver=proof(masks);
        solver.empty_rectangle().unwrap();
        assert_eq!(solver.masks[i(1,5)]&bit(7),0);
        assert!(solver.steps.iter().any(|s|s.method=="empty_rectangle"));
    }
    #[test]
    fn detects_finned_swordfish(){
        let mut masks=domains();
        for (row,covers) in [(1,vec![2,5]),(4,vec![5,8,9]),(7,vec![2,8])]{
            for col in 1..=9{
                if !covers.contains(&col){masks[i(row,col)]&=!bit(5);}
            }
        }
        let mut solver=proof(masks);
        solver.finned_fish().unwrap();
        assert_eq!(solver.masks[i(5,8)]&bit(5),0);
        assert!(solver.steps.iter().any(|s|s.method=="finned_swordfish"));
    }
    #[test]
    fn detects_wxyz_wing(){
        let mut masks=domains();
        for (row,col,d) in [
            (2,2,vec![1,2,3]),(2,4,vec![1,4]),
            (2,6,vec![2,4]),(3,3,vec![3,4])]{
            masks[i(row,col)]=mask(&d);
        }
        let mut solver=proof(masks);
        solver.wxyz_wing().unwrap();
        assert_eq!(solver.masks[i(2,3)]&bit(4),0);
        assert!(solver.steps.iter().any(|s|s.method=="wxyz_wing"));
    }
}
