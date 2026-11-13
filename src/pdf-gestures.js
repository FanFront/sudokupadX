// Pure geometry shared by the PDF pointer handler and regression tests.
export const PDF_MIN_SCALE = 0.5;
export const PDF_MAX_SCALE = 3;

export function touchPair(a,b) {
  const x=(a.x+b.x)/2,y=(a.y+b.y)/2;
  return {x,y,distance:Math.hypot(b.x-a.x,b.y-a.y)};
}

export function gestureScale(startScale,startDistance,currentDistance) {
  const distance=Math.max(1,startDistance);
  return Math.min(PDF_MAX_SCALE,Math.max(PDF_MIN_SCALE,
    startScale * Math.max(0,currentDistance)/distance));
}

export function anchoredPageScroll({
  offsetLeft,offsetTop,pageWidth,pageHeight,anchorX,anchorY,
  centerX,centerY
}) {
  // centerX/Y are measured relative to the scrolling viewport.
  // The page's CSS layout width must already have been updated so its
  // auto-centering offset is correct before these coordinates are computed.
  return {
    left:offsetLeft+anchorX*pageWidth-centerX,
    top:offsetTop+anchorY*pageHeight-centerY
  };
}

export function draggedPageScroll({startX,startY,scrollLeft,scrollTop},point) {
  return {
    left:scrollLeft+startX-point.x,
    top:scrollTop+startY-point.y
  };
}
