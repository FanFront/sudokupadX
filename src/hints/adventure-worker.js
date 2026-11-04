import {nextAdventureHint} from './adventure.js';

// Self-contained browser/Tauri worker: receives a read-only game snapshot.
self.onmessage=event=>{
  try{
    const {puzzle,progress,tier,focus}=event.data||{};
    const result=nextAdventureHint(puzzle,progress,tier,focus);
    self.postMessage({type:'done',result});
  }catch(error){
    self.postMessage({type:'error',error:String(error?.message||error)});
  }
};
