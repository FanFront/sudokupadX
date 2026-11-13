import {invoke} from '@tauri-apps/api/core';
import {
  WPF_SEARCH_URL,parseWpfIndex,filterWpfIndex,parseWpfTypePdfs,
  wpfRoundPdfCandidates
} from './wpf-catalog.js';
import {listWpfDocuments,deleteWpfDocument} from './wpf-storage.js';
import {setupWpfReader} from './wpf-reader.js';
import {fetchPuzzleProxy} from './puzzle-proxy.js';
const $=id=>document.getElementById(id);
const CACHE='sudokupadx:wpf-catalog:v1';

// Only public site pages are fetched. The ropeko index is a reference
// catalogue; PDF bytes always come from WPF's own official GP host.
export function setupWpfLibrary({notify}) {
  let catalog={rounds:[],types:[]},saved=[],loaded=false,busy=false,selectedType=null;
  const status=message=>{$('wpfIndexStatus').textContent=message;};
  const errorText=error=>String(error?.message||error);
  const reader=setupWpfReader({notify,onSaved:()=>refreshSaved().catch(notify)});
  function displaySaved(){
    $('wpfSavedCount').textContent=saved.length+' 份离线 PDF';
    const list=$('wpfSavedResults');list.replaceChildren();
    for(const entry of saved){
      const card=document.createElement('article');card.className='online-entry';
      const title=document.createElement('strong');title.textContent=entry.title;
      const small=document.createElement('small');small.textContent='已离线保存 · 画笔进度自动保存';
      const actions=document.createElement('div');actions.className='online-entry-actions';
      actions.append(actionButton('打开阅读',async()=>{
        await reader.open(entry,{offline:true});$('libraryDialog').close();
      },true),actionButton('删除下载',async()=>{
        await deleteWpfDocument(entry.id);await refreshSaved();
        status('已删除 PDF 和该文件的全部画笔标记。');
      }));
      card.append(title,small,actions);list.append(card);
    }
    if(!saved.length)list.textContent='还没有下载的 WPF PDF。联网打开后会自动存到本机。';
  }
  async function refreshSaved(){
    saved=await listWpfDocuments();
    saved.sort((a,b)=>b.savedAt.localeCompare(a.savedAt));
    displaySaved();renderList();
  }
  function actionButton(label,fn,primary=false){
    const button=document.createElement('button');
    button.type='button';button.textContent=label;
    if(primary)button.className='online-primary-action';
    button.addEventListener('click',async()=>{
      if(busy)return;
      busy=true;button.disabled=true;
      try{await fn();}catch(error){status('操作失败：'+errorText(error));notify(errorText(error));}
      finally{busy=false;button.disabled=false;}
    });
    return button;
  }
  function pdfEntry(round){
    const urls=wpfRoundPdfCandidates(round);
    return {...round,pdfUrl:urls[0]||'',pdfUrls:urls,sourceUrl:WPF_SEARCH_URL};
  }
  function addPdfCard(container,entry,subtitle='WPF 官方比赛题面'){
    const savedEntry=saved.find(item=>item.id===entry.id);
    const card=document.createElement('article');card.className='online-entry';
    const title=document.createElement('strong');title.textContent=entry.title;
    const small=document.createElement('small');small.textContent=subtitle+
      (savedEntry?' · 已离线下载':' · PDF');
    const actions=document.createElement('div');actions.className='online-entry-actions';
    actions.append(actionButton(savedEntry?'离线打开':'打开 PDF',async()=>{
      await reader.open(savedEntry||entry,{offline:!!savedEntry});
      $('libraryDialog').close();
    },true));
    if(savedEntry){
      actions.append(actionButton('移除下载',async()=>{
        await deleteWpfDocument(entry.id);await refreshSaved();
      }));
    }else {
      actions.append(actionButton('下载离线',async()=>{
        status('正在下载 '+entry.title+'…');
        await reader.save(entry);await refreshSaved();
        status('下载完成，可离线阅读和标注。');
      }));
    }
    card.append(title,small,actions);
    const source=document.createElement('a');
    source.href=entry.sourceUrl||entry.pdfUrl;
    source.target='_blank';source.rel='noopener noreferrer';
    source.className='source-link';source.textContent='原始来源';
    card.append(source);container.append(card);
  }
  function renderList(){
    const scope=$('wpfScope').value;
    const discover=$('wpfDiscoverView'),detail=$('wpfTypeDetailView'),offline=$('wpfSavedView');
    discover.hidden=scope==='saved'||!!selectedType;
    detail.hidden=!selectedType;
    offline.hidden=scope!=='saved';
    $('wpfYear').hidden=scope!=='round';
    $('wpfKind').hidden=scope!=='round';
    if(selectedType)return;
    if(scope==='saved')return;
    const source=scope==='type'?catalog.types:catalog.rounds;
    const all=filterWpfIndex(source,{search:$('wpfSearch').value,
      year:scope==='round'?$('wpfYear').value:'',
      kind:scope==='round'?$('wpfKind').value:''});
    const list=$('wpfResults');list.replaceChildren();
    $('wpfResultCount').textContent='匹配 '+all.length+' / '+source.length+' 项';
    for(const item of all.slice(0,150)){
      if(scope==='type'){
        const button=document.createElement('button');button.type='button';
        button.className='lmd-result-button';
        const title=document.createElement('strong');
        title.className='lmd-result-title';title.textContent=item.title;
        const small=document.createElement('small');
        small.textContent='题型数据库编号 '+item.typeId+' · 查找官方 WPF PDF 示例';
        button.append(title,small);
        button.addEventListener('click',()=>selectType(item));
        list.append(button);
      }else addPdfCard(list,pdfEntry(item),'WPF '+
        (item.kind==='sudoku'?'Sudoku GP':'Puzzle GP')+' · '+item.year);
    }
    if(!all.length)list.textContent='暂无匹配项目。可更换关键词或筛选条件。';
    if(all.length>150){
      const notice=document.createElement('p');
      notice.className='online-empty';notice.textContent='仅显示前 150 项，请进一步缩小搜索范围。';
      list.append(notice);
    }
  }
  async function fetchHtml(path,typeId){
    if(window.__TAURI_INTERNALS__){
      return path==='index'?invoke('fetch_wpf_index'):
        invoke('fetch_wpf_type',{puzzleId:typeId});
    }
    return path==='index'?
      fetchPuzzleProxy('wpf-index',{}, {limit:4*1024*1024}):
      fetchPuzzleProxy('wpf-type',{id:typeId},{limit:1024*1024});
  }
  function populateYears(source){
    const years=[...new Set(source.rounds.map(item=>item.year))].sort((a,b)=>b-a);
    const selected=$('wpfYear').value;
    $('wpfYear').replaceChildren(new Option('所有年份',''),
      ...years.map(year=>new Option(String(year),String(year))));
    if(years.includes(Number(selected)))$('wpfYear').value=selected;
  }
  async function loadCatalog(force=false){
    if(loaded&&!force)return;
    if(!force){
      try{
        const cached=JSON.parse(localStorage.getItem(CACHE));
        if(cached?.rounds?.length){catalog=cached;loaded=true;populateYears(cached);renderList();
          status('已读取本机缓存的 WPF 赛事与题型索引。');}
      }catch{}
    }
    try{
      status('正在读取 ropeko 的 WPF 题型和赛事索引…');
      const next=parseWpfIndex(await fetchHtml('index'));
      if(!next.rounds.length)throw Error('未找到 WPF GP 赛事索引');
      catalog=next;loaded=true;
      populateYears(next);
      try{localStorage.setItem(CACHE,JSON.stringify(catalog));}catch{}
      status('已索引 '+next.rounds.length+' 轮赛事、'+next.types.length+
        ' 个题型。PDF 由 WPF 官方服务器提供，打开后自动离线缓存。');
      renderList();
    }catch(error){
      status((loaded?'使用已有本机索引。':'暂无本机索引。')+' 联网更新失败：'+errorText(error));
    }
  }
  async function selectType(item){
    if(busy)return;
    busy=true;selectedType=item;
    $('wpfTypeTitle').textContent=item.title;
    $('wpfTypeExamples').replaceChildren();
    $('wpfTypeStatus').textContent='正在读取该题型的 WPF PDF 示例链接…';
    renderList();
    try{
      const examples=parseWpfTypePdfs(await fetchHtml('type',item.typeId));
      for(const pdf of examples)addPdfCard($('wpfTypeExamples'),
        {...pdf,id:'wpf:pdf:'+pdf.pdfUrl,sourceUrl:item.sourceUrl},
        '出自 ropeko 题型示例');
      $('wpfTypeStatus').textContent=examples.length?
        '找到 '+examples.length+' 个官方 PDF 示例（整份比赛卷包含多道题）。':
        '该题型目前没有收录 WPF 官方 PDF 示例，可尝试搜索其他题型。';
    }catch(error){$('wpfTypeStatus').textContent='读取失败：'+errorText(error);}
    finally{busy=false;}
  }
  $('wpfBackTypes').addEventListener('click',()=>{selectedType=null;renderList();});
  $('wpfSearchForm').addEventListener('submit',event=>{
    event.preventDefault();selectedType=null;renderList();
  });
  $('wpfSearch').addEventListener('input',renderList);
  for(const id of ['wpfYear','wpfKind','wpfScope']){
    $(id).addEventListener('change',()=>{
      selectedType=null;renderList();
    });
  }
  $('wpfRefresh').addEventListener('click',()=>loadCatalog(true));
  async function activate(){
    selectedType=null;
    try{await refreshSaved();}catch(error){status('离线记录不可用：'+errorText(error));}
    renderList();
    if(!loaded)await loadCatalog();
  }
  return {activate};
}
