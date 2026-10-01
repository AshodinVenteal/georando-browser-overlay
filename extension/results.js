// GeoGuessr's game endpoint is not a public API. Reject unfamiliar payloads;
// never interpret missing fields as a zero score or guess another player's data.
export function completedResult(game, token) {
  if (!game || game.state !== 'finished') throw new Error('This is not a completed classic game.');
  const guesses = game.player?.guesses;
  if (!Array.isArray(guesses) || guesses.length !== 5) throw new Error('Expected five completed guesses for the current player.');
  const scores = guesses.map(guess => {
    const value = guess.roundScore?.amount;
    if (value === null || value === undefined || value === '') throw new Error('Result score format is unsupported.');
    const score = Number(value);
    if (!Number.isInteger(score) || score < 0 || score > 5000) throw new Error('Invalid location score.');
    return score;
  });
  // Retain scores only: no true coordinates, panoramas, or other-player data.
  return {token, mapName: typeof game.mapName === 'string' ? game.mapName : '', scores,
    total: scores.reduce((sum, score) => sum + score, 0), best: Math.max(...scores)};
}

export function scoreSuggestions(result, group, bonus, locations) {
  if (!result || !Array.isArray(result.scores) || result.scores.length !== 5 ||
      result.scores.some(score => !Number.isInteger(score) || score < 0 || score > 5000)) throw new Error('Capture a supported completed result first.');
  if (!Number.isInteger(bonus) || bonus < 0 || bonus > 100000) throw new Error('Enter a nonnegative whole-number round bonus.');
  const total = result.scores.reduce((sum, score) => sum + score, 0);
  const best = Math.max(...result.scores);
  return locations.filter(loc => {
    if (loc.checked || loc.pending || loc.group !== group) return false;
    const suffix = loc.name.slice(loc.name.indexOf(':') + 1).trim();
    const match = /^(\d+(?:\.\d+)?)k (location|round)$/i.exec(suffix);
    if (!match) return false;
    return (match[2].toLowerCase() === 'location' ? best : total + bonus) >= Number(match[1]) * 1000;
  });
}
