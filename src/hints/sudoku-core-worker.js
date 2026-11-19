// sudoku-core runs away from the UI on both Android WebView and browsers.
import {teachHint,analyze,hasAnySolution,isUniqueSolution} from 'sudoku-core';
import {adaptCoreTeaching} from './sudoku-core-adapter.js';

self.onmessage=async event=>{
  try{
    const {board,tier,action}=event.data||{};
    if(!Array.isArray(board)||board.length!==81)
      throw Error('标准数独棋盘格式不正确');
    if(action==='analyze'){
      self.postMessage({type:'done',result:analyze(board)});
      return;
    }
    if(!hasAnySolution(board)){
      self.postMessage({type:'done',result:null});
      return;
    }
    let tip=teachHint(board);
    // The SudokuCoach instrumented engine retains candidate-level proof.
    // Never attach a certificate to a mismatched upstream deduction.
    if(tip?.step){
      const {boardFromPublic,walkthrough}=await import('./coach-proof-core.js');
      const candidate=walkthrough(boardFromPublic(board),undefined,1).steps[0];
      const signature=updates=>(updates||[]).map(u=>
        [u.index,u.filledValue??null,u.eliminatedCandidate??null])
        .sort((a,b)=>a[0]-b[0]||Number(a[1]??0)-Number(b[1]??0)||
          Number(a[2]??0)-Number(b[2]??0));
      if(candidate?.proof && candidate.strategy===tip.step.strategy &&
         JSON.stringify(signature(candidate.updates))===
         JSON.stringify(signature(tip.step.updates))){
        tip={...tip,step:{...tip.step,proof:candidate.proof}};
      }
    }
    const method=String(tip?.strategy||'');
    const unique=/Unique Rectangle|BUG\+1/.test(method)
      ?isUniqueSolution(board):false;
    const result=adaptCoreTeaching(tip,board,tier,unique);
    self.postMessage({type:'done',result});
  }catch(error){
    self.postMessage({type:'error',error:String(error?.message||error)});
  }
};
