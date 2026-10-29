// Chromium smoke test for the actual GitHub Pages build (including WASM/SCL).
// Run from the repository root after npm run build:web and npm install playwright.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const root=process.env.WEB_SMOKE_URL || 'http://127.0.0.1:4173/sudokupadX/';
const cases=[
  ['digits-of-despair','40 × 50'],
  ['lineage-of-logic','50 × 50'],
  ['super-sudokoid-1','45 × 42'],
  ['super-sudokoid-2','36 × 45'],
  ['boss-6cn54q09sv','9 × 9']
];
await mkdir('artifacts/web',{recursive:true});
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:430,height:860},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  for(const [id,dimensions] of cases){
    const url=new URL(root);
    url.searchParams.set('puzzle',id);
    const response=await page.goto(url.href,{waitUntil:'domcontentloaded'});
    assert.ok(response?.ok(),url.href+' failed to load');
    await page.waitForFunction(expected=>
      document.querySelector('#boardMeta')?.textContent?.includes(expected) &&
      document.querySelector('#runtimeBadge')?.textContent==='Rust / WASM' &&
      document.querySelector('#puzzleTitle')?.textContent!=='Loading…',
      dimensions,{timeout:60000});
    // Ensure a substantial, actually painted Canvas, not just a DOM title.
    await page.waitForFunction(()=>{
      const canvas=document.querySelector('#boardCanvas');
      if(!canvas||canvas.width<100||canvas.height<100)return false;
      const ctx=canvas.getContext('2d');
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      let distinct=false;
      const base=pixels.slice(0,3);
      for(let i=0;i<pixels.length;i+=Math.max(4,Math.floor(pixels.length/4096/4)*4)){
        if(pixels[i]!==base[0]||pixels[i+1]!==base[1]||pixels[i+2]!==base[2]){distinct=true;break}
      }
      return distinct;
    },null,{timeout:10000});
    await page.screenshot({path:`artifacts/web/${id}.png`});
    console.log('Rendered '+id+' ('+dimensions+')');
  }

  // End-to-end editing and Rust-native undo/redo on a deterministic demo board.
  await page.locator('#demoButton').click();
  await page.waitForFunction(()=>document.querySelector('#boardMeta')?.textContent?.includes('9 × 9'));
  const canvas=page.locator('#boardCanvas');
  const bounds=await canvas.boundingBox();
  assert.ok(bounds && bounds.width>100 && bounds.height>100);
  await canvas.click({position:{x:bounds.width/2,y:bounds.height/2}});
  const selection=await page.locator('#selectionLabel').textContent();
  assert.match(selection,/R5C5/);
  await page.locator('#keypad button[data-symbol="1"]').click();
  await page.waitForFunction(()=>!document.querySelector('#undoButton').disabled);
  await page.locator('#undoButton').click();
  await page.waitForFunction(()=>!document.querySelector('#redoButton').disabled);
  await page.locator('#redoButton').click();
  await page.waitForFunction(()=>!document.querySelector('#undoButton').disabled);
  await page.screenshot({path:'artifacts/web/demo-input.png'});
  assert.deepEqual(errors,[]);
  console.log('Rust WASM input, undo and redo passed; screenshots in artifacts/web/');
}finally{
  await browser.close();
}
