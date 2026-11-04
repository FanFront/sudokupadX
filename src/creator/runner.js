import {invoke} from '@tauri-apps/api/core';

// In browsers, the separate Vite-bundled Worker loads the *same Rust core*
// through wasm-pack and can be terminated without freezing the Sudoku board.
// Android calls a Tauri command using spawn_blocking (see src-tauri/src/lib.rs).
export function startGeneration(request,{onStatus=()=>{}}={}){
  if(window.__TAURI_INTERNALS__){
    let cancelled=false;
    let rejectCancelled;
    const cancelledPromise=new Promise((_,reject)=>{rejectCancelled=reject;});
    const task=Promise.race([
      invoke('generate_puzzle',{request}),
      cancelledPromise
    ]).then(result=>{
      if(cancelled)throw Error('已取消生成');
      return result;
    });
    onStatus('Rust 正在后台生成并严格验证谜题…');
    return {promise:task,cancel(){
      cancelled=true;rejectCancelled(Error('已取消生成'));
    }};
  }
  const worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
  let settled=false;
  let fail,resolveResult;
  const promise=new Promise((resolve,reject)=>{resolveResult=resolve;fail=reject;});
  worker.onmessage=event=>{
    if(settled)return;
    const payload=event.data||{};
    if(payload.type==='status'){onStatus(payload.message);return;}
    settled=true;worker.terminate();
    if(payload.type==='done')resolveResult(payload.response);
    else fail(Error(payload.error||'本机生成失败'));
  };
  worker.onerror=error=>{
    if(settled)return;
    settled=true;worker.terminate();
    fail(Error(error.message||'本机 WASM 线程异常'));
  };
  worker.postMessage({type:'generate',request});
  return {promise,cancel(){
    if(settled)return;
    settled=true;worker.terminate();fail(Error('已取消生成'));
  }};
}
