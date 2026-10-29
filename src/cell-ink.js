// Resolve what can be painted in a cell without leaking puzzle clues through fog.
// Fog masks authored givens/constraints, but never hides the player's own ink.
export function cellInk(puzzle, progress, index) {
  const source=puzzle?.cells?.[index];
  if (!source) return null;
  const fogged=progress?.visible?.[index]===false;
  const given=source.given??null;
  const entry=progress?.cells?.[index]||{};
  if(fogged&&given!==null) {
    return {fogged,given:false,value:null,corner:[],center:[]};
  }
  const value=given??entry.value??null;
  return {
    fogged,
    given:given!==null,
    value,
    // Keep notes in the save; values only suppress their display.
    corner:value?[]:(entry.corner||[]),
    center:value?[]:(entry.center||[])
  };
}
