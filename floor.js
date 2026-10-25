// The Floor page (portal/floor.py): a game-like map of the TK warehouse. Each person is a figure in the area where they last
// worked in the WMS; the slider and Play replay the day; tap a figure for their day. The layout and constants are written in by
// floor.py (js_source): the portal inlines this file, the github.io board loads it (publish.write_site). Pages are swapped by
// innerHTML on the board, so this attaches on its own: at load and whenever a new .ff block appears (MutationObserver).
(() => {
  'use strict';
  const FL = {"layout":{"size":{"w":[1280,720],"t":[420,1280]},"areas":[{"id":"dock","label":"Dock · receiving","w":[0,0,170,215],"t":[0,0,205,120]},{"id":"recv","label":"Receive staging","w":[175,0,95,215],"t":[210,0,210,120]},{"id":"ground","label":"Ground storage","w":[275,0,815,215],"t":[0,130,420,230]},{"id":"T1","label":"T1 racks","w":[0,225,1090,115],"t":[0,370,420,100]},{"id":"T2","label":"T2 racks","w":[0,350,1090,115],"t":[0,480,420,100]},{"id":"stage","label":"Picked, to pack","w":[0,475,150,245],"t":[0,590,130,150]},{"id":"rebin","label":"Rebin walls · multi","w":[155,475,200,245],"t":[135,590,285,150]},{"id":"pack","label":"Pack stations","w":[360,475,430,245],"t":[0,750,420,170]},{"id":"ship","label":"Bagging · handover","w":[795,475,295,245],"t":[0,930,420,100]},{"id":"break","label":"Break room","w":[1100,0,180,300],"t":[0,1040,205,150]},{"id":"off","label":"Off the floor","w":[1100,310,180,210],"t":[215,1040,205,150]},{"id":"other","label":"Counting · stock work","w":[1100,530,180,190],"t":[0,1200,420,80]}],"bands":58,"pillars":{"T2":[10,17,28,29,40,47]},"ground":[["A",10],["C",3],["F",8],["J",6],["G",15]],"ground_rows":{"w":[["A","C","F","J","G"]],"t":[["A","C","F"],["J","G"]]},"stations":24,"walls":10,"cell":{"w":26,"t":24}},"jobs":[["pick","Picking","#2a78d6"],["pack","Packing","#eb6834"],["in","Receiving and putaway","#1baf7a"],["ship","Bagging and handover","#c3c2b7"],["stock","Counting and stock work","#c3c2b7"],["other","Other work","#c3c2b7"]],"status":["working","working up on the order picker","between tasks","no WMS work for 5 min or more","at lunch","away: no WMS work for 15 min or more","gone for the day"],"levels":[[50,200,400,700,1000,1400],[25,100,250,500,800,1200],[10,25,50,100,200,400],[],[],[]],"level_of":["items picked","orders packed","inbound scans","","",""],"badges":{"early":["🌅","Early bird","the first one working in the WMS today"],"all":["🔄","All-rounder","three jobs or more today"],"k1":["🎯","1,000 items","1,000 items picked today"],"o500":["📦","500 orders","500 orders packed today"],"heavy":["🏋️","Heavy lifter","the most pounds picked and packed today"],"run":["🏃","Marathon","the longest stretch of work with no 5-minute break"]},"piles":{"put":["recv","units to put away"],"late":["T1","past their wave time"],"wave":["T1","orders not waved"],"pick":["T1","orders to pick"],"lists":["stage","lists to pack"],"multi":["rebin","multi lists"],"pack":["pack","orders to pack"],"bag":["ship","to bag"],"ho":["ship","to hand over"],"shipped":["ship","handed over"],"ret":["other","units in returns"],"exc":["other","in exceptions"]},"bucket":5};
  if (!FL) return;
  const NS = 'http://www.w3.org/2000/svg';
  const L = FL.layout, JOBS = FL.jobs, STATUS = FL.status;
  const keep = { day: null, t: null, playing: false, speed: 5, live: true };   // survives the board's re-render every few minutes
  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hm = (m) => { m = Math.max(0, Math.floor(m)); return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  const AREA = {}; L.areas.forEach((a) => { AREA[a.id] = a; });
  const GSIZE = {}; L.ground.forEach(([g, n]) => { GSIZE[g] = n; });

  // ------------------------------------------------------------ geometry (floor_layout.py)
  function hall(mode, id) {
    const [x, y, w, h] = AREA[id][mode], wide = mode === 'w';
    const x0 = x + (wide ? 40 : 10), x1 = x + w - 10, rh = wide ? 14 : 12, pad = wide ? 20 : 14;
    return { x, y, w, h, x0, x1, bw: (x1 - x0) / L.bands, rh, top: y + pad, bot: y + h - pad - rh, wide };
  }
  function groundRows(mode) {
    const [x, y, w, h] = AREA.ground[mode], rows = L.ground_rows[mode], out = {};
    const rowH = (h - 24) / rows.length;
    rows.forEach((groups, r) => {
      const n = groups.reduce((a, g) => a + GSIZE[g], 0), gap = 12;
      const lw = (w - 20 - gap * (groups.length - 1)) / n;
      let lx = x + 10;
      const ry = y + 22 + r * rowH;
      groups.forEach((g) => { out[g] = { x: lx, y: ry + 12, lw, lh: rowH - 28, n: GSIZE[g] }; lx += lw * GSIZE[g] + gap; });
    });
    return out;
  }
  function slotBox(mode, id) {
    const [x, y, w, h] = AREA[id][mode], c = L.cell[mode];
    const top = id === 'rebin' ? 22 + (mode === 'w' ? 34 : 28) : 22;
    const right = id === 'ship' ? (mode === 'w' ? 70 : 64) : 0;
    const iw = w - 16 - right, ih = h - top - 6;
    return { x: x + 8, y: y + top, cols: Math.max(1, Math.floor(iw / c)), rows: Math.max(1, Math.floor(ih / c)), c };
  }
  function xy(mode, key) {
    let m = /^(T[12]):(\d+):(\d)$/.exec(key);
    if (m) {
      const H = hall(mode, m[1]), off = H.wide ? 11 : 8;
      return [H.x0 + (Number(m[2]) + 0.5) * H.bw, m[3] === '0' ? H.top + H.rh + off : H.bot - off];
    }
    m = /^([ACFJG])(\d+)(?:\.(\d))?$/.exec(key);
    if (m) {
      const G = groundRows(mode)[m[1]], i = Math.min(Number(m[2]), G.n) - 1, r = Number(m[3] || 0);
      return [G.x + (i + 0.5) * G.lw, r ? G.y + (r - 0.5) / 5 * G.lh : G.y + G.lh / 2];
    }
    m = /^([a-z]+):(\d+)$/.exec(key) || [null, String(key), '0'];
    if (!AREA[m[1]]) m = [null, 'other', m[2]];
    const B = slotBox(mode, m[1]), i = Number(m[2]), per = B.cols * B.rows;
    const k = i % per, lap = Math.floor(i / per);
    return [B.x + (k % B.cols + 0.5) * B.c + lap * 5, B.y + (Math.floor(k / B.cols) + 0.5) * B.c + lap * 5];
  }

  // ------------------------------------------------------------ the map under the figures
  const labelEnd = {};
  function drawBase(svg, mode) {
    const g = el('g', { class: 'base' }, svg), wide = mode === 'w';
    L.areas.forEach((a) => {
      const [x, y, w, h] = a[mode], hallW = wide && (a.id === 'T1' || a.id === 'T2');
      el('rect', { class: 'ar', x: x + 1, y: y + 1, width: w - 2, height: h - 2, rx: 6, 'stroke-dasharray': a.id === 'off' ? '4 3' : 'none' }, g);
      const t = el('text', { class: 'lb', x: x + 8, y: hallW ? y + h / 2 + 4 : y + (wide ? 15 : 12) }, g);
      t.textContent = hallW ? a.id : a.label;
      labelEnd[a.id] = (hallW ? x + 30 : x + 8 + (t.getComputedTextLength() || a.label.length * 6.5));
    });
    ['T1', 'T2'].forEach((id) => {                                   // the two rack halls: a rack row each side of the aisle
      const H = hall(mode, id);
      [H.top, H.bot].forEach((ry) => {
        el('rect', { class: 'rk', x: H.x0, y: ry, width: H.x1 - H.x0, height: H.rh, rx: 2 }, g);
        let d = '';
        for (let b = 1; b < L.bands; b++) d += 'M' + (H.x0 + b * H.bw).toFixed(1) + ' ' + ry + 'v' + H.rh;
        el('path', { class: 'rt', d }, g);
      });
      if (wide) for (let b = 0; b < L.bands; b += 6) el('text', { class: 'sm', x: H.x0 + b * H.bw + 1, y: H.bot + H.rh + 10 }, g).textContent = String(b * 6 + 1).padStart(3, '0');
      (L.pillars[id] || []).forEach((b) => el('rect', { class: 'pl', x: H.x0 + (b + 0.5) * H.bw - 2.5, y: H.top + H.rh - 3, width: 5, height: 5 }, g));
    });
    const G = groundRows(mode);                                      // ground storage: lanes of pallets on the floor
    Object.keys(G).forEach((k) => {
      const R = G[k];
      el('text', { class: 'lb', x: R.x, y: R.y - 2 }, g).textContent = k + (k === 'G' ? ' (1–13 pallet, 14–15 ground)' : '');
      for (let i = 0; i < R.n; i++) {
        el('rect', { class: 'ln', x: R.x + i * R.lw + 1, y: R.y + 2, width: Math.max(2, R.lw - 2), height: R.lh - 2, rx: 2 }, g);
        if (wide || R.lw > 15) el('text', { class: 'sm', x: R.x + (i + 0.5) * R.lw, y: R.y + R.lh + 9, 'text-anchor': 'middle' }, g).textContent = String(i + 1);
      }
    });
    const P = slotBox(mode, 'pack');                                 // pack stations (the WMS has no station ids: one per packer, in order)
    for (let i = 0; i < Math.min(L.stations, P.cols * P.rows); i++) {
      const [sx, sy] = xy(mode, 'pack:' + i);
      el('rect', { class: 'st', x: sx - P.c * 0.42, y: sy + 3, width: P.c * 0.84, height: 6, rx: 1.5 }, g);
    }
    const [rx, ry, rw] = AREA.rebin[mode], wh = wide ? 26 : 20, ww = (rw - 16) / L.walls;   // rebin walls RBW-001..010
    for (let i = 0; i < L.walls; i++) {
      el('rect', { class: 'rk', x: rx + 8 + i * ww + 1, y: ry + 22, width: ww - 2, height: wh, rx: 2 }, g);
      if (wide || ww > 20) el('text', { class: 'sm', x: rx + 8 + (i + 0.5) * ww, y: ry + 22 + wh / 2 + 3, 'text-anchor': 'middle' }, g).textContent = String(i + 1);
    }
    const [hx, hy, hw, hh] = AREA.ship[mode];                        // the carrier truck at the handover dock
    const tx = hx + hw - (wide ? 66 : 60), ty = hy + hh - (wide ? 58 : 50);
    el('rect', { class: 'st', x: tx, y: ty, width: wide ? 40 : 36, height: wide ? 30 : 26, rx: 3 }, g);
    el('rect', { class: 'st', x: tx + (wide ? 40 : 36), y: ty + 10, width: 16, height: wide ? 20 : 16, rx: 3 }, g);
    el('text', { class: 'sm', x: tx + 2, y: ty - 4 }, g).textContent = 'carriers';
    const [dx, dy, , dh] = AREA.dock[mode];                          // dock doors
    for (let i = 0; i < 3; i++) el('rect', { class: 'pl', x: dx + 1, y: dy + 30 + i * (dh - 40) / 3, width: 4, height: (dh - 40) / 3 - 8 }, g);
  }

  // ------------------------------------------------------------ one page instance
  function init(root) {
    root.dataset.init = '1';
    root.classList.add('on');
    let D;
    try { D = JSON.parse(root.querySelector('.ff-data').textContent); } catch (e) { return; }
    const ctl = root.querySelector('.ff-ctl'), box = root.querySelector('.ff-map'), api = root.dataset.api || '';
    const days = (root.dataset.days || '').split(',').filter(Boolean);
    let mode = null, svg = null, ppl = null, fx = null, signs = null, figs = [], byId = {}, lastT = null, raf = 0, sel = -1, timer = 0;
    let live = !!D.live && !(keep.day === D.day && keep.live === false);
    const named = D.people.some((p) => p.n);
    let t = live ? D.at : (keep.day === D.day && keep.t != null ? Math.min(keep.t, D.live ? D.at : D.t1) : (D.live ? D.at : busiest()));
    function busiest() {                                          // a past day opens at its busiest quarter hour, not on an empty floor
      let best = D.t0, most = -1;
      for (let m = D.t0; m <= D.t1; m += 15) {
        const n = D.people.filter((p) => { const s = stateAt(p, m); return s && s[3] <= 3; }).length;
        if (n > most) { most = n; best = m; }
      }
      return best;
    }

    // controls
    ctl.innerHTML = (days.length ? '<select class="day" aria-label="Day">' + days.map((d) => '<option' + (d === D.day ? ' selected' : '') + '>' + esc(d) + '</option>').join('') + '</select>' : '') +
      '<button type="button" class="ghost go" aria-label="Play">▶ Play</button>' +
      '<select class="spd" aria-label="Replay speed"><option value="1">1 min/s</option><option value="5">5 min/s</option><option value="15">15 min/s</option></select>' +
      '<input type="range" class="sl" aria-label="Time of day" step="1">' +
      '<span class="tm"></span>' + (D.live ? '<button type="button" class="ghost lv">● Live</button>' : '');
    const sl = ctl.querySelector('.sl'), tm = ctl.querySelector('.tm'), go = ctl.querySelector('.go'), spd = ctl.querySelector('.spd'), lvb = ctl.querySelector('.lv');
    spd.value = String(keep.speed);
    const card = document.createElement('div'); card.className = 'ff-card'; card.hidden = true; box.appendChild(card);

    function setRange() { sl.min = String(D.t0); sl.max = String(Math.ceil(D.live ? D.at : D.t1)); sl.value = String(Math.round(t)); }
    function build() {
      const want = box.clientWidth > 720 || box.clientWidth === 0 ? 'w' : 't';
      if (want === mode && svg) return;
      mode = want;
      if (svg) svg.remove();
      const [W, H] = L.size[mode];
      svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Map of the TK floor: who works where. The list below says the same in words.' });
      box.insertBefore(svg, card);
      drawBase(svg, mode);
      signs = el('g', { class: 'signs' }, svg);
      ppl = el('g', { class: 'ppl' }, svg);
      fx = el('g', { class: 'fx' }, svg);
      byId = {};
      shown = null;
      people();
      lastT = null;
      draw(false);
    }
    function people() {                                          // one figure per person, kept across the minute's new data
      const r = mode === 'w' ? 8.5 : 7.5, seen = {};
      figs = D.people.map((p, i) => {
        let g = byId[p.id];
        if (!g) {
          g = byId[p.id] = el('g', { class: 'p k6', tabindex: named ? 0 : -1 }, ppl);
          el('circle', { r }, g);
          el('text', {}, g).textContent = initials(p.n);
          el('text', { class: 'up', x: -r - 7, y: -r + 2 }, g).textContent = '▲';
          el('text', { class: 'q', x: r + 1, y: -r + 2 }, g).textContent = '…';
          el('text', { class: 'bd', x: r - 2, y: r + 5 }, g);
          el('title', {}, g).textContent = p.n || 'a person';
        }
        g.dataset.i = String(i);
        seen[p.id] = 1;
        return g;
      });
      Object.keys(byId).forEach((id) => { if (!seen[id]) { byId[id].remove(); delete byId[id]; } });
    }
    const initials = (n) => (n || '').replace(/[^A-Za-zÀ-ɏ一-鿿]/g, '').slice(0, 2).toUpperCase();
    function stateAt(p, m) {                                      // the state holding at minute m, or null before the first
      const s = p.s; let lo = 0, hi = s.length - 1, f = -1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (s[mid][0] <= m) { f = mid; lo = mid + 1; } else hi = mid - 1; }
      return f < 0 ? null : s[f];
    }
    function counts(m) {                                           // per person: {job: work done by minute m}
      const c = D.people.map(() => ({}));
      const all = m >= (D.live ? D.at : D.t1) - 1e-6;
      D.ev.forEach(([b, i, j, n]) => { if (all || b + FL.bucket <= m + 1e-6) c[i][j] = (c[i][j] || 0) + n; });
      return c;
    }
    const lvl = (j, n) => (FL.levels[j] || []).filter((x) => n >= x).length;
    function badgesAt(i, m) { return D.badges.filter((b) => b[0] === i && (b[2] == null ? m >= (D.live ? D.at : D.t1) - 1e-6 : b[2] <= m)); }   // undated: as of the end

    function draw(animate) {
      if (!svg) return;
      box.classList.toggle('fast', keep.playing || !animate);
      const used = {}, now = [], byJob = {};
      let lunch = 0;
      D.people.forEach((p, i) => {
        const st = stateAt(p, t), g = figs[i];
        if (!st) { g.setAttribute('class', 'p k6'); return; }
        const [, j, sp, k] = st, key = D.spots[sp];
        const n = used[key] = (used[key] || 0) + 1;             // people on the same spot stand side by side
        let [x, y] = xy(mode, key);
        if (n > 1) { const r = mode === 'w' ? 18 : 16, q = n - 1; x += [0, 1, -1][q % 3] * r; y += Math.floor(q / 3) * r * 0.9; }
        g.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
        g.setAttribute('class', 'p k' + k + (j >= 3 ? ' g7' : '') + (i === sel ? ' sel' : ''));
        g.querySelector('circle').setAttribute('fill', JOBS[j][2]);
        const nb = named ? badgesAt(i, t).length : 0;
        g.querySelector('.bd').textContent = nb ? '★' + (nb > 1 ? nb : '') : '';
        if (k <= 3) { now.push(i); byJob[j] = (byJob[j] || 0) + 1; } else if (k === 4) lunch++;
      });
      drawSigns();
      hud(now.length, byJob, lunch);
      tm.textContent = (D.live && Math.abs(t - D.at) < 1 ? 'now ' : '') + hm(t);
      if (document.activeElement !== sl) sl.value = String(Math.round(t));
      if (animate && lastT != null && t > lastT && !still) pops(lastT, t);
      lastT = t;
      if (sel >= 0 && !card.hidden) showCard(sel, false);
      keep.day = D.day; keep.t = t; keep.live = live;
    }
    function hud(n, byJob, lunch) {
      const nb = root.querySelector('.ff-n'), ch = root.querySelector('.ff-chips'), tt = root.querySelector('.ff-t');
      if (nb) nb.textContent = String(n);
      if (ch) ch.innerHTML = JOBS.map((jb, j) => byJob[j] ? '<span class="jc"><span class="dot" style="background:' + jb[2] + '"></span>' + esc(jb[1]) + ' ' + byJob[j] + '</span>' : '').join('') +
        (lunch ? '<span class="jc">At lunch ' + lunch + '</span>' : '');
      if (tt) tt.innerHTML = live ? '<b>Live</b> · updated ' + esc(D.built) : '<b>' + (D.live ? 'Replay' : esc(D.day)) + '</b> · ' + hm(t);
      root.classList.toggle('rp', !live);                          // the pace and handed-over figures are for now only
    }
    let shown = null;
    function drawSigns() {                                          // what is waiting at each step, as of the last snapshot before t
      let snap = null;
      for (const s of D.piles || []) { if (s[0] <= t + 1e-6) snap = s; else break; }
      const key = snap ? snap[0] + (live ? 'L' : '') + mode + (D.piles || []).length : null;
      if (key === shown) return;                                    // only when the snapshot changes (not every frame of a replay)
      shown = key;
      signs.textContent = '';
      if (!snap) return;
      const lines = {};
      Object.keys(FL.piles).forEach((k) => { if (snap[1][k] != null) { const [a, lb] = FL.piles[k]; (lines[a] = lines[a] || []).push([k, snap[1][k], lb]); } });
      const sign = (rows, sx, sy, right, room) => {                  // a rounded label: [[pile, n, label]], tone icon first
        const tone = live ? rows.map(([k]) => (D.tones || {})[k]).find(Boolean) : null;
        const g = el('g', { class: 'sg' + (tone ? ' ' + tone : '') }, signs);
        const rect = el('rect', { rx: 4, height: 16 }, g), tx = el('text', {}, g);
        if (tone) el('tspan', { class: 'n' }, tx).textContent = (tone === 'critical' ? '✕ ' : '! ');
        rows.forEach(([, v, lb], r) => {
          if (r) el('tspan', {}, tx).textContent = ' · ';
          el('tspan', { class: 'n' }, tx).textContent = Number(v).toLocaleString('en-US') + ' ';
          el('tspan', {}, tx).textContent = lb;
        });
        let len = tx.getComputedTextLength() || 80;
        if (len + 10 > room) { tx.style.fontSize = Math.max(7, 10.5 * (room - 10) / len).toFixed(1) + 'px'; len = tx.getComputedTextLength() || len; }   // a narrow area
        if (right) sx -= len + 10;
        rect.setAttribute('x', sx); rect.setAttribute('y', sy); rect.setAttribute('width', len + 10);
        tx.setAttribute('x', sx + 5); tx.setAttribute('y', sy + 12);
      };
      Object.keys(lines).forEach((a) => {                          // racks: one line top right; other areas: a line a pile, bottom left
        const [x, y, w, h] = AREA[a][mode];
        if (a === 'T1' || a === 'T2') sign(lines[a], x + w - 6, y + 2, true, w - 50);
        else lines[a].forEach((row, r) => sign([row], x + 6, y + h - 6 - (lines[a].length - r) * 18, false, w - 12));
      });
    }
    function pops(a, b) {                                           // "+n" for the work done since the last frame, and level-ups
      const before = counts(a), after = counts(b);
      D.people.forEach((p, i) => {
        const g = figs[i]; if (!g || /k6/.test(g.getAttribute('class'))) return;
        const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(g.style.transform); if (!m) return;
        const x = Number(m[1]), y = Number(m[2]);
        let up = 0, lv = 0;
        Object.keys(after[i]).forEach((j) => { const d = after[i][j] - (before[i][j] || 0); if (d > 0) { up += d; if (named && lvl(j, after[i][j]) > lvl(j, before[i][j] || 0)) lv = lvl(j, after[i][j]); } });
        if (up > 0 && b - a <= 30) { const tx = el('text', { class: 'pop', x: x + 8, y: y - 10 }, fx); tx.textContent = '+' + up; setTimeout(() => tx.remove(), 1700); }
        if (lv) { const tx = el('text', { class: 'lvl', x: x - 14, y: y - 20 }, fx); tx.textContent = 'Level ' + lv + '!'; setTimeout(() => tx.remove(), 2500); }
      });
    }
    function showCard(i, place) {
      const p = D.people[i], st = stateAt(p, t), x = p.x || {};
      if (!st) { card.hidden = true; return; }
      const [, j, , k] = st, c = counts(t)[i], bs = named ? badgesAt(i, t) : [];
      let since = st[0];
      for (let q = p.s.indexOf(st); q >= 0 && p.s[q][1] === j && p.s[q][3] === k; q--) since = p.s[q][0];
      const work = Object.keys(c).map((jj) => [Number(jj), c[jj]]).filter(([, n]) => n > 0)
        .map(([jj, n]) => esc(n.toLocaleString('en-US') + ' ' + (FL.level_of[jj] || 'done')) + (named && FL.levels[jj] && FL.levels[jj].length ? ' · <b>level ' + lvl(jj, n) + '</b>' : '')).join('<br>');
      const lst = x.list && live ? '<div><span class="k">List now:</span> ' + esc(x.list.k) + ', ' + (x.list.n ? esc(x.list.d + ' of ' + x.list.n + ' lines') + ', ' : '') + esc(x.list.items + ' items') + (x.list.zone ? ' · ' + esc(x.list.zone) : '') + '</div>' : '';
      const hours = Object.keys(x.h || {}).map((jb) => esc(jb + ' ' + x.h[jb] + ' h')).join(', ');
      let mini = '';
      const t0 = D.t0, t1 = Math.max(D.live ? D.at : D.t1, t0 + 1);
      p.s.forEach((s, q) => {
        const a = Math.max(s[0], t0), b = Math.min(q + 1 < p.s.length ? p.s[q + 1][0] : (D.live ? D.at : s[0]), t1);
        if (b > a) mini += '<i style="width:' + (100 * (b - a) / (t1 - t0)).toFixed(2) + '%;margin-left:' + (q === 0 ? (100 * (a - t0) / (t1 - t0)).toFixed(2) : 0) + '%;background:' + (s[3] <= 1 ? JOBS[s[1]][2] : s[3] === 4 ? '#e3e1d8' : 'transparent') + '"></i>';
      });
      card.innerHTML = '<button type="button" class="x" aria-label="Close">×</button>' +
        '<h3>' + esc(p.n || 'A person') + '</h3>' +
        '<div><b>' + esc(JOBS[j][1]) + '</b>' + (x.op && j !== 0 ? ' · ' + esc(x.op) : '') + '</div>' +
        '<div class="k">' + esc(STATUS[k]) + ' since ' + hm(since) + '</div>' + lst +
        (work ? '<div style="margin-top:4px">' + work + '</div>' : '') +
        (named && x.lb && !D.live || named && x.lb && Math.abs(t - D.at) < 1 ? '<div>' + esc(Math.round(x.lb).toLocaleString('en-US')) + ' lb picked or packed today</div>' : '') +
        (x.rate && live ? '<div><span class="k">Pace:</span> ' + esc(x.rate) + '</div>' : '') +
        (x.lunch ? '<div><span class="k">Lunch:</span> ' + esc(x.lunch) + '</div>' : '') +
        '<div class="k">In the WMS ' + esc(x.first || '') + '–' + esc(x.last || '') + (hours ? ' · ' + hours : '') + '</div>' +
        (mini ? '<div class="mini" aria-hidden="true">' + mini + '</div><div class="k" style="font-size:11px">' + hm(t0) + ' – ' + hm(t1) + ', coloured by job</div>' : '') +
        (bs.length ? '<div class="bdg">' + bs.map((b) => { const B = FL.badges[b[1]]; return '<span title="' + esc(B[2]) + '">' + B[0] + ' ' + esc(B[1]) + '</span>'; }).join(' · ') + '</div>' : '');
      card.hidden = false;
      if (place) {
        const g = figs[i], m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(g.style.transform), sc = box.clientWidth / L.size[mode][0];
        const px = m ? Number(m[1]) * sc : 0, py = m ? Number(m[2]) * sc : 0, cw = card.offsetWidth, ch = card.offsetHeight;
        card.style.left = Math.max(8, Math.min(box.clientWidth - cw - 8, px > box.clientWidth / 2 ? px - cw - 14 : px + 14)) + 'px';
        card.style.top = Math.max(8, Math.min(box.clientHeight - ch - 8, py - ch / 2)) + 'px';
      }
    }
    function select(i) {
      sel = i;
      figs.forEach((g, q) => g.classList.toggle('sel', q === i));
      if (i < 0) { card.hidden = true; return; }
      showCard(i, true);
    }
    box.addEventListener('click', (ev) => {
      if (ev.target.closest('.x')) { select(-1); return; }
      if (ev.target.closest('.ff-card')) return;
      const g = ev.target.closest('.p');
      select(g ? Number(g.dataset.i) : -1);
    });
    box.addEventListener('keydown', (ev) => {
      const g = ev.target.closest && ev.target.closest('.p');
      if (g && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); select(Number(g.dataset.i)); }
      if (ev.key === 'Escape') select(-1);
    });

    // replay
    function stop() { keep.playing = false; cancelAnimationFrame(raf); go.textContent = '▶ Play'; go.setAttribute('aria-label', 'Play'); }
    function play() {
      if (t >= (D.live ? D.at : D.t1) - 0.5) t = D.t0;
      live = false; keep.playing = true; go.textContent = '❚❚ Pause'; go.setAttribute('aria-label', 'Pause');
      let prev = performance.now();
      const step = (now) => {
        if (!keep.playing) return;
        const dt = Math.min(0.25, (now - prev) / 1000); prev = now;
        t = Math.min(t + dt * Number(spd.value), D.live ? D.at : D.t1);
        draw(true);
        if (t >= (D.live ? D.at : D.t1)) { stop(); if (D.live) { live = true; draw(false); } return; }
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }
    go.addEventListener('click', () => (keep.playing ? stop() : play()));
    spd.addEventListener('change', () => { keep.speed = Number(spd.value); });
    sl.addEventListener('input', () => { stop(); live = false; t = Number(sl.value); draw(false); });
    if (lvb) lvb.addEventListener('click', () => { stop(); live = true; t = D.at; draw(true); if (api) refresh(); });
    const daySel = ctl.querySelector('.day');
    if (daySel) daySel.addEventListener('change', () => { stop(); select(-1); load(daySel.selectedIndex === 0 ? '' : daySel.value, true); });

    // the portal: new data every minute while live (the board gets a new page with each publish instead)
    function load(day, fresh) {
      if (!api) return;
      fetch(api + (day ? '?day=' + encodeURIComponent(day) : ''), { credentials: 'same-origin', cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then((N) => {
          const oldAt = t, wasLive = live;
          D = N; root.querySelector('.ff-data').textContent = JSON.stringify(N);
          if (fresh) { live = !!N.live && !day; t = live ? N.at : busiest(); if (svg) svg.remove(); svg = null; mode = null; setRange(); build(); if (live) refresh(); return; }
          setRange();
          people();
          if (wasLive) { t = N.at; lastT = oldAt; draw(true); } else draw(false);
        }).catch(() => {});
    }
    function refresh() { clearTimeout(timer); if (!api || !D.live) return; timer = setTimeout(() => { if (document.contains(root)) { load('', false); refresh(); } }, 60000); }

    setRange();
    build();
    window.addEventListener('resize', () => { if (document.contains(root)) build(); });
    if (keep.playing && keep.day === D.day) play();
    refresh();
  }

  function scan() { document.querySelectorAll('.ff:not([data-init])').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
  const pg = document.getElementById('page');                     // the github.io board swaps pages into #page
  if (pg) new MutationObserver(scan).observe(pg, { childList: true });
})();
