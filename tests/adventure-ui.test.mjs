import test from 'node:test';
import assert from 'node:assert/strict';
import {isVisible,canSelectCell,getSectors,getLinkedPuzzles,drawFog,drawSectorBorders,focusInitialFog,puzzlePoint,drawDecorations,drawPuzzleLines,drawArrows,drawCages,dragCellIndices} from '../src/adventure-ui.js';

test('fog limits visibility, not selection of covered cells',()=>{
  assert.equal(isVisible({visible:[true,false]},0),true);
  assert.equal(isVisible({visible:[true,false]},1),false);
  assert.equal(isVisible({cells:[]},0),true);
  assert.equal(isVisible({visible:[true]},-1),false);
  const puzzle={cells:[{},{}]};
  assert.equal(canSelectCell(puzzle,1),true);
  assert.equal(canSelectCell(puzzle,-1),false);
  assert.equal(canSelectCell(puzzle,2),false);
});

test('drag crosses every cell, including fast diagonal moves, without panning',()=>{
  const puzzle={rows:4,cols:5,cells:Array(20).fill(null)};
  const camera={x:10,y:20,scale:1};
  const start={x:36,y:46},end={x:36+52*3,y:46};
  assert.deepEqual(dragCellIndices(start,end,camera,puzzle),[0,1,2,3]);
  assert.deepEqual(
    dragCellIndices(start,{x:36+52*3,y:46+52*3},camera,puzzle),
    [0,6,12,18]
  );
  assert.deepEqual(dragCellIndices({x:-100,y:-100},start,camera,puzzle),[0]);
  const zoomed={x:100,y:80,scale:2};
  assert.deepEqual(dragCellIndices({x:152,y:132},{x:256,y:132},zoomed,puzzle),[0,1]);
});

test('select smallest overlapping sector and keep its rules separate',()=>{
  const puzzle={sectors:[
    {title:'Region',width:9,height:9,cells:[10,11]},
    {title:'Boss Room',width:1,height:1,cells:[11]},
    {title:'Other',width:1,height:1,cells:[35]}
  ]};
  assert.deepEqual(getSectors(puzzle,11).map(x=>x.title),['Boss Room','Region']);
  assert.deepEqual(getSectors(puzzle,1),[]);
});

test('only imported puzzle ids referenced by rules become links',()=>{
  const catalog=[
    {id:'boss-a',url:'https://sudokupad.app/abc',kind:'boss',group:'a',title:'Boss'},
    {id:'boss-b',url:'https://sudokupad.app/xyz',kind:'boss',group:'b',title:'Hidden'}
  ];
  const rules='[Play](https://sudokupad.app/abc) and [Again](https://sudokupad.app/abc).';
  assert.deepEqual(getLinkedPuzzles(rules,catalog,'a').map(x=>x.id),['boss-a']);
  assert.deepEqual(getLinkedPuzzles('No links yet',catalog,'a'),[]);
});

test('hidden constraint cages never draw; visible single-cell clues show only labels',()=>{
  const calls=[];
  const ctx={
    save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},
    setLineDash(){},stroke(){calls.push('stroke')},
    fillText(text){calls.push(['text',text,this.fillStyle]);}
  };
  const clip={left:0,top:0,right:400,bottom:400};
  drawCages(ctx,{cages:[
    {hidden:true,cells:[[0,0],[0,1],[0,2]],value:45},
    {hidden:true,cells:[[1,0]],value:12},
    {cells:[[2,1]],value:'🪙',fontC:'#123456'},
    {cells:[[3,0],[3,1]],value:10}
  ]},clip);
  assert.equal(calls.filter(x=>x==='stroke').length,1);
  assert.deepEqual(calls.filter(x=>Array.isArray(x)),[
    ['text','🪙','#123456'],['text','10','#5a4c74']
  ]);
});

test('killer sum is anchored to an actual top-left cage cell, not its empty bounding corner',()=>{
  const labels=[];
  const ctx={
    save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},
    setLineDash(){},stroke(){},
    fillText(text,x,y){labels.push([text,x,y]);}
  };
  const clip={left:0,top:0,right:1000,bottom:1000};
  drawCages(ctx,{cages:[
    // L: bounding top-left is [0,0], but no cage cell lives there.
    {cells:[[1,0],[1,1],[0,1]],value:12},
    // Irregular top row has two cells; choose its leftmost one even if
    // the input arrays are unsorted and lower rows have smaller columns.
    {cells:[[4,2],[2,5],[3,4],[2,3]],value:18},
    // Keep the same position for standard rectangular and single-cell cages.
    {cells:[[6,6],[5,5],[5,6],[6,5]],value:22},
    {cells:[[8,7]],value:9},
    {hidden:true,cells:[[9,9],[9,10]],value:30}
  ]},clip);
  assert.deepEqual(labels,[
    ['12',58,5], // r0c1: top-left actual cage cell
    ['18',162,109], // r2c3, not bbox [2,2]
    ['22',266,265], // r5c5
    ['9',370,421] // r8c7
  ]);
});

test('fog is painted only over the covered cells',()=>{
  const fills=[];
  const context={save(){},restore(){},fillRect(...args){fills.push(args)},set fillStyle(x){this.color=x}};
  drawFog(context,{rows:2,cols:2},{visible:[true,false,false,true]},
    {left:0,top:0,right:104,bottom:104});
  assert.equal(fills.length,2);
  assert.deepEqual(fills.map(x=>x.slice(0,2)),[[52,0],[0,52]]);
});

test('scene borders frame multi-cell sectors but skip single-cell markers',()=>{
  const strokes=[];
  const ctx={save(){},restore(){},strokeRect(...args){strokes.push([...args,this.lineWidth,this.strokeStyle]);}};
  const clip={left:0,top:0,right:520,bottom:520};
  drawSectorBorders(ctx,[
    {left:1,top:2,width:4,height:4},
    {left:1,top:2,width:4,height:4}, // Duplicated rule metadata.
    {left:6,top:1,width:3,height:1}, // Narrow passage boundary.
    {left:0,top:0,width:1,height:1}, // One-cell rule marker.
    {left:30,top:30,width:9,height:9} // Outside the viewport.
  ],clip);
  assert.equal(strokes.length,2);
  assert.deepEqual(strokes[0],[53.6,105.6,204.8,204.8,3.2,'#354e62']);
  assert.deepEqual(strokes[1],[313.1,53.1,153.8,49.8,2.2,'#354e62']);
});

test('initial camera focuses a dense visible area instead of whole map',()=>{
  const visible=Array(40*40).fill(false);
  for(let r=18;r<=20;r++)for(let c=16;c<=18;c++)visible[r*40+c]=true;
  visible[0]=true;
  const puzzle={rows:40,cols:40,cells:Array(1600)};
  const camera=focusInitialFog(puzzle,{visible},{width:400,height:600});
  assert.ok(camera.scale>.1);
  assert.ok(camera.x<0&&camera.y<0);
});

test('SudokuMaker art coordinates are row then column, just like fog and cages',()=>{
  assert.deepEqual(puzzlePoint([1,4]),[208,52]);
  assert.deepEqual(puzzlePoint([0.5,1.5]),[78,26]);
  assert.deepEqual(puzzlePoint([4,2]),[104,208]);
  assert.equal(puzzlePoint([Infinity,0]),null);
});

test('source line layers preserve coordinates, widths and overlay ordering',()=>{
  const paths=[];
  const ctx={
    save(){},restore(){},beginPath(){},setLineDash(){},
    moveTo(...xy){paths.push(['move',...xy]);},
    lineTo(...xy){paths.push(['line',...xy]);},
    stroke(){paths.push(['stroke',this.lineWidth,this.strokeStyle]);}
  };
  const clip={left:0,top:0,right:800,bottom:800};
  const lines=[
    {wayPoints:[[1,2],[3,4]],thickness:6.4,color:'#123456'},
    {target:'overlay',wayPoints:[[2,1],[2,3]],thickness:3.2},
    {target:'cell-grids',wayPoints:[[0,0],[0,3]],thickness:7.68,color:'#000000'}
  ];
  drawPuzzleLines(ctx,lines,clip);
  assert.deepEqual(paths.slice(0,3),[
    ['move',104,52],['line',208,156],['stroke',5.2,'#123456']
  ]);
  assert.equal(paths.length,3);
  drawPuzzleLines(ctx,lines,clip,'overlay');
  assert.deepEqual(paths.slice(3,5),[['move',52,104],['line',156,104]]);
  // Original scene walls have their own layer, not the normal clue layer:
  // they are rendered once, above the fog and independent of fine grid.
  drawPuzzleLines(ctx,lines,clip,'grid');
  assert.deepEqual(paths.slice(6,9),[
    ['move',0,0],['line',156,0],['stroke',6.24,'#000000']
  ]);
  assert.equal(paths.length,9);
});

test('arrow geometry follows SudokuPad row/column placement',()=>{
  const points=[];
  const ctx={
    save(){},restore(){},beginPath(){},closePath(){},stroke(){},fill(){},
    moveTo(...xy){points.push(['move',...xy]);},
    lineTo(...xy){points.push(['line',...xy]);}
  };
  drawArrows(ctx,{arrows:[{wayPoints:[[1,2],[1,3]],thickness:3.2}]},
    {left:0,top:0,right:500,bottom:500});
  assert.deepEqual(points.slice(0,2),[['move',104,52],['line',156,52]]);
});

test('underlay rectangles and numeric, long and colored text retain source geometry',()=>{
  const events=[];
  const ctx={
    save(){},restore(){},beginPath(){},fill(){},stroke(){},
    rect(...args){events.push(['rect',...args]);},
    roundRect(...args){events.push(['rounded',...args]);},
    fillText(...args){events.push(['text',...args,this.fillStyle]);},
    strokeText(...args){events.push(['outline',...args]);},
    translate(){},rotate(){}
  };
  const clip={left:0,top:0,right:2000,bottom:2000};
  drawDecorations(ctx,[
    {center:[0.5,1.5],width:1,height:1,backgroundColor:'#a0a0a0'},
    {center:[2.5,7.5],width:0,height:1,text:'A long map label',color:'#c0ffee',fontSize:15},
    {center:[9.88,17.915],width:0.1,height:0.1,text:4,color:'#ff2222'}
  ],clip);
  assert.deepEqual(events.find(e=>e[0]==='rect'),['rect',52,0,52,52]);
  const label=events.find(e=>e[0]==='text'&&e[1]==='A long map label');
  assert.equal(label[2],390);
  assert.equal(label[3],130);
  assert.equal(label[4],'#c0ffee'); // No artificial maxWidth for zero-width labels.
  const number=events.find(e=>e[0]==='text'&&e[1]==='4');
  assert.ok(number);
  assert.ok(Math.abs(number[2]-931.58)<.01);
  assert.ok(Math.abs(number[3]-513.76)<.01);
  assert.equal(number[5],'#ff2222');
});
