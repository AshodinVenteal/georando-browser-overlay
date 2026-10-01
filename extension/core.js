export function socketAddress(value) {
  const text = String(value).trim();
  if (!text) throw new Error('Enter an AP server address.');
  if (text.includes('://') && !/^wss?:\/\//i.test(text)) throw new Error('Use ws:// or wss:// for AP connections.');
  const url = new URL(/^wss?:\/\//i.test(text) ? text : `ws://${text}`);
  if (!['ws:', 'wss:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error('Use host:port, ws://host:port, or wss://host:port.');
  }
  if (!url.port) url.port = '38281';
  return url.href;
}

export function mergeItems(previous, packet) {
  if (!Number.isInteger(packet.index) || packet.index < 0 || !Array.isArray(packet.items)) throw new Error('Invalid item packet.');
  if (packet.index === 0) return {items: packet.items.slice(), sync: false};
  if (packet.index > previous.length) return {items: previous, sync: true};
  // Replayed packets replace their indexed range instead of duplicating inventory.
  const items = previous.slice();
  items.splice(packet.index, packet.items.length, ...packet.items);
  return {items, sync: false};
}

export function inventory(items, packageData) {
  const names = Object.fromEntries(Object.entries(packageData?.item_name_to_id || {}).map(([name, id]) => [id, name]));
  const counts = {};
  for (const item of items) {
    const name = names[item.item] || `Unknown item #${item.item}`;
    counts[name] = (counts[name] || 0) + 1;
  }
  return counts;
}

export function allowances(counts) {
  const count = name => Object.entries(counts).reduce((n, [key, value]) => n + (key.toLowerCase() === name.toLowerCase() ? value : 0), 0);
  const move = count('Progressive Move');
  return {
    seconds: 10 + 10 * count('+10 seconds'),
    movement: move >= 3 ? 'Unlimited' : move === 2 ? '10 steps' : move === 1 ? '1 step' : 'Locked',
    roundBonus: 100 * count('Score +100') + 10 * count('Score +10'),
    countryBonus: 100 * count('Country Score +100') + 10 * count('Country Score +10'),
    features: ['Pan', 'Zoom', 'Compass', 'Car visibility', 'Terrain Map View', 'Satellite Map View', 'OpenStreetMap View', 'Borders Map View', 'Coverage Overlay', 'Time Machine', 'Show Author Names'].map(name => ({name, unlocked: count(name) > 0}))
  };
}

export function restrictionPolicy(counts, locations, enabled) {
  const a = allowances(counts);
  const has = name => a.features.some(feature => feature.name === name && feature.unlocked);
  const groups = [...new Set(locations.filter(loc => /k (round|location)$/i.test(loc.name)).map(loc => loc.group))];
  return {enabled, pan: has('Pan'), zoom: has('Zoom'), compass: has('Compass'), car: has('Car visibility'),
    seconds: a.seconds, moves: a.movement === 'Unlimited' ? -1 : a.movement === '10 steps' ? 10 : a.movement === '1 step' ? 1 : 0,
    terrain: has('Terrain Map View'), satellite: has('Satellite Map View'),
    unlockedMaps: groups.filter(group => Object.keys(counts).some(name => counts[name] > 0 && (name === group || name.startsWith(`${group}, by `)))),
    knownMaps: groups};
}
