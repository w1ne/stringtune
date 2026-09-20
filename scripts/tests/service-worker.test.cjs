const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
function worker(response){
 const events={},writes=[],deletions=[];
 const cache={put:async(...args)=>writes.push(args),addAll:async()=>{}};
 const env={URL,Response,console,fetch:async()=>response,caches:{keys:async()=>['unrelated-cache','stringtune-tuner-cache-v4'],delete:async k=>deletions.push(k),open:async()=>cache,match:async()=>new Response('offline')},clients:{claim:async()=>{}},self:{location:{origin:'https://stringtune.com'},skipWaiting:async()=>{},addEventListener:(name,fn)=>events[name]=fn}};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../../stringtune/static/sw.js'),'utf8'),env);
 return {events,writes,deletions};
}
test('activation deletes only old tuner caches',async()=>{
 const {events,deletions}=worker();let pending;events.activate({waitUntil:p=>pending=p});await pending;assert.deepEqual(deletions,['stringtune-tuner-cache-v4']);
});
test('failed HTTP responses cannot replace working offline assets',async()=>{
 const {events,writes}=worker(new Response('missing',{status:404}));const pending=[];let result;
 events.fetch({request:{method:'GET',url:'https://stringtune.com/js/tuner/tuner.js'},respondWith:p=>result=p,waitUntil:p=>pending.push(p)});
 await result;await Promise.all(pending);assert.equal(writes.length,0);
});
