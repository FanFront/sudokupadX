import {invoke} from '@tauri-apps/api/core';
import {validatedWpfPdfUrl,isPdfData} from './wpf-catalog.js';
import {MAX_WPF_PDF,readWpfDocument,saveWpfDocument,readWpfInk,saveWpfInk} from './wpf-storage.js';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

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
    ink.style.touchAction=penEnabled?'none':'auto';
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
  async function writeInk(){
    if(!entry)return;
    try{await saveWpfInk(entry.id,pages);}
    catch(error){status('画笔保存失败：'+(error?.message||error));}
  }
  async function renderPage(){
    if(!doc||!dialog.open)return;
    const token=++renderSequence;
    if(renderJob){try{renderJob.cancel();}catch{}renderJob=null;}
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
      canvas.width=pxw;canvas.height=pxh;
      canvas.style.width=width+'px';canvas.style.height=height+'px';
    }
    sheet.style.width=width+'px';sheet.style.height=height+'px';
    drawingSize={width,height};
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
    if(token===renderSequence) status('第 '+pageNumber+' / '+doc.numPages+' 页 · 画笔自动保存');
  }
  async function navigate(next){
    if(!doc||next<1||next>doc.numPages)return;
    activeStroke=null;activePointer=null;pageNumber=next;history=[];future=[];
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
  let changed=false;
  ink.addEventListener('pointerdown',event=>{
    if(!penEnabled||!doc||activePointer!==null||event.button>0)return;
    event.preventDefault();activePointer=event.pointerId;ink.setPointerCapture(event.pointerId);
    changed=false;pushHistory();
    if(eraser){changed=eraseAt(point(event));}
    else {activeStroke={color,width:.0035,points:[point(event)]};drawInk();}
  });
  ink.addEventListener('pointermove',event=>{
    if(event.pointerId!==activePointer)return;
    event.preventDefault();
    if(eraser){changed=eraseAt(point(event))||changed;}
    else if(activeStroke){
      const p=point(event),last=activeStroke.points.at(-1);
      if(Math.hypot((p[0]-last[0])*drawingSize.width,(p[1]-last[1])*drawingSize.height)>1){
        activeStroke.points.push(p);drawInk();
      }
    }
  });
  const finish=event=>{
    if(event.pointerId!==activePointer)return;
    if(!eraser&&activeStroke){
      activeStroke.points.push(point(event));
      setStrokes([...strokes(),activeStroke]);
      activeStroke=null;changed=true;
    }
    activePointer=null;
    if(!changed)history.pop();
    drawInk();updateControls();
    if(changed)void writeInk();
  };
  ink.addEventListener('pointerup',finish);
  ink.addEventListener('pointercancel',finish);
  $('wpfPrevPage').addEventListener('click',()=>navigate(pageNumber-1));
  $('wpfNextPage').addEventListener('click',()=>navigate(pageNumber+1));
  $('wpfPageInput').addEventListener('change',()=>navigate(Number($('wpfPageInput').value)));
  for(const [id,delta] of [['wpfZoomIn',.25],['wpfZoomOut',-.25]]){
    $(id).addEventListener('click',()=>{
      scale=clamp(Math.round((scale+delta)*100)/100,.5,3);
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
    ++renderSequence;if(renderJob)try{renderJob.cancel();}catch{}
    const old=doc;doc=null;entry=null;activeStroke=null;activePointer=null;
    if(old)void old.destroy().catch(()=>{});
  });
  window.addEventListener('resize',()=>{
    if(dialog.open&&doc)renderPage().catch(error=>notify(error.message));
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
          bytes=new Uint8Array(await invoke('fetch_wpf_pdf',{url:pdfUrl}));
        }else{
          const response=await fetch(pdfUrl,{cache:'no-store',credentials:'omit'});
          if(!response.ok)throw Error('HTTP '+response.status);
          if(Number(response.headers.get('content-length')||0)>MAX_WPF_PDF)
            throw Error('PDF 超过 24 MiB');
          bytes=new Uint8Array(await response.arrayBuffer());
        }
        if(bytes.byteLength>MAX_WPF_PDF||!isPdfData(bytes))throw Error('链接返回的不是 PDF');
        const found={...entryToOpen,pdfUrl};
        await saveWpfDocument(found,bytes);
        onSaved();
        return {bytes,entry:found};
      }catch(error){lastError=error;}
    }
    throw Error('WPF PDF 下载失败：'+(lastError?.message||lastError)+
      '。网页版如被 CORS 阻止，请使用安卓版或从官方站点下载。');
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
    history=[];future=[];activeStroke=null;activePointer=null;
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
