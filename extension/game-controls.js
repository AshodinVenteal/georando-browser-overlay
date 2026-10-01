(() => {
  // Runs in the page world solely to control viewers. AP credentials and commands
  // remain in the extension world; this bridge never sends location checks.
  let policy = {enabled: false}, round = null, deadline = 0, settlingUntil = 0;
  const viewers = new Set(), maps = new Set(), wrapped = new WeakSet();
  const channel = 'georando-controls-v1';
  const active = () => policy.enabled && /^\/game\/[\w-]+\/?$/.test(location.pathname);
  const mapUnlocked = () => round && policy.unlockedMaps?.some(name => name === round.mapName || name.split(', by ')[0] === round.mapName);
  function emit(type, value) { window.postMessage({channel, type, value}, location.origin); }
  function observeGame(game, token) {
    if (!game || typeof game.state !== 'string' || !Number.isInteger(game.round) || game.round < 1 || game.round > 5) return;
    const guesses = game.player?.guesses;
    if (!Array.isArray(guesses)) return;
    const key = `${token}:${game.round}`;
    if (game.state === 'finished' || guesses.length >= game.round) {
      if (round?.key === key) round.done = true;
      return;
    }
    if (round?.key === key) return;
    round = {key, token, number: game.round, mapName: typeof game.mapName === 'string' ? game.mapName : '', done: false};
    settlingUntil = performance.now() + 800;
    deadline = Date.now() + (policy.seconds || 10) * 1000;
    for (const viewer of viewers) { viewer.steps = 0; viewer.pano = null; viewer.pov = null; viewer.zoom = null; }
  }
  // Passive observation: clone existing game responses, never request active
  // round coordinates or inspect the location list.
  function gameEndpoint(url) {
    try { const parsed = new URL(url, location.origin); return parsed.origin === location.origin && /^\/api\/v3\/games\/([\w-]+)(?:\/guess)?$/.exec(parsed.pathname); } catch { return null; }
  }
  const originalFetch = window.fetch;
  window.fetch = async function(input, init) {
    const match = gameEndpoint(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
    const response = await originalFetch.call(this, input, init);
    if (match && response.ok) response.clone().json().then(game => observeGame(game, match[1])).catch(() => {});
    return response;
  };
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    const match = gameEndpoint(url);
    if (match) this.addEventListener('load', () => {
      try { if (this.status >= 200 && this.status < 300) observeGame(this.responseType === 'json' ? this.response : JSON.parse(this.responseText), match[1]); } catch {}
    }, {once: true});
    return originalOpen.call(this, method, url, ...rest);
  };
  function options(record) {
    if (!active()) return;
    const moving = mapUnlocked() && !round.done && (policy.moves === -1 || record.steps < policy.moves);
    record.viewer.setOptions({clickToGo: moving, linksControl: moving, panControl: policy.pan,
      zoomControl: policy.zoom, scrollwheel: policy.zoom, disableDoubleClickZoom: !policy.zoom,
      motionTracking: false, motionTrackingControl: false});
  }
  function register(viewer, container) {
    const record = {viewer, container, steps: 0, pano: null, pov: null, zoom: null, reverting: false};
    viewers.add(record);
    const mask = document.createElement('div');
    mask.style.cssText = 'position:absolute;inset:0;background:#111923;color:white;z-index:1000;display:none;align-items:center;justify-content:center;font:600 18px system-ui;text-align:center;padding:20px;';
    const car = document.createElement('div');
    car.style.cssText = 'position:absolute;bottom:0;left:0;right:0;height:32%;background:#111923;z-index:999;pointer-events:none;display:none;';
    record.mask = mask; record.car = car;
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.append(car, mask);
    viewer.addListener('pov_changed', () => {
      if (!active() || record.reverting || !record.pov || performance.now() < settlingUntil) return;
      if (!policy.pan) {
        const pov = viewer.getPov();
        if (pov.heading !== record.pov.heading || pov.pitch !== record.pov.pitch) {
          record.reverting = true; viewer.setPov(record.pov); record.reverting = false;
        }
      } else record.pov = {...viewer.getPov()};
    });
    viewer.addListener('zoom_changed', () => {
      if (!active() || record.reverting || record.zoom === null || performance.now() < settlingUntil) return;
      if (!policy.zoom && viewer.getZoom() !== record.zoom) {
        record.reverting = true; viewer.setZoom(record.zoom); record.reverting = false;
      } else if (policy.zoom) record.zoom = viewer.getZoom();
    });
    viewer.addListener('pano_changed', () => {
      const pano = viewer.getPano();
      if (!active() || record.reverting || !record.pano || performance.now() < settlingUntil) return;
      if (pano === record.pano) return;
      if (policy.moves !== -1 && record.steps >= policy.moves) {
        record.reverting = true; viewer.setPano(record.pano); record.reverting = false;
      } else { record.steps++; record.pano = pano; record.pov = {...viewer.getPov()}; }
      options(record);
    });
    // Capture pointer input while syncing, locked-map, timed-out, or settling.
    const block = event => {
      if (!active()) return;
      const waiting = !round || !mapUnlocked() || performance.now() < settlingUntil || (!round.done && Date.now() >= deadline);
      const panInput = ['pointerdown', 'touchstart'].includes(event.type) && !policy.pan && policy.moves === 0;
      if (waiting || panInput || (event.type === 'wheel' && !policy.zoom)) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    for (const type of ['pointerdown', 'touchstart', 'wheel', 'dblclick']) container.addEventListener(type, block, {capture: true, passive: false});
  }
  function hook() {
    const api = window.google?.maps;
    if (!api) return;
    for (const key of ['StreetViewPanorama', 'Map']) {
      const ctor = api[key];
      if (typeof ctor !== 'function' || wrapped.has(ctor)) continue;
      const proxy = new Proxy(ctor, {construct(target, args, receiver) {
        const instance = Reflect.construct(target, args, receiver);
        if (key === 'StreetViewPanorama') register(instance, args[0]);
        else {
          maps.add(instance);
          instance.addListener('maptypeid_changed', () => {
            if (!active()) return;
            const type = instance.getMapTypeId();
            if ((type === 'terrain' && !policy.terrain) || (['satellite', 'hybrid'].includes(type) && !policy.satellite) || !['roadmap','terrain','satellite','hybrid'].includes(type)) instance.setMapTypeId('roadmap');
          });
        }
        return instance;
      }});
      wrapped.add(proxy); api[key] = proxy;
    }
  }
  document.addEventListener('load', hook, true);
  setInterval(hook, 25);
  let previousStatus = '', style;
  function tick() {
    hook();
    if (!style && document.documentElement) {
      style = document.createElement('style'); document.documentElement.append(style);
    }
    if (style) style.textContent = active() && !policy.compass ? '[class*="compass_compass"],[class*="compass_container"],[data-qa="compass"]{visibility:hidden!important}' : '';
    for (const map of maps) {
      if (!active()) continue;
      const type = map.getMapTypeId();
      if ((type === 'terrain' && !policy.terrain) || (['satellite', 'hybrid'].includes(type) && !policy.satellite)) map.setMapTypeId('roadmap');
    }
    let visible = 0;
    for (const record of viewers) {
      if (!record.container.isConnected) { viewers.delete(record); continue; }
      if (active() && record.viewer.getVisible()) visible++;
      options(record);
      const running = active() && round && !round.done;
      const locked = active() && round && !mapUnlocked();
      const waiting = active() && !round;
      const expired = running && Date.now() >= deadline;
      record.mask.textContent = waiting ? 'AP: waiting for classic round state. Reload the game after connecting.' : locked ? 'AP: this map is locked or its name could not be matched.' : 'AP time is up — place your guess on the map.';
      record.mask.style.display = waiting || locked || expired ? 'flex' : 'none';
      record.car.style.display = active() && !policy.car ? 'block' : 'none';
      if (performance.now() >= settlingUntil && !record.pano) {
        record.pano = record.viewer.getPano(); record.pov = {...record.viewer.getPov()}; record.zoom = record.viewer.getZoom();
      }
    }
    const status = !policy.enabled ? 'Waiting for AP inventory' : !active() ? 'Restrictions apply to classic /game/ pages' : !visible ? 'Viewer not detected — reload the game' : !round ? 'Waiting for round state' : !mapUnlocked() ? 'Map locked or unmatched' : round.done ? 'Round finished' : `Applied · ${Math.max(0, Math.ceil((deadline-Date.now())/1000))}s · ${policy.moves === -1 ? 'unlimited moves' : `${Math.max(0, policy.moves - Math.max(0, ...[...viewers].map(v => v.steps)))} moves left`}`;
    if (status !== previousStatus) { previousStatus = status; emit('status', status); }
  }
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.channel !== channel || event.data.type !== 'policy') return;
    const next = event.data.value;
    if (!next || typeof next.enabled !== 'boolean' || !Number.isFinite(next.seconds) || !Number.isInteger(next.moves)) return;
    if (!policy.enabled && next.enabled && round && !round.done) deadline = Date.now() + next.seconds * 1000;
    else if (policy.enabled && next.enabled && round && !round.done) deadline += (next.seconds - policy.seconds) * 1000;
    policy = next;
    if (event.data.mapType && ['roadmap','terrain','satellite','hybrid'].includes(event.data.mapType)) {
      const type = event.data.mapType;
      if (type === 'roadmap' || (type === 'terrain' && policy.terrain) || (['satellite','hybrid'].includes(type) && policy.satellite)) for (const map of maps) map.setMapTypeId(type);
    }
    tick();
  });
  setInterval(tick, 250);
})();
