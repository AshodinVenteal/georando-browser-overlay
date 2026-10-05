export function socketAddress(value, secure = true) {
  value = value.trim();
  if (/^https:\/\/archipelago.gg\/room\/UJTg7y1-TOyMABK6Ai9ttw\/?$/.test(value)) return 'wss://archipelago.gg:63304';
  if (/^https?:/.test(value)) throw new Error('Copy the host:port shown on the room page.');
  if (!/^wss?:\/\//.test(value)) value = `${secure ? 'wss' : 'ws'}://${value}`;
  const url = new URL(value);
  if (!url.hostname || !['ws:', 'wss:'].includes(url.protocol)) throw new Error('Enter a valid server address.');
  if (secure && url.protocol === 'ws:') throw new Error('This HTTPS page requires a wss:// server.');
  return url.href;
}
export function slotInfo(value) {
  return Object.fromEntries(Object.entries(value || {}).map(([id,x]) => [id,Array.isArray(x) ? {name:x[0],game:x[1],type:x[2]} : x]));
}
export function mergeItems(current, packet) {
  if (!Number.isInteger(packet.index) || packet.index < 0 || !Array.isArray(packet.items)) throw new Error('Invalid item packet.');
  if (packet.index > current.length) return {items:current,resync:true};
  const items = packet.index === 0 ? [] : current.slice();
  packet.items.forEach((item,offset) => {items[packet.index+offset] = item;});
  return {items,resync:false};
}
export const signature = items => JSON.stringify(items.map(x => [x.item,x.location,x.player,x.flags ?? 0]));
export const identity = result => JSON.stringify([result.seed,result.team,result.slot]);
export function history(result,previous) {
  const same = previous && previous.items.length <= result.items.length && signature(result.items.slice(0,previous.items.length)) === signature(previous.items);
  return result.items.map((x,index) => ({...x,index,isNew:!!same && index >= previous.items.length})).reverse();
}
export function itemName(result,id) {
  for (const game of [result.game,'Archipelago']) {
    const match = Object.entries(result.packages[game]?.item_name_to_id || {}).find(([,value])=>value === id);
    if (match) return match[0];
  }
  return `Unknown item (${id})`;
}
export function locationName(result,id,game = result.game) {
  return Object.entries(result.packages[game]?.location_name_to_id || {}).find(([,value])=>value === id)?.[0] || `Location ${id}`;
}
export function availableChecks(result,snapshots) {
  const snapshot = snapshots.find(x=>identity(x) === identity(result) && x.game === result.game);
  if (!snapshot) return {ids:null,reason:'Logic unavailable: import a Universal Tracker snapshot for this slot.'};
  if (signature(snapshot.items) !== signature(result.items)) return {ids:null,reason:'Logic snapshot is stale: received items changed. Export and import a fresh snapshot.'};
  if (JSON.stringify([...snapshot.checked].sort((a,b)=>a-b)) !== JSON.stringify([...result.checked].sort((a,b)=>a-b))) return {ids:null,reason:'Logic snapshot is stale: completed checks changed.'};
  const missing = new Set(result.missing);
  return {ids:snapshot.in_logic.filter(id=>missing.has(id)),reason:`Universal Tracker evaluated ${snapshot.generated_at}.`};
}
export function scan({server,name,password='',Socket=globalThis.WebSocket,onStage=()=>{},timeoutMs=25000}) {
  return new Promise((resolve,reject)=>{
    let socket,timer,finished=false,stage='opening connection',connected=null,seed,packages={},items=[],synced=false;
    const finish = error => {
      if (finished) return;
      finished=true;clearTimeout(timer);
      if (socket) {socket.onclose=null;socket.close();}
      if (error) reject(error);else resolve({...connected,seed,packages,items});
    };
    const progress = text => {stage=text;onStage(text);};
    const send = packet => socket.send(JSON.stringify([packet]));
    timer=setTimeout(()=>finish(new Error(`Timed out while ${stage}.`)),timeoutMs);
    try {socket=new Socket(server);} catch(error) {finish(error);return;}
    socket.onerror=()=>finish(new Error(`WebSocket failed while ${stage}. Check the host and port.`));
    socket.onclose=event=>finish(new Error(`Server closed while ${stage} (code ${event.code}${event.reason ? ': '+event.reason : ''}).`));
    socket.onmessage=event=>{
      try {
        const packets=JSON.parse(event.data);
        if (!Array.isArray(packets)) throw new Error('Expected an Archipelago packet list.');
        for (const packet of packets) {
          switch(packet.cmd) {
            case 'RoomInfo':
              seed=packet.seed_name;progress('authenticating slot');
              send({cmd:'Connect',name:name.trim(),game:'',password:password||null,uuid:crypto.randomUUID(),version:{major:0,minor:6,build:0,class:'Version'},tags:['Tracker','NoText'],items_handling:7,slot_data:true});break;
            case 'ConnectionRefused': throw new Error((packet.errors||['Connection refused']).join(', '));
            case 'Connected': {
              const slots=slotInfo(packet.slot_info),game=slots[packet.slot]?.game;
              if (!game) throw new Error('Server did not supply the slot game.');
              connected={team:packet.team,slot:packet.slot,game,slots,players:packet.players||[],slotData:packet.slot_data||{},missing:packet.missing_locations||[],checked:packet.checked_locations||[]};
              progress('loading item history and names');
              send({cmd:'GetDataPackage',games:[...new Set([game,'Archipelago',...Object.values(slots).map(x=>x.game)])]});break;
            }
            case 'ReceivedItems': {
              const merged=mergeItems(items,packet);items=merged.items;
              if (packet.index === 0) synced=true;
              if (merged.resync) {synced=false;send({cmd:'Sync'});}break;
            }
            case 'DataPackage': packages={...packages,...packet.data?.games};break;
          }
        }
        if (connected && synced && packages[connected.game] && packages.Archipelago) finish();
      } catch(error) {finish(error);}
    };
  });
}
