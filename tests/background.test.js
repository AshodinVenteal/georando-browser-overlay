import test from 'node:test';
import assert from 'node:assert/strict';

class Event {
  callbacks = [];
  addListener(callback) { this.callbacks.push(callback); }
  emit(...args) { for (const callback of this.callbacks) callback(...args); }
}
class Socket {
  static OPEN = 1;
  static instances = [];
  readyState = 1;
  sent = [];
  constructor(url) { this.url = url; Socket.instances.push(this); }
  send(value) { this.sent.push(...JSON.parse(value)); }
  close() { this.readyState = 3; this.onclose?.(); }
  receive(packet) { this.onmessage({data: JSON.stringify([packet])}); }
}
const local = {}, session = {};
const storage = data => ({
  async get(keys) { return Object.fromEntries(keys.filter(key => key in data).map(key => [key, structuredClone(data[key])])); },
  async set(values) { Object.assign(data, structuredClone(values)); }
});
globalThis.chrome = {
  storage: {local: storage(local), session: storage(session)},
  runtime: {onConnect: new Event()},
  alarms: {onAlarm: new Event(), clear() {}, create() {}},
  action: {onClicked: new Event()},
  tabs: {sendMessage: async () => {}}
};
globalThis.WebSocket = Socket;
await import('../extension/background.js');
const tick = () => new Promise(resolve => setImmediate(resolve));
let messages = [];
const port = {name: 'georando-panel', sender: {url: 'https://www.geoguessr.com/game/test'},
  onMessage: new Event(), onDisconnect: new Event(), postMessage(message) { messages.push(structuredClone(message)); }};
chrome.runtime.onConnect.emit(port);
await tick();
const command = async message => { port.onMessage.emit(message); await tick(); };
const latest = () => messages.filter(message => message.type === 'state').at(-1).value;
const settings = {server: 'localhost:38281', player: 'Tester', game: 'Manual_GeoGuessr_Tester'};
const pkg = {item_name_to_id: {'Pan': 10}, location_name_to_id: {'Identify France': 101, 'Map: 2k location': 102, 'Unused': 999}};

test('AP handshake, exact world package, inventory sync and server confirmation', async () => {
  await command({type: 'connect', settings, password: 'test'});
  const socket = Socket.instances.at(-1);
  assert.equal(socket.sent.length, 0, 'authentication waits for RoomInfo');
  socket.receive({cmd: 'RoomInfo', seed_name: 'seed-one'});
  assert.equal(socket.sent[0].game, settings.game);
  assert.equal(socket.sent[0].items_handling, 7);
  socket.receive({cmd: 'Connected', team: 0, slot: 1, missing_locations: [101,102], checked_locations: []});
  socket.receive({cmd: 'DataPackage', data: {games: {[settings.game]: pkg}}});
  socket.receive({cmd: 'ReceivedItems', index: 0, items: [{item: 10}]});
  socket.receive({cmd: 'ReceivedItems', index: 0, items: [{item: 10}]});
  assert.equal(latest().counts.Pan, 1);
  assert.equal(latest().locations.length, 2, 'only checks belonging to this slot are shown');
  await command({type: 'check', id: 101});
  assert.equal(latest().checked, 0, 'sending does not prematurely mark the check confirmed');
  assert.equal(latest().locations.find(loc => loc.id === 101).pending, true);
  socket.receive({cmd: 'RoomUpdate', checked_locations: [101]});
  assert.equal(latest().checked, 1);
  assert.equal(latest().locations.find(loc => loc.id === 101).pending, false);
  await command({type: 'check', id: 999});
  assert.equal(messages.at(-1).type, 'error');
  const completed = {state: 'finished', mapName: 'Map', player: {guesses: [2500,100,100,100,100].map(amount => ({roundScore: {amount}}))}};
  await command({type: 'result', token: 'test', game: completed});
  const result = messages.at(-1).value;
  assert.equal(messages.at(-1).type, 'result');
  await command({type: 'score-checks', result, group: 'Map', bonus: 0});
  assert.deepEqual(socket.sent.at(-1), {cmd: 'LocationChecks', locations: [102]});
  assert.equal(latest().checked, 1);
  socket.receive({cmd: 'RoomUpdate', checked_locations: [102]});
  assert.equal(latest().checked, 2);
  await command({type: 'goal'});
  assert.deepEqual(socket.sent.at(-1), {cmd: 'StatusUpdate', status: 30});
  await command({type: 'disconnect'});
});

test('pending checks replay in the same seed but never in another seed', async () => {
  await command({type: 'connect', settings});
  let socket = Socket.instances.at(-1);
  socket.receive({cmd: 'RoomInfo', seed_name: 'seed-one'});
  socket.receive({cmd: 'Connected', team: 0, slot: 1, missing_locations: [102], checked_locations: [101]});
  await command({type: 'check', id: 102});
  await command({type: 'disconnect'});
  await command({type: 'connect', settings});
  socket = Socket.instances.at(-1);
  socket.receive({cmd: 'RoomInfo', seed_name: 'seed-one'});
  socket.receive({cmd: 'Connected', team: 0, slot: 1, missing_locations: [102], checked_locations: [101]});
  assert.ok(socket.sent.some(packet => packet.cmd === 'LocationChecks' && packet.locations.includes(102)));
  await command({type: 'disconnect'});
  await command({type: 'connect', settings});
  socket = Socket.instances.at(-1);
  socket.receive({cmd: 'RoomInfo', seed_name: 'seed-two'});
  socket.receive({cmd: 'Connected', team: 0, slot: 1, missing_locations: [102], checked_locations: []});
  assert.equal(socket.sent.some(packet => packet.cmd === 'LocationChecks'), false);
  assert.equal(latest().goal, false);
  await command({type: 'disconnect'});
});
