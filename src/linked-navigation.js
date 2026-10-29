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
