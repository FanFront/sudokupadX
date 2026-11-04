// Read-only hint solver on its own WASM instance. Never mutate the game engine.
self.onmessage=async event=>{
  const {input,cells,tier}=event.data||{};
  if(!input||!Array.isArray(cells))return;
  try{
    const url=new URL(import.meta.env.BASE_URL+'wasm/sudokupadx_web.js',self.location.origin);
    const module=await import(/* @vite-ignore */ url.href);
    await module.default();
    const engine=new module.WasmPuzzleEngine();
    engine.open_puzzle(input,'null');
    engine.restore_progress(JSON.stringify(cells));
    const result=JSON.parse(engine.hint_step(tier));
    self.postMessage({type:'done',result});
  }catch(error){
    self.postMessage({type:'error',error:String(error?.message||error)});
  }
};
