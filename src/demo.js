export const digits = ['53..7....','6..195...','.98....6.','8...6...3','4..8.3..1','7...2...6','.6....28.','...419..5','....8..79'];

export function makeDemo() {
  const regions = [];
  for (let br = 0; br < 3; br++) for (let bc = 0; bc < 3; bc++) {
    const region = [];
    for (let r = br * 3; r < br * 3 + 3; r++)
      for (let c = bc * 3; c < bc * 3 + 3; c++) region.push([r,c]);
    regions.push(region);
  }
  const cells = digits.flatMap(row => Array.from(row).map(c => ({
    given: c === '.' ? null : c
  })));
  return {
    puzzle: {
      key:'sudokupadx-demo-v1',
      title:'First Steps · 初始练习',
      author:'SudokuPad X',
      rules:'Fill each row, column and 3×3 region with digits 1–9.\n每行、每列、每个 3×3 宫填入 1–9。',
      rows:9, cols:9, cells, regions,
      overlays:[], underlays:[], lines:[], cages:[], warnings:[]
    },
    progress:{
      cells:Array.from({length:81},()=>({value:null,corner:[],center:[],color:null})),
      canUndo:false,canRedo:false
    }
  };
}
