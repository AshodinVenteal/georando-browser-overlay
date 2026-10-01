import test from 'node:test';
import assert from 'node:assert/strict';
import {completedResult, scoreSuggestions} from '../extension/results.js';

const game = {state: 'finished', mapName: 'A Community World', player: {guesses: [4800,3000,2000,1000,200].map(score => ({roundScore: {amount: String(score)}}))}};
test('completed parser accepts classic scores and excludes all true location fields', () => {
  const result = completedResult({...game, rounds: [{lat: 1, lng: 2}]}, 'token');
  assert.equal(result.total, 11000);
  assert.equal(result.best, 4800);
  assert.equal('rounds' in result, false);
  assert.throws(() => completedResult({...game, state: 'started'}, 'token'));
  assert.throws(() => completedResult({...game, player: {guesses: []}}, 'token'));
  assert.throws(() => completedResult({...game, player: {guesses: Array(5).fill({roundScore: {amount: null}})}}, 'token'));
});
test('score checks use exact map, round-only bonuses, decimal thresholds, and server status', () => {
  const names = ['Map: 2k location', 'Map: 4.5k location', 'Map: 5k location', 'Map: 10k round', 'Map: 12k round', 'Other: 2k location', 'Map: 3 country streak'];
  const locations = names.map((name, id) => ({name, id, group: name.split(':')[0]}));
  const result = completedResult(game, 'token');
  assert.deepEqual(scoreSuggestions(result, 'Map', 1000, locations).map(loc => loc.id), [0,1,3,4]);
  locations[0].checked = true; locations[1].pending = true;
  assert.deepEqual(scoreSuggestions(result, 'Map', 0, locations).map(loc => loc.id), [3]);
  assert.throws(() => scoreSuggestions(result, 'Map', -1, locations));
  assert.throws(() => scoreSuggestions({...result, scores: [NaN,1,1,1,1]}, 'Map', 0, locations));
});
