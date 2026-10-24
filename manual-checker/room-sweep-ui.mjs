import {socketAddress,locationName,itemName} from './core.mjs?v=20261023-2';
import {sweepRoom,analyzeSweep,validateSpheres} from './room-sweep.mjs?v=20261023-2';
export function attachRoomSweep({getReference}){
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const read=key=>{try{return JSON.parse(localStorage.getItem(key));}catch{return null;}};
  let index=read('ap-sphere-index'),latest=null,previous=null,busy=false;
  function render(){
    if(!latest)return;
    const reference=getReference();
    if(!reference||reference.seed!==latest.seed||reference.team!==latest.team)return;
    let verified=null;
    try{if(index)verified=validateSpheres(index,reference);}catch(error){$('sweep-status').textContent=error.message;}
    const rows=analyzeSweep(latest,{index:verified,maxSphere:Number($('sphere-limit').value)||3,previous});
    const successful=rows.filter(row=>!row.error);
    const needed=rows.filter(row=>!row.error&&(row.early.length||row.hints.length));
    const label=slot=>reference.slots[slot]?.name||`Slot ${slot}`;
    const showSpoilers=$('sweep-spoilers').checked;
    $('sweep-results').innerHTML=`<p class="note">${successful.length}/${rows.length} player slots sampled · ${needed.length} with audit targets · ${latest.hint_slots}/${rows.length} hint feeds readable · ${esc(latest.generated_at)}</p>
      <p class="note">${verified?'Using the owner-supplied sendable-sphere index, numbered from 1.':'No full sphere index loaded: these are unresolved-hint priorities, NOT early-sphere results.'} Generation spheres are not current reachability. A listed check is a candidate to investigate, not proof it blocks another player. Hints marked Avoid are excluded. Goal-complete games may still have checks to send.${previous?.seed===latest.seed&&previous.team===latest.team?' Previous sweep: '+esc(previous.generated_at)+'.':''}</p>`+
      rows.map(row=>{
        if(row.error)return `<details><summary>${esc(row.name)} · ${esc(row.game)} — scan failed</summary><p class="error">${esc(row.error)} No conclusions drawn.</p></details>`;
        const delta=row.newChecks===null?'First observation':row.regressed?'Checked-location data decreased; comparison may reflect a rollback':`${row.newChecks} new checks since previous sweep`;
        const targets=new Map();
        for(const check of row.early)targets.set(check.location,{...check});
        for(const hint of row.hints){const target=targets.get(hint.location)||{location:hint.location};target.hints=target.hints||[];target.hints.push(hint);targets.set(hint.location,target);}
        return `<details${targets.size?' open':''}><summary>${esc(row.name)} · ${esc(row.game)} — ${verified?`${row.early.length} left in spheres 1–${Number($('sphere-limit').value)||3}`:'sphere status unknown'} · ${row.hints.length} unresolved hints${row.status===30?' · Goal complete':''}</summary>
        <p class="note">${row.checked.length}/${row.checked.length+row.missing.length} checked · ${esc(delta)} · ${row.progressionHints} progression hints · ${row.priorityHints} priority hints${row.unknown?` · ${row.unknown} indexed checks absent from this slot’s live location list`:''}</p>
        <div class="list">${[...targets.values()].map(target=>{
          const hint=target.hints?.[0];
          const tags=[target.sphere?`Sphere ${target.sphere}`:'Sphere unknown'];
          if(hint){tags.push(`Hint for ${label(hint.receiving_player)}`);if(hint.item_flags&1)tags.push('Progression');if(hint.status===30)tags.push('Priority');}
          if(!hint&&target.receiver!==undefined)tags.push(`For ${label(target.receiver)}`);
          let item='';
          if(showSpoilers){const receiver=hint?.receiving_player??target.receiver;const id=hint?.item??target.item;
            if(id!==undefined&&receiver!==undefined)item=` · ${itemName({...reference,game:reference.slots[receiver]?.game},id)}`;}
          return `<div class="check">${esc(locationName(reference,target.location,row.game))}<small>${esc(tags.join(' · ')+item)}</small></div>`;
        }).join('')||'<p class="note">No targets identified from the available sphere/hint data. This does not prove all in-logic checks are cleared.</p>'}</div></details>`;
      }).join('');
  }
  $('sphere-index').onchange=async event=>{
    try{
      const candidate=JSON.parse(await event.target.files[0].text());
      if(candidate.schema!=='ap-sphere-index-v1'||!Array.isArray(candidate.checks))throw new Error('Not an owner-exported sphere index.');
      const reference=getReference();if(reference)validateSpheres(candidate,reference);
      index=candidate;localStorage.setItem('ap-sphere-index',JSON.stringify(index));
      $('sweep-status').textContent='Sphere index loaded. Sweep the room to compare it with live completed checks.';render();
    }catch(error){$('sweep-status').textContent=error.message;}
  };
  $('sphere-limit').onchange=()=>{try{render();}catch(error){$('sweep-status').textContent=error.message;}};
  $('sweep-spoilers').onchange=render;
  $('clear-spheres').onclick=()=>{index=null;localStorage.removeItem('ap-sphere-index');$('sphere-index').value='';$('sweep-status').textContent='Sphere index removed; using live hint priorities only.';render();};
  $('sweep-room').onclick=async()=>{
    if(busy)return;
    const reference=getReference();
    if(!reference){$('sweep-status').textContent='Click Update all slots first to identify the current room and load game names.';return;}
    busy=true;$('sweep-room').disabled=true;
    try{
      if(index)validateSpheres(index,reference);
      const server=socketAddress($('server').value,location.protocol==='https:');
      $('sweep-status').textContent='Reading room hint feeds and completed checks…';
      previous=read('ap-room-sweep');
      latest=await sweepRoom({reference,server,password:$('password').value,onProgress:(n,total,name)=>$('sweep-status').textContent=`Sweeping ${n}/${total}: ${name}…`});
      render();
      try{localStorage.setItem('ap-room-sweep',JSON.stringify(latest));}catch{}
      $('sweep-status').textContent=`Sweep complete. ${latest.slots.filter(x=>x.error).length} slots failed; failed slots are not classified. This samples each slot at a slightly different time.`;
    }catch(error){$('sweep-status').textContent=error.message;}
    finally{busy=false;$('sweep-room').disabled=false;}
  };
}
