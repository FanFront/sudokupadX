// Dedicated module worker; never imports the app's current game session.
// The WASM core is initialized inside this worker, then discarded on exit.
self.onmessage=async event=>{
  if(event.data?.type!=='generate')return;
  try{
    self.postMessage({type:'status',message:'正在载入离线 Rust / WASM 生成器…'});
    const url=new URL(import.meta.env.BASE_URL+'wasm/sudokupadx_web.js',self.location.origin);
    const module=await import(/* @vite-ignore */ url.href);
    await module.default();
    const engine=new module.WasmPuzzleEngine();
    self.postMessage({type:'status',message:'正在进行本机唯一解、技巧等级与变体验证…'});
    const json=engine.generate_puzzle(JSON.stringify(event.data.request));
    self.postMessage({type:'done',response:JSON.parse(json)});
  }catch(error){
    self.postMessage({type:'error',error:String(error?.message||error)});
  }
};
