import {
  ONLINE_INDEX_URL, parseOnlineIndex, filterOnlineEntries,
  fetchOnlinePuzzle, readOnlineIndex, saveOnlineIndex,
  listOfflinePuzzles, readOfflinePuzzle, saveOfflinePuzzle, removeOfflinePuzzle
} from './online-library.js';
import {invoke} from '@tauri-apps/api/core';
import {installLmdImageViewer} from './lmd-image-viewer.js';
import {
  logicMastersReference, parseLogicMastersPage, directSudokuPadEntry,
  logicMastersSearchUrl, parseLogicMastersSearch, parseLogicMastersDetails,
  logicMastersDifficultyLabel
} from './logic-masters.js';

// The bundled snapshot works without a network, including on first launch of the APK.
// A newer index can be refreshed from the source; only explicitly downloaded
// puzzle definitions are kept for offline play.
export function setupOnlineLibrary({openPuzzle, notify}) {
  const $ = id => document.getElementById(id);
  let entries = [];
  let saved = new Map();
  let indexSource = '';
  let active = false;
  let lmdActive = false;
  let lmdSearchStarted = false;
  let lmdView = 'discover';
  let lmdReturnView = 'discover';
  let lmdMatches = [];
  let lmdSelected = null;
  let lmdDetails = null;
  let lmdDetailSource = '';
  let lmdTotal = null;
  let lmdCurrentQuery = '';
  let lmdOffset = 0;
  let loading = false;
  let actionId = '';
  const imageViewer = installLmdImageViewer({
    dialog:$('lmdImageDialog'),stage:$('lmdImageStage'),image:$('lmdImageFull'),
    error:$('lmdImageError'),zoomLabel:$('lmdImageZoom'),
    zoomIn:$('lmdImageZoomIn'),zoomOut:$('lmdImageZoomOut'),
    reset:$('lmdImageReset'),close:$('lmdImageClose')
  });

  const status = message => { $('onlineIndexStatus').textContent = message; };
  const errorText = error => String(error?.message || error);
  const description = entry => {
    const date = Date.parse(entry.publishedAt);
    return entry.sourceName + (Number.isFinite(date) ? ' · ' + new Date(date).toLocaleDateString('zh-CN') : '');
  };

  // Built-in mobile search uses the official portal's keyword search, paged
  // 20 results at a time. Only the native Android shell bypasses browser CORS.
  const lmdSearchStatus = message => { $('lmdSearchStatus').textContent = message; };
  function renderLmdMatches() {
    if (!lmdActive) return;
    const container = $('lmdSearchResults');
    container.replaceChildren();
    for (const item of lmdMatches) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lmd-result-button';
      button.disabled = Boolean(actionId);
      const heading = document.createElement('div');
      heading.className = 'lmd-result-heading';
      const title = document.createElement('strong');
      title.textContent = item.title;
      heading.append(title);
      if (item.difficulty) {
        const difficulty = document.createElement('span');
        difficulty.className = 'lmd-difficulty';
        difficulty.textContent = logicMastersDifficultyLabel(
          item.difficulty,item.difficultyEstimated);
        heading.append(difficulty);
      }
      const meta = document.createElement('small');
      meta.textContent = 'LMD ' + item.id +
        (item.author ? ' · 作者 ' + item.author : '') + ' · 点击查看详情';
      button.append(heading,meta);
      button.addEventListener('click',() => selectLmdMatch(item));
      container.append(button);
    }
    if (!lmdMatches.length) {
      const p = document.createElement('p');
      p.className = 'online-empty';
      p.textContent = '没有找到匹配的题目，可尝试其他关键词。';
      container.append(p);
    }
    $('lmdPageLabel').textContent = '第 ' + (lmdOffset / 20 + 1) + ' 页';
    $('lmdPrev').disabled = Boolean(actionId) || lmdOffset === 0;
    $('lmdNext').disabled = Boolean(actionId) || lmdMatches.length < 20 ||
      (lmdTotal !== null && lmdOffset + 20 >= lmdTotal) ||
      lmdOffset >= 20000;
  }
  async function fetchLmdHtml(url, nativeCommand, args) {
    if (window.__TAURI_INTERNALS__) return invoke(nativeCommand,args);
    let response;
    try {
      response = await fetch(url,{cache:'no-store',credentials:'omit'});
    } catch {
      throw Error('Logic Masters 网站未允许浏览器跨域访问（CORS）。请使用 SudokuPadX 安卓版检索；网页版可从题目页复制 SudokuPad 链接手动导入。');
    }
    if (!response.ok) throw Error('Logic Masters 请求失败：HTTP ' + response.status);
    if (Number(response.headers.get('content-length') || 0) > 1024*1024)
      throw Error('Logic Masters 页面超过 1 MiB 大小限制');
    const html = await response.text();
    if (html.length > 1024*1024) throw Error('Logic Masters 页面超过大小限制');
    return html;
  }
  async function searchLmd(query, offset = 0) {
    if (actionId) return;
    const keyword = query.trim();
    const url = logicMastersSearchUrl(keyword,offset);
    actionId = 'lmd:search';
    lmdSearchStatus('正在搜索 Logic Masters 题库…');
    $('lmdSearchButton').disabled = true;
    $('lmdLatest').disabled = true;
    try {
      const html = await fetchLmdHtml(url,'search_logic_masters',
        {query:keyword,start:offset});
      const {items,total} = parseLogicMastersSearch(html);
      lmdMatches = items;
      lmdTotal = total;
      lmdCurrentQuery = keyword;
      lmdOffset = offset;
      lmdSearchStatus((keyword ? '搜索“'+keyword+'”' : '最新题目') +
        ' · 本页 ' + items.length + ' 题' +
        (total !== null ? ' · 共 '+total+' 题' : '') +
        ' · 点选题目查看可导入版本');
    } catch(error) {
      lmdSearchStatus('检索失败：' + errorText(error) + '。已下载的谜题仍可离线打开。');
      // Preserve the previous result page if a network request fails.
    } finally {
      actionId = '';
      $('lmdSearchButton').disabled = false;
      $('lmdLatest').disabled = false;
      renderLmdMatches();
    }
  }
  function showLmdView(view) {
    if (view === 'detail') {
      lmdReturnView = lmdView === 'saved' ? 'saved' : 'discover';
    }
    lmdView = view;
    $('lmdLibraryPanel').dataset.view = view;
    for (const name of ['discover','saved','detail']) {
      const id = 'lmd' + name[0].toUpperCase() + name.slice(1) + 'View';
      $(''+id).hidden = name !== view;
    }
    $('lmdDiscover').setAttribute('aria-selected', String(view === 'discover'));
    $('lmdSaved').setAttribute('aria-selected', String(view === 'saved'));
  }
  function renderLmdDetailInfo() {
    const detail = lmdDetails;
    const rating = logicMastersDifficultyLabel(
      detail?.difficulty ?? lmdSelected?.difficulty,
      detail?.difficulty === null || !detail
        ? lmdSelected?.difficultyEstimated : detail.difficultyEstimated);
    $('lmdDetailMeta').textContent = [
      lmdSelected?.author ? '作者 ' + lmdSelected.author : '',
      rating ? '难度 ' + rating : ''
    ].filter(Boolean).join(' · ');
    const panel = $('lmdDescriptionPanel');
    panel.hidden = !detail;
    const content = $('lmdDescriptionText');
    content.replaceChildren();
    let imageNumber = 0;
    for (const part of detail?.segments || []) {
      if (part.type === 'text') {
        const paragraph = document.createElement('p');
        paragraph.className = 'lmd-description-copy';
        paragraph.textContent = part.text;
        content.append(paragraph);
      } else if (part.type === 'image') {
        imageNumber++;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'lmd-inline-image';
        button.title = '点击查看图片 ' + imageNumber + ' 的大图';
        button.setAttribute('aria-label',button.title);
        const img = document.createElement('img');
        img.src = part.url;
        img.alt = part.alt || '作者提供的谜题图片 ' + imageNumber;
        img.loading = 'lazy';
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error',() => {
          button.textContent = '图片加载失败，请查看 Logic Masters 原题';
          button.classList.add('lmd-inline-image-failed');
        });
        button.append(img);
        button.addEventListener('click',()=>imageViewer.open(part,button));
        content.append(button);
      }
    }
    if (!content.childNodes.length) {
      content.textContent = detail?.hasImages ?
        '原题图片无法直接显示，请查看 Logic Masters 原页面。' :
        '未从此页面提取到文字说明，请查看原题页面。';
    }
    $('lmdDescriptionNotice').hidden = !detail?.hasImages ||
      Boolean(detail?.images?.length);
    const source = $('lmdDetailSource');
    source.hidden = !lmdDetailSource;
    if (lmdDetailSource) source.href = lmdDetailSource;
  }
  async function selectLmdMatch(item) {
    if (actionId) return;
    lmdSelected = item;
    lmdDetails = null;
    lmdDetailSource = item.url;
    $('lmdReference').value = item.id;
    $('lmdSelectedTitle').textContent = item.title;
    lmdFound = [];
    renderLmdDetailInfo();
    renderLmd();
    await lmdAction(resolveLmdReference);
  }
  async function activateLmd() {
    active = false;
    lmdActive = true;
    $('bundledLibraryPanel').hidden = true;
    $('onlineLibraryPanel').hidden = true;
    $('lmdLibraryPanel').hidden = false;
    $('bundledLibraryTab').setAttribute('aria-selected','false');
    $('onlineLibraryTab').setAttribute('aria-selected','false');
    $('lmdLibraryTab').setAttribute('aria-selected','true');
    showLmdView('discover');
    try { saved = new Map((await listOfflinePuzzles()).map(e => [e.id,e])); }
    catch(error) { lmdSearchStatus('无法读取离线记录：'+errorText(error)); }
    renderLmd();
    renderLmdMatches();
    if (!lmdSearchStarted) {
      lmdSearchStarted = true;
      await searchLmd('',0);
    }
  }

  // Logic Masters pages are usually HTML with an image, not a puzzle file.
  // Import only an actual SudokuPad link published by the setter.
  let lmdFound = [];
  const lmdStatus = message => { $('lmdStatus').textContent = message; };
  function renderLmdEntries(list, entries, emptyMessage) {
    list.replaceChildren();
    if (!entries.length) {
      const p = document.createElement('p');
      p.className = 'online-empty';
      p.textContent = emptyMessage;
      list.append(p);
    }
    for (const entry of entries) {
      const downloaded = saved.has(entry.id);
      const card = document.createElement('article');
      card.className = 'online-entry';
      const heading = document.createElement('strong');
      heading.textContent = entry.title;
      const detail = document.createElement('small');
      detail.textContent = 'Logic Masters · ' + (downloaded ? '已离线保存' : '尚未下载');
      const actions = document.createElement('div');
      actions.className = 'online-entry-actions';
      function addButton(label, action, primary = false) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.disabled = Boolean(actionId);
        if (primary) button.className = 'online-primary-action';
        button.addEventListener('click', () => operate(entry, action));
        actions.append(button);
      }
      if (downloaded) {
        addButton('离线打开', async () => {
          const input = await readOfflinePuzzle(entry.id);
          if (!input) throw Error('离线数据丢失，请重新下载');
          await openPuzzle(entry,input,true);
          $('libraryDialog').close();
        },true);
        addButton('移除下载',async () => {
          await removeOfflinePuzzle(entry.id);
          saved.delete(entry.id);
          lmdStatus('离线谜题已移除，解题进度不会删除。');
        });
      }
      addButton('在线打开',async () => {
        await openPuzzle(entry,await fetchOnlinePuzzle(entry),false);
        $('libraryDialog').close();
      },!downloaded);
      if (!downloaded) addButton('下载离线',async () => {
        const input = await fetchOnlinePuzzle(entry);
        await saveOfflinePuzzle(entry,input);
        saved.set(entry.id,entry);
        lmdStatus('已下载「' + entry.title + '」，可断网游玩。');
      });
      if (entry.sourceUrl) {
        const source = document.createElement('a');
        source.href = entry.sourceUrl;
        source.target = '_blank';
        source.rel = 'noopener noreferrer';
        source.textContent = '查看作者在 Logic Masters 发布的原题与规则';
        source.className = 'source-link';
        card.append(heading,detail,actions,source);
      } else card.append(heading,detail,actions);
      list.append(card);
    }
  }
  function renderLmd() {
    if (!lmdActive) return;
    const downloaded = [...saved.values()].filter(entry => entry.id?.startsWith('lmd:'));
    $('lmdSavedCount').textContent = downloaded.length + ' 道已下载';
    renderLmdEntries($('lmdSavedResults'), downloaded,
      '还没有离线谜题。在「探索题库」中选择题目并点击「下载离线」。');
    renderLmdEntries($('lmdResults'), lmdFound,
      '此题尚无可导入的 SudokuPad 链接。可返回列表选择其他谜题。');
  }
  async function resolveLmdReference() {
    const input = $('lmdReference').value.trim();
    if (/^https:\/\/(?:www\.)?sudokupad\.app\//i.test(input)) {
      lmdFound = [directSudokuPadEntry(input)];
      lmdStatus('已识别 SudokuPad 直链，可在线打开或下载离线。');
      renderLmd();
      return;
    }
    const ref = logicMastersReference(input);
    const html = await fetchLmdHtml(ref.url,'fetch_logic_masters_page',
      {puzzleId:ref.id});
    lmdFound = parseLogicMastersPage(html,ref);
    lmdDetails = parseLogicMastersDetails(html,ref);
    lmdDetailSource = ref.url;
    if (!lmdSelected && lmdDetails.title)
      $('lmdSelectedTitle').textContent = lmdDetails.title;
    renderLmdDetailInfo();
    lmdStatus(lmdFound.length ?
      '从 Logic Masters ' + ref.id + ' 找到 ' + lmdFound.length + ' 个 SudokuPad 链接。':
      '这个页面未提供可导入的 SudokuPad 链接；如有作者图片，可在下方直接查看（暂不能转成可玩棋盘）。');
    renderLmd();
  }
  async function resolveLmdPasted() {
    const input = $('lmdPasted').value.trim();
    if (/^https:\/\/(?:www\.)?sudokupad\.app\//i.test(input)) {
      lmdFound = [directSudokuPadEntry(input)];
    } else {
      const ref = logicMastersReference($('lmdReference').value);
      lmdFound = parseLogicMastersPage(input,ref);
      lmdDetails = parseLogicMastersDetails(input,ref);
      lmdDetailSource = ref.url;
      if (lmdDetails.title) $('lmdSelectedTitle').textContent = lmdDetails.title;
    }
    renderLmdDetailInfo();
    lmdStatus(lmdFound.length ?
      '从粘贴内容提取到 ' + lmdFound.length + ' 道可加载的 SudokuPad 谜题。':
      '粘贴内容没有可导入的 SudokuPad 链接；作者图片可直接查看，但暂不能转换为可玩棋盘。');
    renderLmd();
  }
  async function lmdAction(action) {
    if (actionId) return;
    actionId = 'lmd:lookup';
    $('lmdFetch').disabled = true;
    $('lmdParsePaste').disabled = true;
    lmdStatus('正在提取谜题链接…');
    showLmdView('detail');
    try { await action(); }
    catch (error) { lmdStatus('导入失败：' + errorText(error)); }
    finally {
      actionId = '';
      $('lmdFetch').disabled = false;
      $('lmdParsePaste').disabled = false;
      renderLmd();
    }
  }

  function render() {
    if (!active) return;
    const sources = [...new Map(entries.map(x => [x.sourceId,x.sourceName])).entries()];
    const previous = $('onlineSourceFilter').value;
    $('onlineSourceFilter').replaceChildren(new Option('所有来源',''),
      ...sources.map(([id,name]) => new Option(name,id)));
    $('onlineSourceFilter').value = sources.some(([id]) => id === previous) ? previous : '';
    renderList();
  }

  function renderList() {
    if (!active) return;
    const list = $('onlineIndexList');
    list.replaceChildren();
    const result = filterOnlineEntries(entries,{
      search:$('onlineSearch').value,
      source:$('onlineSourceFilter').value,
      offlineOnly:$('onlineOfflineOnly').checked,
      offlineIds:new Set(saved.keys())
    });
    $('onlineResultCount').textContent = '匹配 ' + result.length + ' / ' + entries.length + ' 题';
    if (!result.length) {
      const p = document.createElement('p');
      p.className = 'online-empty';
      p.textContent = entries.length ? '没有符合条件的谜题。可更换关键词或筛选条件。' :
        '暂时没有题目。请尝试刷新索引或检查本机资源。';
      list.append(p); return;
    }

    // Keep DOM bounded on phones; filtering still scans the complete index.
    const visible = result.slice(0, 200);
    for (const entry of visible) {
      const downloaded = saved.has(entry.id);
      const card = document.createElement('article');
      card.className = 'online-entry';
      const title = document.createElement('strong');
      title.textContent = entry.title;
      const meta = document.createElement('small');
      meta.textContent = description(entry) + (downloaded ? ' · 已下载' : '');
      const actions = document.createElement('div');
      actions.className = 'online-entry-actions';
      const addAction = (label, handler, primary = false) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.disabled = !!actionId;
        if (primary) button.className = 'online-primary-action';
        button.addEventListener('click', () => operate(entry, handler));
        actions.append(button);
      };
      addAction('在线打开', () => open(entry, false), !downloaded);
      if (downloaded) {
        addAction('离线打开', () => open(entry, true), true);
        addAction('移除下载', async () => {
          await removeOfflinePuzzle(entry.id);
          saved.delete(entry.id);
          status('已移除「' + entry.title + '」的离线题面；现有解题进度仍保留。');
        });
      } else {
        addAction('下载离线', async () => {
          const input = await fetchOnlinePuzzle(entry);
          await saveOfflinePuzzle(entry, input);
          saved.set(entry.id, entry);
          status('已下载「' + entry.title + '」，断网后可通过“离线打开”游玩。');
        });
      }
      card.append(title, meta, actions);
      list.append(card);
    }
    if (result.length > visible.length) {
      const note = document.createElement('p');
      note.className='online-empty';
      note.textContent='仅展示前 200 条结果；输入关键词可继续筛选剩余题目。';
      list.append(note);
    }
  }

  async function operate(entry, action) {
    if (actionId) return;
    actionId = entry.id;
    renderList();
    try { await action(); }
    catch(error) { (entry.sourceId === 'logic-masters' ? lmdStatus : status)('操作失败：' + errorText(error)); notify(error); }
    finally { actionId = ''; renderList(); renderLmd(); }
  }

  async function open(entry, offline) {
    const input = offline ? await readOfflinePuzzle(entry.id) : await fetchOnlinePuzzle(entry);
    if (!input) throw Error('本机没有这道谜题的离线题面，请联网下载');
    await openPuzzle(entry, input, offline);
    $('libraryDialog').close();
  }

  async function loadLocalIndex() {
    let bundled = null, cached = null;
    try {
      const response = await fetch(import.meta.env.BASE_URL + 'puzzles/online-index.json');
      if (!response.ok) throw Error('HTTP ' + response.status);
      bundled = parseOnlineIndex(await response.json());
    } catch(error) {
      // The cached copy also survives use from an older web app revision.
      status('内置目录读取失败，尝试本地缓存：' + errorText(error));
    }
    try { cached = await readOnlineIndex(); } catch {}
    const chosen = cached && (!bundled || cached.generatedAt > bundled.generatedAt) ? cached : bundled;
    if (!chosen) throw Error('离线题库索引不可用');
    entries = chosen.entries;
    indexSource = chosen === bundled ? '内置离线索引' : '已缓存索引';
    status(indexSource + ' · ' + entries.length + ' 题' +
      (chosen.generatedAt ? ' · 更新于 ' + chosen.generatedAt.slice(0,10) : ''));
    try {
      const downloaded = await listOfflinePuzzles();
      saved = new Map(downloaded.map(e => [e.id,e]));
    } catch (error) {
      status('目录可用，但无法读取离线下载记录：' + errorText(error));
    }
    render();
    renderLmd();
  }

  async function refreshIndex() {
    if (loading) return;
    loading = true;
    $('refreshOnlineIndex').disabled = true;
    status('正在从网络更新在线题库目录…');
    try {
      const response = await fetch(ONLINE_INDEX_URL, {cache:'no-store'});
      if (!response.ok) throw Error('HTTP ' + response.status);
      const next = parseOnlineIndex(await response.json());
      entries = next.entries;
      indexSource = '在线更新';
      try { await saveOnlineIndex(next); }
      catch { status('目录已更新，但无法持久缓存'); }
      status('在线更新成功 · ' + entries.length + ' 题 · ' + (next.generatedAt || '未知时间'));
      render();
    } catch (error) {
      status((entries.length ? '继续使用' + indexSource + ' · ' : '') +
        '网络刷新失败：' + errorText(error));
    } finally {
      loading = false;
      $('refreshOnlineIndex').disabled = false;
    }
  }

  let started = false;
  async function activate() {
    lmdActive = false;
    $('lmdLibraryPanel').hidden = true;
    $('lmdLibraryTab').setAttribute('aria-selected','false');
    $('bundledLibraryPanel').hidden = true;
    $('onlineLibraryPanel').hidden = false;
    $('bundledLibraryTab').setAttribute('aria-selected','false');
    $('onlineLibraryTab').setAttribute('aria-selected','true');
    active = true;
    if (!started) {
      started = true;
      try { await loadLocalIndex(); }
      catch (error) { status('离线目录加载失败：' + errorText(error)); started = false; }
    } else {
      try {
        saved = new Map((await listOfflinePuzzles()).map(e=>[e.id,e]));
      } catch {}
      renderList();
      renderLmd();
    }
  }
  function showBundled() {
    active = false;
    lmdActive = false;
    $('lmdLibraryPanel').hidden = true;
    $('lmdLibraryTab').setAttribute('aria-selected','false');
    $('onlineLibraryPanel').hidden = true;
    $('bundledLibraryPanel').hidden = false;
    $('bundledLibraryTab').setAttribute('aria-selected','true');
    $('onlineLibraryTab').setAttribute('aria-selected','false');
  }
  $('onlineLibraryTab').addEventListener('click', () => activate().catch(notify));
  $('lmdLibraryTab').addEventListener('click', () => activateLmd().catch(notify));
  $('bundledLibraryTab').addEventListener('click', showBundled);
  $('onlineSearch').addEventListener('input', renderList);
  $('onlineSourceFilter').addEventListener('change', renderList);
  $('onlineOfflineOnly').addEventListener('change', renderList);
  $('refreshOnlineIndex').addEventListener('click', () => refreshIndex().catch(notify));
  $('lmdFetch').addEventListener('click', () => {
    lmdSelected = null;
    lmdDetails = null;
    lmdDetailSource = '';
    renderLmdDetailInfo();
    $('lmdSelectedTitle').textContent = '按 ID / 链接导入';
    lmdAction(resolveLmdReference);
  });
  $('lmdParsePaste').addEventListener('click', () => {
    lmdSelected = null;
    lmdDetails = null;
    lmdDetailSource = '';
    renderLmdDetailInfo();
    $('lmdSelectedTitle').textContent = '粘贴内容导入';
    lmdAction(resolveLmdPasted);
  });
  $('lmdSearchForm').addEventListener('submit',event => {
    event.preventDefault();
    searchLmd($('lmdSearch').value.trim(),0);
  });
  $('lmdLatest').addEventListener('click',() => {
    $('lmdSearch').value = '';
    searchLmd('',0);
  });
  $('lmdPrev').addEventListener('click',() =>
    searchLmd(lmdCurrentQuery,Math.max(0,lmdOffset-20)));
  $('lmdNext').addEventListener('click',() =>
    searchLmd(lmdCurrentQuery,lmdOffset+20));
  $('lmdDiscover').addEventListener('click',() => showLmdView('discover'));
  $('lmdSaved').addEventListener('click',() => {
    showLmdView('saved');
    renderLmd();
  });
  $('lmdBack').addEventListener('click',() => showLmdView(lmdReturnView));
  $('lmdReference').addEventListener('keydown',event => {
    if (event.key === 'Enter') { event.preventDefault(); $('lmdFetch').click(); }
  });
}
