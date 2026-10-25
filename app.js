// 511 board: loads board.enc (AES-256-GCM; the key comes from the passcode through PBKDF2-SHA256), decrypts it in the
// browser and shows the pages inside. The server only ever holds ciphertext. "Remember on this device" keeps the derived
// key (not the passcode) in this browser's localStorage; Lock forgets it.
'use strict';
(function () {
  const STORE = 'board511.v1';
  const REFRESH_MS = 5 * 60 * 1000;    // look for a newer board every 5 minutes
  const STALE_MIN = 75;                // only for a board without next_ts: the Mac publishes hourly at night, so less is normal
  const $ = (id) => document.getElementById(id);
  const te = new TextEncoder(), td = new TextDecoder();
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const toB64 = (buf) => { let s = ''; new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); }); return btoa(s); };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (p) => p.toUpperCase().replace(/[^A-Z0-9]/g, '');     // dashes, spaces and case do not matter
  let key = null, salt = '', board = null;

  async function fetchEnc() {
    const r = await fetch('board.enc?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('The board did not load (HTTP ' + r.status + '). Try again in a minute.');
    return r.json();
  }
  async function derive(pass, enc) {
    const base = await crypto.subtle.importKey('raw', te.encode(norm(pass)), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: fromB64(enc.salt), iterations: enc.iter, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
  }
  async function open(enc, k) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(enc.iv) }, k, fromB64(enc.ct));
    return JSON.parse(td.decode(pt));
  }
  async function remember(k, s) {
    try { localStorage.setItem(STORE, JSON.stringify({ salt: s, k: toB64(await crypto.subtle.exportKey('raw', k)) })); } catch (e) { /* private mode */ }
  }
  function forget() { try { localStorage.removeItem(STORE); } catch (e) { /* storage blocked */ } }
  async function recall(s) {
    let v = null;
    try { v = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { return null; }
    if (!v || !v.k || v.salt !== s) return null;
    try { return await crypto.subtle.importKey('raw', fromB64(v.k), { name: 'AES-GCM' }, true, ['decrypt']); } catch (e) { return null; }
  }

  function fmtAge(min) {
    if (min < 60) return min + ' min';
    if (min < 48 * 60) return Math.floor(min / 60) + ' h ' + (min % 60) + ' min';
    return Math.floor(min / 1440) + ' days';
  }
  let noteUntil = 0;
  function note(text) {                // a short message in place of the "Updated" line (the Refresh button)
    $('upd').textContent = text;
    noteUntil = Date.now() + 8000;
    setTimeout(stamp, 8100);
  }
  function nextText() {
    if (!board || !board.next_ts) return 'The Mac publishes every 15 minutes in the day and hourly at night.';
    const t = new Date(board.next_ts * 1000);
    return 'Next update about ' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0') + '.';
  }
  function stamp() {
    if (!board || Date.now() < noteUntil) return;
    const nowS = Date.now() / 1000, min = Math.max(0, Math.round((nowS - board.built_ts) / 60));
    $('upd').textContent = 'Updated ' + board.built + (min >= 2 ? ' (' + fmtAge(min) + ' ago)' : '');
    const st = $('stale');
    // late = 15 minutes past the publish that was due (next_ts: every 15 minutes in the day, hourly at night)
    st.hidden = board.next_ts ? nowS < board.next_ts + 15 * 60 : min <= STALE_MIN;
    if (!st.hidden) st.textContent = 'This board has not updated for ' + fmtAge(min) + '. The warehouse Mac may be asleep, offline or signed out of a WMS. The numbers below are from ' + board.built + '.';
  }
  function render(keepScroll) {
    const pages = board.pages, order = board.order, y = window.scrollY;
    let id = decodeURIComponent(location.hash.slice(1));
    if (!pages[id]) id = order[0];
    $('nav').innerHTML = order.map((p) => '<a href="#' + esc(p) + '"' + (p === id ? ' class="on" aria-current="page"' : '') + '>' + esc(pages[p].nav) + '</a>').join('');
    const pg = pages[id];
    $('pt').textContent = pg.title;
    $('ps').innerHTML = pg.sub || '';          // built and escaped by the publisher (portal/board.py)
    $('page').innerHTML = pg.html;
    applyRanges();
    document.title = pg.title + ' · 511 board';
    if (keepScroll) window.scrollTo(0, y);
    stamp();
  }
  // Range buttons (portal/board.py switcher): every range is built in advance; a click shows one panel in every switcher of the
  // same group, and the choice is kept on this device (the 5-minute refresh and page changes keep it).
  const RNG = 'board511.rng';
  function rangePrefs() { try { return JSON.parse(localStorage.getItem(RNG) || '{}'); } catch (e) { return {}; } }
  function showRange(group, k) {
    document.querySelectorAll('.rng[data-rng="' + group + '"]').forEach((box) => {
      if (!box.querySelector('.rng-p[data-k~="' + k + '"]')) return;           // a panel can serve several buttons: data-k="30 month all"
      box.querySelectorAll('.rng-p').forEach((p) => { p.hidden = !p.dataset.k.split(' ').includes(k); });
      box.querySelectorAll('.rng-btns button').forEach((b) => { b.classList.toggle('on', b.dataset.k === k); b.setAttribute('aria-pressed', String(b.dataset.k === k)); });
    });
  }
  function newest() {                 // wide day grids (board.wave_grid) open on their newest days
    document.querySelectorAll('.tw > .gw').forEach((t) => { const w = t.parentElement; w.scrollLeft = w.scrollWidth; });
  }
  function applyRanges() { const p = rangePrefs(); Object.keys(p).forEach((g) => showRange(g, p[g])); newest(); }
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest && ev.target.closest('.rng-btns button');
    if (!b) return;
    const g = b.closest('.rng').dataset.rng;
    showRange(g, b.dataset.k);
    newest();
    const p = rangePrefs(); p[g] = b.dataset.k;
    try { localStorage.setItem(RNG, JSON.stringify(p)); } catch (e) { /* private mode: the choice lasts until reload */ }
  });

  function showLock(msg) {
    $('app').hidden = true; $('lock').hidden = false;
    $('err').textContent = msg || ''; $('pc').value = ''; $('pc').focus();
  }
  function showApp() { $('lock').hidden = true; $('app').hidden = false; render(false); }

  async function start() {
    let enc;
    try { enc = await fetchEnc(); } catch (e) { showLock(e.message); return; }
    salt = enc.salt;
    const k = await recall(salt);
    if (k) {
      try { board = await open(enc, k); key = k; showApp(); return; } catch (e) { forget(); }
    }
    showLock('');
  }
  async function refresh(force) {       // 'new' | 'same' | 'error' | 'locked' | 'skip'
    if (!key || (!force && document.visibilityState === 'hidden')) return 'skip';
    try {
      const enc = await fetchEnc();
      if (enc.salt !== salt) { key = null; board = null; forget(); showLock('The passcode has changed. Enter the new one.'); return 'locked'; }
      const b = await open(enc, key);
      if (!board || b.built_ts !== board.built_ts) { board = b; noteUntil = 0; render(true); return 'new'; }
      stamp();
      return 'same';
    } catch (e) { stamp(); return 'error'; }
  }

  $('lockf').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = $('unlock');
    btn.disabled = true; $('err').textContent = 'Opening…';
    try {
      const enc = await fetchEnc();
      const k = await derive($('pc').value, enc);
      board = await open(enc, k);             // throws OperationError when the passcode is wrong
      key = k; salt = enc.salt;
      if ($('rem').checked) await remember(k, salt); else forget();
      $('err').textContent = '';
      showApp();
    } catch (e) {
      $('err').textContent = e && e.name === 'OperationError' ? 'That passcode did not work.' : ((e && e.message) || 'Could not open the board.');
    } finally { btn.disabled = false; }
  });
  $('lockb').addEventListener('click', () => { key = null; board = null; forget(); showLock(''); });
  // Refresh: look for a newer copy now instead of at the next 5-minute check. New numbers themselves come from the Mac's schedule
  // (or the portal's Update buttons on the warehouse Wi-Fi); this button cannot reach the Mac.
  $('refb').addEventListener('click', async () => {
    const btn = $('refb');
    btn.disabled = true;
    note('Checking…');
    const r = await refresh(true);
    btn.disabled = false;
    if (r === 'same') note('This is the newest copy. ' + nextText());
    else if (r === 'error') note('Could not load the board. ' + nextText());
    else if (r === 'new') { noteUntil = 0; stamp(); }
  });
  window.addEventListener('hashchange', () => { if (board) { render(false); window.scrollTo(0, 0); } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  setInterval(refresh, REFRESH_MS);
  setInterval(stamp, 60000);

  if (!window.crypto || !crypto.subtle) { showLock('This browser cannot open the board (Web Crypto is missing). Use Safari or Chrome.'); return; }
  start();
})();
