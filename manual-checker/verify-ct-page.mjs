// Exercise the page update handler with a minimal DOM, the real room socket,
// and the bundled graph. A stale/offline Python URL must not block browser CT.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const elements=new Map();
function element(id){
  if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',textContent:'',disabled:false,querySelectorAll:()=>[]});
  return elements.get(id);
}
globalThis.document={getElementById:element,querySelectorAll:()=>[]};
globalThis.location={hostname:'ashodinventeal.github.io',protocol:'https:'};
const stored=new Map([['ap-manual-checker',JSON.stringify({server:'wss://archipelago.gg:63304',backend:'https://offline.invalid',profiles:[{slot:'AshTrigger',label:''}]})]]);
globalThis.localStorage={getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value)};
let graphLoads=0;
globalThis.fetch=async url=>{
  assert(String(url).startsWith('./data/ct-'),'CT should not call the Python backend');graphLoads++;
  return {ok:true,json:async()=>JSON.parse(await readFile(new URL(String(url).split('?')[0],import.meta.url),'utf8'))};
};
await import('./app.mjs');
await element('update').onclick();
assert.equal(graphLoads,1);
assert.match(element('status').textContent,/logic available for 1/);
assert.match(element('results').innerHTML,/CT browser graph evaluator/);
assert.doesNotMatch(element('results').innerHTML,/Logic unavailable|Unknown item/);
assert.match(element('results').innerHTML,/Progressive Masamune/);
await element('update').onclick();
assert.equal(graphLoads,1,'Reuse graph but recalculate live inventory each time');
assert.match(element('status').textContent,/logic available for 1/);
console.log('CT page update handler: real room connected twice; browser logic rendered; offline Python URL bypassed.');
