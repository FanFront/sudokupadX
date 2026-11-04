// Browser inference happens off the UI thread, independently of the live board.
export function computeBrowserHint(input,cells,tier){
  const worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
  let settled=false,rejectTask;
  const promise=new Promise((resolve,reject)=>{
    rejectTask=reject;
    worker.onmessage=event=>{
      if(settled)return;
      settled=true;worker.terminate();
      if(event.data?.type==='done')resolve(event.data.result);
      else reject(Error(event.data?.error||'提示计算失败'));
    };
    worker.onerror=error=>{
      if(settled)return;
      settled=true;worker.terminate();
      reject(Error(error.message||'WASM 提示线程异常'));
    };
  });
  worker.postMessage({input,cells,tier});
  return {promise,cancel(){
    if(settled)return;
    settled=true;worker.terminate();
    rejectTask(Error('已取消提示'));
  }};
}
