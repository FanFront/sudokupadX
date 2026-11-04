// A puzzle's solver rules must be *typed data*, never inferred from strokes,
// colors, line thickness, overlay backgrounds, or human-language rule prose.
// The compact SudokuPad SCL format frequently stores artwork only.
const TYPES=new Set([
  'killer','kropki','xv','whisper','thermo','renban','between',
  'entropic','modular','region_sum','arrow','reverse_thermo',
  'palindrome','parity_line','zipline','prime_sum','anti_xv',
  'anti_king','anti_knight','lava','reverse_whisper',
  'shadow_lower','greater_neighbors','magic_square','crystal_cage'
]);
const pos=(value,rows,cols)=>{
  if(Number.isInteger(value))return value>=0&&value<rows*cols?value:-1;
  if(!Array.isArray(value)||value.length!==2)return -1;
  const [r,c]=value;
  return Number.isInteger(r)&&Number.isInteger(c)&&r>=0&&r<rows&&c>=0&&c<cols
    ?r*cols+c:-1;
};
function positions(items,rows,cols,maxCells=20){
  if(!Array.isArray(items)||items.length===0||items.length>maxCells)return null;
  const cells=items.map(p=>pos(p,rows,cols));
  if(cells.some(i=>i<0)||new Set(cells).size!==cells.length)return null;
  return cells;
}
const validDigit=(value,limit=9)=>Number.isInteger(value)&&value>0&&value<=limit;

/** Only independently authored/serialized semantics are admitted as solver
 * axioms; missing types are not guessed from the SudokuPad render layer.
 *
 * - puzzle.hintRules originates from metadata.solverRules (Rust generator).
 * - puzzle.hintConstraints originates from metadata.hintConstraints.
 * - optionally each rule has unlockCells (grid indices or [row,col]); at
 *   least one explicit unlock cell must be visible for the rule to be active.
 */
export function typedConstraints(puzzle,progress){
  const {rows,cols}=puzzle||{};
  if(!Number.isInteger(rows)||!Number.isInteger(cols)||
      !Array.isArray(progress?.visible))return [];
  const supplied=[
    ...(Array.isArray(puzzle.hintRules)?puzzle.hintRules:[]),
    ...(Array.isArray(puzzle.hintConstraints)?puzzle.hintConstraints:[])
  ].slice(0,4000);
  const constraints=[];
  for(const raw of supplied){
    if(!raw||typeof raw!=='object')continue;
    const type=raw.type;
    if(!TYPES.has(type))continue;
    const items=type==='arrow'&&Array.isArray(raw.circle)&&Array.isArray(raw.shaft)
      ?[...raw.circle,...raw.shaft]:raw.cells;
    const cells=positions(items,rows,cols,
      ['anti_king','anti_knight','anti_xv','lava'].includes(type)?121:20);
    if(!cells||cells.length<2||cells.some(i=>progress.visible[i]!==true))continue;
    const unlock=raw.unlockCells===undefined?null:positions(raw.unlockCells,rows,cols);
    if(raw.unlockCells!==undefined&&!unlock)continue;
    if(unlock&&!unlock.some(i=>progress.visible[i]===true))continue;
    const rule={type,cells};
    if(type==='killer'){
      const sum=raw.sum;
      if(!Number.isInteger(sum)||sum<1||sum>180||cells.length>9)continue;
      rule.sum=sum;
      rule.unique=raw.unique!==false;
    }
    if(type==='kropki'){
      if(cells.length!==2||!['white','black'].includes(raw.dot))continue;
      rule.dot=raw.dot;
    }
    if(type==='xv'){
      if(cells.length!==2||![5,10].includes(raw.sum))continue;
      rule.sum=raw.sum;
    }
    if(['thermo','reverse_thermo','whisper','renban','between','arrow','entropic','modular','region_sum']
      .includes(type)&&cells.length>20)continue;
    if(['palindrome','parity_line','zipline','prime_sum','reverse_whisper'].includes(type) &&
       cells.length>20)continue;
    if(type==='zipline'&&(cells.length<3||cells.length%2!==1))continue;
    if(['shadow_lower','greater_neighbors'].includes(type)&&cells.length<2)continue;
    if(type==='magic_square'){
      if(cells.length!==9)continue;
      const coords=cells.map(i=>[Math.floor(i/cols),i%cols]);
      const r=coords[0][0],c=coords[0][1];
      if(coords.some(([row,col],i)=>row!==r+Math.floor(i/3)||
        col!==c+i%3))continue;
    }
    if(type==='crystal_cage'){
      if(!Number.isInteger(raw.sum)||raw.sum<1||raw.sum>100||
         !Array.isArray(raw.groups)||raw.groups.length<2)continue;
      const groups=raw.groups.map(group=>positions(group,rows,cols));
      if(groups.some(group=>!group||group.some(i=>!cells.includes(i))))continue;
      rule.sum=raw.sum;
      rule.groups=groups;
    }
    if(type==='region_sum'){
      if(!Array.isArray(raw.segments)||raw.segments.length<2)continue;
      const segments=raw.segments.map(items=>positions(items,rows,cols));
      if(segments.some(segment=>!segment)||
         segments.flat().length!==cells.length||
         new Set(segments.flat()).size!==cells.length||
         !cells.every(i=>segments.flat().includes(i)))continue;
      rule.segments=segments;
    }
    constraints.push(rule);
  }
  return constraints;
}
