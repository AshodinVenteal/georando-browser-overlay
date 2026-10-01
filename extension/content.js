(() => {
  if (document.getElementById('georando-ap-host')) return;
  const host = document.createElement('div');
  host.id = 'georando-ap-host';
  host.style.cssText = 'position:fixed;top:12px;left:12px;z-index:2147483647;pointer-events:auto;';
  const root = host.attachShadow({mode: 'closed'});
  root.innerHTML = `
    <style>
      :host{all:initial;color-scheme:dark}*{box-sizing:border-box}
      .panel{width:min(380px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;background:#141920f5;color:#edf3fa;border:1px solid #465365;border-radius:12px;box-shadow:0 8px 32px #0007;font:14px/1.4 system-ui,sans-serif}
      header{display:flex;align-items:center;gap:8px;padding:10px;background:#202a36;position:sticky;top:0;z-index:1}header strong{flex:1}header button{width:auto;padding:4px 9px}
      section{padding:12px;border-top:1px solid #344152}h2{font-size:14px;margin:0 0 8px}p{margin:6px 0}small,.muted{color:#a7b6c9;font-size:12px}
      label{display:block;font-size:12px;margin:8px 0 4px}input,button,select{font:inherit;background:#0f141c;color:#edf3fa;border:1px solid #465365;border-radius:6px;padding:7px;width:100%}button{cursor:pointer}button:hover{border-color:#7cdbac}button:disabled{opacity:.5;cursor:default}.primary{background:#25563e}.row{display:flex;gap:6px;margin-top:8px}.row>*{flex:1}
      summary{cursor:pointer;font-weight:600}.status{color:#ffc978;overflow-wrap:anywhere}.connected{color:#7cdbac}.error{color:#ff9898}.list{max-height:260px;overflow:auto;display:grid;gap:6px;margin-top:8px}.check{text-align:left}.done{text-decoration:line-through;opacity:.5}.item{display:flex;justify-content:space-between;border-bottom:1px solid #344152;padding:4px;gap:10px}.feature{display:inline-block;padding:3px 6px;background:#26323f;border-radius:5px;margin:3px;color:#a7b6c9}.unlocked{color:#7cdbac}.log{max-height:140px;overflow:auto;font-size:12px;overflow-wrap:anywhere}.log p{padding-bottom:4px;border-bottom:1px solid #344152}.hidden{display:none!important}.badge{width:auto;background:#202a36;padding:9px 13px;box-shadow:0 4px 20px #0006}
    </style>
    <button class="badge hidden" id="badge">AP · <span id="badge-status">Disconnected</span></button>
    <div class="panel" id="panel">
      <header><strong>GeoRando AP</strong><button id="dock" title="Move to the other side">⇄</button><button id="collapse" title="Collapse panel">−</button></header>
      <section><div id="status" class="status">Disconnected</div><div class="muted" id="progress"></div><p id="error" class="error" role="alert"></p></section>
      <section><details id="connection-settings" open><summary>Connection</summary>
        <label for="server">AP server</label><input id="server" placeholder="host:port or wss://host:port">
        <label for="player">Player / slot name</label><input id="player" autocomplete="off">
        <label for="game">Generated game name</label><input id="game" placeholder="Manual_GeoGuessr_arborelia">
        <small>Use the exact game name from your GeoRando YAML.</small>
        <label for="password">Room password (optional)</label><input id="password" type="password" autocomplete="off">
        <div class="row"><button class="primary" id="connect">Connect</button><button id="disconnect">Disconnect</button></div>
      </details></section>
      <section><h2>Unlock allowances</h2><div id="allowances" class="muted">Connect to load received items.</div><p class="muted">Set game restrictions manually. Automatic result capture and restriction enforcement are not enabled in this version.</p></section>
      <section><h2>Checks</h2><input id="search" placeholder="Search country, map, score…" aria-label="Search checks"><div class="row"><select id="group" aria-label="Check group"><option value="">All groups</option></select><button id="completed">Show completed</button></div><div id="checks" class="list"></div><p class="muted" id="check-count"></p></section>
      <section><details><summary>Received items</summary><div id="items" class="list"></div></details></section>
      <section><details><summary>AP messages</summary><div id="log" class="log"></div></details></section>
      <section><button id="goal">Declare victory…</button><p class="muted">Use after meeting your generated world's medal goal.</p></section>
    </div>`;
  const $ = id => root.getElementById(id);
  let port, state, initialized = false, showCompleted = false, collapsed = false, confirmId = null, side = 'left';
  const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  function attach() {
    const target = document.fullscreenElement || document.body;
    if (target && host.parentElement !== target) target.append(host);
  }
  attach();
  document.addEventListener('fullscreenchange', attach);
  function toggle() { collapsed = !collapsed; $('panel').classList.toggle('hidden', collapsed); $('badge').classList.toggle('hidden', !collapsed); }
  $('collapse').onclick = toggle; $('badge').onclick = toggle;
  $('dock').onclick = () => { side = side === 'left' ? 'right' : 'left'; host.style.left = side === 'left' ? '12px' : 'auto'; host.style.right = side === 'right' ? '12px' : 'auto'; };
  chrome.runtime.onMessage.addListener(message => { if (message.type === 'toggle') toggle(); });
  function send(message) {
    $('error').textContent = '';
    try { port.postMessage(message); } catch { $('error').textContent = 'Extension connection unavailable. Reload the GeoGuessr tab.'; }
  }
  $('connect').onclick = () => send({type: 'connect', settings: {server: $('server').value, player: $('player').value, game: $('game').value}, password: $('password').value});
  $('disconnect').onclick = () => { $('password').value = ''; send({type: 'disconnect'}); };
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
    const a = state.allowances;
    $('allowances').innerHTML = `<p>Time: <strong>${a.seconds}s</strong> · Move: <strong>${escape(a.movement)}</strong></p><p>Round bonus: +${a.roundBonus} · Country bonus: +${a.countryBonus}</p>` + a.features.map(f => `<span class="feature ${f.unlocked ? 'unlocked' : ''}">${f.unlocked ? '✓' : '🔒'} ${escape(f.name)}</span>`).join('');
    $('items').innerHTML = Object.entries(state.counts).sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => `<div class="item"><span>${escape(name)}</span><strong>×${count}</strong></div>`).join('') || '<p class="muted">No items received.</p>';
    $('log').innerHTML = state.log.slice().reverse().map(entry => `<p>${escape(new Date(entry.time).toLocaleTimeString())} · ${escape(entry.text)}</p>`).join('');
    $('goal').disabled = !state.connected || state.goal;
    $('goal').textContent = state.goal ? 'Victory declared' : 'Declare victory…';
    renderChecks();
  }
  function connectPort() {
    try {
      port = chrome.runtime.connect({name: 'georando-panel'});
      port.onMessage.addListener(message => { if (message.type === 'state') render(message.value); else if (message.type === 'error') $('error').textContent = message.text; });
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
