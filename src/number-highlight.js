import {cellInk} from './cell-ink.js';

// Pointer events are shared by touch screens, mice and Android WebViews.
// Keep tap recognition independent from the board's pan/drag/pen gestures.
export const TAP_MOVE_TOLERANCE = 14;
export const DOUBLE_TAP_INTERVAL = 360;
export const DOUBLE_TAP_DISTANCE = 22;

export function cellLargeValue(puzzle,progress,index) {
  const value=cellInk(puzzle,progress,index)?.value;
  return value===null||value===undefined||value===''?null:String(value);
}

export function isHighlightedNumber(puzzle,progress,index,number) {
  return number!==null && cellLargeValue(puzzle,progress,index)===number;
}

// Call only for completed, stationary taps in selection mode.
// Any single tap clears an existing highlight. Save what was highlighted
// before that first tap, so a second tap can still toggle the same number off
// or switch to a new digit without restoring an unwanted highlight.
export function advanceNumberHighlight(previousTap,tap,selectedNumber) {
  const doubleTap=previousTap!==null &&
    previousTap.index===tap.index &&
    previousTap.pointerType===tap.pointerType &&
    tap.time>=previousTap.time &&
    tap.time-previousTap.time<=DOUBLE_TAP_INTERVAL &&
    Math.hypot(tap.x-previousTap.x,tap.y-previousTap.y)<=DOUBLE_TAP_DISTANCE;
  if(!doubleTap) return {
    previousTap:{...tap,highlightBeforeTap:selectedNumber},
    selectedNumber:null,changed:selectedNumber!==null
  };
  const before=Object.hasOwn(previousTap,'highlightBeforeTap')
    ?previousTap.highlightBeforeTap:selectedNumber;
  const next=tap.value===before?null:tap.value;
  return {previousTap:null,selectedNumber:next,changed:next!==selectedNumber};
}
