import test from 'node:test';
import assert from 'node:assert/strict';
import {restrictionPolicy} from '../extension/core.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('AP inventory controls features, movement tiers and creator-qualified maps', () => {
  const locations = [{name: 'Map: 2k location', group: 'Map'}, {name: 'Locked: 5k round', group: 'Locked'}];
  const policy = restrictionPolicy({'Map, by Creator': 1, 'Pan': 1, 'Progressive Move': 2, '+10 seconds': 4}, locations, true);
  assert.deepEqual(policy.unlockedMaps, ['Map']);
  assert.equal(policy.pan, true); assert.equal(policy.zoom, false);
  assert.equal(policy.moves, 10); assert.equal(policy.seconds, 50);
});

test('page adapter enforces POV, zoom, movement budgets, timeout and unlock updates', async () => {
  let now = 0;
  const intervals = [], listeners = {};
  class Viewer {
    constructor() { this.pov = {heading: 20, pitch: 0}; this.zoom = 1; this.pano = 'start'; this.events = {}; }
    addListener(name, callback) { this.events[name] = callback; }
    setOptions(value) { this.options = value; }
    getPov() { return this.pov; } setPov(value) { this.pov = value; this.events.pov_changed?.(); }
    getZoom() { return this.zoom; } setZoom(value) { this.zoom = value; this.events.zoom_changed?.(); }
    getPano() { return this.pano; } setPano(value) { this.pano = value; this.events.pano_changed?.(); }
    getVisible() { return true; }
  }
  const element = () => ({style: {}, isConnected: true, append(...children) { this.children = children; }, addEventListener() {}});
  const fakeWindow = {google: {maps: {StreetViewPanorama: Viewer}}, addEventListener(name, callback) { listeners[name] = callback; }, postMessage() {},
    async fetch() { return {ok: true, clone() { return {async json() { return {state: 'started', round: 1, mapName: 'Map', player: {guesses: []}}; }}; }}; }};
  const context = vm.createContext({window: fakeWindow, document: {documentElement: element(), createElement: element, addEventListener() {}},
    location: {origin: 'https://www.geoguessr.com', pathname: '/game/token'},
    performance: {now: () => now}, Date: {now: () => now}, URL, XMLHttpRequest: function() {},
    getComputedStyle: () => ({position: 'relative'}), setInterval(fn) { intervals.push(fn); }, console});
  // Supply an ordinary constructor so its open method can be wrapped.
  vm.runInContext('XMLHttpRequest = function() {}; XMLHttpRequest.prototype.open = function() {};', context);
  vm.runInContext(readFileSync(new URL('../extension/game-controls.js', import.meta.url), 'utf8'), context);
  intervals[0]();
  const container = element();
  const viewer = new fakeWindow.google.maps.StreetViewPanorama(container);
  const value = {enabled: true, seconds: 10, moves: 1, pan: false, zoom: false, compass: false, car: false, terrain: false, satellite: false, unlockedMaps: ['Map']};
  const update = () => listeners.message({source: fakeWindow, origin: 'https://www.geoguessr.com', data: {channel: 'georando-controls-v1', type: 'policy', value}});
  update();
  await fakeWindow.fetch('/api/v3/games/token'); await new Promise(resolve => setImmediate(resolve));
  now = 1000; intervals.at(-1)();
  viewer.setPov({heading: 90, pitch: 0}); assert.equal(viewer.getPov().heading, 20);
  viewer.setZoom(3); assert.equal(viewer.getZoom(), 1);
  viewer.setPano('step-one'); assert.equal(viewer.getPano(), 'step-one');
  viewer.setPano('step-two'); assert.equal(viewer.getPano(), 'step-one');
  assert.equal(viewer.options.clickToGo, false);
  value.moves = 10; value.pan = true; value.zoom = true; update();
  viewer.setPano('step-two'); assert.equal(viewer.getPano(), 'step-two');
  viewer.setPov({heading: 90, pitch: 0}); assert.equal(viewer.getPov().heading, 90);
  viewer.setZoom(3); assert.equal(viewer.getZoom(), 3);
  now = 11000; intervals.at(-1)();
  assert.equal(container.children.at(-1).style.display, 'flex');
  assert.match(container.children.at(-1).textContent, /time is up/);
});
