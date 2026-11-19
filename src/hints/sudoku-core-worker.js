// sudoku-core runs away from the UI on both Android WebView and browsers.
import {teachHint,analyze,hasAnySolution,isUniqueSolution} from 'sudoku-core';
import {adaptCoreTeaching} from './sudoku-core-adapter.js';

self.onmessage=event=>{
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
    const tip=teachHint(board);
    const method=String(tip?.strategy||'');
    const unique=/Unique Rectangle|BUG\+1/.test(method)
      ?isUniqueSolution(board):false;
    const result=adaptCoreTeaching(tip,board,tier,unique);
    self.postMessage({type:'done',result});
  }catch(error){
    self.postMessage({type:'error',error:String(error?.message||error)});
  }
};
