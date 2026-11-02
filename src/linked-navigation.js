import {getSectors,getLinkedPuzzles,isVisible} from './adventure-ui.js';

/** Only the puzzle catalog can turn a source link into an offline destination.
 * Resolve links from every sector covering the tapped cell: a small story tile
 * can overlap a larger grid whose rules contain the associated boss link.
 */
export function linksAtCell(puzzle,progress,index,catalog,currentId=null) {
  if(!puzzle || !Number.isInteger(index) || index<0 ||
      index>=puzzle.cells.length || !isVisible(progress,index))return [];
  const sectors=getSectors(puzzle,index);
  const sources=[puzzle.rules,...sectors.map(sector=>sector.rules)];
  const result=[],seen=new Set();
  // Generated bosses are discovered ONLY at their embedded, visible
  // BOSS cell. Ordinary chapter cells must not bypass the fog milestone
  // by exposing the chapter's boss link from its rules text.
  const generated=Array.isArray(puzzle.bossGates)&&puzzle.bossGates.length>0;
  for(const gate of puzzle.bossGates||[]){
    const [r,c]=Array.isArray(gate?.cell)?gate.cell:[-1,-1];
    if(!Number.isInteger(r)||!Number.isInteger(c)||r*puzzle.cols+c!==index)continue;
    const entry=catalog.find(item=>item.id===gate.bossId&&item.file);
    if(entry?.id!==currentId && entry && !seen.has(entry.id)){
      seen.add(entry.id);result.push(entry);
    }
  }
  if(generated)return result;
  for(const rules of sources){
    for(const entry of getLinkedPuzzles(rules,catalog)){
      if(!entry?.file || entry.id===currentId || seen.has(entry.id))continue;
      seen.add(entry.id);
      result.push(entry);
    }
  }
  return result;
}

/** A linked puzzle launched by URL or from the library has no in-memory stack.
 * Its catalog group still identifies the correct bundled adventure map.
 */
export function parentMain(entry,catalog) {
  if(!entry || ['main','standalone'].includes(entry.kind) || !Array.isArray(catalog))return null;
  const direct=catalog.find(item=>item.id===entry.parent&&item.id!==entry.id);
  return direct || catalog.find(item=>['main','standalone'].includes(item.kind)&&item.id===entry.group) || null;
}

export function returnDestination(entry,catalog,navigationStack=[]) {
  const previous=navigationStack.at(-1);
  if(previous?.id)return {id:previous.id,backState:previous,fromStack:true};
  const parent=parentMain(entry,catalog);
  return parent?{id:parent.id,backState:null,fromStack:false}:null;
}
