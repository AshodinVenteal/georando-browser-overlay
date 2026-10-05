import {socketAddress,scan,identity,history,itemName,locationName,availableChecks} from './core.mjs?v=20261005-2';
const $=id=>document.getElementById(id);
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const save=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
const settings=read('ap-manual-checker',{});
const state={profiles:settings.profiles||[{slot:'AshedUpFusion',label:''}],results:[],snapshots:read('ap-checker-logic',[]),baseline:read('ap-checker-history',{})};
$('server').value=settings.server||$('server').value;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function persist(){save('ap-manual-checker',{server:$('server').value,profiles:state.profiles});}
function profiles(){
  $('profiles').innerHTML=state.profiles.map((p,i)=>`<div class="profile"><input aria-label="Slot name" data-i="${i}" data-k="slot" value="${esc(p.slot)}" placeholder="Slot name"><input aria-label="Display label" data-i="${i}" data-k="label" value="${esc(p.label)}" placeholder="Optional label"><button data-remove="${i}">Remove</button></div>`).join('');
  $('profiles').querySelectorAll('input').forEach(x=>x.oninput=()=>{state.profiles[x.dataset.i][x.dataset.k]=x.value;persist();});
  $('profiles').querySelectorAll('button').forEach(x=>x.onclick=()=>{state.profiles.splice(+x.dataset.remove,1);persist();profiles();});
}
function render(){
  $('results').innerHTML=state.results.map(r=>{
    if(r.error)return `<article class="panel"><h2>${esc(r.label)}</h2><p class="error">${esc(r.error)}</p></article>`;
    const logic=availableChecks(r,state.snapshots);
    const checks=ids=>ids.map(id=>`<div class="check" data-search="${esc(locationName(r,id).toLowerCase())}">${esc(locationName(r,id))}</div>`).join('');
    return `<article class="panel"><h2>${esc(r.label)}</h2><p class="note">${esc(r.game)} · Slot ${r.slot} · ${esc(r.seed)}</p><div class="stats"><span><b>${logic.ids===null?'—':logic.ids.length}</b>checks available in logic</span><span><b>${r.items.length}</b>items received</span></div>
      <h3>Available checks</h3><p class="note">${esc(logic.reason)}</p><div class="list">${logic.ids===null?'':checks(logic.ids)||'<p class="note">No unchecked locations currently reachable.</p>'}</div>
      <details><summary>All unfinished checks (${r.missing.length})</summary><input class="filter" placeholder="Search unfinished checks"><div class="list">${checks(r.missing)}</div></details>
      <h3>Received items · newest first</h3><p class="note">NEW marks arrivals since the previous successful update on this browser. The first update establishes a baseline.</p><div class="list">${r.history.map(x=>{
        const sender=r.players.find(p=>p.slot===x.player&&p.team===r.team);
        return `<div class="item"><div>${esc(itemName(r,x.item))}<small>#${x.index+1} · ${esc(sender?.alias||sender?.name||'Starting inventory')}${x.location>0?' · '+esc(locationName(r,x.location,r.slots[x.player]?.game)):''}</small></div>${x.isNew?'<span class="badge">NEW</span>':''}</div>`;
      }).join('')||'<p class="note">No received items.</p>'}</div></article>`;
  }).join('');
  $('results').querySelectorAll('.filter').forEach(input=>input.oninput=()=>input.parentElement.querySelectorAll('.check').forEach(x=>x.hidden=!x.dataset.search.includes(input.value.toLowerCase())));
}
$('add').onclick=()=>{state.profiles.push({slot:'',label:''});profiles();persist();};
$('logic').onchange=async event=>{
  try{
    const incoming=[];
    for(const file of event.target.files){
      const data=JSON.parse(await file.text());
      for(const x of data.slots||[data]){
        if(x.schema!=='ap-ut-snapshot-v1'||!Array.isArray(x.items)||!Array.isArray(x.in_logic)||!Array.isArray(x.checked)||typeof x.seed!=='string'||!Number.isInteger(x.slot)||!Number.isInteger(x.team))throw new Error('Not a Universal Tracker snapshot.');
        incoming.push(x);
      }
    }
    for(const x of incoming)state.snapshots=[...state.snapshots.filter(old=>identity(old)!==identity(x)),x];
    save('ap-checker-logic',state.snapshots);render();$('status').textContent=`Imported ${incoming.length} logic snapshots.`;
  }catch(error){$('status').textContent=error.message;}
};
$('update').onclick=async()=>{
  const buttons=document.querySelectorAll('button');buttons.forEach(x=>x.disabled=true);
  try{
    const server=socketAddress($('server').value,location.protocol==='https:');persist();
    const slots=state.profiles.filter(p=>p.slot.trim());if(!slots.length)throw new Error('Add at least one slot.');
    state.results=[];render();
    for(const p of slots){
      const label=p.label||p.slot;
      try{
        const r=await scan({server,name:p.slot,password:$('password').value,onStage:stage=>$('status').textContent=`${label}: ${stage}…`});
        r.label=label;r.history=history(r,state.baseline[identity(r)]);
        state.baseline[identity(r)]={items:r.items};save('ap-checker-history',state.baseline);state.results.push(r);
      }catch(error){state.results.push({label,error:error.message});}render();
    }
    $('status').textContent=`Updated ${state.results.filter(r=>!r.error).length} of ${slots.length} slots.`;
  }catch(error){$('status').textContent=error.message;}
  finally{buttons.forEach(x=>x.disabled=false);}
};
profiles();render();
