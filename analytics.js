(() => {
  'use strict';
  const script = document.currentScript;
  const version = script?.dataset.release || 'web-150';
  const path = location.pathname;
  const query = new URLSearchParams(location.search);
  const validation = query.get('analytics_test') === '1';
  const qaKeys = ['qa', 'qaTool', 'preview', 'test', 'analytics_qa', 'disableSubmitQA'];
  let disabled = false;
  try { disabled = localStorage.getItem('umami.disabled') === '1'; } catch {}
  if (location.hostname !== 'kindwolf-labs.github.io' || location.protocol !== 'https:' || window.top !== window.self ||
      !path.startsWith('/play/') || disabled || (!validation && (navigator.webdriver || qaKeys.some(k => query.has(k)) || query.get('utm_source') === 'qa')) ||
      navigator.doNotTrack === '1' || window.doNotTrack === '1') return;
  const pocketRivals = ['echo-beacon', 'voxel-bloom', 'parcel-parade', 'ferry-queue', 'switchpost'];
  const stateEventGames = ['tiny-orchard', 'marble-relay', 'balance-pantry', ...pocketRivals];
  const games = ['pocket-blocks', 'arrow-harbor', 'copper-workshop', 'lantern-links', 'garden-current', 'orbit-switch', 'pocket-depot', 'parcel-platform', 'paper-fold-atlas', 'prism-post', 'rail-junction', 'magnet-foundry', 'tile-expedition', 'bridgewright', ...stateEventGames];
  const match = path.match(/^\/play\/(?:en\/)?lab\/([^/]+)\/(?:index\.html)?$/);
  const primary = path.match(/^\/play\/(bloom-rings|football-draft|gridiron-draft)\/(?:index\.html)?$/);
  const pocketRoute = path.match(/^\/play\/pocket-rivals\/([^/]+)\/(?:index\.html)?$/);
  const pocketGame = pocketRivals.includes(pocketRoute?.[1]);
  const game = primary?.[1] || (pocketGame ? pocketRoute[1] : match && games.includes(match[1]) ? match[1] : null);
  const requiresGameEvent = stateEventGames.includes(game);
  const pocketHub = /^\/play\/pocket-rivals\/(?:index\.html)?$/.test(path);
  const collection = pocketHub || /^\/play\/(?:en\/|lab\/)?(?:index\.html)?$/.test(path);
  if (!game && !collection) return;
  const website = '97fedd6b-a37f-4cf7-8a80-9919c0eae4a1';
  const tag = validation ? 'integration-test' : 'production';
  const sources = ['poki', 'playgama', 'itch', 'youtube', 'tiktok', 'reddit', 'discord', 'taptap', 'crazygames',
    'kindwolf-home', 'kindwolf-lab', 'kindwolf-related', 'kindwolf-hub'];
  const candidate = query.get('utm_source');
  const source = sources.includes(candidate) ? candidate : 'direct';
  let referrer = '';
  try { const u = new URL(document.referrer); referrer = u.origin === location.origin ? '' : u.origin; } catch {}
  let ready = false;
  const queue = [];
  function send(name, data = {}) {
    const payload = { website, hostname: location.hostname, url: pocketGame ? path.replace(/index\.html$/,'') : path,
      title: game || (pocketHub ? 'Pocket Rivals' : 'Kindwolf Play'), language: navigator.language,
      screen: `${screen.width}x${screen.height}`, referrer, tag };
    if (name) payload.name = validation ? 'test_' + name : name;
    if (Object.keys(data).length) payload.data = data;
    if (!ready) { if (queue.length < 24) queue.push(payload); return; }
    window.umami.track(payload);
  }
  const sdk = document.createElement('script');
  sdk.src = 'https://cloud.umami.is/script.js';
  sdk.defer = true;
  sdk.dataset.websiteId = website;
  sdk.dataset.autoTrack = 'false';
  sdk.dataset.domains = 'kindwolf-labs.github.io';
  sdk.dataset.excludeSearch = 'true';
  sdk.dataset.excludeHash = 'true';
  sdk.dataset.doNotTrack = 'true';
  sdk.onload = () => { ready = true; for (const p of queue.splice(0)) window.umami.track(p); };
  sdk.onerror = () => { queue.length = 0; };
  document.head.appendChild(sdk);
  if (validation) send('validation_ping', { scope: 'integration-test' }); else send(null);
  if (pocketGame) send('pocket_rivals_entry', {game,version,source});
  if (!game) return;
  const selectors = {
    'bloom-rings': '#board,#turnLeft,#turnRight,#btnHint',
    'football-draft': '.draft [data-k="spin"],.draft [data-k="auto"],.draft [data-c],.draft .slot',
    'gridiron-draft': '.draft .spin,.draft .wheelcv,.draft .auto-draft,.offerscreen button,.hub .tac,.game button:not(.mute):not(.music)',
    'magnet-foundry': 'button.coil,#hint',
    'orbit-switch': '#controls button,#hint', 'paper-fold-atlas': '#forward,#backward,#hint',
    'rail-junction': '#play,#step,#trains input,#hint', 'parcel-platform': '#lanes button,#rack button,#hint',
    'pocket-depot': '#board,button[data-dir]',
  };
  const actionSelector = selectors[game] || '#board,#hint';
  const visible = el => !!el && !el.hidden && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && el.getClientRects().length > 0;
  const getLevel = () => {
    if (game === 'bloom-rings') return Math.min(150, Number(document.querySelector('#hudLevel')?.textContent.match(/\d+/)?.[0]) || 0);
    if (primary) return 0;
    const el = document.querySelector('#levelName,#level,#number');
    return Math.min(150, Math.max(0, Number(el?.textContent.match(/\d+/)?.[0]) || 0));
  };
  let started = false, completed = false, seasonDone = false, currentLevel = -1;
  let active = 0, lastFlush = 0, previousTick = performance.now(), lastInput = -Infinity;
  const base = () => ({ game, version, level: getLevel(), ...(pocketGame ? {source} : {}) });
  function begin() {
    const level = getLevel();
    if (!started) { started = true; send('game_start', { ...base(), source }); }
    if (currentLevel !== level) { currentLevel = level; completed = false; send('level_start', base()); }
  }
  function completion(kind) {
    if (!started || completed) return;
    completed = true;
    send('core_loop_complete', { ...base(), kind });
    flush();
  }
  function flush() {
    const delta = Math.floor(active - lastFlush);
    if (started && delta >= 1000) { send('active_time', { ...base(), active_ms: delta }); lastFlush += delta; }
  }
  function input(event) {
    if (!event.isTrusted) return;
    lastInput = performance.now();
    const reset = event.target instanceof Element && event.target.closest(pocketGame ? '[data-action="restart"]' : '#restart,#reset,#btnRestart,#again,#replay');
    if (reset && (event.type === 'pointerdown' || (pocketGame && event.type === 'click'))) { currentLevel = -1; completed = false; }
    if (requiresGameEvent) return;
    if ((event.type === 'pointerdown' || event.type === 'click') && event.target instanceof Element && event.target.closest(actionSelector)) begin();
    if (event.type === 'keydown' && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D','Enter',' '].includes(event.key)) {
      const board = document.querySelector('#board,#rings,.draft,.game');
      if (visible(board) && !['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName)) begin();
    }
  }
  document.addEventListener('pointerdown', input, true);
  document.addEventListener('click', input, true);
  document.addEventListener('keydown', input, true);
  // These game-authored events are generated by actual game state transitions.
  const recognized = new Set(['game_start','level_start','level_complete','core_loop_complete']);
  window.addEventListener('prototype-event', event => {
    if (event.detail?.game !== game || !recognized.has(event.detail.event)) return;
    if (performance.now() - lastInput > 30000) return;
    begin();
    if (event.detail.event === 'level_complete' || event.detail.event === 'core_loop_complete') completion('level');
  });
  if (game === 'gridiron-draft') {
    // This funnel counts each milestone once per page visit and mode, across real input only.
    const stages = new Set(['ps_first_offer', 'ps_first_pick', 'ps_draft_complete', 'ps_first_kickoff', 'ps_first_final']);
    const recorded = new Set();
    window.addEventListener('perfect-season-progress', event => {
      const { event: step, mode, quick } = event.detail || {};
      if (!started || !stages.has(step) || (mode !== 'free' && mode !== 'challenge')) return;
      const key = `${mode}/${step}`;
      if (recorded.has(key)) return;
      recorded.add(key);
      send(step, { ...base(), source, mode, quick: quick === true });
    });
  }
  function observeState() {
    if (!started || requiresGameEvent) return;
    if (currentLevel !== getLevel()) return;
    if (game === 'bloom-rings') { if (visible(document.querySelector('#mNext'))) completion('level'); }
    else if (game === 'football-draft') {
      if (visible(document.querySelector('.screen.pre'))) completion('draft');
      if (!seasonDone && visible(document.querySelector('.screen.res'))) { seasonDone = true; send('season_complete', base()); }
    } else if (game === 'gridiron-draft') {
      if (visible(document.querySelector('.screen.summary'))) completion('draft');
      if (!seasonDone && visible(document.querySelector('.screen.champ,.screen.resultscreen'))) { seasonDone = true; send('season_complete', base()); }
    } else if (visible(document.querySelector('#next'))) completion('level');
  }
  if (!requiresGameEvent) {
    let scheduled = false;
    new MutationObserver(() => { if (!scheduled) { scheduled = true; requestAnimationFrame(() => { scheduled = false; observeState(); }); } })
      .observe(document.body, { attributes: true, childList: true, subtree: true, characterData: true });
  }
  setInterval(() => {
    const now = performance.now(), delta = Math.min(2000, Math.max(0, now - previousTick)); previousTick = now;
    if (started && document.visibilityState === 'visible' && document.hasFocus() && now - lastInput < 30000) active += delta;
    if (active - lastFlush >= 60000) flush();
  }, 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') flush(); });
  window.addEventListener('pagehide', flush);
})();
