(() => {
  if (document.getElementById('georando-ap-host')) return;
  const host = document.createElement('div');
  host.id = 'georando-ap-host';
  host.style.cssText = 'position:fixed;top:100px;left:16px;z-index:2147483647;pointer-events:none;';
  const root = host.attachShadow({mode: 'closed'});
  root.innerHTML = `
    <style>
      :host{all:initial;color-scheme:dark}*{box-sizing:border-box}
      .panel{width:min(380px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;background:#141920f5;color:#edf3fa;border:1px solid #465365;border-radius:12px;box-shadow:0 8px 32px #0007;font:14px/1.4 system-ui,sans-serif}
      .panel,.badge{pointer-events:auto;transition:opacity .18s ease}
      .playing .panel,.playing .badge{opacity:var(--play-opacity,.25)}
      .playing .panel:hover,.playing .panel:focus-within,.playing .badge:hover,.playing .badge:focus-visible{opacity:1}
      .drag-handle{cursor:grab;touch-action:none;user-select:none}.dragging .drag-handle{cursor:grabbing}
      .badge{max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:13px/1.4 system-ui,sans-serif}
      .badge-grip{padding:3px 8px;display:inline-block;border-right:1px solid #465365;margin-right:6px}
      .checkbox{display:flex;gap:8px;align-items:center}.checkbox input{width:auto}
      input[type=range]{padding:0}
      @media(prefers-reduced-motion:reduce){.panel,.badge{transition:none}}
      header{display:flex;align-items:center;gap:8px;padding:10px;background:#202a36;position:sticky;top:0;z-index:1}header strong{flex:1}header button{width:auto;padding:4px 9px}
      section{padding:12px;border-top:1px solid #344152}h2{font-size:14px;margin:0 0 8px}p{margin:6px 0}small,.muted{color:#a7b6c9;font-size:12px}
      label{display:block;font-size:12px;margin:8px 0 4px}input,button,select{font:inherit;background:#0f141c;color:#edf3fa;border:1px solid #465365;border-radius:6px;padding:7px;width:100%}button{cursor:pointer}button:hover{border-color:#7cdbac}button:disabled{opacity:.5;cursor:default}.primary{background:#25563e}.row{display:flex;gap:6px;margin-top:8px}.row>*{flex:1}
      summary{cursor:pointer;font-weight:600}.status{color:#ffc978;overflow-wrap:anywhere}.connected{color:#7cdbac}.error{color:#ff9898}.list{max-height:260px;overflow:auto;display:grid;gap:6px;margin-top:8px}.check{text-align:left}.done{text-decoration:line-through;opacity:.5}.item{display:flex;justify-content:space-between;border-bottom:1px solid #344152;padding:4px;gap:10px}.feature{display:inline-block;padding:3px 6px;background:#26323f;border-radius:5px;margin:3px;color:#a7b6c9}.unlocked{color:#7cdbac}.log{max-height:140px;overflow:auto;font-size:12px;overflow-wrap:anywhere}.log p{padding-bottom:4px;border-bottom:1px solid #344152}.hidden{display:none!important}.badge{width:auto;background:#202a36;padding:9px 13px;box-shadow:0 4px 20px #0006}
    </style>
    <div id="shell"><button class="badge hidden" id="badge" title="Open AP panel; drag the grip to reposition"><span class="badge-grip drag-handle" id="badge-grip">⠿</span>AP · <span id="badge-status">Disconnected</span></button>
    <div class="panel" id="panel">
      <header id="drag-header" class="drag-handle"><strong>GeoRando AP</strong><button id="dock" title="Move to the other side">⇄</button><button id="collapse" title="Collapse panel">−</button></header>
      <section><details><summary>Overlay appearance</summary>
        <label class="checkbox"><input type="checkbox" id="auto-collapse" checked>Collapse on game pages; expand on results</label>
        <label for="play-opacity">Visibility while playing: <span id="opacity-label">25%</span></label><input id="play-opacity" type="range" min="5" max="100" step="5" value="25">
        <p class="muted">Drag the header or badge grip to move the overlay. Hover or focus restores full visibility. Alt+Shift+G toggles the panel.</p>
        <button id="reset-position">Reset position</button>
      </details></section>
      <section><div id="status" class="status">Disconnected</div><div class="muted" id="progress"></div><p id="error" class="error" role="alert"></p></section>
      <section><details id="connection-settings" open><summary>Connection</summary>
        <label for="server">AP server</label><input id="server" placeholder="host:port or wss://host:port">
        <label for="player">Player / slot name</label><input id="player" autocomplete="off">
        <label for="game">Generated game name</label><input id="game" placeholder="Manual_GeoGuessr_arborelia">
        <small>Use the exact game name from your GeoRando YAML.</small>
        <label for="password">Room password (optional)</label><input id="password" type="password" autocomplete="off">
        <div class="row"><button class="primary" id="connect">Connect</button><button id="disconnect">Disconnect</button></div>
      </details></section>
      <section><h2>AP game controls</h2><p id="controls-status" class="status">Waiting for AP inventory</p><div id="allowances" class="muted">Connect to load received items.</div>
        <label for="map-view">Guess map view</label><select id="map-view"><option value="roadmap">Road map</option><option value="terrain">Terrain (locked)</option><option value="satellite">Satellite (locked)</option><option value="hybrid">Hybrid (locked)</option></select>
        <p class="muted">Automatic controls support classic /game/ pages. Connect before starting, and reload an existing game to attach controls. Car visibility uses an experimental lower-image cover. Traps and non-Google map views are not enforced yet.</p>
      </section>
      <section><details><summary>Completed-game score checks (experimental)</summary>
        <p class="muted">On a classic /results/ page, read your completed game, select its AP map, and review the suggested checks.</p>
        <button id="capture">Read completed result</button><p id="result-summary" class="muted">No result captured.</p>
        <label for="result-map">AP map for this result</label><select id="result-map"><option value="">Choose map…</option></select>
        <label for="result-bonus">Round bonus earned before playing (including country bonus if applicable)</label><input id="result-bonus" type="number" min="0" step="1" value="0">
        <p class="muted">Enter the bonus applicable to this run. It never applies to individual location scores.</p>
        <div id="suggestions" class="list"></div><button id="submit-result" disabled>Review and send score checks…</button>
        <p class="muted">Country, streak, and medal checks still use the manual checklist.</p>
      </details></section>
      <section><h2>Checks</h2><input id="search" placeholder="Search country, map, score…" aria-label="Search checks"><div class="row"><select id="group" aria-label="Check group"><option value="">All groups</option></select><button id="completed">Show completed</button></div><div id="checks" class="list"></div><p class="muted" id="check-count"></p></section>
      <section><details><summary>Received items</summary><div id="items" class="list"></div></details></section>
      <section><details><summary>AP messages</summary><div id="log" class="log"></div></details></section>
      <section><button id="goal">Declare victory…</button><p class="muted">Use after meeting your generated world's medal goal.</p></section>
    </div></div>`;
  const $ = id => root.getElementById(id);
  let port, state, initialized = false, showCompleted = false, collapsed = false, confirmId = null;
  let appearance = {autoCollapse: true, opacity: 25, x: 16, y: 100};
  let route = '', dragging = null, suppressBadgeClick = false, saveTimer;
  let result = null, capturePath = '', candidates = [], loading = false;
  const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  function applyGamePolicy(mapType) {
    if (state?.restrictions) window.postMessage({channel: 'georando-controls-v1', type: 'policy', value: state.restrictions, mapType}, location.origin);
  }
  window.addEventListener('message', event => {
    if (event.source === window && event.origin === location.origin && event.data?.channel === 'georando-controls-v1' && event.data.type === 'status' && typeof event.data.value === 'string') $('controls-status').textContent = event.data.value;
  });
  $('map-view').onchange = () => applyGamePolicy($('map-view').value);
  setInterval(() => applyGamePolicy(), 1000);
  function attach() {
    const target = document.fullscreenElement || document.body;
    if (target && host.parentElement !== target) target.append(host);
  }
  attach();
  document.addEventListener('fullscreenchange', () => { attach(); position(); });
  function saveAppearance() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => chrome.storage.local.set({overlayAppearance: appearance}).catch(() => {}), 200);
  }
  function position() {
    const visible = collapsed ? $('badge') : $('panel');
    const width = visible.getBoundingClientRect().width || 250;
    const x = Math.max(8, Math.min(appearance.x, Math.max(8, innerWidth - width - 8)));
    const y = Math.max(8, Math.min(appearance.y, Math.max(8, innerHeight - 60)));
    host.style.left = `${x}px`; host.style.top = `${y}px`; host.style.right = 'auto';
    $('panel').style.maxHeight = `${Math.max(60, innerHeight - y - 8)}px`;
  }
  function setCollapsed(value) {
    collapsed = value;
    $('panel').classList.toggle('hidden', collapsed); $('badge').classList.toggle('hidden', !collapsed);
    position();
  }
  function toggle() { setCollapsed(!collapsed); }
  $('collapse').onclick = toggle;
  $('badge').onclick = () => { if (suppressBadgeClick) { suppressBadgeClick = false; return; } toggle(); };
  $('dock').onclick = () => {
    const rect = host.getBoundingClientRect();
    appearance.x = rect.left < innerWidth / 2 ? innerWidth - (collapsed ? 250 : 380) - 16 : 16;
    position(); saveAppearance();
  };
  function routeAppearance(force = false) {
    const path = location.pathname;
    if (!force && route === path) return;
    route = path;
    // Route detection is deliberately independent of GeoGuessr's unstable CSS.
    const playing = /^\/(game|challenge|duels|battle-royale|live-challenge)(\/|$)/.test(path);
    $('shell').classList.toggle('playing', playing);
    if (appearance.autoCollapse) {
      if (playing) setCollapsed(true);
      else if (/^\/results(\/|$)/.test(path)) setCollapsed(false);
    }
  }
  function applyAppearance() {
    $('auto-collapse').checked = appearance.autoCollapse;
    $('play-opacity').value = appearance.opacity;
    $('opacity-label').textContent = `${appearance.opacity}%`;
    host.style.setProperty('--play-opacity', String(appearance.opacity / 100));
    position(); routeAppearance(true);
  }
  $('auto-collapse').onchange = () => { appearance.autoCollapse = $('auto-collapse').checked; applyAppearance(); saveAppearance(); };
  $('play-opacity').oninput = () => {
    appearance.opacity = Number($('play-opacity').value);
    $('opacity-label').textContent = `${appearance.opacity}%`;
    host.style.setProperty('--play-opacity', String(appearance.opacity / 100)); saveAppearance();
  };
  $('reset-position').onclick = () => { appearance.x = 16; appearance.y = 100; position(); saveAppearance(); };
  for (const handle of [$('drag-header'), $('badge-grip')]) {
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('button') && handle.id !== 'badge-grip') return;
      const rect = host.getBoundingClientRect();
      dragging = {pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: rect.left, y: rect.top, moved: false};
      handle.setPointerCapture(event.pointerId); $('panel').classList.add('dragging'); event.preventDefault();
    });
    handle.addEventListener('pointermove', event => {
      if (!dragging || event.pointerId !== dragging.pointerId) return;
      const dx = event.clientX - dragging.startX, dy = event.clientY - dragging.startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) dragging.moved = true;
      appearance.x = Math.max(8, dragging.x + dx); appearance.y = Math.max(8, dragging.y + dy); position();
    });
    function finishDrag(event) {
      if (!dragging || event.pointerId !== dragging.pointerId) return;
      suppressBadgeClick = handle.id === 'badge-grip' && dragging.moved;
      if (suppressBadgeClick) setTimeout(() => { suppressBadgeClick = false; }, 100);
      const rect = host.getBoundingClientRect(); appearance.x = rect.left; appearance.y = rect.top;
      dragging = null; $('panel').classList.remove('dragging'); saveAppearance();
    }
    handle.addEventListener('pointerup', finishDrag); handle.addEventListener('pointercancel', finishDrag);
  }
  window.addEventListener('resize', position);
  document.addEventListener('keydown', event => {
    if (event.altKey && event.shiftKey && event.code === 'KeyG' && !event.repeat) { event.preventDefault(); toggle(); }
  });
  chrome.storage.local.get('overlayAppearance').then(saved => {
    const value = saved.overlayAppearance;
    if (value) appearance = {autoCollapse: typeof value.autoCollapse === 'boolean' ? value.autoCollapse : true,
      opacity: Number.isFinite(value.opacity) ? Math.min(100, Math.max(5, value.opacity)) : 25,
      x: Number.isFinite(value.x) ? value.x : 16, y: Number.isFinite(value.y) ? value.y : 100};
    applyAppearance();
  }).catch(() => applyAppearance());
  applyAppearance();
  setInterval(() => { routeAppearance(); attach(); }, 500);
  chrome.runtime.onMessage.addListener(message => { if (message.type === 'toggle') toggle(); });
  function send(message) {
    $('error').textContent = '';
    try { port.postMessage(message); } catch { $('error').textContent = 'Extension connection unavailable. Reload the GeoGuessr tab.'; }
  }
  $('connect').onclick = () => send({type: 'connect', settings: {server: $('server').value, player: $('player').value, game: $('game').value}, password: $('password').value});
  $('disconnect').onclick = () => { $('password').value = ''; send({type: 'disconnect'}); };
  $('capture').onclick = async () => {
    const match = /^\/results\/([A-Za-z0-9_-]+)\/?$/.exec(location.pathname);
    if (!match) { $('error').textContent = 'Open the completed classic game results page first.'; return; }
    loading = true; result = null; renderResult();
    capturePath = location.pathname;
    const path = capturePath;
    try {
      const response = await fetch(`/api/v3/games/${encodeURIComponent(match[1])}`, {credentials: 'same-origin', signal: AbortSignal.timeout(10000)});
      if (!response.ok) throw new Error(`GeoGuessr returned HTTP ${response.status}.`);
      const game = await response.json();
      if (location.pathname !== path) throw new Error('The page changed; read the result again.');
      // Send only the fields the parser needs, excluding true-location data.
      send({type: 'result', token: match[1], game: {state: game.state, mapName: game.mapName,
        player: {guesses: game.player?.guesses?.map(guess => ({roundScore: guess.roundScore}))}}});
    } catch (error) { $('error').textContent = `${error.message} Use manual checks if this result format is unsupported.`; }
    finally { loading = false; renderResult(); }
  };
  $('result-map').onchange = renderResult;
  $('result-bonus').oninput = renderResult;
  function renderResult() {
    if (!state) return;
    $('capture').disabled = loading;
    if (result && location.pathname !== capturePath) result = null;
    $('result-summary').textContent = loading ? 'Reading completed scores…' : result ? `${result.mapName || 'Unknown map'} · ${result.total} total · ${result.best} best location` : 'No result captured.';
    candidates = [];
    const group = $('result-map').value, bonus = Number($('result-bonus').value);
    if (result && group && Number.isInteger(bonus) && bonus >= 0 && bonus <= 100000) {
      candidates = state.locations.filter(loc => {
        if (loc.checked || loc.pending || loc.group !== group) return false;
        const match = /^(\d+(?:\.\d+)?)k (location|round)$/i.exec(loc.name.slice(loc.name.indexOf(':') + 1).trim());
        return match && (match[2].toLowerCase() === 'location' ? result.best : result.total + bonus) >= Number(match[1]) * 1000;
      });
    }
    $('suggestions').innerHTML = candidates.map(loc => `<div class="item">${escape(loc.name)}</div>`).join('');
    $('submit-result').disabled = !state.connected || !candidates.length;
  }
  $('submit-result').onclick = () => {
    renderResult();
    if (!candidates.length) return;
    if (confirm(`Confirm this AP map and bonus are correct and you followed your unlock restrictions. Send these ${candidates.length} checks?\n\n${candidates.map(loc => loc.name).join('\n')}`)) {
      send({type: 'score-checks', result, group: $('result-map').value, bonus: Number($('result-bonus').value)});
    }
  };
  setInterval(() => { if (result && location.pathname !== capturePath) { result = null; renderResult(); } }, 1000);
  $('goal').onclick = () => {
    if (confirm('Have you met your GeoRando medal goal? This declares victory to the AP server.')) send({type: 'goal'});
  };
  $('search').oninput = () => { confirmId = null; renderChecks(); };
  $('group').onchange = () => { confirmId = null; renderChecks(); };
  $('completed').onclick = () => { showCompleted = !showCompleted; $('completed').textContent = showCompleted ? 'Hide completed' : 'Show completed'; renderChecks(); };
  function renderChecks() {
    if (!state) return;
    const query = $('search').value.toLowerCase(), group = $('group').value;
    const checks = state.locations.filter(loc => (showCompleted || !loc.checked) && (!group || loc.group === group) && loc.name.toLowerCase().includes(query));
    $('checks').innerHTML = checks.slice(0, 100).map(loc => `<button class="check ${loc.checked ? 'done' : ''}" data-id="${loc.id}" ${!state.connected || loc.checked || loc.pending ? 'disabled' : ''}>${escape(loc.name)}<br><small>${loc.checked ? 'Confirmed by server' : loc.pending ? 'Awaiting server confirmation' : confirmId === loc.id ? 'Click again to confirm this check' : 'Mark complete…'}</small></button>`).join('');
    $('check-count').textContent = !state.ready ? 'Connect to load checks for your slot.' : checks.length > 100 ? `Showing 100 of ${checks.length}; narrow your search.` : `${checks.length} matching checks`;
  }
  $('checks').onclick = event => {
    const button = event.target.closest('button[data-id]');
    if (!button || button.disabled) return;
    const id = Number(button.dataset.id);
    if (confirmId === id) { confirmId = null; send({type: 'check', id}); }
    else { confirmId = id; renderChecks(); }
  };
  function render(value) {
    if (value.connected && !state?.connected) $('connection-settings').open = false;
    if (state && (state.seed !== value.seed || JSON.stringify(state.settings) !== JSON.stringify(value.settings))) {
      result = null;
      $('result-bonus').value = '0';
      $('result-map').value = '';
    }
    state = value;
    if (!initialized) {
      ['server', 'player', 'game'].forEach(key => $(key).value = state.settings[key]);
      initialized = true;
    }
    $('status').textContent = state.status; $('status').className = 'status' + (state.connected ? ' connected' : '');
    $('badge-status').textContent = state.connected ? `${state.checked}/${state.total}` : state.status;
    $('progress').textContent = state.seed ? `${state.checked}/${state.total} checks · ${state.seed}` : '';
    const selected = $('group').value;
    const groups = [...new Set(state.locations.map(loc => loc.group))].sort();
    $('group').innerHTML = '<option value="">All groups</option>' + groups.map(group => `<option value="${escape(group)}">${escape(group)}</option>`).join('');
    if (groups.includes(selected)) $('group').value = selected;
    const selectedMap = $('result-map').value;
    $('result-map').innerHTML = '<option value="">Choose map…</option>' + groups.filter(group => state.locations.some(loc => loc.group === group && /k (location|round)$/i.test(loc.name))).map(group => `<option value="${escape(group)}">${escape(group)}</option>`).join('');
    if (groups.includes(selectedMap)) $('result-map').value = selectedMap;
    const a = state.allowances;
    for (const option of $('map-view').options) {
      const allowed = option.value === 'roadmap' || (option.value === 'terrain' ? state.restrictions.terrain : state.restrictions.satellite);
      option.disabled = !allowed;
      option.textContent = ({roadmap: 'Road map', terrain: 'Terrain', satellite: 'Satellite', hybrid: 'Hybrid'}[option.value]) + (allowed ? '' : ' (locked)');
    }
    if ($('map-view').selectedOptions[0]?.disabled) $('map-view').value = 'roadmap';
    applyGamePolicy();
    $('allowances').innerHTML = `<p>Time: <strong>${a.seconds}s</strong> · Move: <strong>${escape(a.movement)}</strong></p><p>Round bonus: +${a.roundBonus} · Country bonus: +${a.countryBonus}</p>` + a.features.map(f => `<span class="feature ${f.unlocked ? 'unlocked' : ''}">${f.unlocked ? '✓' : '🔒'} ${escape(f.name)}</span>`).join('');
    $('items').innerHTML = Object.entries(state.counts).sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => `<div class="item"><span>${escape(name)}</span><strong>×${count}</strong></div>`).join('') || '<p class="muted">No items received.</p>';
    $('log').innerHTML = state.log.slice().reverse().map(entry => `<p>${escape(new Date(entry.time).toLocaleTimeString())} · ${escape(entry.text)}</p>`).join('');
    $('goal').disabled = !state.connected || state.goal;
    $('goal').textContent = state.goal ? 'Victory declared' : 'Declare victory…';
    renderChecks();
    renderResult();
    position();
  }
  function connectPort() {
    try {
      port = chrome.runtime.connect({name: 'georando-panel'});
      port.onMessage.addListener(message => {
        if (message.type === 'state') render(message.value);
        else if (message.type === 'error') $('error').textContent = message.text;
        else if (message.type === 'result' && location.pathname === capturePath) { result = message.value; renderResult(); }
      });
      port.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError;
        $('status').textContent = 'Reconnecting to extension…';
        if (state) { state.connected = false; renderChecks(); }
        if (chrome.runtime.id) setTimeout(connectPort, 1000);
        else $('error').textContent = 'Extension updated. Reload this GeoGuessr tab.';
      });
    } catch { $('error').textContent = 'Reload the GeoGuessr tab after updating the extension.'; }
  }
  connectPort();
})();
