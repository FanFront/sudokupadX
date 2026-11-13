import {invoke} from '@tauri-apps/api/core';
import {validatedWpfPdfUrl,isPdfData} from './wpf-catalog.js';
import {MAX_WPF_PDF,readWpfDocument,saveWpfDocument,readWpfInk,saveWpfInk} from './wpf-storage.js';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import {fetchPuzzleProxy} from './puzzle-proxy.js';
import {PDF_MIN_SCALE,PDF_MAX_SCALE,touchPair,gestureScale,anchoredPageScroll,draggedPageScroll} from './pdf-gestures.js';

const PALETTE=['#e34b45','#1c80df','#21975c','#efab2c','#181818'];
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const copy=value=>JSON.parse(JSON.stringify(value));
const $=id=>document.getElementById(id);

// A PDF is not converted to a Sudoku grid. Each page is rasterized locally by
// PDF.js and the separate ink canvas stores coordinates relative to that page.
export function setupWpfReader({notify,onSaved=()=>{}}) {
  const dialog=$('wpfReaderDialog'),scroll=$('wpfPageScroll');
  const sheet=$('wpfPageSheet'),paper=$('wpfPdfCanvas'),ink=$('wpfInkCanvas');
  const inkCtx=ink.getContext('2d');
  let pdfjs=null,doc=null,entry=null,pages={},pageNumber=1;
  let scale=1,penEnabled=true,eraser=false,color=PALETTE[0];
  let renderSequence=0,renderJob=null,activeStroke=null,activePointer=null;
  let history=[],future=[],drawingSize={width:0,height:0};
  // Touches are tracked on the scroll viewport rather than the ink canvas:
  // the second finger may land on the margin outside the PDF page.
  const pointers=new Map();
  let gestureMode='idle',panStart=null,pinchStart=null,strokeBefore=null;
  let strokeChanged=false,previewActive=false;
  let renderedScale=1,renderedSize={width:0,height:0};
  const status=message=>{$('wpfReaderStatus').textContent=message;};
  const strokes=()=>Array.isArray(pages[pageNumber]) ? pages[pageNumber] : [];
  function setStrokes(next){pages[pageNumber]=next;}
  function pushHistory(){history.push(copy(strokes()));if(history.length>70)history.shift();future=[];}
  function updateControls(){
    $('wpfPrevPage').disabled=pageNumber<=1;
    $('wpfNextPage').disabled=!doc||pageNumber>=doc.numPages;
    $('wpfPageCount').textContent=doc?'/ '+doc.numPages:'';
    $('wpfPageInput').value=String(pageNumber);
    $('wpfZoomLabel').textContent=Math.round(scale*100)+'%';
    $('wpfPenToggle').setAttribute('aria-pressed',String(penEnabled&&!eraser));
    $('wpfEraserToggle').setAttribute('aria-pressed',String(penEnabled&&eraser));
    $('wpfUndo').disabled=!history.length;
    $('wpfRedo').disabled=!future.length;
    $('wpfClearPage').disabled=!strokes().length;
    for(const button of document.querySelectorAll('#wpfColors button[data-ink]'))
      button.setAttribute('aria-pressed',String(button.dataset.ink===color));
    ink.style.pointerEvents=penEnabled?'auto':'none';
    // Touch gestures are handled by the viewport even when pen is enabled.
    ink.style.touchAction='none';
  }
  function drawInk(){
    const {width,height}=drawingSize;
    inkCtx.clearRect(0,0,ink.width,ink.height);
    if(!width||!height)return;
    const dpr=ink.width/width;
    inkCtx.setTransform(dpr,0,0,dpr,0,0);
    for(const stroke of [...strokes(),...(activeStroke?[activeStroke]:[])]) {
      if(!stroke?.points?.length)continue;
      inkCtx.beginPath();
      inkCtx.strokeStyle=stroke.color;
      inkCtx.fillStyle=stroke.color;
      inkCtx.lineWidth=Math.max(1.2,(stroke.width||0.003)*Math.min(width,height));
      inkCtx.lineCap='round';inkCtx.lineJoin='round';
      stroke.points.forEach(([x,y],i)=>{
        if(i)inkCtx.lineTo(x*width,y*height);
        else inkCtx.moveTo(x*width,y*height);
      });
      if(stroke.points.length===1){
        const [x,y]=stroke.points[0];
        inkCtx.beginPath();inkCtx.arc(x*width,y*height,inkCtx.lineWidth/2,0,Math.PI*2);
        inkCtx.fill();
      }else inkCtx.stroke();
    }
  }
  // Serialise autosaves: a slow IndexedDB write must not overwrite a later
  // stroke, even if the user changes pages or closes the reader immediately.
  let inkSaveQueue=Promise.resolve();
  function writeInk(){
    if(!entry)return inkSaveQueue;
    const id=entry.id,snapshot=copy(pages);
    inkSaveQueue=inkSaveQueue.catch(()=>{}).then(()=>saveWpfInk(id,snapshot))
      .catch(error=>{status('画笔保存失败：'+(error?.message||error));});
    return inkSaveQueue;
  }
  async function renderPage(){
    if(!doc||!dialog.open)return;
    const token=++renderSequence;
    // Wait for the cancelled PDF.js task before reusing its canvas. Repeated
    // quick pinches otherwise race with the previous render on Android.
    const previous=renderJob;
    if(previous){
      try{previous.cancel();}catch{}
      try{await previous.promise;}catch{}
      if(renderJob===previous)renderJob=null;
    }
    const page=await doc.getPage(pageNumber);
    if(token!==renderSequence)return;
    const base=page.getViewport({scale:1});
    const fit=Math.min(2.8,Math.max(.15,(scroll.clientWidth-30)/base.width));
    const viewport=page.getViewport({scale:fit*scale});
    const width=Math.floor(viewport.width),height=Math.floor(viewport.height);
    const pixelRatio=Math.min(window.devicePixelRatio||1,2,4096/Math.max(width,height));
    const pxw=Math.max(1,Math.ceil(width*pixelRatio));
    const pxh=Math.max(1,Math.ceil(height*pixelRatio));
    for(const canvas of [paper,ink]){
      canvas.style.transform='none';
      canvas.width=pxw;canvas.height=pxh;
      canvas.style.width=width+'px';canvas.style.height=height+'px';
    }
    sheet.style.width=width+'px';sheet.style.height=height+'px';
    drawingSize={width,height};
    renderedScale=scale;renderedSize={width,height};previewActive=false;
    inkCtx.setTransform(1,0,0,1,0,0);
    drawInk();
    const context=paper.getContext('2d',{alpha:false});
    context.setTransform(1,0,0,1,0,0);
    // The PDF canvas is independently scaled for HiDPI; ink stays in CSS px.
    renderJob=page.render({canvasContext:context,canvas:paper,viewport,
      transform:[pixelRatio,0,0,pixelRatio,0,0]});
    try{await renderJob.promise;}
    catch(error){if(error?.name!=='RenderingCancelledException')throw error;}
    finally{if(token===renderSequence)renderJob=null;}
    if(token===renderSequence) status('第 '+pageNumber+' / '+doc.numPages+' 页 · 单指画笔 · 双指缩放/移动 · 自动保存');
  }
  async function navigate(next){
    if(!doc||!Number.isInteger(next)||next<1||next>doc.numPages){updateControls();return;}
    clearPointers();pageNumber=next;history=[];future=[];
    updateControls();
    scroll.scrollTop=0;scroll.scrollLeft=0;
    try{await renderPage();}catch(error){notify('PDF 渲染失败：'+error.message);}
  }
  function point(event){
    const rect=ink.getBoundingClientRect();
    return [clamp((event.clientX-rect.left)/rect.width,0,1),
      clamp((event.clientY-rect.top)/rect.height,0,1)];
  }
  function nearStroke(stroke,p){
    const w=Math.max(1,drawingSize.width),h=Math.max(1,drawingSize.height);
    const radius=15;let last=null;
    for(const xy of stroke.points||[]){
      const a=[xy[0]*w,xy[1]*h],b=[p[0]*w,p[1]*h];
      if(last){
        const dx=a[0]-last[0],dy=a[1]-last[1];
        const t=clamp(((b[0]-last[0])*dx+(b[1]-last[1])*dy)/(dx*dx+dy*dy||1),0,1);
        if(Math.hypot(b[0]-last[0]-dx*t,b[1]-last[1]-dy*t)<radius)return true;
      }else if(Math.hypot(a[0]-b[0],a[1]-b[1])<radius)return true;
      last=a;
    }
    return false;
  }
  function eraseAt(p){
    const next=strokes().filter(stroke=>!nearStroke(stroke,p));
    if(next.length===strokes().length)return false;
    setStrokes(next);drawInk();return true;
  }
  function insidePage(event){
    const rect=ink.getBoundingClientRect();
    return event.clientX>=rect.left&&event.clientX<=rect.right&&
      event.clientY>=rect.top&&event.clientY<=rect.bottom;
  }
  function abortInk(){
    if(gestureMode!=='ink')return;
    if(strokeBefore!==null)setStrokes(strokeBefore); // Restore erased marks.
    activeStroke=null;activePointer=null;strokeBefore=null;strokeChanged=false;
    drawInk();updateControls();
  }
  function beginInk(event){
    gestureMode='ink';activePointer=event.pointerId;
    strokeBefore=copy(strokes());strokeChanged=false;
    if(eraser)strokeChanged=eraseAt(point(event));
    else {activeStroke={color,width:.0035,points:[point(event)]};drawInk();}
  }
  function moveInk(event){
    if(activePointer!==event.pointerId)return;
    if(eraser)strokeChanged=eraseAt(point(event))||strokeChanged;
    else if(activeStroke){
      const p=point(event),last=activeStroke.points.at(-1);
      if(Math.hypot((p[0]-last[0])*drawingSize.width,
          (p[1]-last[1])*drawingSize.height)>1){
        activeStroke.points.push(p);drawInk();
      }
    }
  }
  function finishInk(event,cancelled){
    if(activePointer!==event.pointerId)return;
    if(cancelled){abortInk();return;}
    if(!eraser&&activeStroke){
      activeStroke.points.push(point(event));
      setStrokes([...strokes(),activeStroke]);activeStroke=null;
      strokeChanged=true;
    }
    if(strokeChanged){
      history.push(strokeBefore);
      if(history.length>70)history.shift();
      future=[];
      void writeInk();
    }
    strokeBefore=null;strokeChanged=false;activePointer=null;
    drawInk();updateControls();
  }
  function beginPan(pointer){
    gestureMode='pan';panStart={
      startX:pointer.x,startY:pointer.y,
      scrollLeft:scroll.scrollLeft,scrollTop:scroll.scrollTop
    };
    pinchStart=null;
  }
  function beginPinch(){
    if(pointers.size<2)return;
    abortInk();  // A second finger must never commit an accidental stroke.
    const [first,second]=[...pointers.values()];
    const pair=touchPair(first,second);
    const rect=sheet.getBoundingClientRect();
    gestureMode='pinch';panStart=null;
    pinchStart={
      scale,distance:pair.distance,
      anchorX:(pair.x-rect.left)/Math.max(1,rect.width),
      anchorY:(pair.y-rect.top)/Math.max(1,rect.height)
    };
  }
  function previewPinch(){
    if(!pinchStart||pointers.size<2)return;
    const [first,second]=[...pointers.values()];
    const pair=touchPair(first,second);
    scale=gestureScale(pinchStart.scale,pinchStart.distance,pair.distance);
    // Cheap CSS magnification while fingers move; PDF.js only rerenders
    // at the final resolution once the gesture has finished.
    const ratio=scale/renderedScale;
    const width=Math.max(1,Math.floor(renderedSize.width*ratio));
    const height=Math.max(1,Math.floor(renderedSize.height*ratio));
    sheet.style.width=width+'px';sheet.style.height=height+'px';
    for(const canvas of [paper,ink])canvas.style.transform='scale('+ratio+')';
    previewActive=true;
    const viewport=scroll.getBoundingClientRect();
    const target=anchoredPageScroll({
      offsetLeft:sheet.offsetLeft,offsetTop:sheet.offsetTop,
      pageWidth:width,pageHeight:height,
      anchorX:pinchStart.anchorX,anchorY:pinchStart.anchorY,
      centerX:pair.x-viewport.left,centerY:pair.y-viewport.top
    });
    scroll.scrollLeft=target.left;scroll.scrollTop=target.top;
    updateControls();
  }
  function finishPreview(){
    if(!previewActive)return;
    if(Math.abs(scale-renderedScale)<0.0001){
      // Pure two-finger translation: the scroll offsets already contain
      // the final pan, so don't do an unnecessary PDF.js render.
      for(const canvas of [paper,ink])canvas.style.transform='none';
      sheet.style.width=renderedSize.width+'px';
      sheet.style.height=renderedSize.height+'px';
      previewActive=false;
    }else renderPage().catch(error=>notify('PDF 缩放失败：'+error.message));
  }
  function clearPointers(){
    abortInk();
    for(const id of pointers.keys()){
      try{if(scroll.hasPointerCapture(id))scroll.releasePointerCapture(id);}catch{}
    }
    pointers.clear();gestureMode='idle';panStart=null;pinchStart=null;
    activePointer=null;activeStroke=null;
  }
  // Capture on the scrolling viewport instead of only the canvas so a second
  // touch on the page margin can start a two-finger gesture. Mouse and stylus
  // input retain ordinary single-pointer drawing/dragging behavior.
  scroll.addEventListener('pointerdown',event=>{
    if(!doc||!dialog.open||event.button!==0)return;
    if(pointers.has(event.pointerId))return;
    event.preventDefault();
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    try{scroll.setPointerCapture(event.pointerId);}catch{}
    if(pointers.size>=2){beginPinch();return;}
    if(penEnabled&&insidePage(event))beginInk(event);
    else beginPan(pointers.get(event.pointerId));
  });
  scroll.addEventListener('pointermove',event=>{
    if(!pointers.has(event.pointerId))return;
    event.preventDefault();
    const point={x:event.clientX,y:event.clientY};
    pointers.set(event.pointerId,point);
    if(gestureMode==='pinch'){previewPinch();return;}
    if(gestureMode==='pan'&&panStart){
      const target=draggedPageScroll(panStart,point);
      scroll.scrollLeft=target.left;scroll.scrollTop=target.top;
    }else if(gestureMode==='ink')moveInk(event);
  });
  function endPointer(event,cancelled=false){
    if(!pointers.has(event.pointerId))return;
    event.preventDefault();
    if(gestureMode==='ink')finishInk(event,cancelled);
    pointers.delete(event.pointerId);
    if(gestureMode==='pinch'){
      if(pointers.size>=2)beginPinch();
      else if(pointers.size===1)beginPan([...pointers.values()][0]);
      else {gestureMode='idle';pinchStart=null;finishPreview();}
    }else if(gestureMode==='pan'&&!pointers.size){
      gestureMode='idle';panStart=null;finishPreview();
    }else if(gestureMode==='ink'&&!pointers.size){
      gestureMode='idle';
    }
    try{if(scroll.hasPointerCapture(event.pointerId))
      scroll.releasePointerCapture(event.pointerId);}catch{}
  }
  scroll.addEventListener('pointerup',event=>endPointer(event));
  scroll.addEventListener('pointercancel',event=>endPointer(event,true));
  $('wpfPrevPage').addEventListener('click',()=>navigate(pageNumber-1));
  $('wpfNextPage').addEventListener('click',()=>navigate(pageNumber+1));
  $('wpfPageInput').addEventListener('change',()=>navigate(Number($('wpfPageInput').value)));
  for(const [id,delta] of [['wpfZoomIn',.25],['wpfZoomOut',-.25]]){
    $(id).addEventListener('click',()=>{
      clearPointers();
      scale=clamp(Math.round((scale+delta)*100)/100,PDF_MIN_SCALE,PDF_MAX_SCALE);
      updateControls();renderPage().catch(error=>notify(error.message));
    });
  }
  $('wpfPenToggle').addEventListener('click',()=>{
    penEnabled=!(penEnabled&&!eraser);eraser=false;updateControls();
  });
  $('wpfEraserToggle').addEventListener('click',()=>{
    if(penEnabled&&eraser)penEnabled=false;
    else {penEnabled=true;eraser=true;}
    updateControls();
  });
  $('wpfColors').addEventListener('click',event=>{
    const swatch=event.target.closest('button[data-ink]');
    if(!swatch)return;
    color=swatch.dataset.ink;penEnabled=true;eraser=false;updateControls();
  });
  $('wpfUndo').addEventListener('click',()=>{
    if(!history.length)return;
    future.push(copy(strokes()));setStrokes(history.pop());drawInk();updateControls();void writeInk();
  });
  $('wpfRedo').addEventListener('click',()=>{
    if(!future.length)return;
    history.push(copy(strokes()));setStrokes(future.pop());drawInk();updateControls();void writeInk();
  });
  $('wpfClearPage').addEventListener('click',()=>{
    if(!strokes().length)return;
    pushHistory();setStrokes([]);drawInk();updateControls();void writeInk();
  });
  $('wpfReaderClose').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{
    clearPointers();
    ++renderSequence;if(renderJob)try{renderJob.cancel();}catch{}
    const old=doc;doc=null;entry=null;activeStroke=null;activePointer=null;
    if(old)void old.destroy().catch(()=>{});
  });
  window.addEventListener('resize',()=>{
    if(dialog.open&&doc){
      clearPointers();
      renderPage().catch(error=>notify(error.message));
    }
  });
  async function download(entryToOpen){
    const candidates=(entryToOpen.pdfUrls||[entryToOpen.pdfUrl])
      .map(validatedWpfPdfUrl).filter(Boolean);
    if(!candidates.length)throw Error('未找到此赛事对应的有效官方 PDF 链接');
    let lastError;
    for(const pdfUrl of candidates){
      try{
        let bytes;
        if(window.__TAURI_INTERNALS__){
          const encoded=await invoke('fetch_wpf_pdf',{url:pdfUrl});
          if(typeof encoded!=='string'||encoded.length>MAX_WPF_PDF*4/3+16)
            throw Error('PDF 传输数据格式不正确');
          const binary=atob(encoded);
          bytes=new Uint8Array(binary.length);
          for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
        }else{
          bytes=await fetchPuzzleProxy('wpf-pdf',{url:pdfUrl},
            {limit:MAX_WPF_PDF,binary:true});
        }
        if(bytes.byteLength>MAX_WPF_PDF||!isPdfData(bytes))throw Error('链接返回的不是 PDF');
        const found={...entryToOpen,pdfUrl};
        await saveWpfDocument(found,bytes);
        onSaved();
        return {bytes,entry:found};
      }catch(error){lastError=error;}
    }
    throw Error('WPF PDF 下载失败：'+(lastError?.message||lastError)+
      '。请检查跨域代理和官方 PDF 资源是否可用。');
  }
  async function open(entryToOpen,{offline=false}={}){
    if(dialog.open)dialog.close();
    status('正在打开 WPF PDF…');
    let bytes=await readWpfDocument(entryToOpen.id);
    let result=entryToOpen;
    if(!bytes){
      if(offline)throw Error('离线 PDF 不存在，请联网重新下载');
      ({bytes,entry:result}=await download(entryToOpen));
    }
    if(!isPdfData(bytes))throw Error('离线文件不是有效 PDF');
    const api=pdfjs||await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjs=api;api.GlobalWorkerOptions.workerSrc=pdfWorkerUrl;
    const loaded=await api.getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;
    doc=loaded;entry=result;pages=await readWpfInk(entry.id);
    if(!pages||typeof pages!=='object'||Array.isArray(pages))pages={};
    pageNumber=1;scale=1;penEnabled=true;eraser=false;
    clearPointers();history=[];future=[];activeStroke=null;activePointer=null;
    $('wpfReaderTitle').textContent=entry.title;
    $('wpfReaderSource').href=entry.pdfUrl;
    updateControls();dialog.showModal();
    try{await renderPage();}catch(error){status('PDF 渲染失败：'+error.message);throw error;}
  }
  // Used when a user explicitly presses "download"; it doesn't open the reader.
  async function save(entryToSave){
    const old=await readWpfDocument(entryToSave.id);
    if(old)return;
    await download(entryToSave);
  }
  // Render the palette locally; never inject markup from the remote site.
  for(const shade of PALETTE){
    const button=document.createElement('button');button.type='button';
    button.dataset.ink=shade;button.title='画笔 '+shade;
    button.style.setProperty('--ink',shade);
    button.setAttribute('aria-label',button.title);
    $('wpfColors').append(button);
  }
  updateControls();
  return {open,save};
}
