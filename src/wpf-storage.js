// A separate IndexedDB prevents large PDF blobs from occupying Sudoku saves.
import {isPdfData,validatedWpfPdfUrl} from './wpf-catalog.js';
export const MAX_WPF_PDF=24*1024*1024;
let opening;
function database() {
  if (!opening) opening=new Promise((resolve,reject)=>{
    if (typeof indexedDB==='undefined') { reject(Error('本机不支持 PDF 离线存储')); return; }
    const req=indexedDB.open('sudokupadx-wpf-v1',1);
    req.onupgradeneeded=()=>{
      for(const name of ['documents','files','ink'])
        if(!req.result.objectStoreNames.contains(name))
          req.result.createObjectStore(name,{keyPath:'id'});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||Error('PDF 数据库无法打开'));
    req.onblocked=()=>reject(Error('PDF 数据库被其他窗口占用'));
  }).catch(error=>{opening=undefined;throw error;});
  return opening;
}
async function transact(stores,mode,fn){
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(stores,mode);let output;
    tx.oncomplete=()=>resolve(output);
    tx.onerror=()=>reject(tx.error||Error('PDF 本机存储失败'));
    tx.onabort=()=>reject(tx.error||Error('PDF 存储已取消'));
    try{fn(tx,value=>{output=value;});}catch(error){tx.abort();reject(error);}
  });
}
export function listWpfDocuments(){
  return transact(['documents'],'readonly',(tx,done)=>{
    tx.objectStore('documents').getAll().onsuccess=e=>done(e.target.result||[]);
  });
}
export function readWpfDocument(id){
  return transact(['files'],'readonly',(tx,done)=>{
    tx.objectStore('files').get(id).onsuccess=e=>done(e.target.result?.data||null);
  });
}
export function saveWpfDocument(entry,data){
  if (!entry || typeof entry.id!=='string' || entry.id.length>600 ||
      !validatedWpfPdfUrl(entry.pdfUrl)) throw Error('无效的 WPF PDF 链接');
  const bytes=data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.byteLength>MAX_WPF_PDF || !isPdfData(bytes))
    throw Error('文件不是有效的 PDF，或超过 24 MiB');
  const meta={id:entry.id,pdfUrl:entry.pdfUrl,title:String(entry.title||'WPF PDF').slice(0,220),
    savedAt:new Date().toISOString(),sourceUrl:entry.sourceUrl||entry.pdfUrl};
  return transact(['documents','files'],'readwrite',tx=>{
    tx.objectStore('documents').put(meta);
    tx.objectStore('files').put({id:entry.id,data:bytes});
  });
}
export function deleteWpfDocument(id){
  return transact(['documents','files','ink'],'readwrite',tx=>{
    for(const store of ['documents','files','ink'])tx.objectStore(store).delete(id);
  });
}
export function readWpfInk(id){
  return transact(['ink'],'readonly',(tx,done)=>{
    tx.objectStore('ink').get(id).onsuccess=e=>done(e.target.result?.pages||{});
  });
}
export function saveWpfInk(id,pages){
  return transact(['ink'],'readwrite',tx=>{
    tx.objectStore('ink').put({id,pages});
  });
}
