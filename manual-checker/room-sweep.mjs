// Read-only Tracker sessions. No LocationChecks, scouts, chat or hint purchases.
export function inspectSlot({server,name,password='',team,keys=[],Socket=globalThis.WebSocket,timeoutMs=25000}){
  return new Promise((resolve,reject)=>{
    let socket,connected,seed,done=false;
    const finish=error=>{if(done)return;done=true;clearTimeout(timer);if(socket){socket.onclose=null;socket.close();}error?reject(error):resolve({...connected,seed});};
    const timer=setTimeout(()=>finish(new Error('Room sweep connection timed out.')),timeoutMs);
    const send=packet=>socket.send(JSON.stringify([packet]));
    try{socket=new Socket(server);}catch(error){finish(error);return;}
    socket.onerror=()=>finish(new Error('Room sweep connection failed.'));
    socket.onclose=()=>finish(new Error('Room sweep connection closed before completing.'));
    socket.onmessage=event=>{
      try{
        for(const packet of JSON.parse(event.data)){
          if(packet.cmd==='RoomInfo'){seed=packet.seed_name;send({cmd:'Connect',name,game:'',password:password||null,uuid:crypto.randomUUID(),version:{major:0,minor:6,build:0,class:'Version'},tags:['Tracker','NoText'],items_handling:0,slot_data:false});}
          if(packet.cmd==='ConnectionRefused')throw new Error((packet.errors||[]).join(', '));
          if(packet.cmd==='Connected'){
            if(team!==undefined&&team!==packet.team)throw new Error('Slot is on a different team.');
            connected={team:packet.team,slot:packet.slot,checked:packet.checked_locations||[],missing:packet.missing_locations||[],sampled_at:new Date().toISOString(),stored:{}};
            if(keys.length)send({cmd:'Get',keys});else finish();
          }
          if(packet.cmd==='Retrieved'&&connected){connected.stored=packet.keys||{};finish();}
          if(packet.cmd==='InvalidPacket')throw new Error(packet.text||'Server rejected the sweep request.');
        }
      }catch(error){finish(error);}
    };
  });
}
export async function sweepRoom({reference,server,password='',onProgress=()=>{},inspect=inspectSlot}){
  const slots=Object.entries(reference.slots).filter(([,slot])=>slot.type===1).map(([id,slot])=>({slot:+id,...slot}));
  const keys=slots.flatMap(slot=>[`_read_hints_${reference.team}_${slot.slot}`,`_read_client_status_${reference.team}_${slot.slot}`]);
  const anchor=await inspect({server,password,name:reference.slots[reference.slot].name,team:reference.team,keys});
  if(anchor.seed!==reference.seed)throw new Error('Room seed changed; update your slots first.');
  const rows=[],hints=[];
  let next=0,completed=0;
  for(const slot of slots){
    const value=anchor.stored[`_read_hints_${reference.team}_${slot.slot}`];
    if(Array.isArray(value))hints.push(...value);
  }
  await Promise.all(Array.from({length:Math.min(3,slots.length)},async()=>{
    while(next<slots.length){
      const slot=slots[next++];
      try{
        const current=slot.slot===anchor.slot?anchor:await inspect({server,password,name:slot.name,team:reference.team});
        if(current.seed!==reference.seed||current.slot!==slot.slot)throw new Error('Unexpected slot or seed identity.');
        rows.push({...slot,...current,status:anchor.stored[`_read_client_status_${reference.team}_${slot.slot}`]??null});
      }catch(error){rows.push({...slot,error:error.message});}
      onProgress(++completed,slots.length,slot.name);
    }
  }));
  const unique=new Map();
  for(let hint of hints){
    if(Array.isArray(hint))hint={receiving_player:hint[0],finding_player:hint[1],location:hint[2],item:hint[3],found:hint[4],entrance:hint[5],item_flags:hint[6],status:hint[7]};
    if(hint&&Number.isInteger(hint.location)&&Number.isInteger(hint.finding_player))unique.set(`${hint.finding_player}:${hint.location}:${hint.receiving_player}`,hint);
  }
  return {schema:'ap-room-sweep-v1',seed:reference.seed,team:reference.team,generated_at:new Date().toISOString(),
    slots:rows.sort((a,b)=>a.slot-b.slot),hints:[...unique.values()],hint_slots:slots.filter(slot=>Array.isArray(anchor.stored[`_read_hints_${reference.team}_${slot.slot}`])).length};
}
export function validateSpheres(index,reference){
  if(index?.schema!=='ap-sphere-index-v1'||index.seed!==reference.seed||index.team!==reference.team||!Array.isArray(index.checks))throw new Error('Sphere index must match this seed and team.');
  const seen=new Set();
  for(const check of index.checks){
    const key=`${check.slot}:${check.location}`;
    if(!Number.isInteger(check.sphere)||check.sphere<1||!Number.isInteger(check.slot)||!reference.slots[check.slot]||!Number.isInteger(check.location)||seen.has(key))throw new Error('Sphere index has invalid or duplicate checks.');
    if(check.receiver!==undefined&&!reference.slots[check.receiver])throw new Error('Sphere index has an unknown recipient.');
    seen.add(key);
  }
  return index;
}
export function analyzeSweep(sweep,{index=null,maxSphere=3,previous=null}={}){
  if(!Number.isInteger(maxSphere)||maxSphere<1||maxSphere>1000)throw new Error('Choose a sphere limit between 1 and 1000.');
  if(index&&(index.seed!==sweep.seed||index.team!==sweep.team))throw new Error('Sphere index is for a different room.');
  const comparable=previous?.seed===sweep.seed&&previous.team===sweep.team;
  const rows=sweep.slots.map(slot=>{
    if(slot.error)return {...slot,early:[],hints:[],newChecks:null};
    const missing=new Set(slot.missing),checked=new Set(slot.checked);
    const early=index?index.checks.filter(check=>check.slot===slot.slot&&check.sphere<=maxSphere&&missing.has(check.location)):[];
    const unknown=index?index.checks.filter(check=>check.slot===slot.slot&&!missing.has(check.location)&&!checked.has(check.location)).length:0;
    const hints=sweep.hints.filter(hint=>hint.finding_player===slot.slot&&!hint.found&&hint.status!==20&&missing.has(hint.location));
    const old=comparable?previous.slots.find(x=>x.slot===slot.slot&&!x.error):null;
    const prior=new Set(old?.checked||[]);
    return {...slot,early:early.sort((a,b)=>a.sphere-b.sphere||a.location-b.location),unknown,hints,
      earliest:early.length?Math.min(...early.map(x=>x.sphere)):null,
      progressionHints:hints.filter(h=>(h.item_flags&1)!==0).length,
      priorityHints:hints.filter(h=>h.status===30).length,
      newChecks:old?slot.checked.filter(id=>!prior.has(id)).length:null,
      regressed:old?old.checked.some(id=>!checked.has(id)):false};
  });
  rows.sort((a,b)=>Number(!!a.error)-Number(!!b.error)||(a.earliest??Infinity)-(b.earliest??Infinity)||b.priorityHints-a.priorityHints||b.progressionHints-a.progressionHints||b.early.length-a.early.length||b.hints.length-a.hints.length||a.slot-b.slot);
  return rows;
}
