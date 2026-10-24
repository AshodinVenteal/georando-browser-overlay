import test from 'node:test';
import assert from 'node:assert/strict';
import {attachRoomSweep} from './room-sweep-ui.mjs';
test('page can import and remove a matching sphere index; mismatched index is rejected',async()=>{
  const elements=new Map();
  const $=id=>{if(!elements.has(id))elements.set(id,{value:id==='sphere-limit'?'3':'',textContent:'',innerHTML:'',checked:false});return elements.get(id);};
  const store=new Map();
  globalThis.document={getElementById:$};
  globalThis.localStorage={getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)};
  const reference={seed:'seed',team:0,slot:1,slots:{1:{name:'One',game:'A',type:1}}};
  attachRoomSweep({getReference:()=>reference});
  const index={schema:'ap-sphere-index-v1',seed:'seed',team:0,checks:[{sphere:1,slot:1,location:10}]};
  const change=value=>$('sphere-index').onchange({target:{files:[{text:async()=>JSON.stringify(value)}]}});
  await change(index);assert(store.has('ap-sphere-index'));assert.match($('sweep-status').textContent,/loaded/);
  await change({...index,seed:'wrong'});assert.match($('sweep-status').textContent,/match/);
  $('clear-spheres').onclick();assert(!store.has('ap-sphere-index'));
});
