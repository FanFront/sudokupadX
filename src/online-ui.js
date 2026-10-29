import {
  ONLINE_INDEX_URL, parseOnlineIndex, filterOnlineEntries,
  fetchOnlinePuzzle, readOnlineIndex, saveOnlineIndex,
  listOfflinePuzzles, readOfflinePuzzle, saveOfflinePuzzle, removeOfflinePuzzle
} from './online-library.js';

// The bundled snapshot works without a network, including on first launch of the APK.
// A newer index can be refreshed from the source; only explicitly downloaded
// puzzle definitions are kept for offline play.
export function setupOnlineLibrary({openPuzzle, notify}) {
  const $ = id => document.getElementById(id);
  let entries = [];
  let saved = new Map();
  let indexSource = '';
  let active = false;
  let loading = false;
  let actionId = '';

  const status = message => { $('onlineIndexStatus').textContent = message; };
  const errorText = error => String(error?.message || error);
  const description = entry => {
    const date = Date.parse(entry.publishedAt);
    return entry.sourceName + (Number.isFinite(date) ? ' · ' + new Date(date).toLocaleDateString('zh-CN') : '');
  };

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
    catch(error) { status('操作失败：' + errorText(error)); notify(error); }
    finally { actionId = ''; renderList(); }
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
    }
  }
  function showBundled() {
    active = false;
    $('onlineLibraryPanel').hidden = true;
    $('bundledLibraryPanel').hidden = false;
    $('bundledLibraryTab').setAttribute('aria-selected','true');
    $('onlineLibraryTab').setAttribute('aria-selected','false');
  }
  $('onlineLibraryTab').addEventListener('click', () => activate().catch(notify));
  $('bundledLibraryTab').addEventListener('click', showBundled);
  $('onlineSearch').addEventListener('input', renderList);
  $('onlineSourceFilter').addEventListener('change', renderList);
  $('onlineOfflineOnly').addEventListener('change', renderList);
  $('refreshOnlineIndex').addEventListener('click', () => refreshIndex().catch(notify));
}
