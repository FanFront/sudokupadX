// A full-screen image viewer stays in the current WebView. The browser's
// native dialog/back behavior returns to the puzzle detail screen.
export function installLmdImageViewer({dialog, stage, image, error, zoomLabel, zoomIn, zoomOut, reset, close}) {
  let scale = 1, offsetX = 0, offsetY = 0;
  let previousFocus = null;
  const pointers = new Map();
  let gesture = null;
  const clamp = value => Math.max(1,Math.min(6,value));

  function redraw() {
    image.style.transform = 'translate3d(' + offsetX + 'px,' + offsetY + 'px,0) scale(' + scale + ')';
    zoomLabel.textContent = Math.round(scale * 100) + '%';
    zoomOut.disabled = scale <= 1;
    zoomIn.disabled = scale >= 6;
  }
  function setScale(next) {
    scale = clamp(next);
    if (scale === 1) offsetX = offsetY = 0;
    redraw();
  }
  function resetView() {
    scale = 1;
    offsetX = offsetY = 0;
    pointers.clear();
    gesture = null;
    redraw();
  }
  function startGesture() {
    const values = [...pointers.values()];
    if (values.length >= 2) {
      const [a,b] = values;
      gesture = {
        type:'pinch',distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),
        midX:(a.x+b.x)/2,midY:(a.y+b.y)/2,
        startScale:scale,startX:offsetX,startY:offsetY
      };
    } else if (values.length === 1) {
      gesture = {type:'pan',x:values[0].x,y:values[0].y,
        startX:offsetX,startY:offsetY};
    } else gesture = null;
  }
  stage.addEventListener('pointerdown',event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    stage.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    startGesture();
  });
  stage.addEventListener('pointermove',event => {
    if (!pointers.has(event.pointerId) || !gesture) return;
    event.preventDefault();
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    const values = [...pointers.values()];
    if (values.length >= 2 && gesture.type === 'pinch') {
      const [a,b] = values;
      const midX=(a.x+b.x)/2, midY=(a.y+b.y)/2;
      scale = clamp(gesture.startScale *
        Math.hypot(a.x-b.x,a.y-b.y)/gesture.distance);
      offsetX = gesture.startX + midX - gesture.midX;
      offsetY = gesture.startY + midY - gesture.midY;
      if (scale === 1) offsetX=offsetY=0;
    } else if (values.length===1 && gesture.type==='pan' && scale>1) {
      offsetX=gesture.startX+values[0].x-gesture.x;
      offsetY=gesture.startY+values[0].y-gesture.y;
    }
    redraw();
  });
  const finishPointer = event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    startGesture();
  };
  stage.addEventListener('pointerup',finishPointer);
  stage.addEventListener('pointercancel',finishPointer);
  stage.addEventListener('wheel', event => {
    event.preventDefault();
    setScale(scale * (event.deltaY > 0 ? 0.85 : 1.15));
  },{passive:false});

  zoomIn.addEventListener('click',()=>setScale(scale*1.5));
  zoomOut.addEventListener('click',()=>setScale(scale/1.5));
  reset.addEventListener('click',resetView);
  close.addEventListener('click',()=>dialog.close());
  image.addEventListener('load',()=>{ error.hidden=true; });
  image.addEventListener('error',()=>{
    error.textContent='图片加载失败，请返回详情页打开原题查看。';
    error.hidden=false;
  });
  dialog.addEventListener('close',()=>{
    image.removeAttribute('src');
    resetView();
    error.hidden=true;
    if (previousFocus?.isConnected) previousFocus.focus();
    previousFocus=null;
  });

  resetView();
  return {
    open({url,alt},sourceElement){
      if (dialog.open) dialog.close();
      previousFocus=sourceElement || document.activeElement;
      resetView();
      error.hidden=true;
      image.alt=alt || 'Logic Masters 作者提供的谜题图片';
      image.referrerPolicy='no-referrer';
      image.src=url;
      dialog.showModal();
      close.focus();
    }
  };
}
