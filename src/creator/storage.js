// Personal puzzles use a dedicated IndexedDB database (not an app-wide
// localStorage JSON list). Puzzle artwork, the unique answer and user flags
// are saved atomically so a WebView restart does not lose generated boards.
const DB_NAME='sudokupadx-personal-v1';
let dbPromise;
function db(){
  if(!dbPromise){
    dbPromise=new Promise((resolve,reject)=>{
      if(typeof indexedDB==='undefined'){reject(Error('本机不支持离线谜题存储'));return;}
      const req=indexedDB.open(DB_NAME,1);
      req.onupgradeneeded=()=>{
        if(!req.result.objectStoreNames.contains('puzzles'))
          req.result.createObjectStore('puzzles',{keyPath:'id'});
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||Error('无法打开本机题库'));
      req.onblocked=()=>reject(Error('本机题库正被另一个窗口占用'));
    }).catch(error=>{dbPromise=null;throw error;});
  }
  return dbPromise;
}
async function transaction(mode,change){
  const database=await db();
  return new Promise((resolve,reject)=>{
    const tx=database.transaction(['puzzles'],mode);
    const store=tx.objectStore('puzzles');
    let value;
    tx.oncomplete=()=>resolve(value);
    tx.onerror=()=>reject(tx.error||Error('本机写入失败'));
    tx.onabort=()=>reject(tx.error||Error('本机操作已取消'));
    try{change(store,result=>{value=result;});}
    catch(error){tx.abort();reject(error);}
  });
}
function validId(id){
  return typeof id==='string'&&/^personal-[a-z0-9-]{6,100}$/.test(id);
}
export function saveCreated(response){
  const {puzzle,details}=response||{};
  const id=puzzle?.id;
  if(!validId(id)||details?.id!==id||
     !Array.isArray(puzzle?.cells)||
     ![4,6,9].includes(puzzle.cells.length)||
     puzzle.cells.some(row=>!Array.isArray(row)||row.length!==puzzle.cells.length)||
     typeof puzzle.metadata?.solution!=='string'||
     puzzle.metadata.solution.length!==puzzle.cells.length**2){
    throw Error('生成器输出不完整，无法保存');
  }
  const record={id,createdAt:new Date().toISOString(),
    puzzle,details,starred:false,done:false};
  return transaction('readwrite',(store,done)=>{
    const get=store.get(id);
    get.onsuccess=()=>{
      if(get.result){return; /* Never replace an existing generated puzzle. */}
      store.add(record);
      done(record);
    };
  }).then(saved=>{
    if(!saved)throw Error('相同谜题编号已存在');
    return saved;
  });
}
export function listCreated(){
  return transaction('readonly',(store,done)=>{
    store.getAll().onsuccess=e=>{
      const entries=e.target.result||[];
      entries.sort((a,b)=>Number(b.starred)-Number(a.starred)||
        b.createdAt.localeCompare(a.createdAt));
      done(entries);
    };
  });
}
export function readCreated(id){
  if(!validId(id))return Promise.resolve(null);
  return transaction('readonly',(store,done)=>{
    store.get(id).onsuccess=e=>done(e.target.result||null);
  });
}
export function markCreated(id,field,value){
  if(!validId(id)||!['starred','done'].includes(field)||typeof value!=='boolean')
    return Promise.reject(Error('题目标记无效'));
  return transaction('readwrite',(store,done)=>{
    store.get(id).onsuccess=e=>{
      const record=e.target.result;
      if(!record){return;}
      record[field]=value;
      store.put(record);
      done(record);
    };
  }).then(result=>{
    if(!result)throw Error('找不到该本机谜题');
    return result;
  });
}
export function deleteCreated(id){
  if(!validId(id))return Promise.reject(Error('无效题目编号'));
  return transaction('readwrite',store=>store.delete(id));
}
export function createdCatalogEntries(records){
  return (records||[]).map(r=>({
    id:r.id,title:(r.starred?'★ ':'')+(r.puzzle?.metadata?.title||'我的生成谜题'),
    kind:'standalone',group:'personal-created',
    tier:r.details?.tier,givens:r.details?.givens,starred:!!r.starred,
    done:!!r.done
  }));
}
