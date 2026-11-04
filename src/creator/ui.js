import {startGeneration} from './runner.js';
import {availableVariants,availableTechniques,validateCreatorOptions} from './options.js';
import {listCreated,saveCreated,markCreated,deleteCreated} from './storage.js';

const $=id=>document.getElementById(id);
const errorMessage=error=>String(error?.message||error);
const escapeLabel=(text)=>String(text||'').slice(0,240);

// This is purely client-side UI. The worker/native command owns generation,
// the personal IndexedDB database owns the files and the existing Rust game
// engine owns editing and checkpoint resume.
export function setupCreatorUI({openPuzzle,onCatalogChanged,handleDelete,notify}){
  const dialog=$('creatorDialog'),status=$('creatorStatus');
  let active=null,busy=false,records=[];
  const setStatus=message=>{status.textContent=message;};

  function selectedVariants(){
    return [...$('creatorVariants').querySelectorAll('input:checked')]
      .map(input=>input.value);
  }
  function renderVariants(){
    const size=Number($('creatorSize').value),selected=new Set(selectedVariants());
    const area=$('creatorVariants');
    area.replaceChildren();
    for(const [kind,name] of availableVariants(size)){
      const label=document.createElement('label');
      label.className='creator-variant';
      const box=document.createElement('input');
      box.type='checkbox';box.value=kind;
      box.checked=selected.has(kind)||(selected.size===0&&kind==='killer');
      box.addEventListener('change',renderTechniques);
      label.append(box,document.createTextNode(name));
      area.append(label);
    }
    renderTechniques();
  }
  function renderTechniques(){
    const select=$('creatorTechnique');
    const previous=select.value;
    select.replaceChildren();
    const tier=Number($('creatorTier').value);
    for(const [name,label,level] of availableTechniques(
      $('creatorSize').value,tier,selectedVariants())){
      const option=document.createElement('option');
      option.value=name;option.textContent=label+(name?' · '+level+' 级':'');
      select.append(option);
    }
    if([...select.options].some(option=>option.value===previous))
      select.value=previous;
    select.disabled=tier===5;
    $('creatorTierHint').textContent=tier===5?
      '等级 5：第 4 级逻辑求解器无法完成，但精确搜索验证唯一解；可能需要试探或穷举。':
      '等级 '+tier+'：前一级求解器无法完成，目标等级可在不猜测的情况下完成。生成失败不会伪造等级。';
    $('creatorTier').querySelectorAll('option').forEach(option=>{
      option.disabled=Number($('creatorSize').value)!==9&&Number(option.value)>=3;
    });
  }
  function setBusy(value){
    busy=value;
    $('creatorGenerate').disabled=value;
    $('creatorCancel').hidden=!value;
    for(const control of $('creatorOptions').querySelectorAll('input,select,button'))
      if(control.id!=='creatorCancel')control.disabled=value;
  }
  function listMeta(record){
    const info=record.details||{};
    const names=(info.variants||[]).join(' + ')||'经典数独';
    return info.size+'×'+info.size+' · '+info.givens+
      ' 个提示数 · 等级 '+info.tier+' / 5 · '+names+
      (record.done?' · 已完成':'');
  }
  function makeAction(label,className,onClick){
    const btn=document.createElement('button');
    btn.type='button';btn.className=className;btn.textContent=label;
    btn.addEventListener('click',onClick);
    return btn;
  }
  function renderSaved(){
    const list=$('creatorSaved');
    list.replaceChildren();
    const query=$('creatorSearch').value.trim().toLocaleLowerCase('zh-CN');
    const matched=records.filter(record=>
      !query||[record.id,record.puzzle?.metadata?.title,
        record.details?.tier,...(record.details?.variants||[])]
        .join(' ').toLocaleLowerCase('zh-CN').includes(query));
    $('creatorCount').textContent='本机保存 '+records.length+' 题';
    if(!matched.length){
      const empty=document.createElement('p');
      empty.className='creator-empty';
      empty.textContent=records.length?'没有匹配的本机谜题。':
        '还没有本机生成的谜题。生成后会自动保存，无需联网。';
      list.append(empty);return;
    }
    for(const record of matched){
      const item=document.createElement('article');
      item.className='creator-saved-item';
      const title=document.createElement('strong');
      title.textContent=(record.starred?'★ ':'')+
        escapeLabel(record.puzzle?.metadata?.title);
      const subtitle=document.createElement('small');
      subtitle.textContent=listMeta(record);
      const buttons=document.createElement('div');
      buttons.className='creator-saved-actions';
      buttons.append(
        makeAction('开始 / 继续','creator-play',async()=>{
          try{
            await openPuzzle(record);
            dialog.close();
          }catch(error){notify('打开本机谜题失败：'+errorMessage(error));}
        }),
        makeAction(record.starred?'★ 已收藏':'☆ 收藏','',async()=>{
          try{
            await markCreated(record.id,'starred',!record.starred);
            await refresh(true);
          }catch(error){notify(errorMessage(error));}
        }),
        makeAction(record.done?'✓ 已完成':'标记完成','',async()=>{
          try{
            await markCreated(record.id,'done',!record.done);
            await refresh(true);
          }catch(error){notify(errorMessage(error));}
        }),
        makeAction('删除','creator-delete',async()=>{
          if(!window.confirm('确定从本机永久删除这道生成谜题及其解题存档吗？'))return;
          try{
            await deleteCreated(record.id);
            await handleDelete(record.id);
            await refresh(true);
            setStatus('已从本机删除生成谜题。');
          }catch(error){notify(errorMessage(error));}
        })
      );
      item.append(title,subtitle,buttons);
      list.append(item);
    }
  }
  async function refresh(notifyCatalog=false){
    records=await listCreated();
    renderSaved();
    if(notifyCatalog)await onCatalogChanged(records);
  }
  function cancel(){
    if(active){active.cancel();active=null;}
    setBusy(false);
    setStatus('已取消生成；没有创建或保存新谜题。');
  }
  $('creatorCancel').addEventListener('click',cancel);
  $('creatorClose').addEventListener('click',()=>{
    if(busy)cancel();
    dialog.close();
  });
  dialog.addEventListener('cancel',()=>{
    if(busy)cancel();
  });
  $('creatorSize').addEventListener('change',()=>{
    const size=Number($('creatorSize').value);
    if(size!==9&&Number($('creatorTier').value)>=3)
      $('creatorTier').value='2';
    renderVariants();
  });
  $('creatorTier').addEventListener('change',renderTechniques);
  $('creatorSearch').addEventListener('input',renderSaved);
  $('creatorClearVariants').addEventListener('click',()=>{
    $('creatorVariants').querySelectorAll('input').forEach(input=>{input.checked=false;});
    renderTechniques();
  });
  $('creatorAllVariants').addEventListener('click',()=>{
    $('creatorVariants').querySelectorAll('input').forEach(input=>{input.checked=true;});
    renderTechniques();
  });
  $('creatorGenerate').addEventListener('click',async()=>{
    if(busy)return;
    let request;
    try{
      const options=validateCreatorOptions({
        size:$('creatorSize').value,tier:$('creatorTier').value,
        variants:selectedVariants(),focus:$('creatorTechnique').value,
        density:$('creatorDensity').value,attempts:$('creatorAttempts').value
      });
      const customSeed=$('creatorSeed').value.trim();
      const seed=customSeed?Number(customSeed):crypto.getRandomValues(new Uint32Array(1))[0];
      if(!Number.isSafeInteger(seed)||seed<0||seed>Number.MAX_SAFE_INTEGER)
        throw Error('随机种子必须是非负安全整数');
      const id='personal-'+crypto.randomUUID().replaceAll('-','');
      request={...options,id,seed};
    }catch(error){setStatus(errorMessage(error));return;}
    setBusy(true);
    const running=startGeneration(request,{onStatus:setStatus});
    active=running;
    try{
      const response=await running.promise;
      if(active!==running)return; // The user cancelled or closed the modal.
      // Persist before opening a board; storage failure is NOT success.
      const saved=await saveCreated(response);
      await refresh(true);
      setStatus('生成成功，已自动保存到本机。');
      await openPuzzle(saved);
      dialog.close();
    }catch(error){
      if(active===running)setStatus('生成未完成：'+errorMessage(error));
    }finally{
      if(active===running){active=null;setBusy(false);}
    }
  });
  $('creatorButton').addEventListener('click',async()=>{
    dialog.showModal();
    try{await refresh();}catch(error){setStatus(errorMessage(error));}
  });
  $('creatorOpenFromLibrary').addEventListener('click',async()=>{
    dialog.showModal();
    try{await refresh();}catch(error){setStatus(errorMessage(error));}
  });
  renderVariants();
  return {refresh};
}
