import {socketAddress, mergeItems, inventory, allowances} from './core.js';

let socket, heartbeat, retryTimer, generation = 0;
let settings = {server: 'archipelago.gg:38281', player: '', game: 'Manual_GeoGuessr_arborelia'};
let wanted = false, password = '', uuid;
let state = fresh();
const ports = new Set();
function fresh() {
  return {status: 'Disconnected', connected: false, authenticated: false, seed: '', team: null, slot: null, package: {}, items: [], checked: [], missing: [], pending: [], log: [], goal: false};
}
const ready = (async () => {
  const saved = await chrome.storage.local.get(['settings', 'uuid']);
  settings = {...settings, ...saved.settings};
  uuid = saved.uuid || crypto.randomUUID();
  if (!saved.uuid) await chrome.storage.local.set({uuid});
  const session = await chrome.storage.session.get(['state', 'wanted', 'password']);
  if (session.state) state = {...fresh(), ...session.state, connected: false, authenticated: false};
  wanted = session.wanted || false;
  password = session.password || '';
  if (wanted) openSocket();
})();

function snapshot() {
  const counts = inventory(state.items, state.package);
  const checked = new Set(state.checked), pending = new Set(state.pending);
  const valid = new Set([...state.checked, ...state.missing]);
  const locations = Object.entries(state.package.location_name_to_id || {})
    .filter(([, id]) => valid.has(id))
    .map(([name, id]) => ({name, id, checked: checked.has(id), pending: pending.has(id), group: name.includes(':') ? name.split(':')[0] : name.startsWith('Identify ') ? 'Countries' : 'Other'}))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {settings, status: state.status, connected: state.authenticated, ready: !!locations.length,
    seed: state.seed, checked: state.checked.length, total: valid.size, locations, counts,
    allowances: allowances(counts), log: state.log, goal: state.goal};
}
function broadcast() {
  chrome.storage.session.set({state, wanted, password});
  const message = {type: 'state', value: snapshot()};
  for (const port of ports) { try { port.postMessage(message); } catch { ports.delete(port); } }
}
function note(text) {
  state.log = [...state.log.slice(-39), {time: Date.now(), text: String(text)}];
}
function send(packet) {
  if (socket?.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify([packet]));
  return true;
}
function closeSocket() {
  generation++;
  clearInterval(heartbeat); clearTimeout(retryTimer);
  chrome.alarms.clear('reconnect');
  if (socket) { socket.onclose = null; socket.close(); socket = undefined; }
  state.connected = false; state.authenticated = false;
}
function retry() {
  if (!wanted) return;
  state.status = 'Connection lost; retrying…';
  chrome.alarms.create('reconnect', {delayInMinutes: 0.5});
  retryTimer = setTimeout(openSocket, 5000);
}
function openSocket() {
  closeSocket();
  const current = generation;
  state.status = 'Connecting…'; broadcast();
  try { socket = new WebSocket(socketAddress(settings.server)); }
  catch (error) { wanted = false; state.status = error.message; broadcast(); return; }
  socket.onmessage = event => {
    if (generation !== current) return;
    try {
      const packets = JSON.parse(event.data);
      if (!Array.isArray(packets)) throw new Error('Invalid AP packet list');
      for (const packet of packets) handle(packet);
    } catch (error) { note(`Protocol error: ${error.message}`); }
    broadcast();
  };
  socket.onerror = () => { if (generation === current) { state.status = 'Connection failed. Check host, port, and ws/wss scheme.'; broadcast(); } };
  socket.onclose = () => { if (generation === current) { state.connected = false; state.authenticated = false; clearInterval(heartbeat); retry(); broadcast(); } };
}
function handle(p) {
  switch (p.cmd) {
    case 'RoomInfo': {
      // Bind pending checks to the server seed. Never replay into a different room.
      if (state.seed && state.seed !== p.seed_name) state = fresh();
      state.seed = p.seed_name;
      state.connected = true; state.status = 'Authenticating…';
      send({cmd: 'Connect', game: settings.game, name: settings.player, password: password || null,
        uuid, version: {major: 0, minor: 6, build: 0, class: 'Version'}, items_handling: 7,
        tags: ['AP', 'GeoRandoExtension'], slot_data: true});
      break;
    }
    case 'Connected':
      state.team = p.team; state.slot = p.slot;
      state.checked = p.checked_locations || []; state.missing = p.missing_locations || [];
      state.authenticated = true; state.status = 'Connected';
      state.pending = state.pending.filter(id => state.missing.includes(id));
      send({cmd: 'GetDataPackage', games: [settings.game]}); send({cmd: 'Sync'});
      if (state.pending.length) send({cmd: 'LocationChecks', locations: state.pending});
      // MV3 requires WebSocket activity within 30 seconds to keep the worker alive.
      clearInterval(heartbeat);
      heartbeat = setInterval(() => send({cmd: 'Bounce', tags: ['GeoRandoExtension'], data: {heartbeat: true}}), 20000);
      note(`Connected to ${settings.player} (${settings.game}).`);
      break;
    case 'DataPackage':
      if (p.data?.games?.[settings.game]) state.package = p.data.games[settings.game];
      else note(`Server did not provide a data package for ${settings.game}.`);
      break;
    case 'ReceivedItems': {
      const merged = mergeItems(state.items, p);
      state.items = merged.items;
      if (merged.sync) send({cmd: 'Sync'});
      break;
    }
    case 'RoomUpdate':
      if (p.checked_locations) {
        state.checked = [...new Set([...state.checked, ...p.checked_locations])];
        state.missing = state.missing.filter(id => !state.checked.includes(id));
        state.pending = state.pending.filter(id => !state.checked.includes(id));
      }
      break;
    case 'ConnectionRefused':
      wanted = false; closeSocket(); state.status = `Connection refused: ${(p.errors || []).join(', ')}`; note(state.status);
      break;
    case 'InvalidPacket': note(`Server rejected a packet: ${p.text || p.type || 'unknown error'}`); break;
    case 'Print': note(p.text); break;
    case 'PrintJSON':
      note((p.data || []).map(part => {
        if (part.type === 'item_id') return Object.entries(state.package.item_name_to_id || {}).find(([, id]) => id === Number(part.text))?.[0] || `item #${part.text}`;
        if (part.type === 'location_id') return Object.entries(state.package.location_name_to_id || {}).find(([, id]) => id === Number(part.text))?.[0] || `location #${part.text}`;
        return part.text || '';
      }).join(''));
      break;
  }
}
async function command(message) {
  await ready;
  if (message.type === 'connect') {
    const next = {server: socketAddress(message.settings.server), player: message.settings.player.trim(), game: message.settings.game.trim()};
    if (!next.player || !/^Manual_GeoGuessr_/i.test(next.game)) throw new Error('Enter your player name and Manual_GeoGuessr_… game name.');
    closeSocket();
    if (JSON.stringify(next) !== JSON.stringify(settings)) state = fresh();
    settings = next; password = message.password || ''; wanted = true;
    await chrome.storage.local.set({settings});
    openSocket();
  } else if (message.type === 'disconnect') {
    wanted = false; password = ''; closeSocket(); state.status = 'Disconnected';
  } else if (message.type === 'check') {
    const id = Number(message.id);
    if (!state.authenticated) throw new Error('Connect before sending a check.');
    if (!state.missing.includes(id)) throw new Error('That check is not missing in this slot.');
    if (state.pending.includes(id)) return;
    state.pending.push(id);
    await chrome.storage.session.set({state});
    send({cmd: 'LocationChecks', locations: [id]});
    note('Check sent; waiting for server confirmation.');
  } else if (message.type === 'goal') {
    if (!state.authenticated) throw new Error('Connect before declaring victory.');
    send({cmd: 'StatusUpdate', status: 30}); state.goal = true; note('Victory declared to Archipelago.');
  }
  broadcast();
}
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'georando-panel' || !/^https:\/\/(www\.)?geoguessr\.com\//.test(port.sender?.url || '')) return;
  ports.add(port); ready.then(() => port.postMessage({type: 'state', value: snapshot()}));
  port.onMessage.addListener(message => command(message).catch(error => port.postMessage({type: 'error', text: error.message})));
  port.onDisconnect.addListener(() => ports.delete(port));
});
chrome.alarms.onAlarm.addListener(async alarm => { await ready; if (alarm.name === 'reconnect' && wanted) openSocket(); });
chrome.action.onClicked.addListener(tab => {
  if (tab.id && /^https:\/\/(www\.)?geoguessr\.com\//.test(tab.url || '')) chrome.tabs.sendMessage(tab.id, {type: 'toggle'}).catch(() => {});
});
