import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  PDF_MIN_SCALE,PDF_MAX_SCALE,
  touchPair,gestureScale,anchoredPageScroll,draggedPageScroll
} from '../src/pdf-gestures.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const close=(a,b)=>assert.ok(Math.abs(a-b)<.00001,`${a} ≠ ${b}`);

test('two fingers calculate midpoint and distance for pinch and translation',()=>{
  const start=touchPair({x:100,y:100},{x:200,y:100});
  assert.deepEqual(start,{x:150,y:100,distance:100});
  const translated=touchPair({x:130,y:150},{x:230,y:150});
  assert.deepEqual(translated,{x:180,y:150,distance:100});
  close(gestureScale(1,start.distance,translated.distance),1);
  close(gestureScale(1,100,200),2);
  close(gestureScale(2,200,100),1);
  close(gestureScale(1,100,9999),PDF_MAX_SCALE);
  close(gestureScale(1,100,1),PDF_MIN_SCALE);
  assert.ok(Number.isFinite(gestureScale(1,0,0)));
});

test('anchored zoom preserves the same PDF point beneath the moving midpoint',()=>{
  // Initial viewport is 400px wide, left margin 12px; the fingers straddle
  // a PDF point at 30% across the page and 40% down.
  const anchorX=.3,anchorY=.4;
  const goal={x:230,y:175};
  const target=anchoredPageScroll({
    offsetLeft:12,offsetTop:12,pageWidth:900,pageHeight:1200,
    anchorX,anchorY,centerX:goal.x,centerY:goal.y
  });
  close(12+anchorX*900-target.left,goal.x);
  close(12+anchorY*1200-target.top,goal.y);
  // A narrower PDF may be horizontally auto-centered; that margin also
  // participates in focal-point preservation.
  const centered=anchoredPageScroll({
    offsetLeft:70,offsetTop:12,pageWidth:260,pageHeight:440,
    anchorX:.5,anchorY:.5,centerX:200,centerY:160
  });
  close(70+130-centered.left,200);
  close(12+220-centered.top,160);
});

test('one remaining finger after a pinch pans from the current scroll offsets',()=>{
  const origin={startX:100,startY:90,scrollLeft:250,scrollTop:350};
  assert.deepEqual(draggedPageScroll(origin,{x:135,y:115}),
    {left:215,top:325});
  assert.deepEqual(draggedPageScroll(origin,{x:70,y:45}),
    {left:280,top:395});
});

test('reader uses scroll-wide pointer capture, cancels ink before a pinch, and redraws on release',()=>{
  const reader=read('src/wpf-reader.js'),styles=read('src/style.css');
  assert.match(reader,/scroll\.addEventListener\('pointerdown'/);
  assert.match(reader,/scroll\.setPointerCapture\(event\.pointerId\)/);
  assert.match(reader,/scroll\.addEventListener\('pointermove'/);
  assert.match(reader,/scroll\.addEventListener\('pointerup'/);
  assert.match(reader,/scroll\.addEventListener\('pointercancel'/);
  assert.match(reader,/function beginPinch\(\)\{[\s\S]*?abortInk\(\)/);
  assert.match(reader,/function abortInk\(\)\{[\s\S]*?setStrokes\(strokeBefore\)/);
  assert.match(reader,/function previewPinch\(\)\{[\s\S]*?anchoredPageScroll/);
  assert.match(reader,/function finishPreview\(\)\{[\s\S]*?renderPage\(\)/);
  assert.match(reader,/gestureMode==='pan'&&panStart/);
  assert.match(styles,/\.wpf-page-scroll\{[^}]*touch-action:none/);
  assert.match(styles,/#wpfPdfCanvas,#wpfInkCanvas\{transform-origin:top left/);
});
