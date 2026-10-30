import {puzzleIdFromUrl} from './online-library.js';

export const RESUME_KEY = 'sudokupadx:last-session:v1';
const MAX_STACK = 32;
const validNumber = value => typeof value === 'number' && Number.isFinite(value);
const validCoordinate = value => validNumber(value) && Math.abs(value) <= 1e8;

export function captureView(camera, width, height, selectedCells = [], gridLines = true) {
  if (!camera || !validNumber(camera.scale) || camera.scale < .065 || camera.scale > 5 ||
      !validCoordinate(camera.x) || !validCoordinate(camera.y)) return null;
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  const centerX = (w / 2 - camera.x) / camera.scale;
  const centerY = (h / 2 - camera.y) / camera.scale;
  if (!validCoordinate(centerX) || !validCoordinate(centerY)) return null;
  return {
    centerX, centerY, scale: camera.scale,
    selectedCells: selectedCells.filter(n => Number.isInteger(n) && n >= 0).slice(0, 10000),
    gridLines: Boolean(gridLines)
  };
}

// Persist the center of the viewed board (in logical board pixels), not a
// screen-specific x/y offset. The same cell remains centered after rotation.
export function restoreView(view, width, height, cellCount) {
  if (!view || !validCoordinate(view.centerX) || !validCoordinate(view.centerY) ||
      !validNumber(view.scale) || view.scale < .065 || view.scale > 5) return null;
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  return {
    camera: {
      x: w / 2 - view.centerX * view.scale,
      y: h / 2 - view.centerY * view.scale,
      scale: view.scale
    },
    selectedCells: Array.isArray(view.selectedCells) ?
      [...new Set(view.selectedCells.filter(n => Number.isInteger(n) &&
        n >= 0 && n < cellCount))].slice(0, 10000) : [],
    gridLines: typeof view.gridLines === 'boolean' ? view.gridLines : null
  };
}

export function bundledSource(id) {
  return typeof id === 'string' && id.length <= 160 && id.length > 0 ?
    {type:'bundled',id} : null;
}
export function cachedSource(key, entry = null) {
  if (typeof key !== 'string' || !key || key.length > 1024) return null;
  if (entry === null) return {type:'imported',key};
  if (typeof entry.id !== 'string' || !entry.id || entry.id.length > 256 ||
      typeof entry.title !== 'string' || !entry.title ||
      !puzzleIdFromUrl(entry.puzzleUrl)) return null;
  return {
    type:'online', key,
    entry:{
      id:entry.id, title:entry.title.slice(0,300),
      sourceId:String(entry.sourceId || '').slice(0,100),
      sourceName:String(entry.sourceName || '').slice(0,300),
      puzzleUrl:entry.puzzleUrl,
      sourceUrl:typeof entry.sourceUrl === 'string' ? entry.sourceUrl.slice(0,2048) : null
    }
  };
}
export function parseResume(text) {
  try {
    const stored=typeof text === 'string' ? JSON.parse(text) : text;
    if (!stored || stored.version !== 1 || !stored.source || !stored.view) return null;
    const source=stored.source.type === 'bundled' ?
      bundledSource(stored.source.id) :
      stored.source.type === 'imported' ?
        cachedSource(stored.source.key) :
        stored.source.type === 'online' ?
          cachedSource(stored.source.key,stored.source.entry) : null;
    if (!source || !restoreView(stored.view,1,1,Number.MAX_SAFE_INTEGER)) return null;
    const stack=Array.isArray(stored.stack) ? stored.stack.slice(0,MAX_STACK)
      .filter(item => bundledSource(item?.id) &&
        restoreView(item?.view,1,1,Number.MAX_SAFE_INTEGER))
      .map(item => ({id:item.id,view:item.view})) : [];
    return {source,view:stored.view,stack};
  } catch {
    return null;
  }
}
export function serializeResume(source, view, stack = []) {
  if (!source || !view) return null;
  return JSON.stringify({version:1,source,view,stack:stack.slice(-MAX_STACK)});
}
