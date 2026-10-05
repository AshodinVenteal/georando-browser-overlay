import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scan,history,mergeItems,itemName,availableChecks} from './core.mjs';
const item = (id,location=100)=>({item:id,location,player:1,flags:1});
test('full sync and replay do not duplicate item stream',()=>{
  let items=mergeItems([], {index:0,items:[item(1),item(1)]}).items;
  items=mergeItems(items,{index:0,items:[item(1),item(1)]}).items;
  assert.equal(items.length,2);
  assert.equal(mergeItems(items,{index:9,items:[item(2)]}).resync,true);
});
test('arrival history preserves duplicate instances and only flags appended arrivals',()=>{
  const result={items:[item(1),item(1),item(2)]};
  assert.deepEqual(history(result,{items:result.items.slice(0,2)}).map(x=>[x.index,x.isNew]),[[2,true],[1,false],[0,false]]);
  assert(history(result).every(x=>!x.isNew));
  assert(history({items:[item(8)]},{items:[item(1)]}).every(x=>!x.isNew));
});
test('receiving game and shared package resolve item names',()=>{
  const result={game:'Test',packages:{Test:{item_name_to_id:{Sword:1}},Archipelago:{item_name_to_id:{Nothing:0}}}};
  assert.equal(itemName(result,1),'Sword');assert.equal(itemName(result,0),'Nothing');
});
test('available checks never fall back to all missing and invalidate stale inventory',()=>{
  const r={seed:'seed',team:0,slot:1,game:'Test',items:[item(1)],checked:[9],missing:[1,2,3]};
  assert.equal(availableChecks(r,[]).ids,null);
  const snapshot={...r,in_logic:[2,9],generated_at:'now'};
  assert.deepEqual(availableChecks(r,[snapshot]).ids,[2]);
  assert.equal(availableChecks({...r,items:[...r.items,item(2)]},[snapshot]).ids,null);
});
test('packet ordering waits for names and full item stream; discovers array slot_info',async()=>{
  class Socket {
    constructor(){queueMicrotask(()=>this.onmessage({data:JSON.stringify([{cmd:'RoomInfo',seed_name:'s'}])}));}
    send(data){const p=JSON.parse(data)[0];
      if(p.cmd==='Connect'){
        assert.equal(p.game,'');assert(p.tags.includes('Tracker'));assert.equal(p.version.class,'Version');
        queueMicrotask(()=>this.onmessage({data:JSON.stringify([{cmd:'Connected',team:0,slot:1,slot_info:{1:['Player','Test',1]},missing_locations:[2]},{cmd:'ReceivedItems',index:0,items:[item(7)]}])}));
      } else if(p.cmd==='GetDataPackage') queueMicrotask(()=>this.onmessage({data:JSON.stringify([{cmd:'DataPackage',data:{games:{Test:{item_name_to_id:{Key:7}},Archipelago:{}}}}])}));
    }
    close(){}
  }
  const r=await scan({server:'wss://test',name:'Player',Socket,timeoutMs:1000});
  assert.equal(r.game,'Test');assert.equal(itemName(r,7),'Key');assert.equal(r.items.length,1);
});
