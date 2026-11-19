// Browser inference happens off the UI thread, independently of the live board.
export function computeBrowserHint(input,cells,tier,focus=null){
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
  worker.postMessage({input,cells,tier,focus});
  return {promise,cancel(){
    if(settled)return;
    settled=true;worker.terminate();
    rejectTask(Error('已取消提示'));
  }};
}

export function computeAdventureHint(puzzle,progress,tier,focus=-1){
  const worker=new Worker(new URL('./adventure-worker.js',import.meta.url),{type:'module'});
  let settled=false,rejectTask;
  const promise=new Promise((resolve,reject)=>{
    rejectTask=reject;
    worker.onmessage=event=>{
      if(settled)return;
      settled=true;worker.terminate();
      if(event.data?.type==='done')resolve(event.data.result);
      else reject(Error(event.data?.error||'大型谜题提示计算失败'));
    };
    worker.onerror=error=>{
      if(settled)return;
      settled=true;worker.terminate();
      reject(Error(error.message||'冒险谜题推理线程异常'));
    };
  });
  worker.postMessage({puzzle,progress,tier,focus});
  return {promise,cancel(){
    if(settled)return;
    settled=true;worker.terminate();
    rejectTask(Error('已取消提示'));
  }};
}


function coreWorker(board,tier,action){
  const worker=new Worker(new URL('./sudoku-core-worker.js',import.meta.url),{type:'module'});
  let settled=false,rejectTask;
  const promise=new Promise((resolve,reject)=>{
    rejectTask=reject;
    worker.onmessage=event=>{
      if(settled)return;
      settled=true;worker.terminate();
      if(event.data?.type==='done')resolve(event.data.result);
      else reject(Error(event.data?.error||'sudoku-core 推理失败'));
    };
    worker.onerror=error=>{
      if(settled)return;
      settled=true;worker.terminate();
      reject(Error(error.message||'sudoku-core Worker 异常'));
    };
  });
  worker.postMessage({board,tier,action});
  return {promise,cancel(){
    if(settled)return;
    settled=true;worker.terminate();rejectTask(Error('已取消推理'));
  }};
}
export function computeClassicHint(board,tier){
  return coreWorker(board,tier,'hint');
}
export function analyzeClassicBoard(board){
  return coreWorker(board,4,'analyze');
}
