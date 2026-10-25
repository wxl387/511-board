// 511 board and portal: the readout of the fluid charts (portal/board.py fluid_chart, fluid_time and fluid_lanes). Hover or
// tap a chart, or focus it and use the arrow keys: one box lists every series at that day, week or minute, or, on a lane chart,
// the list or gap under the pointer (up and down change the lane). The board loads this file (index.html); the portal inlines
// it (ui.CHART_JS).
'use strict';
(function () {
  const num = (v) => v.toLocaleString('en-US', { maximumFractionDigits: 1 });
  const count = (v, one) => num(v) + ' ' + one + (v === 1 ? '' : 's');
  const clock = (h) => { const m = Math.round(h * 60); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  const plotOf = (t) => (t && t.closest ? t.closest('.fl-p') : null);
  const isLanes = (p) => 'iv' in p.dataset;
  const WHAT = { t: 'Top-sell list', s: 'Singles list', m: 'Multi list', g: 'Between lists', a: 'Away: no work in the WMS', l: 'Lunch break' };
  function el(tag, cls, parent, before) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    parent.insertBefore(e, before || null);
    return e;
  }
  function lineAt(pts, t) {                                  // a line's value at t, straight between its points; none outside it
    if (!pts.length || t < pts[0][0] || t > pts[pts.length - 1][0]) return null;
    for (let k = 1; k < pts.length; k++) {
      if (t <= pts[k][0]) {
        const [a, va] = pts[k - 1], [b, vb] = pts[k];
        return b === a ? vb : va + ((vb - va) * (t - a)) / (b - a);
      }
    }
    return pts[0][1];
  }
  function chart(p) {
    if (p._fl) return p._fl;
    const ds = p.dataset, d = { n: ds.n.split('|'), c: ds.c.split('|'), top: Number(ds.top), pos: null, time: 'x0' in ds };
    if (d.time) {                                            // clock time (fluid_time): any minute from x0 to x1
      d.x0 = Number(ds.x0);
      d.x1 = Number(ds.x1);
      d.ln = true;
      d.pts = ds.p.split('|').map((s) => (s ? s.split(' ').map((q) => q.split(',').map(Number)) : []));
      d.step = 10 / 60;                                      // the arrow keys move 10 minutes
      d.last = d.pts[0].length ? d.pts[0][d.pts[0].length - 1][0] : d.x1;
    } else {                                                 // one slot per day or week (fluid_chart)
      d.x = ds.x.split('|');
      d.ln = 'ln' in ds;
      d.v = ds.v.split('|').map((s) => s.split(',').map((t) => (t === '' ? null : Number(t))));
      d.step = 1;
      d.last = d.x.length - 1;
    }
    d.hl = el('div', d.ln ? 'fl-hl ln' : 'fl-hl', p, d.ln ? null : p.firstChild);   // a hairline, or a wash under the slot's columns
    d.dots = d.ln ? d.c.map((c) => { const e = el('i', 'fl-d', p); e.style.background = c; return e; }) : [];
    d.tip = el('div', 'fl-tip', p);
    d.tip.setAttribute('role', 'status');
    d.head = el('div', 'h', d.tip);
    d.rows = d.n.map((name, j) => {
      const r = el('div', 'r', d.tip);
      el('i', 'k', r).style.background = d.c[j];                                     // a line key, not a box
      const b = el('b', '', r);
      el('span', '', r).textContent = name;
      return { r, b };
    });
    p._fl = d;
    hide(p);
    return d;
  }
  function lanes(p) {                                        // fluid_lanes: a lane per person, its lists and gaps in minutes after midnight
    if (p._fl) return p._fl;
    const ds = p.dataset;
    const d = { n: ds.n.split('|'), ops: ds.ops ? ds.ops.split('|') : [], lh: Number(ds.lh), x0: Number(ds.x0), x1: Number(ds.x1),
      items: ds.u === 'oi', lane: 0, j: null, dots: [],
      w: Object.fromEntries((ds.w || '').split('|').filter(Boolean).map((x) => [x.slice(0, 1), x.slice(2)])) };   // the page's own names for the kinds
    d.iv = ds.iv.split('|').map((s) => (s ? s.split(' ').map((q) => { const f = q.split(','); return { s: +f[0], e: +f[1], k: f[2], a: f[3], b: f[4] }; }) : []));
    d.hl = el('div', 'fl-hl', p);
    d.tip = el('div', 'fl-tip', p);
    d.tip.setAttribute('role', 'status');
    d.head = el('div', 'h', d.tip);
    d.body = el('div', '', d.tip);
    p._fl = d;
    hide(p);
    return d;
  }
  function place(p, tip, cx, hw, row) {    // beside the mark (cx +- hw, % of the plot) on the roomier side; else near its lane (row) or above the chart
    tip.style.left = '0px';                                                           // measure at full width
    tip.style.top = (row ? Math.max(0, row.top - 2) : 4) + 'px';
    tip.style.bottom = 'auto';
    const w = p.clientWidth, x = (w * cx) / 100, half = (w * hw) / 100, tw = tip.offsetWidth;
    const right = x + half + 12 + tw <= w ? x + half + 12 : null, left = x - half - 12 - tw >= 0 ? x - half - 12 - tw : null;
    const at = x < w / 2 ? (right != null ? right : left) : (left != null ? left : right);
    if (at != null) { tip.style.left = at + 'px'; return; }                          // beside the crosshair or the list
    tip.style.left = Math.max(0, Math.min(w - tw, x - tw / 2)) + 'px';                // no room beside it (a phone):
    if (row) {                                                                        // a lane: just below it, or above it in the lower half
      tip.style.top = (row.top + row.h / 2 > p.clientHeight / 2 ? row.top - tip.offsetHeight - 4 : row.top + row.h + 4) + 'px';
      return;
    }
    tip.style.top = 'auto';                                                           // a chart: above it, hiding nothing
    tip.style.bottom = 'calc(100% + 6px)';
    const bar = document.querySelector('header'), under = bar ? bar.getBoundingClientRect().bottom : 0;
    if (tip.getBoundingClientRect().top < under + 4) {                                // that is under the sticky menu bar: below the chart instead
      tip.style.bottom = 'auto';
      tip.style.top = 'calc(100% + 28px)';
    }
  }
  function show(p, pos) {                                    // pos: a slot number, or an hour on a clock-time chart
    const d = chart(p);
    let cx, vals;
    if (d.time) {
      pos = Math.max(d.x0, Math.min(d.x1, Math.round(pos * 60) / 60));
      cx = (100 * (pos - d.x0)) / (d.x1 - d.x0);
      d.head.textContent = clock(pos);
      vals = d.pts.map((pts) => lineAt(pts, pos));
      d.hl.style.left = cx + '%';
    } else {
      const n = d.x.length;
      pos = Math.max(0, Math.min(n - 1, pos));
      cx = (100 * (pos + 0.5)) / n;
      d.head.textContent = d.x[pos];
      vals = d.v.map((s) => s[pos]);
      d.hl.style.left = (d.ln ? cx : (100 * pos) / n) + '%';
      if (!d.ln) d.hl.style.width = 100 / n + '%';
    }
    d.pos = pos;
    d.hl.hidden = false;
    d.dots.forEach((e, j) => {
      const v = vals[j];
      e.hidden = v == null;
      if (v != null) { e.style.left = cx + '%'; e.style.top = 100 - (100 * v) / d.top + '%'; }
    });
    d.rows.forEach(({ r, b }, j) => {
      const v = vals[j];
      r.hidden = d.time && v == null;                        // a clock-time chart lists only the lines drawn at that minute
      b.textContent = v == null ? '–' : num(d.time ? Math.round(v) : v);
    });
    d.tip.hidden = d.time && vals.every((v) => v == null);
    if (!d.tip.hidden) place(p, d.tip, cx, 0, null);
  }
  function showLane(p, lane, j) {                            // the j-th list or gap of a lane
    const d = lanes(p), L = d.iv[lane];
    if (!L || !L.length) return;
    j = Math.max(0, Math.min(L.length - 1, j));
    d.lane = lane;
    d.j = j;
    const v = L[j], span = d.x1 - d.x0, left = (100 * (v.s - d.x0)) / span, w = (100 * (v.e - v.s)) / span, m = v.e - v.s;
    Object.assign(d.hl.style, { left: left + '%', width: 'max(3px, ' + w + '%)', top: lane * d.lh + 3 + 'px', height: d.lh - 6 + 'px', bottom: 'auto' });
    d.hl.hidden = false;
    d.head.textContent = d.n[lane] + ' · ' + clock(v.s / 60) + '–' + clock(v.e / 60);
    const what = v.k === 'o' ? 'Other work: ' + (d.ops[+v.a] || 'another task') : d.w[v.k] || WHAT[v.k] || '';
    const qty = ['t', 's', 'm'].includes(v.k) ? ', ' + count(+v.a, 'order') + (d.items && v.b != null ? ', ' + count(+v.b, 'item') : '') : '';
    d.body.textContent = what + qty + ' · ' + (m < 1 ? 'under a minute' : num(m < 10 ? Math.round(m * 10) / 10 : Math.round(m)) + ' min');   // 1.5 min, not 2 for 10:06–10:07
    d.tip.hidden = false;
    place(p, d.tip, left + w / 2, w / 2, { top: lane * d.lh, h: d.lh });
  }
  function hide(p) {
    const d = p._fl;
    if (!d) return;
    d.hl.hidden = true;
    d.tip.hidden = true;
    d.dots.forEach((e) => { e.hidden = true; });
  }
  function point(p, ev) {
    const r = p.getBoundingClientRect();
    if (r.width <= 0) return;
    const f = (ev.clientX - r.left) / r.width;
    if (isLanes(p)) {                                        // the lane under the pointer, the list or gap at that minute
      const d = lanes(p), lane = Math.floor((ev.clientY - r.top) / d.lh), t = d.x0 + f * (d.x1 - d.x0), L = d.iv[lane];
      const pad = (d.x1 - d.x0) / 100;                       // just outside a person's first or last list still reads it
      if (!L || !L.length || t < L[0].s - pad || t > L[L.length - 1].e + pad) return hide(p);
      const j = L.findIndex((v) => t < v.e);
      return showLane(p, lane, j < 0 ? L.length - 1 : j);
    }
    const d = chart(p);
    show(p, d.time ? d.x0 + f * (d.x1 - d.x0) : Math.floor(f * d.x.length));
  }
  document.addEventListener('pointermove', (ev) => { const p = plotOf(ev.target); if (p) point(p, ev); });
  document.addEventListener('pointerdown', (ev) => {                                  // a tap shows that spot; a tap elsewhere closes it
    const p = plotOf(ev.target);
    document.querySelectorAll('.fl-p').forEach((q) => { if (q !== p) hide(q); });
    if (p) point(p, ev);
  });
  document.addEventListener('pointerout', (ev) => {                                   // the mouse left the chart
    const p = plotOf(ev.target);
    if (p && ev.pointerType === 'mouse' && !p.contains(ev.relatedTarget) && document.activeElement !== p) hide(p);
  });
  document.addEventListener('focusin', (ev) => {
    const p = ev.target;
    if (!p.classList || !p.classList.contains('fl-p')) return;
    if (isLanes(p)) { const d = lanes(p); showLane(p, d.lane, d.j == null ? 0 : d.j); return; }
    const d = chart(p);
    show(p, d.pos == null ? d.last : d.pos);
  });
  document.addEventListener('focusout', (ev) => { if (ev.target.classList && ev.target.classList.contains('fl-p')) hide(ev.target); });
  document.addEventListener('keydown', (ev) => {
    const p = ev.target;
    if (!p.classList || !p.classList.contains('fl-p')) return;
    if (isLanes(p)) {                                        // left / right: the previous or next list or gap; up / down: the lane above or below
      const d = lanes(p), L = d.iv[d.lane] || [], j = d.j == null ? 0 : d.j;
      let lane = d.lane, to = { ArrowLeft: j - 1, ArrowRight: j + 1, Home: 0, End: L.length - 1 }[ev.key];
      if ((ev.key === 'ArrowUp' || ev.key === 'ArrowDown') && L.length) {
        lane = Math.max(0, Math.min(d.n.length - 1, lane + (ev.key === 'ArrowUp' ? -1 : 1)));
        const t = (L[j].s + L[j].e) / 2, k = (d.iv[lane] || []).findIndex((v) => t < v.e);
        to = k < 0 ? (d.iv[lane] || []).length - 1 : k;
      }
      if (to != null) { ev.preventDefault(); showLane(p, lane, to); } else if (ev.key === 'Escape') hide(p);
      return;
    }
    const d = chart(p), cur = d.pos == null ? d.last : d.pos;
    const to = { ArrowLeft: cur - d.step, ArrowRight: cur + d.step, Home: d.time ? d.x0 : 0, End: d.last }[ev.key];
    if (to != null) { ev.preventDefault(); show(p, to); } else if (ev.key === 'Escape') hide(p);
  });
})();
