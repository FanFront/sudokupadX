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
  ['k4995f3fx1','8 × 7'],
  ['utmh5dybvf','9 × 9'],
  ['mfhh567b60','9 × 9'],
  ['k7qc98e00u','9 × 9'],
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

  // Original wording remains readable in parallel with the Chinese translation.
  for(const [id,phrase,source] of [
    ['k4995f3fx1','血黑色的虚无','And blood-black nothingness'],
    ['utmh5dybvf','关卡入口与符号线索','sudokupad.app/z7qsv9k00p'],
    ['mfhh567b60','标准数独规则始终适用','Sudoku rules always apply'],
    ['k7qc98e00u','遥远国度的回忆','𝐌𝐞𝐦𝐨𝐫𝐢𝐞𝐬 𝐨𝐟 𝐚']
  ]){
    const url=new URL(root);
    url.searchParams.set('puzzle',id);
    await page.goto(url.href,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(expected=>
      document.querySelector('#boardMeta')?.textContent?.includes(expected),
      id==='k4995f3fx1'?'8 × 7':'9 × 9',{timeout:60000});
    await page.locator('#rulesButton').click();
    const columns=page.locator('#fullRules .bilingual-column');
    await columns.first().waitFor({timeout:10000});
    assert.equal(await columns.count(),2,'Both languages must appear in rules');
    assert.ok((await columns.nth(0).textContent()).includes(phrase),
      id+' missing Chinese');
    assert.ok((await columns.nth(1).textContent()).includes(source),
      id+' missing original text');
    await page.locator('#dismissRules').click();
  }
  // Restore the boss route before testing backwards navigation.
  {
    const url=new URL(root);
    url.searchParams.set('puzzle','boss-6cn54q09sv');
    await page.goto(url.href,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('#boardMeta')?.textContent?.includes('9 × 9'),null,{timeout:60000});
  }

  // A linked boss opened by a direct URL must still provide a route to its
  // correct parent adventure map (there is no in-memory navigation stack).
  const back=page.locator('#backButton');
  await back.waitFor({state:'visible',timeout:10000});
  await back.click();
  await page.waitForFunction(()=>document.querySelector('#boardMeta')?.textContent?.includes('40 × 50'),null,{timeout:60000});
  assert.equal(await back.isHidden(),true,'Main map must not offer a stale back target');

  // The spoiler-enabled library is another supported direct entry path.
  await page.locator('#libraryButton').click();
  await page.locator('#showAllPuzzles').check();
  await page.locator('#libraryList .library-entry').filter({hasText:'负约束领域'}).click();
  await page.waitForFunction(()=>document.querySelector('#boardMeta')?.textContent?.includes('9 × 9'),null,{timeout:60000});
  await back.waitFor({state:'visible'});
  await back.click();
  await page.waitForFunction(()=>document.querySelector('#boardMeta')?.textContent?.includes('40 × 50'),null,{timeout:60000});
  assert.equal(await back.isHidden(),true);
  console.log('Direct linked-puzzle -> main-map return passed.');

  // The bundled index is usable without reaching the online JSON provider.
  await page.locator('#libraryButton').click();
  await page.locator('#onlineLibraryTab').click();
  await page.locator('#onlineIndexList .online-entry').first().waitFor({timeout:15000});
  const indexed=await page.locator('#onlineIndexList .online-entry').count();
  assert.ok(indexed>40,'Bundled Sudoku index should be browsable in the game library');
  await page.locator('#onlineSearch').fill('Daily Sudoku');
  assert.ok((await page.locator('#onlineIndexList .online-entry').count())>0,
    'Online-index title search must work');
  await page.locator('#onlineOfflineOnly').check();
  assert.equal(await page.locator('#onlineIndexList .online-entry').count(),0,
    'Fresh installs should not claim online puzzle definitions are saved offline');
  await page.locator('#onlineOfflineOnly').uncheck();
  await page.locator('#closeLibrary').click();
  console.log('Bundled online index browser and offline-only filter passed.');

  // A test-only imported board exercises editable cells without bundling or
  // exposing an example puzzle in the app itself.
  const fixture={
    id:'sudokupadx-ui-smoke',
    metadata:{title:'UI Smoke Fixture',rules:'Test imported-board editing.'},
    cells:Array.from({length:9},()=>Array.from({length:9},()=>({}))),
    regions:Array.from({length:9},(_,region)=>Array.from({length:9},(_,n)=>
      [Math.floor(region/3)*3+Math.floor(n/3), (region%3)*3+n%3]))
  };
  await page.locator('#importButton').click();
  await page.locator('#pasteInput').fill(JSON.stringify(fixture));
  await page.locator('#confirmImport').click();
  await page.waitForFunction(()=>document.querySelector('#boardMeta')?.textContent?.includes('9 × 9') &&
    document.querySelector('#puzzleTitle')?.textContent?.includes('UI Smoke Fixture'),null,{timeout:60000});
  const canvas=page.locator('#boardCanvas');
  const bounds=await canvas.boundingBox();
  assert.ok(bounds && bounds.width>100 && bounds.height>100);
  await canvas.click({position:{x:bounds.width/2,y:bounds.height/2}});
  const selection=await page.locator('#selectionLabel').textContent();
  assert.match(selection,/R5C5/);
  const undo=page.locator('#undoButton'),redo=page.locator('#redoButton');
  await page.locator('#keypad button[data-symbol="1"]').click();
  await page.waitForFunction(()=>!document.querySelector('#undoButton').disabled);
  assert.equal(await redo.isDisabled(),true,'Redo must be disabled after a new edit');
  await undo.click();
  // Undo keeps the same cell selected; both history buttons must still refresh.
  await page.waitForFunction(()=>!document.querySelector('#redoButton').disabled,
    null,{timeout:10000});
  assert.equal(await undo.isDisabled(),true,'Undo must be disabled after reversing the only edit');
  await redo.click();
  await page.waitForFunction(()=>{
    return !document.querySelector('#undoButton').disabled &&
      document.querySelector('#redoButton').disabled;
  },null,{timeout:10000});
  // Manual check is a dialog only: it never marks the board or gives away answers.
  await page.locator('#checkButton').click();
  await page.locator('#checkDialog').waitFor({state:'visible'});
  assert.match(await page.locator('#checkResult').textContent(),/无法核对/);
  await page.locator('#dismissCheck').click();
  assert.equal(await page.locator('#checkDialog').isHidden(),true);
  // Emulate an Android WebView that does not report the camera-cutout inset.
  await page.evaluate(()=>document.documentElement.classList.add('android-native'));
  const brand=await page.locator('.brand').boundingBox();
  assert.ok(brand && brand.y>=40,'Toolbar must sit below the camera/status-bar safe area');
  await page.evaluate(()=>document.documentElement.classList.remove('android-native'));

  // A checkpoint roundtrip must restore the actual Rust/WASM board state.
  await page.locator('#checkpointButton').click();
  await page.locator('#exportCheckpoint').click();
  const savedText=await page.locator('#checkpointText').inputValue();
  const checkpoint=JSON.parse(savedText);
  assert.equal(checkpoint.format,'sudokupadx-checkpoint');
  assert.equal(checkpoint.rows,9);
  assert.equal(checkpoint.cols,9);
  assert.equal(checkpoint.cells[40].value,'1');
  await page.locator('#closeCheckpoint').click();
  await page.locator('#eraseButton').click();
  await page.waitForFunction(()=>!document.querySelector('#undoButton').disabled);
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#checkpointButton').click();
  await page.locator('#importCheckpoint').click();
  await page.waitForFunction(()=>document.querySelector('#checkpointDialog')?.open===false);
  assert.equal(await page.locator('#undoButton').isDisabled(),true,
    'Restoring a checkpoint should clear the previous undo stack');
  await page.screenshot({path:'artifacts/web/imported-input.png'});
  await page.locator('#zoomIn').click();
  const zoomBefore=await page.locator('#zoomLabel').textContent();
  const selectedBefore=await page.locator('#selectionLabel').textContent();
  assert.ok(!await page.locator('#demoButton').count(),'Example action must not ship');
  await page.goto(root,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#puzzleTitle')?.textContent?.includes('UI Smoke Fixture'),null,{timeout:60000});
  assert.equal(await page.locator('#zoomLabel').textContent(),zoomBefore,'Zoom should survive restart');
  assert.equal(await page.locator('#selectionLabel').textContent(),selectedBefore,'Selected cell should survive restart');
  console.log('Last imported puzzle, selection, and zoom restored after reload.');
  assert.deepEqual(errors,[]);
  console.log('Rust WASM input, undo and redo passed; screenshots in artifacts/web/');
}finally{
  await browser.close();
}
