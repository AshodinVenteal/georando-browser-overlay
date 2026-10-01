import test from 'node:test';
import assert from 'node:assert/strict';
import {socketAddress, mergeItems, inventory, allowances} from '../extension/core.js';

test('socket endpoints support hosted, local, explicit TLS and IPv6', () => {
  assert.equal(socketAddress('localhost:38281'), 'ws://localhost:38281/');
  assert.equal(socketAddress('wss://archipelago.gg:12345'), 'wss://archipelago.gg:12345/');
  assert.equal(socketAddress('[::1]:38281'), 'ws://[::1]:38281/');
  assert.throws(() => socketAddress('https://example.com'));
  assert.throws(() => socketAddress(''));
});
test('inventory replay, index-zero resets, and gaps are handled', () => {
  const a = {item: 1}, b = {item: 2};
  assert.deepEqual(mergeItems([a], {index: 1, items: [b]}).items, [a,b]);
  assert.deepEqual(mergeItems([a,b], {index: 1, items: [b]}).items, [a,b]);
  assert.deepEqual(mergeItems([a,b], {index: 0, items: [b]}).items, [b]);
  assert.equal(mergeItems([a], {index: 3, items: [b]}).sync, true);
});
test('world item names produce repeatable allowances without assuming map IDs', () => {
  const counts = inventory([{item: 1}, {item: 1}, {item: 2}], {item_name_to_id: {'+10 seconds': 1, 'Pan': 2}});
  assert.equal(allowances(counts).seconds, 30);
  assert.equal(allowances(counts).features.find(f => f.name === 'Pan').unlocked, true);
  assert.equal(allowances({'Progressive Move': 2}).movement, '10 steps');
  assert.equal(allowances({'Score +100': 3, 'Score +10': 2}).roundBonus, 320);
});
