// Chromium smoke test for the actual GitHub Pages build (including WASM/SCL).
// Run from the repository root after npm run build:web and npm install playwright.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createLessonPractice} from '../src/lesson-puzzles.js';

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
  ['boss-6cn54q09sv','9 × 9'],
  ['generated-adventure-1','27 × 27'],
  ['generated-adventure-1-boss-1','9 × 9'],
  ['generated-9x9-001','9 × 9'],
  ['generated-9x9-100','9 × 9'],
  ['single-rule-lab-killer','9 × 9'],
  ['single-rule-lab-kropki','9 × 9'],
  ['single-rule-lab-thermo','9 × 9'],
  ['single-rule-lab-renban','9 × 9'],
  ['single-rule-lab-arrow','9 × 9'],
  ['single-rule-lab-whisper','9 × 9'],
  ['advanced-logic-kropki-t3','9 × 9'],
  ['advanced-logic-thermo-t3','9 × 9'],
  ['advanced-logic-killer-t3','9 × 9'],
  ['advanced-logic-renban-t3','9 × 9']
];
await mkdir('artifacts/web',{recursive:true});
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:430,height:860},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  // A cold launch must show Home, with no separate app toolbar above the board.
  await page.goto(root,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#homeScreen')?.hidden===false &&
    document.querySelector('#libraryList')?.children.length>0,null,{timeout:60000});
  assert.equal(await page.locator('#gameScreen').isHidden(),true);
  assert.equal(await page.locator('#homeContinueSection').isHidden(),true);
  assert.equal(await page.locator('.topbar').count(),0);
  await page.screenshot({path:'artifacts/web/android-home.png'});
  // The offline Chinese guide must be a real, touch-friendly application
  // page with all 25 lessons and working practice, not an external URL.
  await page.locator('#lessonButton').click();
  await page.locator('#lessonList .lesson-entry').first().waitFor();
  assert.equal(await page.locator('#lessonScreen').isVisible(),true);
  assert.equal(await page.locator('#homeScreen').isHidden(),true);
  assert.equal(await page.locator('#lessonList .lesson-entry').count(),25);
  await page.locator('#lessonFilters button[data-stage="patterns"]').click();
  assert.equal(await page.locator('#lessonList .lesson-entry').count(),6);
  const lesson7=createLessonPractice(7);
  await page.locator('#lessonList [data-id="7"]').click();
  assert.match(await page.locator('#lessonTitle').textContent(),/X-Wing/);
  assert.match(await page.locator('#lessonReading').textContent(),/第 2 行和第 7 行/);
  // Launch the real game engine, remove one seeded candidate with the
  // regular keypad and verify the lesson, not a multiple-choice button.
  assert.equal(await page.locator('#lessonExercise .lesson-choice').count(),0);
  await page.locator('#lessonStartPractice').click();
  await page.locator('#lessonPracticeBar').waitFor({state:'visible',timeout:15000});
  assert.equal(await page.locator('#gameScreen').isVisible(),true);
  assert.match(await page.locator('#puzzleTitle').textContent(),/技巧练习/);
  assert.equal(await page.locator('#modeBar [data-mode="center"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#selectionLabel').textContent(),lesson7.goalLabel);
  await page.locator('#keypad button[data-symbol="'+lesson7.goal.digit+'"]').click();
  await page.waitForFunction(()=>document.querySelector('#lessonPracticeStatus')?.textContent?.includes('推理正确'));
  await page.screenshot({path:'artifacts/web/chinese-lesson-real-board.png'});
  await page.locator('#lessonPracticeReturn').click();
  assert.equal(await page.locator('#lessonScreen').isVisible(),true);
  assert.match(await page.locator('#lessonProgressText').textContent(),/1 \/ 25/);
  await page.locator('#lessonNext').click();
  assert.match(await page.locator('#lessonTitle').textContent(),/Swordfish/);
  await page.screenshot({path:'artifacts/web/chinese-lessons.png'});
  // Every authored lesson must actually open inside Rust/WASM. Validate
  // all 25 engine definitions, not only their JSON shape in Node tests.
  await page.locator('#lessonFilters button[data-stage="all"]').click();
  for(let lessonId=1;lessonId<=25;lessonId++){
    await page.locator('#lessonList [data-id="'+lessonId+'"]').click();
    await page.locator('#lessonStartPractice').click();
    await page.locator('#lessonPracticeBar').waitFor({state:'visible',timeout:10000});
    assert.match(await page.locator('#puzzleTitle').textContent(),/技巧练习/);
    assert.match(await page.locator('#lessonPracticeName').textContent(),
      new RegExp('第 '+lessonId+' 课'));
    await page.locator('#lessonPracticeReturn').click();
    assert.equal(await page.locator('#lessonScreen').isVisible(),true);
  }
  await page.locator('#lessonList [data-id="8"]').click();
  console.log('All 25 themed lesson boards opened successfully in Rust / WASM.');
  await page.locator('#lessonBack').click();
  assert.equal(await page.locator('#homeScreen').isVisible(),true);
  await page.locator('#lessonButton').click();
  assert.match(await page.locator('#lessonTitle').textContent(),/Swordfish/,
    'Last lesson must survive leaving and returning');
  assert.match(await page.locator('#lessonProgressText').textContent(),/1 \/ 25/,
    'Mastered progress must survive leaving and returning');
  await page.locator('#lessonBack').click();
  console.log('Chinese lesson board uses Rust/WASM pencilmarks, completion and preserved puzzle state.');
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
    assert.equal(await page.locator('#gameScreen').isVisible(),true);
    assert.equal(await page.locator('#homeScreen').isHidden(),true);
    if(id==='digits-of-despair'){
      const before=await page.locator('#puzzleTitle').textContent();
      await page.locator('#rulesButton').click();
      await page.locator('#lessonFromRulesButton').click();
      assert.equal(await page.locator('#lessonScreen').isVisible(),true);
      assert.equal(await page.locator('#gameScreen').isHidden(),true);
      await page.locator('#lessonStartPractice').click();
      await page.locator('#lessonPracticeBar').waitFor({state:'visible',timeout:15000});
      await page.locator('#lessonPracticeReturn').click();
      assert.equal(await page.locator('#lessonScreen').isVisible(),true);
      await page.locator('#lessonBack').click();
      assert.equal(await page.locator('#gameScreen').isVisible(),true);
      assert.equal(await page.locator('#puzzleTitle').textContent(),before,
        'Returning from a lesson must preserve the puzzle');
    }
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

  // Go Home without destroying the parent puzzle, then choose a library item.
  await page.locator('#homeButton').click();
  assert.equal(await page.locator('#homeScreen').isVisible(),true);
  assert.equal(await page.locator('#gameScreen').isHidden(),true);
  assert.equal(await page.locator('#continueButton').isVisible(),true);
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

  // All 100 locally generated puzzles must be discoverable in the actual
  // library and their SudokuPad-compatible files must load through Rust/WASM.
  await page.locator('#homeButton').click();
  await page.locator('#libraryButton').click();
  await page.locator('#bundledCategory').selectOption('generated');
  assert.equal(await page.locator('#libraryList .library-entry').count(),100);
  await page.locator('#bundledSearch').fill('第 042 题');
  assert.equal(await page.locator('#libraryList .library-entry').count(),1);
  await page.locator('#libraryList .library-entry').first().click();
  await page.waitForFunction(()=>
    document.querySelector('#puzzleTitle')?.textContent?.includes('042') &&
    document.querySelector('#boardMeta')?.textContent?.includes('9 × 9'),
    null,{timeout:60000});
  await page.screenshot({path:'artifacts/web/generated-9x9-library.png'});
  console.log('100 generated 9x9 entries, search and real puzzle load passed.');
  // The sparse one-rule collection is selectable with a clue-count subtitle.
  await page.locator('#homeButton').click();
  await page.locator('#libraryButton').click();
  await page.locator('#bundledSearch').fill('');
  await page.locator('#bundledCategory').selectOption('single');
  assert.equal(await page.locator('#libraryList .library-entry').count(),6);
  assert.ok((await page.locator('#libraryList').textContent()).includes('个提示数'));
  await page.locator('#bundledSearch').fill('kropki');
  assert.equal(await page.locator('#libraryList .library-entry').count(),1);
  await page.locator('#libraryList .library-entry').first().click();
  await page.waitForFunction(()=>
    document.querySelector('#puzzleTitle')?.textContent?.includes('黑白连锁') &&
    document.querySelector('#boardMeta')?.textContent?.includes('9 × 9'),
    null,{timeout:60000});
  await page.screenshot({path:'artifacts/web/sparse-single-rule-kropki.png'});
  console.log('Six sparse single-rule puzzles open from their own library category.');
  await page.locator('#homeButton').click();
  await page.locator('#libraryButton').click();
  await page.locator('#bundledSearch').fill('');
  await page.locator('#bundledCategory').selectOption('advanced');
  assert.equal(await page.locator('#libraryList .library-entry').count(),4);
  assert.match(await page.locator('#libraryList .library-entry').first().textContent(),/认证最低技巧等级 3/);
  await page.locator('#bundledSearch').fill('killer');
  assert.equal(await page.locator('#libraryList .library-entry').count(),1);
  await page.locator('#libraryList .library-entry').first().click();
  await page.waitForFunction(()=>
    document.querySelector('#puzzleTitle')?.textContent?.includes('极简杀手笼') &&
    document.querySelector('#boardMeta')?.textContent?.includes('9 × 9'),
    null,{timeout:60000});
  await page.screenshot({path:'artifacts/web/advanced-verified-tier3.png'});
  console.log('Four independently certified tier-3 puzzles and library filtering passed.');


  // The same Rust generator runs in a Web Worker in the browser.
  // Create a classical 4x4 puzzle, verify it is playable, automatically saved,
  // marked, persisted across reload, and permanently deleted on request.
  await page.locator('#homeButton').click();
  await page.locator('#creatorButton').click();
  await page.locator('#creatorSize').selectOption('4');
  await page.locator('#creatorTier').selectOption('1');
  await page.locator('#creatorClearVariants').click();
  await page.locator('#creatorSeed').fill('102938');
  await page.locator('#creatorAttempts').fill('4');
  await page.locator('#creatorGenerate').click();
  await page.waitForFunction(()=>
    document.querySelector('#creatorDialog')?.open === false &&
    document.querySelector('#puzzleTitle')?.textContent?.includes('本机创作') &&
    document.querySelector('#boardMeta')?.textContent?.includes('4 × 4'),
    null,{timeout:90000});
  await page.screenshot({path:'artifacts/web/creator-rust-generated-board.png'});
  await page.locator('#homeButton').click();
  await page.locator('#creatorButton').click();
  assert.equal(await page.locator('#creatorSaved .creator-saved-item').count(),1);
  await page.locator('#creatorSaved .creator-saved-item button').filter({hasText:'收藏'}).click();
  await page.locator('#creatorSaved .creator-saved-item button').filter({hasText:'标记完成'}).click();
  assert.ok((await page.locator('#creatorSaved').textContent()).includes('已完成'));
  assert.ok((await page.locator('#creatorSaved').textContent()).includes('已收藏'));
  await page.reload();
  await page.locator('#creatorButton').click();
  assert.equal(await page.locator('#creatorSaved .creator-saved-item').count(),1);
  assert.ok((await page.locator('#creatorSaved').textContent()).includes('已完成'));
  await page.locator('#creatorClose').click();
  await page.locator('#libraryButton').click();
  await page.locator('#bundledSearch').fill('');
  await page.locator('#bundledCategory').selectOption('personal');
  assert.equal(await page.locator('#libraryList .library-entry').count(),1);
  await page.locator('#closeLibrary').click();
  await page.locator('#creatorButton').click();
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#creatorSaved .creator-saved-item .creator-delete').click();
  assert.equal(await page.locator('#creatorSaved .creator-saved-item').count(),0);
  await page.locator('#creatorClose').click();
  console.log('On-device Rust/WASM creator, automatic IndexedDB save, marking, reload and deletion passed.');

  // The bundled index is usable without reaching the online JSON provider.
  await page.locator('#homeButton').click();
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
  // Mobile buttons are a T9 pad with modes on its right, not stacked toolbars.
  const keyOne=await page.locator('#keypad [data-symbol="1"]').boundingBox();
  const keyTwo=await page.locator('#keypad [data-symbol="2"]').boundingBox();
  const keyFour=await page.locator('#keypad [data-symbol="4"]').boundingBox();
  const modeRail=await page.locator('#modeBar').boundingBox();
  assert.ok(keyOne && keyTwo && keyFour && modeRail);
  assert.ok(keyTwo.x>keyOne.x && Math.abs(keyOne.y-keyTwo.y)<2,'keypad must have columns');
  assert.ok(keyFour.y>keyOne.y,'keypad must have rows');
  assert.ok(modeRail.x>keyTwo.x,'mode rail must be beside the keypad');
  assert.ok(bounds.height>200,'board must retain substantial vertical room on Android-sized screens');
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
  await page.locator('#homeButton').click();
  const brand=await page.locator('.home-hero .brand').boundingBox();
  assert.ok(brand && brand.y>=40,'Home must sit below the camera/status-bar safe area');
  await page.locator('#continueButton').click();
  const boardHeader=await page.locator('.board-heading').boundingBox();
  assert.ok(boardHeader && boardHeader.y>=40,'Board header must sit below the camera/status-bar safe area');
  await page.evaluate(()=>document.documentElement.classList.remove('android-native'));

  // A checkpoint roundtrip must restore the actual Rust/WASM board state.
  await page.locator('#homeButton').click();
  await page.locator('#checkpointButton').click();
  await page.locator('#exportCheckpoint').click();
  const savedText=await page.locator('#checkpointText').inputValue();
  const checkpoint=JSON.parse(savedText);
  assert.equal(checkpoint.format,'sudokupadx-checkpoint');
  assert.equal(checkpoint.rows,9);
  assert.equal(checkpoint.cols,9);
  assert.equal(checkpoint.cells[40].value,'1');
  await page.locator('#closeCheckpoint').click();
  await page.locator('#continueButton').click();
  await page.locator('#eraseButton').click();
  await page.waitForFunction(()=>!document.querySelector('#undoButton').disabled);
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#homeButton').click();
  await page.locator('#checkpointButton').click();
  await page.locator('#importCheckpoint').click();
  await page.waitForFunction(()=>document.querySelector('#checkpointDialog')?.open===false);
  assert.equal(await page.locator('#undoButton').isDisabled(),true,
    'Restoring a checkpoint should clear the previous undo stack');
  await page.screenshot({path:'artifacts/web/imported-input.png'});
  await page.locator('#zoomIn').click();
  await page.waitForFunction(()=>document.querySelector('#saveLabel')?.textContent==='已保存到本机',null,{timeout:10000});
  const zoomBefore=await page.locator('#zoomLabel').textContent();
  const selectedBefore=await page.locator('#selectionLabel').textContent();
  assert.ok(!await page.locator('#demoButton').count(),'Example action must not ship');
  await page.goto(root,{waitUntil:'domcontentloaded'});
  await page.locator('#continueButton').waitFor({state:'visible',timeout:60000});
  assert.equal(await page.locator('#gameScreen').isHidden(),true);
  await page.locator('#continueButton').click();
  await page.waitForFunction(()=>document.querySelector('#puzzleTitle')?.textContent?.includes('UI Smoke Fixture'),null,{timeout:60000});
  // The title is set during openResult(), BEFORE the awaited IndexedDB
  // cache load and applyStoredView() finish. Wait for the actual restored
  // camera and selection, not merely for the earlier title update.
  await page.waitForFunction(({zoom,selection})=>
    document.querySelector('#zoomLabel')?.textContent===zoom &&
    document.querySelector('#selectionLabel')?.textContent===selection,
    {zoom:zoomBefore,selection:selectedBefore},{timeout:15000});
  assert.equal(await page.locator('#zoomLabel').textContent(),zoomBefore,'Zoom should survive restart');
  assert.equal(await page.locator('#selectionLabel').textContent(),selectedBefore,'Selected cell should survive restart');
  console.log('Last imported puzzle, selection, and zoom restored after reload.');
  assert.deepEqual(errors,[]);
  console.log('Rust WASM input, undo and redo passed; screenshots in artifacts/web/');
}finally{
  await browser.close();
}
