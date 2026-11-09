'use strict';
/*
 * Trailglow — plugin per Obsidian (v0.4.0)
 * La tua vita come una linea neon. Ogni giorno è una nota YYYY-MM-DD.md:
 *   frontmatter  mood: top | bella | cosi | pesante     (umore del giorno)
 *                evento: "Il giorno del matrimonio"      (giorno importante)
 *   testo        la nota del giorno
 *   ## Risposte dal futuro                                (risposte al te di quel giorno)
 *   ### YYYY-MM-DD
 * JavaScript puro: nessuna build necessaria.
 */
const obsidian = require('obsidian');
const { Plugin, ItemView, PluginSettingTab, Setting, Notice, normalizePath } = obsidian;

const VIEW_TYPE = 'trailglow-view';
const DAY = 86400000;
const YEAR = 365.25 * DAY;
const VB_W = 1000;
const MID = 120;
const AMP = 160;
const REPLIES_H = '## Risposte dal futuro';

const MOODS = [
  { key: 'top', label: 'Top', name: 'Giornata top', chapter: 'Uno dei periodi più belli', color: '#FFD23F', level: 1 },
  { key: 'bella', label: 'Bella', name: 'Bella giornata', chapter: 'Un bel periodo', color: '#33F0FF', level: 0.67 },
  { key: 'cosi', label: 'Così così', name: 'Così così', chapter: 'Alti e bassi', color: '#B98CFF', level: 0.33 },
  { key: 'pesante', label: 'Pesante', name: 'Giornata pesante', chapter: 'Un periodo difficile', color: '#FF3B8B', level: 0 }
];
const ALIASES = {
  top: 0, great: 0, '4': 0,
  bella: 1, good: 1, '3': 1,
  cosi: 2, 'così': 2, 'cosi cosi': 2, 'così così': 2, meh: 2, '2': 2,
  pesante: 3, bad: 3, hard: 3, '1': 3
};
const WHITE = '#F2F2F2';
const WHITE_DIM = 'rgba(242,242,242,0.5)';
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const INI = ['G', 'F', 'M', 'A', 'M', 'G', 'L', 'A', 'S', 'O', 'N', 'D'];
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const GIORNI_BREVI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

const DEFAULT_SETTINGS = {
  folder: 'Diario', subfolders: true, folderV: 1, floor: 0.35,
  onboarded: false, birthYear: 1998, chapters: {}, periods: [], startDate: '', showFuture: false
};
const SVG_NS = 'http://www.w3.org/2000/svg';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FM_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

/* ---------- utilità ---------- */

function todayT() { const n = new Date(); return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()); }
function iso(t) { return new Date(t).toISOString().slice(0, 10); }
function parseIso(s) { return Date.parse(s + 'T00:00:00Z'); }
function fmtDate(id) { const d = new Date(parseIso(id)); return d.getUTCDate() + ' ' + MESI[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
function moodIndex(v) {
  if (v === undefined || v === null) return -1;
  const k = String(v).toLowerCase().trim();
  return Object.prototype.hasOwnProperty.call(ALIASES, k) ? ALIASES[k] : -1;
}
function colorOf(m) { return m >= 0 ? MOODS[m].color : WHITE; }
function dim(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',0.55)';
}
function glowOf(c, ring) {
  const g = '0 0 6px ' + c + ', 0 0 14px ' + c;
  return ring ? '0 0 0 2px #000, 0 0 0 3.5px #fff, ' + g : g;
}
function smoothstep(u) { return u * u * (3 - 2 * u); }

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}
function btn(cls, parent, text, onClick) {
  const b = el('button', cls, parent, text);
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  return b;
}
function svg(tag, attrs, parent) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function swatch(parent, color) {
  const s = el('span', 'tg-swatch', parent);
  s.style.background = color;
  s.style.boxShadow = '0 0 8px ' + color;
  return s;
}

function smooth(arr, r) {
  if (r <= 0) return arr.slice();
  const sig = r * 0.6, w = [];
  for (let k = -r; k <= r; k++) w.push(Math.exp(-(k * k) / (2 * sig * sig)));
  return arr.map((_, i) => {
    let s = 0, ws = 0;
    for (let k = -r; k <= r; k++) {
      const j = i + k;
      if (j < 0 || j >= arr.length) continue;
      s += arr[j] * w[k + r]; ws += w[k + r];
    }
    return s / ws;
  });
}

function segments(pts) {
  const f = (v) => v.toFixed(2), out = [], n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    out.push({
      x1: p1.x, x2: p2.x > p1.x ? p2.x : p1.x + 0.01, c1: p1.c, c2: p2.c,
      d: 'M' + f(p1.x) + ' ' + f(p1.y) + ' C' + f(c1x) + ' ' + f(c1y) + ' ' + f(c2x) + ' ' + f(c2y) + ' ' + f(p2.x) + ' ' + f(p2.y)
    });
  }
  return out;
}

function yAt(pts, x) {
  if (!pts.length) return MID;
  if (x <= pts[0].x) return pts[0].y;
  for (let i = 0; i < pts.length - 1; i++) {
    if (x <= pts[i + 1].x) {
      const span = pts[i + 1].x - pts[i].x;
      return span > 0 ? pts[i].y + (pts[i + 1].y - pts[i].y) * (x - pts[i].x) / span : pts[i].y;
    }
  }
  return pts[pts.length - 1].y;
}

/* separa una nota in frontmatter / testo / risposte */
function splitNote(data) {
  const m = data.match(FM_RE);
  const fm = m ? m[0] : '';
  const body = data.slice(fm.length);
  const idx = body.search(/^## Risposte dal futuro\s*$/m);
  const text = (idx >= 0 ? body.slice(0, idx) : body).trim();
  const repliesRaw = idx >= 0 ? body.slice(idx) : '';
  const replies = [];
  if (repliesRaw) {
    const parts = repliesRaw.split(/^### (\d{4}-\d{2}-\d{2})\s*$/m);
    for (let i = 1; i < parts.length; i += 2) {
      const t = (parts[i + 1] || '').trim();
      if (t) replies.push({ written: parts[i], text: t });
    }
  }
  return { fm: fm, text: text, replies: replies };
}
function joinNote(fm, text, replies) {
  let out = fm;
  if (fm && !fm.endsWith('\n')) out += '\n';
  if (text) out += (fm ? '\n' : '') + text.trim() + '\n';
  if (replies.length) {
    out += '\n' + REPLIES_H + '\n';
    replies.forEach((r) => { out += '\n### ' + r.written + '\n' + r.text.trim() + '\n'; });
  }
  return out;
}

/* ---------- la vista ---------- */

class TrailglowView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    const t = todayT(), d = new Date(t);
    this.state = {
      screen: 'main', zoom: 'settimana', weekEnd: t, curY: d.getUTCFullYear(), curM: d.getUTCMonth(), yearCur: d.getUTCFullYear(),
      ob: 'birth', chIdx: 0, sel: null, selHadNote: false, back: 'main'
    };
    this.form = {};
    this.drafts = {};
    this.editing = false;
    this.uid = 'tg' + Math.random().toString(36).slice(2, 8);
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'Trailglow'; }
  getIcon() { return 'activity'; }

  async onOpen() { await this.render(); }
  async onClose() { this.contentEl.innerHTML = ''; }

  go(patch) { Object.assign(this.state, patch); this.render(); }
  get S() { return this.plugin.settings; }

  startT() { return this.S.startDate ? parseIso(this.S.startDate) : todayT(); }
  birthT() { return Date.UTC(this.S.birthYear, 0, 1); }

  /* capitoli per fasce d'età fino all'inizio del diario */
  defs(app) {
    const B = this.S.birthYear;
    const ages = [0, 11, 19, 26, 36, 46, 56, 66, 76, 86, 96];
    const appD = new Date(app), out = [];
    for (let i = 0; i < ages.length - 1; i++) {
      const from = Date.UTC(B + ages[i], 0, 1);
      if (from >= app) break;
      const nextFrom = Date.UTC(B + ages[i + 1], 0, 1);
      const last = nextFrom >= app;
      let label;
      if (ages[i] === 0) label = 'Infanzia';
      else if (ages[i] === 11) label = 'Adolescenza';
      else label = last ? 'Dai ' + ages[i] + ' anni a oggi' : 'Dai ' + ages[i] + ' ai ' + (ages[i + 1] - 1) + ' anni';
      out.push({ label: label, from: from, to: last ? app : nextFrom, years: (B + ages[i]) + '–' + (last ? appD.getUTCFullYear() : B + ages[i + 1] - 1) });
    }
    return out;
  }

  /* il passato ricordato: capitoli come onda morbida, periodi come colline */
  memAt(t, app) {
    if (t >= app) return null;
    const defs = this.defs(app), ch = this.S.chapters || {}, ps = this.S.periods || [];
    const answered = defs.some((d, i) => ch[i] !== undefined && ch[i] >= 0);
    if (!answered && !ps.length) return null;
    let lvl = 0.5, color = WHITE_DIM, hit = false;
    if (answered) {
      const an = defs.map((d, i) => ({ t: (d.from + d.to) / 2, l: ch[i] !== undefined && ch[i] >= 0 ? MOODS[ch[i]].level : 0.5 }));
      if (t <= an[0].t) lvl = an[0].l;
      else if (t >= an[an.length - 1].t) lvl = an[an.length - 1].l;
      else for (let i = 0; i < an.length - 1; i++) {
        if (t <= an[i + 1].t) { lvl = an[i].l + (an[i + 1].l - an[i].l) * smoothstep((t - an[i].t) / (an[i + 1].t - an[i].t)); break; }
      }
      for (let i = 0; i < defs.length; i++) {
        if (t >= defs[i].from && t < defs[i].to && ch[i] !== undefined && ch[i] >= 0) { color = dim(MOODS[ch[i]].color); break; }
      }
    }
    ps.forEach((p) => {
      const pa = Date.UTC(p.from, 0, 1), pb = Date.UTC(p.to + 1, 0, 1);
      let w = 0;
      if (t >= pa && t < pb) { w = 1; color = dim(MOODS[p.mood].color); hit = true; }
      else { const dist = t < pa ? pa - t : t - pb; if (dist < YEAR) w = smoothstep(1 - dist / YEAR); }
      if (w > 0) lvl = lvl * (1 - w) + MOODS[p.mood].level * w;
    });
    if (!answered && !hit && Math.abs(lvl - 0.5) < 0.001) return null;
    return { lvl: lvl, color: color };
  }

  memPts(app, xOf, yMap) {
    const birth = this.birthT();
    if (app <= birth) return [{ x: xOf(birth), y: yMap(0.5), c: WHITE_DIM }, { x: xOf(app), y: yMap(0.5), c: WHITE_DIM }];
    const B = this.S.birthYear, ad = new Date(app);
    const totalM = (ad.getUTCFullYear() - B) * 12 + ad.getUTCMonth() + 1;
    const step = Math.max(3, Math.ceil(totalM / 120));
    const samples = [];
    for (let mm = 0; mm < 3000; mm += step) {
      const a = Date.UTC(B, mm, 1);
      if (a >= app) break;
      const b = Math.min(Date.UTC(B, mm + step, 1), app), mid = (a + b) / 2;
      const mem = this.memAt(mid, app);
      samples.push({ t: mid, lvl: mem ? mem.lvl : 0.5, c: mem ? mem.color : WHITE_DIM });
    }
    const sm = smooth(samples.map((p) => p.lvl), 1);
    const pts = samples.map((p, i) => ({ x: xOf(p.t), y: yMap(sm[i]), c: p.c }));
    pts.unshift({ x: xOf(birth), y: pts[0].y, c: pts[0].c });
    pts.push({ x: xOf(app), y: pts[pts.length - 1].y, c: pts[pts.length - 1].c });
    return pts;
  }

  y(level) {
    let d = level - 0.5;
    if (d < 0) d *= this.S.floor;
    return MID - d * AMP;
  }

  levels(index, a, b) {
    const look = 30, out = [], app = this.startT();
    for (let u = a - look * DAY; u < b; u += DAY) {
      const e = index.get(iso(u));
      let l = e && e.mood >= 0 ? MOODS[e.mood].level : null;
      if (l === null && u < app) { const mem = this.memAt(u, app); if (mem) l = mem.lvl; }
      out.push(l);
    }
    let last = -1;
    for (let i = 0; i < out.length; i++) {
      if (out[i] === null) continue;
      if (last < 0) { for (let j = 0; j < i; j++) out[j] = 0.5; }
      else { for (let j = last + 1; j < i; j++) out[j] = out[last] + (out[i] - out[last]) * (j - last) / (i - last); }
      last = i;
    }
    if (last < 0) return out.slice(look).map(() => 0.5);
    for (let j = last + 1; j < out.length; j++) out[j] = out[last];
    return out.slice(look);
  }

  dayColor(index, t) {
    const e = index.get(iso(t));
    if (e && e.mood >= 0) return MOODS[e.mood].color;
    const app = this.startT();
    if (t < app) { const mem = this.memAt(t, app); if (mem) return mem.color; }
    return WHITE;
  }

  chunks(index, a, b, lv, nextFn, xOf) {
    const pts = [], app = this.startT();
    let t = a;
    while (t < b) {
      const e = Math.min(nextFn(t), b);
      const i0 = Math.round((t - a) / DAY), i1 = Math.round((e - a) / DAY);
      const counts = [0, 0, 0, 0];
      let sum = 0;
      for (let i = i0; i < i1; i++) {
        sum += lv[i];
        const en = index.get(iso(a + i * DAY));
        if (en && en.mood >= 0) counts[en.mood]++;
      }
      let best = -1, n = 0;
      for (let k = 0; k < 4; k++) if (counts[k] > n) { n = counts[k]; best = k; }
      let c = best < 0 ? WHITE_DIM : MOODS[best].color;
      if (best < 0 && (t + e) / 2 < app) { const mem = this.memAt((t + e) / 2, app); if (mem) c = mem.color; }
      pts.push({ x: xOf((t + e) / 2), lvl: sum / Math.max(1, i1 - i0), c: c });
      t = e;
    }
    return pts;
  }

  /* disegna una linea (vissuta + ricordata) in uno stage */
  drawLine(stage, o) {
    const h = o.height || 240;
    const vb = '0 0 ' + VB_W + ' ' + h;
    const glow = svg('svg', { class: 'tg-svg', viewBox: vb, preserveAspectRatio: 'none', 'aria-hidden': 'true' }, stage);
    glow.style.height = h + 'px';
    glow.style.filter = 'blur(6px)';
    glow.style.opacity = '0.9';
    const sharp = svg('svg', { class: 'tg-svg', viewBox: vb, preserveAspectRatio: 'none', 'aria-hidden': 'true' }, stage);
    sharp.style.height = h + 'px';
    const defs = svg('defs', {}, sharp);
    const ns = o.prefix || 'l';
    const paint = (segs, kind) => segs.forEach((sg, i) => {
      const gid = this.uid + ns + kind + i;
      const lg = svg('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1: sg.x1, y1: 0, x2: sg.x2, y2: 0 }, defs);
      svg('stop', { offset: 0, 'stop-color': sg.c1 }, lg);
      svg('stop', { offset: 1, 'stop-color': sg.c2 }, lg);
      const common = { d: sg.d, fill: 'none', stroke: 'url(#' + gid + ')', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' };
      if (kind === 'm') {
        svg('path', Object.assign({ 'stroke-width': 2.5 }, common), sharp);
      } else {
        svg('path', Object.assign({ 'stroke-width': 6 }, common), glow);
        svg('path', Object.assign({ 'stroke-width': 3.5 }, common), sharp);
      }
    });
    paint(segments(o.mem || []), 'm');
    paint(segments(o.lived || []), 'v');
    (o.arcs || []).forEach((d) => {
      svg('path', { d: d, fill: 'none', stroke: 'rgba(255,255,255,0.5)', 'stroke-width': 3, 'vector-effect': 'non-scaling-stroke' }, glow);
      svg('path', { d: d, fill: 'none', stroke: 'rgba(255,255,255,0.8)', 'stroke-width': 1.2, 'stroke-dasharray': '2 4', 'vector-effect': 'non-scaling-stroke' }, sharp);
    });
    if (o.future) svg('path', { d: o.future, fill: 'none', stroke: 'rgba(242,242,242,0.4)', 'stroke-width': 2, 'stroke-dasharray': '5 6', 'vector-effect': 'non-scaling-stroke' }, sharp);
    (o.dots || []).forEach((d) => {
      const dot = el('span', 'tg-dot', stage);
      dot.style.left = (d.x / VB_W * 100) + '%';
      dot.style.top = d.y + 'px';
      dot.style.width = d.size + 'px';
      dot.style.height = d.size + 'px';
      dot.style.background = d.color;
      dot.style.boxShadow = glowOf(d.color, d.ring);
    });
    if (o.pulse) {
      const p = el('span', 'tg-pulse', stage);
      p.style.left = (o.pulse.x / VB_W * 100) + '%';
      p.style.top = o.pulse.y + 'px';
    }
  }

  async render() {
    if (this.editing) { this.pending = true; return; }
    const index = await this.plugin.buildIndex();
    this.lastIndex = index;
    const root = this.contentEl;
    root.innerHTML = '';
    root.classList.add('tg-root');
    const inner = el('div', 'tg-inner', root);
    if (!this.S.onboarded && this.state.screen !== 'edit') return this.renderOnb(inner);
    if (this.state.screen === 'edit') return this.renderEdit(inner, index);
    if (this.state.screen === 'day' && this.state.sel) return this.renderDay(inner, index);
    return this.renderMain(inner, index);
  }

  /* ---------------- schermata principale ---------------- */

  renderMain(inner, index) {
    const s = this.state, S = this.S;
    const today = todayT(), td = new Date(today);
    const ty = td.getUTCFullYear(), tm = td.getUTCMonth();

    const head = el('div', 'tg-head', inner);
    const ht = el('div', null, head);
    el('p', 'tg-eyebrow', ht, GIORNI[td.getUTCDay()] + ' ' + td.getUTCDate() + ' ' + MESI[tm]);
    el('h2', 'tg-title', ht, 'La tua linea');
    const rb = btn('tg-btn tg-icon', head, '↺', () => {
      if (window.confirm('Rifare l\'inizio? Le tue note restano dove sono, ricominci solo anno di nascita e domande sul passato.')) {
        S.onboarded = false; this.plugin.saveSettings(); this.go({ ob: 'birth', chIdx: 0 });
      }
    });
    rb.setAttribute('aria-label', 'Rifai l\'inizio');
    rb.title = 'Rifai l\'inizio';

    const zoom = el('div', 'tg-zoom', inner);
    [['settimana', 'Settimana'], ['mese', 'Mese'], ['anno', 'Anno'], ['vita', 'Vita']].forEach(([id, label]) => {
      const b = btn('tg-btn' + (s.zoom === id ? ' is-on' : ''), zoom, label, () => this.go({ zoom: id }));
      b.setAttribute('aria-pressed', String(s.zoom === id));
    });

    const nav = el('div', 'tg-nav', inner);
    const prevB = btn('tg-btn tg-icon', nav, '‹');
    prevB.setAttribute('aria-label', 'Periodo precedente');
    const navTitle = el('div', 'tg-nav-title', nav);
    const nextB = btn('tg-btn tg-icon', nav, '›');
    nextB.setAttribute('aria-label', 'Periodo successivo');

    const stage = el('div', 'tg-stage', inner);
    let lived = [], mem = [], dots = [], arcs = [], future = null, pulse = null, stats = '';
    const app = this.startT();

    let firstDay = null;
    index.forEach((e, k) => { if (!e.evento && (e.mood >= 0 || e.hasNote)) { const t = parseIso(k); if (firstDay === null || t < firstDay) firstDay = t; } });
    const recFrom = firstDay === null ? app : Math.min(app, firstDay);
    const statLine = (a, b) => {
      a = Math.max(a, recFrom);
      if (a >= b) return 'Questo periodo è prima del diario: lo vedi come lo ricordi.';
      let n = 0, col = 0, wr = 0;
      for (let u = a; u < b; u += DAY) { n++; const e = index.get(iso(u)); if (e && e.mood >= 0) col++; if (e && e.hasNote) wr++; }
      return col + ' giorni colorati · ' + wr + ' scritti · ' + (n - col) + ' bianchi';
    };

    if (s.zoom === 'settimana' || s.zoom === 'mese') {
      let start, n, radius;
      if (s.zoom === 'settimana') {
        start = s.weekEnd - 6 * DAY; n = 7; radius = 1;
        const a = new Date(start), b = new Date(s.weekEnd);
        navTitle.textContent = a.getUTCMonth() === b.getUTCMonth()
          ? a.getUTCDate() + '–' + b.getUTCDate() + ' ' + MESI[b.getUTCMonth()] + ' ' + b.getUTCFullYear()
          : a.getUTCDate() + ' ' + MESI_BREVI[a.getUTCMonth()] + ' – ' + b.getUTCDate() + ' ' + MESI_BREVI[b.getUTCMonth()];
        prevB.addEventListener('click', () => this.go({ weekEnd: s.weekEnd - 7 * DAY }));
        nextB.disabled = s.weekEnd >= today;
        nextB.addEventListener('click', () => this.go({ weekEnd: Math.min(today, s.weekEnd + 7 * DAY) }));
      } else {
        start = Date.UTC(s.curY, s.curM, 1); n = new Date(Date.UTC(s.curY, s.curM + 1, 0)).getUTCDate(); radius = 3;
        navTitle.textContent = MESI[s.curM].charAt(0).toUpperCase() + MESI[s.curM].slice(1) + ' ' + s.curY;
        const m = s.curM, y = s.curY;
        prevB.addEventListener('click', () => this.go({ curM: m === 0 ? 11 : m - 1, curY: m === 0 ? y - 1 : y }));
        nextB.disabled = y === ty && m === tm;
        nextB.addEventListener('click', () => this.go({ curM: m === 11 ? 0 : m + 1, curY: m === 11 ? y + 1 : y }));
      }
      const pastEnd = Math.min(start + n * DAY, today + DAY);
      const nPast = Math.max(0, Math.round((pastEnd - start) / DAY));
      const raw = nPast ? this.levels(index, start - radius * DAY, start + nPast * DAY) : [];
      const lv = smooth(raw, radius).slice(radius);
      const cw = VB_W / n;
      const cols = el('div', 'tg-cols');
      for (let i = 0; i < n; i++) {
        const t = start + i * DAY, id = iso(t), e = index.get(id);
        const fut = t > today, isToday = t === today;
        const c = this.dayColor(index, t);
        let yy = MID;
        if (!fut) { yy = this.y(lv[i]); lived.push({ x: (i + 0.5) * cw, y: yy, c: c }); }
        const ring = !!(e && e.replies.length);
        if (!fut && e && (e.hasNote || ring || e.evento)) dots.push({ x: (i + 0.5) * cw, y: yy - 28, color: e.mood >= 0 ? MOODS[e.mood].color : WHITE, size: n <= 7 ? 10 : 7, ring: ring });
        const dd = new Date(t);
        const col = btn('tg-col', cols, null, () => this.openDay(id));
        col.setAttribute('aria-label', GIORNI[dd.getUTCDay()] + ' ' + dd.getUTCDate() + ' ' + MESI[dd.getUTCMonth()] + (e && e.mood >= 0 ? ', ' + MOODS[e.mood].name : ''));
        let label = '';
        if (isToday) label = 'oggi';
        else if (n <= 7) label = GIORNI_BREVI[dd.getUTCDay()] + ' ' + dd.getUTCDate();
        else if (dd.getUTCDate() === 1 || dd.getUTCDate() % 5 === 0) label = String(dd.getUTCDate());
        el('span', 'tg-col-label' + (isToday ? ' is-today' : ''), col, label);
      }
      const endX = nPast * cw;
      if (lived.length) {
        lived.unshift({ x: 0, y: lived[0].y, c: lived[0].c });
        lived.push({ x: endX, y: lived[lived.length - 1].y, c: lived[lived.length - 1].c });
      }
      const lastY = lived.length ? lived[lived.length - 1].y : MID;
      if (nPast < n) future = 'M' + endX + ' ' + lastY + ' L' + VB_W + ' ' + lastY;
      if (today >= start && today < start + n * DAY) pulse = { x: endX, y: lastY };
      stats = statLine(start, pastEnd);
      this.drawLine(stage, { lived: lived, dots: dots, future: future, pulse: pulse });
      stage.appendChild(cols);
    }

    if (s.zoom === 'anno') {
      const Y = s.yearCur, ys = Date.UTC(Y, 0, 1), ye = Date.UTC(Y + 1, 0, 1);
      const pastEnd = Math.min(Math.max(today + DAY, ys), ye);
      const xOf = (t) => (t - ys) / (ye - ys) * VB_W;
      navTitle.textContent = String(Y);
      prevB.disabled = Y <= S.birthYear;
      prevB.addEventListener('click', () => this.go({ yearCur: Y - 1 }));
      nextB.disabled = Y >= ty;
      nextB.addEventListener('click', () => this.go({ yearCur: Y + 1 }));
      if (pastEnd > ys) {
        const lv = this.levels(index, ys, pastEnd);
        const ch = this.chunks(index, ys, pastEnd, lv, (t) => t + 7 * DAY, xOf);
        const sm = smooth(ch.map((p) => p.lvl), 2);
        lived = ch.map((p, i) => ({ x: p.x, y: this.y(sm[i]), c: p.c }));
        lived.unshift({ x: 0, y: lived[0].y, c: lived[0].c });
        lived.push({ x: xOf(pastEnd), y: lived[lived.length - 1].y, c: lived[lived.length - 1].c });
      }
      for (let u = ys; u < pastEnd; u += DAY) {
        const e = index.get(iso(u));
        if (e && (e.hasNote || e.replies.length || e.evento)) {
          const x = xOf(u + DAY / 2);
          dots.push({ x: x, y: yAt(lived, x) - 22, color: e.mood >= 0 ? MOODS[e.mood].color : WHITE, size: 6, ring: e.replies.length > 0 });
        }
      }
      const endX = xOf(pastEnd);
      const lastY = lived.length ? lived[lived.length - 1].y : MID;
      if (pastEnd < ye) future = 'M' + endX + ' ' + lastY + ' L' + VB_W + ' ' + lastY;
      if (Y === ty) pulse = { x: endX, y: lastY };
      this.drawLine(stage, { lived: lived, dots: dots, future: future, pulse: pulse });
      const cols = el('div', 'tg-cols', stage);
      INI.forEach((ini, i) => {
        const b = btn('tg-col', cols, null, () => this.go({ zoom: 'mese', curY: Y, curM: i }));
        b.setAttribute('aria-label', 'Apri ' + MESI[i] + ' ' + Y);
        el('span', 'tg-col-label' + (Y === ty && i === tm ? ' is-today' : ''), b, ini);
      });
      stats = statLine(ys, pastEnd);
    }

    if (s.zoom === 'vita') {
      prevB.style.visibility = 'hidden';
      nextB.style.visibility = 'hidden';
      const birth = this.birthT(), pastEnd = today + DAY;
      const end = S.showFuture ? Date.UTC(S.birthYear + 90, 0, 1) : pastEnd;
      const xOf = (t) => (t - birth) / (end - birth) * VB_W;
      navTitle.textContent = (ty - S.birthYear) + ' anni di linea';
      let firstMood = null;
      index.forEach((e, k) => { if (e.mood >= 0 && !e.evento) { const t = parseIso(k); if (t >= birth && (firstMood === null || t < firstMood)) firstMood = t; } });
      const livedStart = Math.max(birth, Math.min(app, firstMood === null ? app : firstMood));
      mem = this.memPts(livedStart, xOf, (l) => this.y(l));
      const lastMem = mem[mem.length - 1];
      const lv = this.levels(index, livedStart, pastEnd);
      const quarter = (t) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1); };
      const q = this.chunks(index, livedStart, pastEnd, lv, quarter, xOf);
      const sm = smooth(q.map((p) => p.lvl), 1);
      const qp = q.map((p, i) => ({ x: p.x, y: this.y(Math.max(0, Math.min(1, 0.5 + (sm[i] - 0.5) * 1.8))), c: p.c }));
      lived = [{ x: lastMem.x, y: lastMem.y, c: qp.length ? qp[0].c : lastMem.c }].concat(qp);
      const endX = xOf(pastEnd);
      lived.push({ x: endX, y: lived[lived.length - 1].y, c: lived[lived.length - 1].c });
      const all = mem.slice(0, -1).concat(lived);
      const lastY = lived[lived.length - 1].y;
      const dotBtns = [];
      index.forEach((e, k) => {
        if (!e.evento && !e.replies.length) return;
        const t = parseIso(k);
        if (t < birth || t > today) return;
        const x = xOf(t), y = yAt(all, x);
        const c = e.mood >= 0 ? MOODS[e.mood].color : WHITE;
        dotBtns.push({ x: x, y: y - 22, c: c, ring: e.replies.length > 0, id: k, label: e.evento || fmtDate(k) });
        if (e.replies.length) {
          const w = e.replies[e.replies.length - 1].written;
          const x2 = xOf(Math.min(parseIso(w), today) + DAY / 2), y2 = yAt(all, x2);
          const cy = Math.max(6, Math.min(y, y2) - 70);
          arcs.push('M' + x.toFixed(2) + ' ' + (y - 22).toFixed(2) + ' Q' + ((x + x2) / 2).toFixed(2) + ' ' + cy.toFixed(2) + ' ' + x2.toFixed(2) + ' ' + (y2 - 4).toFixed(2));
        }
      });
      if (S.showFuture) future = 'M' + endX + ' ' + lastY + ' L' + VB_W + ' ' + lastY;
      pulse = { x: endX, y: lastY };
      this.drawLine(stage, { lived: lived, mem: mem, arcs: arcs, future: future, pulse: pulse });
      dotBtns.forEach((d) => {
        const b = btn('tg-dotbtn', stage, null, () => this.openDay(d.id));
        b.style.left = (d.x / VB_W * 100) + '%';
        b.style.top = d.y + 'px';
        b.setAttribute('aria-label', 'Apri ' + d.label);
        b.title = d.label + ' · ' + fmtDate(d.id);
        const dot = el('span', 'tg-dotbtn-dot', b);
        dot.style.background = d.c;
        dot.style.boxShadow = glowOf(d.c, d.ring);
      });
      el('span', 'tg-edge-label', stage, String(S.birthYear)).style.left = '0';
      el('span', 'tg-edge-label tg-right', stage, S.showFuture ? String(S.birthYear + 90) : 'oggi');
      if (S.showFuture) {
        const o = el('span', 'tg-oggi', stage, 'oggi');
        o.style.left = (endX / VB_W * 100) + '%';
        o.style.top = (lastY + 16) + 'px';
      }
      stats = (ty - S.birthYear) + ' anni · ' + statLine(birth, pastEnd);
    }

    const legend = el('div', 'tg-legend', inner);
    MOODS.forEach((m) => { const it = el('span', null, legend); swatch(it, m.color); it.appendChild(document.createTextNode(m.label)); });
    { const it = el('span', null, legend); swatch(it, WHITE); it.appendChild(document.createTextNode('Nessuna stellina')); }
    { const it = el('span', null, legend); const r = el('span', 'tg-ring', it); r.style.boxShadow = glowOf('#fff', true); it.appendChild(document.createTextNode('Risposta dal futuro')); }
    el('p', 'tg-stats', inner, stats);

    if (s.zoom === 'vita') {
      const row = el('div', 'tg-two', inner);
      const fb = btn('tg-card-btn', row, null, async () => { S.showFuture = !S.showFuture; await this.plugin.saveSettings(); this.render(); });
      fb.setAttribute('aria-pressed', String(!!S.showFuture));
      el('span', null, fb, 'Mostra il futuro');
      const sw = el('span', 'tg-switch' + (S.showFuture ? ' is-on' : ''), fb);
      el('span', 'tg-knob', sw);
      btn('tg-card-btn', row, 'Modella il passato', () => this.go({ screen: 'edit', back: 'main' }));
      const hasMem = Object.keys(S.chapters || {}).some((k) => S.chapters[k] >= 0) || (S.periods || []).length;
      el('p', 'tg-hint', inner, (S.showFuture ? 'Il tratteggio è la linea che hai ancora davanti. Non è una scadenza: è spazio. ' : '')
        + (hasMem ? 'La parte più tenue è il passato come lo ricordi. ' : 'Il passato prima del diario è bianco: puoi dargli una forma con "Modella il passato". ')
        + 'Gli archi sono le risposte che hai lasciato al te del passato.');
    } else {
      el('p', 'tg-hint', inner, 'Tocca un giorno per aprirlo: puoi colorarlo, scriverci, o rispondere al te di quel giorno.');
    }

    btn('tg-cta', inner, "Com'è andata oggi?", () => this.openDay(iso(today)));
  }

  openDay(id) {
    const e = this.lastIndex ? this.lastIndex.get(id) : null;
    this.drafts = {};
    this.go({ screen: 'day', sel: id, selHadNote: !!(e && e.hasNote) });
  }

  /* ---------------- pagina del giorno ---------------- */

  renderDay(inner, index) {
    const id = this.state.sel, t = parseIso(id), today = todayT();
    const e = index.get(id) || { mood: -1, hasNote: false, text: '', replies: [], evento: '' };
    const fut = t > today, isToday = t === today, past = t < today;
    const dd = new Date(t);

    btn('tg-back', inner, '‹  Torna alla linea', () => this.go({ screen: 'main', sel: null }));
    const hd = el('div', null, inner);
    el('p', 'tg-eyebrow', hd, GIORNI[dd.getUTCDay()] + (isToday ? ' · oggi' : ''));
    el('h2', 'tg-title', hd, fmtDate(id));
    const bar = el('div', 'tg-bar', inner);
    const c = this.dayColor(index, t);
    bar.style.background = fut ? 'repeating-linear-gradient(90deg,rgba(242,242,242,0.4) 0 5px,transparent 5px 11px)' : c;
    if (!fut) bar.style.boxShadow = '0 0 8px ' + c + ', 0 0 20px ' + c;

    if (e.evento) el('div', 'tg-badge', inner, 'Giorno importante · ' + e.evento);

    if (fut) {
      el('p', 'tg-p', inner, 'Questo giorno non è ancora arrivato. Qui la linea è ancora tratteggiata.');
      return;
    }

    const ms = el('section', 'tg-section', inner);
    el('h3', 'tg-h3', ms, "Com'è andata?");
    const grid = el('div', 'tg-moods', ms);
    MOODS.concat([{ label: 'Bianca', name: 'Nessuna stellina, linea bianca', color: WHITE }]).forEach((m, i) => {
      const idx = i < 4 ? i : -1, on = e.mood === idx && (idx >= 0 || index.has(id));
      const b = btn('tg-mood' + (on ? ' is-on' : ''), grid, null, () => this.plugin.setMood(id, idx));
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', m.name);
      b.style.color = m.color;
      if (on) { b.style.borderColor = m.color; }
      const st = el('span', 'tg-star', b, on ? '★' : '☆');
      if (on) st.style.textShadow = '0 0 8px ' + m.color + ', 0 0 16px ' + m.color;
      el('span', 'tg-mood-label', b, m.label);
    });

    const editable = isToday || !this.state.selHadNote;
    const ns = el('section', 'tg-section', inner);
    if (editable) {
      const lab = el('label', 'tg-h3', ns, (isToday ? 'Ti ha segnato qualcosa?' : 'Aggiungi un ricordo di questo giorno') + ' ');
      el('span', 'tg-muted', lab, '(facoltativo)');
      const ta = el('textarea', 'tg-textarea', ns);
      ta.placeholder = 'Scrivi qualcosa… o niente. La linea va avanti lo stesso.';
      ta.value = this.drafts.note !== undefined ? this.drafts.note : e.text;
      ta.rows = isToday ? 7 : 4;
      let timer = null;
      const save = () => { clearTimeout(timer); this.plugin.setNoteText(id, ta.value); };
      ta.addEventListener('focus', () => { this.editing = true; });
      ta.addEventListener('input', () => { this.drafts.note = ta.value; clearTimeout(timer); timer = setTimeout(save, 800); });
      ta.addEventListener('blur', () => { save(); this.editing = false; if (this.pending) { this.pending = false; this.render(); } });
    } else {
      el('h3', 'tg-h3', ns, 'Quel giorno hai scritto');
      el('div', 'tg-quote', ns, e.text);
    }

    if (past) {
      const rs = el('section', 'tg-section', inner);
      el('h3', 'tg-h3', rs, 'Risposte dal futuro');
      el('p', 'tg-muted', rs, 'Le parole di quel giorno restano com\'erano. Puoi rispondere al te di allora, con la data di oggi.');
      e.replies.forEach((r) => {
        const card = el('div', 'tg-reply', rs);
        el('span', 'tg-muted', card, 'Scritta il ' + fmtDate(r.written) + (r.written === iso(today) ? ' · oggi' : ''));
        el('p', 'tg-p', card, r.text);
      });
      const ta = el('textarea', 'tg-textarea', rs);
      ta.placeholder = 'Cosa gli diresti adesso?';
      ta.rows = 3;
      ta.value = this.drafts.reply || '';
      const send = btn('tg-cta tg-cta-small', rs, 'Lascia la risposta', async () => {
        const v = ta.value.trim();
        if (!v) return;
        this.drafts.reply = '';
        this.editing = false;
        await this.plugin.addReply(id, v);
      });
      send.disabled = !ta.value.trim();
      ta.addEventListener('focus', () => { this.editing = true; });
      ta.addEventListener('input', () => { this.drafts.reply = ta.value; send.disabled = !ta.value.trim(); });
      ta.addEventListener('blur', () => { setTimeout(() => { if (document.activeElement !== send) { this.editing = false; if (this.pending) { this.pending = false; this.render(); } } }, 150); });
    }

    btn('tg-link', inner, 'Apri la nota in Obsidian ↗', () => this.plugin.openInObsidian(id));
  }

  /* ---------------- onboarding ---------------- */

  previewStage(parent, band) {
    const today = todayT(), birth = this.birthT();
    const st = el('div', 'tg-preview', parent);
    const xOf = (t) => (t - birth) / Math.max(DAY, today - birth) * (VB_W - 12);
    if (band) {
      const b = el('span', 'tg-band', st);
      b.style.left = (xOf(band.from) / VB_W * 100) + '%';
      b.style.width = Math.max(1, (xOf(band.to) - xOf(band.from)) / VB_W * 100) + '%';
    }
    const pts = this.memPts(today, xOf, (l) => 55 + (this.y(l) - MID) * 0.6);
    const moments = [];
    if (this.lastIndex) this.lastIndex.forEach((e, k) => {
      if (!e.evento) return;
      const t = parseIso(k);
      if (t < birth || t > today) return;
      const x = xOf(t);
      moments.push({ x: x, y: yAt(pts, x) - 16, color: e.mood >= 0 ? MOODS[e.mood].color : WHITE, size: 8 });
    });
    this.drawLine(st, { mem: [], lived: pts, height: 110, prefix: 'p', dots: moments, pulse: { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y } });
    el('span', 'tg-edge-label tg-small', st, String(this.S.birthYear)).style.left = '0';
    el('span', 'tg-edge-label tg-small tg-right', st, 'oggi');
    return st;
  }

  renderOnb(inner) {
    const s = this.state, S = this.S, today = todayT(), ty = new Date(today).getUTCFullYear();
    const defs = this.defs(today);
    const step = s.ob;
    const box = el('div', 'tg-onb', inner);
    const setB = (v) => {
      const n = Math.round(Number(v));
      if (!isFinite(n)) return;
      S.birthYear = Math.max(1920, Math.min(ty - 1, n));
      S.chapters = {};
      this.plugin.saveSettings(true);
    };

    if (step === 'birth') {
      const ln = el('div', 'tg-hero-line', box);
      ln.setAttribute('aria-hidden', 'true');
      el('h1', 'tg-hero', box, 'Ogni vita è una linea.');
      el('p', 'tg-p', box, 'Partiamo da dove inizia la tua.');
      el('label', 'tg-h3', box, 'In che anno sei nato?');
      const row = el('div', 'tg-stepper', box);
      btn('tg-btn tg-icon', row, '−', () => { setB(S.birthYear - 1); this.render(); });
      const inp = el('input', 'tg-input tg-year', row);
      inp.type = 'number'; inp.value = String(S.birthYear);
      inp.addEventListener('change', () => { setB(inp.value); this.render(); });
      btn('tg-btn tg-icon', row, '+', () => { setB(S.birthYear + 1); this.render(); });
      el('p', 'tg-muted', box, (ty - S.birthYear) + ' anni di linea');
      btn('tg-cta', box, 'Avanti', () => this.go({ ob: 'folder' }));
      return;
    }

    if (step === 'folder') {
      btn('tg-back', box, '‹  Indietro', () => this.go({ ob: 'birth' }));
      el('h1', 'tg-hero tg-hero-s', box, 'Dove salvo le tue giornate?');
      el('p', 'tg-p', box, 'Ogni giornata è una nota .md nel tuo vault. Scegli la cartella: chiamala come vuoi, se non esiste la creo io.');
      const f = this.form;
      if (f.folder === undefined) f.folder = S.folder || 'Diario';
      el('label', 'tg-h3', box, 'Nome della cartella');
      const fi = el('input', 'tg-input', box);
      fi.type = 'text'; fi.placeholder = 'Diario'; fi.value = f.folder;
      const ex = el('p', 'tg-muted', box);
      const example = () => {
        const name = this.plugin.cleanFolder(fi.value);
        ex.textContent = 'Esempio: ' + name + '/' + (S.subfolders ? iso(today).slice(0, 4) + '/' + iso(today).slice(5, 7) + '/' : '') + iso(today) + '.md';
      };
      example();
      fi.addEventListener('input', () => { f.folder = fi.value; example(); });
      const existing = this.plugin.topFolders();
      if (existing.length) {
        el('p', 'tg-muted', box, 'Oppure usa una cartella che hai già:');
        const chips = el('div', 'tg-chips', box);
        existing.slice(0, 8).forEach((name) => btn('tg-btn', chips, name, () => { f.folder = name; fi.value = name; example(); }));
      }
      const tg = btn('tg-card-btn', box, null, async () => { S.subfolders = !S.subfolders; await this.plugin.saveSettings(true); this.render(); });
      tg.setAttribute('aria-pressed', String(!!S.subfolders));
      el('span', null, tg, 'Dividi per anno e mese');
      const sw = el('span', 'tg-switch' + (S.subfolders ? ' is-on' : ''), tg);
      el('span', 'tg-knob', sw);
      btn('tg-cta', box, 'Avanti', async () => {
        await this.plugin.changeFolder(fi.value);
        delete f.folder;
        this.go({ ob: 'choice' });
      });
      return;
    }

    const top = el('div', 'tg-onb-top', box);
    if (step !== 'final') btn('tg-back', top, '‹  Indietro', () => {
      if (step === 'choice') this.go({ ob: 'folder' });
      else if (s.chIdx > 0) this.go({ chIdx: s.chIdx - 1 });
      else this.go({ ob: 'choice' });
    });
    if (step === 'ch') el('span', 'tg-muted', top, (s.chIdx + 1) + ' di ' + defs.length);

    const cur = defs[Math.min(s.chIdx, Math.max(0, defs.length - 1))];
    this.previewStage(box, step === 'ch' && cur ? cur : null);

    if (step === 'choice') {
      el('h1', 'tg-hero tg-hero-s', box, 'E gli anni prima di oggi?');
      el('p', 'tg-p', box, 'Hai ' + (ty - S.birthYear) + ' anni di linea alle spalle. Puoi dargli una forma con qualche domanda generica, oppure lasciarli bianchi e partire da oggi. Potrai cambiarlo quando vuoi.');
      btn('tg-cta', box, 'Diamo forma al passato', () => this.go({ ob: defs.length ? 'ch' : 'final', chIdx: 0 }));
      btn('tg-cta tg-cta-ghost', box, 'Lascio bianco, parto da oggi', () => this.finishOnb(true));
      return;
    }

    if (step === 'ch' && cur) {
      el('p', 'tg-eyebrow', box, cur.years);
      el('h1', 'tg-hero tg-hero-s', box, cur.label);
      el('p', 'tg-p', box, 'Se ci ripensi adesso, com\'era quel periodo?');
      const list = el('div', 'tg-opts', box);
      const chosen = (S.chapters || {})[s.chIdx];
      MOODS.map((m, i) => ({ m: i, label: m.chapter, color: m.color })).concat([{ m: -1, label: 'Non ricordo, lo lascio bianco', color: WHITE }]).forEach((o) => {
        const on = chosen === o.m;
        const b = btn('tg-opt' + (on ? ' is-on' : ''), list, null, async () => {
          S.chapters = Object.assign({}, S.chapters || {}); S.chapters[s.chIdx] = o.m;
          await this.plugin.saveSettings(true);
          if (s.chIdx + 1 < defs.length) this.go({ chIdx: s.chIdx + 1 }); else this.go({ ob: 'final' });
        });
        b.style.color = o.color;
        if (on) b.style.borderColor = o.color;
        el('span', 'tg-star', b, on ? '★' : '☆');
        el('span', 'tg-opt-label', b, o.label);
      });
      el('p', 'tg-muted', box, 'Non serve essere precisi: conta come lo senti adesso. Nessuna risposta è obbligatoria.');
      return;
    }

    el('h1', 'tg-hero tg-hero-s', box, 'Ecco la tua linea.');
    el('p', 'tg-p', box, 'La parte più tenue è il passato come lo ricordi. Da oggi la linea si accende davvero, un giorno alla volta.');
    el('p', 'tg-muted', box, 'Le giornate vengono salvate nella cartella "' + S.folder + '"' + (S.subfolders ? ', divise per anno e mese' : '') + '. Puoi cambiarla quando vuoi nelle impostazioni.');
    btn('tg-cta', box, 'Inizia da oggi', () => this.finishOnb(false));
    btn('tg-cta tg-cta-ghost', box, 'Segna periodi e giorni importanti', () => this.go({ screen: 'edit', back: 'onb' }));
    btn('tg-link', box, 'Rivedi le risposte', () => this.go({ ob: 'ch', chIdx: 0 }));
  }

  async finishOnb(blank) {
    const S = this.S;
    if (blank) S.chapters = {};
    S.onboarded = true;
    if (!S.startDate) S.startDate = iso(todayT());
    await this.plugin.saveSettings(true);
    this.go({ screen: 'main', zoom: 'vita', ob: 'birth', chIdx: 0 });
  }

  /* ---------------- modella il passato ---------------- */

  renderEdit(inner, index) {
    const S = this.S, f = this.form, today = todayT(), ty = new Date(today).getUTCFullYear();
    btn('tg-back', inner, '‹  Fatto', () => this.go({ screen: this.state.back === 'onb' ? 'main' : 'main' }));
    el('h1', 'tg-hero tg-hero-s', inner, 'Modella il passato');
    el('p', 'tg-p', inner, 'Domande generali, periodi e giorni importanti. Più dettagli metti, più la linea ti somiglia. Tutto è facoltativo.');
    this.previewStage(inner, null);

    const chs = el('div', 'tg-cardrow', inner);
    const defs = this.defs(this.S.onboarded ? this.startT() : today);
    const answered = Object.keys(S.chapters || {}).filter((k) => S.chapters[k] >= 0).length;
    const ct = el('div', null, chs);
    el('div', 'tg-h3', ct, 'Capitoli generali');
    el('div', 'tg-muted', ct, answered + ' di ' + defs.length + ' periodi con una risposta');
    btn('tg-btn', chs, 'Rifai le domande', async () => { S.onboarded = false; await this.plugin.saveSettings(true); this.go({ screen: 'main', ob: 'ch', chIdx: 0 }); });

    const keep = (k) => (ev) => { f[k] = ev.target.value; };

    /* periodi */
    const ps = el('section', 'tg-section', inner);
    el('h3', 'tg-h2', ps, 'Periodi importanti');
    el('p', 'tg-muted', ps, 'Un range di anni che spicca sul resto, nel bene o nel male. Ha la precedenza sui capitoli generali.');
    (S.periods || []).forEach((p) => {
      const r = el('div', 'tg-item', ps);
      swatch(r, MOODS[p.mood].color);
      const tx = el('div', 'tg-item-text', r);
      el('div', null, tx, p.name);
      el('div', 'tg-muted', tx, (p.from === p.to ? p.from : p.from + '–' + p.to) + ' · ' + MOODS[p.mood].label);
      const x = btn('tg-btn tg-icon', r, '×', async () => { S.periods = (S.periods || []).filter((q) => q.id !== p.id); await this.plugin.saveSettings(true); this.render(); });
      x.setAttribute('aria-label', 'Elimina il periodo ' + p.name);
    });
    const pf = el('div', 'tg-form', ps);
    el('label', 'tg-muted', pf, 'Nome del periodo');
    const pn = el('input', 'tg-input', pf); pn.type = 'text'; pn.placeholder = "Es. Gli anni dell'università"; pn.value = f.pName || ''; pn.addEventListener('input', keep('pName'));
    const yr = el('div', 'tg-two', pf);
    const c1 = el('div', 'tg-col2', yr); el('label', 'tg-muted', c1, 'Dal');
    const pa = el('input', 'tg-input', c1); pa.type = 'number'; pa.placeholder = String(S.birthYear); pa.value = f.pFrom || ''; pa.addEventListener('input', keep('pFrom'));
    const c2 = el('div', 'tg-col2', yr); el('label', 'tg-muted', c2, 'Al');
    const pb = el('input', 'tg-input', c2); pb.type = 'number'; pb.placeholder = String(ty); pb.value = f.pTo || ''; pb.addEventListener('input', keep('pTo'));
    el('div', 'tg-muted', pf, "Com'era?");
    const pm = el('div', 'tg-moods', pf);
    MOODS.forEach((m, i) => {
      const on = f.pMood === i;
      const b = btn('tg-mood' + (on ? ' is-on' : ''), pm, null, () => { f.pMood = i; this.render(); });
      b.style.color = m.color; if (on) b.style.borderColor = m.color;
      el('span', 'tg-star', b, on ? '★' : '☆'); el('span', 'tg-mood-label', b, m.label);
    });
    btn('tg-cta tg-cta-small tg-cta-ghost', pf, 'Aggiungi periodo', async () => {
      const a = parseInt(f.pFrom, 10), b = parseInt(f.pTo, 10);
      if (!isFinite(a) || !isFinite(b) || a > b || a < S.birthYear || b > ty || f.pMood === undefined) {
        new Notice('Trailglow: controlla anni (tra ' + S.birthYear + ' e ' + ty + ', inizio prima della fine) e scegli com\'era.');
        return;
      }
      S.periods = (S.periods || []).concat([{ id: 'p' + Date.now(), name: (f.pName || '').trim() || 'Un periodo importante', from: a, to: b, mood: f.pMood }]);
      delete f.pName; delete f.pFrom; delete f.pTo; delete f.pMood;
      await this.plugin.saveSettings(true);
      this.render();
    });

    /* giorni importanti */
    const ms = el('section', 'tg-section', inner);
    el('h3', 'tg-h2', ms, 'Giorni importanti');
    el('p', 'tg-muted', ms, 'Un fidanzamento, un matrimonio, una nascita, una perdita. Diventano punti luminosi sulla linea, e sono note vere del tuo vault.');
    const evs = [];
    index.forEach((e, k) => { if (e.evento) evs.push([k, e]); });
    evs.sort((a, b) => (a[0] < b[0] ? -1 : 1)).forEach(([k, e]) => {
      const r = el('div', 'tg-item', ms);
      const dot = el('span', 'tg-ring', r);
      const c = e.mood >= 0 ? MOODS[e.mood].color : WHITE;
      dot.style.background = c; dot.style.boxShadow = glowOf(c, false);
      const tx = el('div', 'tg-item-text', r);
      el('div', null, tx, e.evento);
      el('div', 'tg-muted', tx, fmtDate(k) + (e.mood >= 0 ? ' · ' + MOODS[e.mood].label : ' · segnato e basta'));
      const x = btn('tg-btn tg-icon', r, '×', async () => { await this.plugin.setEvento(k, null); });
      x.setAttribute('aria-label', 'Togli il giorno importante ' + e.evento);
    });
    const mf = el('div', 'tg-form', ms);
    el('label', 'tg-muted', mf, "Cos'è successo");
    const mn = el('input', 'tg-input', mf); mn.type = 'text'; mn.placeholder = 'Es. Il giorno del matrimonio'; mn.value = f.mName || ''; mn.addEventListener('input', keep('mName'));
    el('label', 'tg-muted', mf, 'Quando');
    const md = el('input', 'tg-input', mf); md.type = 'date'; md.min = iso(this.birthT()); md.max = iso(today); md.value = f.mDate || ''; md.addEventListener('input', keep('mDate'));
    el('div', 'tg-muted', mf, 'Che segno ha lasciato?');
    const mm = el('div', 'tg-moods', mf);
    MOODS.map((m, i) => ({ i: i, label: m.label, color: m.color })).concat([{ i: -1, label: 'Segna e basta', color: WHITE }]).forEach((m) => {
      const on = f.mMood === m.i;
      const b = btn('tg-mood' + (on ? ' is-on' : ''), mm, null, () => { f.mMood = m.i; this.render(); });
      b.style.color = m.color; if (on) b.style.borderColor = m.color;
      el('span', 'tg-star', b, on ? '★' : '☆'); el('span', 'tg-mood-label', b, m.label);
    });
    el('p', 'tg-muted', mf, 'Non tutti i giorni si possono giudicare. "Segna e basta" lo mette sulla linea senza dargli un colore.');
    btn('tg-cta tg-cta-small tg-cta-ghost', mf, 'Aggiungi giorno', async () => {
      const t = f.mDate ? parseIso(f.mDate) : NaN;
      if (!isFinite(t) || t < this.birthT() || t > today || f.mMood === undefined) {
        new Notice('Trailglow: scegli una data passata e il segno che ha lasciato.');
        return;
      }
      const name = (f.mName || '').trim() || 'Un giorno importante', mood = f.mMood, date = f.mDate;
      delete f.mName; delete f.mDate; delete f.mMood;
      await this.plugin.setEvento(date, name, mood);
    });
  }
}

/* ---------- impostazioni ---------- */

class TrailglowSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const c = this.containerEl;
    c.innerHTML = '';
    el('h2', null, c, 'Trailglow');
    new Setting(c)
      .setName('Cartella del diario')
      .setDesc('Dove vengono salvate le giornate (YYYY-MM-DD.md). Chiamala come vuoi. Trailglow legge solo le note dentro questa cartella e le sue sottocartelle. Se la cambi, ti propone di spostare le giornate dalla vecchia.')
      .addText((t) => {
        t.setPlaceholder('Diario').setValue(this.plugin.settings.folder);
        t.inputEl.addEventListener('change', async () => {
          await this.plugin.changeFolder(t.inputEl.value);
          t.setValue(this.plugin.settings.folder);
        });
      });
    new Setting(c)
      .setName('Dividi per anno e mese')
      .setDesc('Salva le giornate come Diario/2026/11/2026-11-09.md, così non ti ritrovi centinaia di note nella stessa cartella.')
      .addToggle((t) => t.setValue(!!this.plugin.settings.subfolders).onChange(async (v) => {
        this.plugin.settings.subfolders = v;
        await this.plugin.saveSettings();
      }));
    new Setting(c)
      .setName('Metti in ordine le giornate')
      .setDesc('Sposta nel diario le giornate rimaste nella radice del vault (o non nella sottocartella giusta). I link alle note vengono aggiornati da Obsidian.')
      .addButton((b) => b.setButtonText('Sposta').onClick(() => this.plugin.tidy(false)));
    new Setting(c)
      .setName('Quanto scendono i giorni pesanti')
      .setDesc('0 = la linea non scende mai, 1 = scende quanto salgono i giorni belli.')
      .addSlider((sl) => sl.setLimits(0, 1, 0.05).setValue(this.plugin.settings.floor).setDynamicTooltip().onChange(async (v) => {
        this.plugin.settings.floor = v;
        await this.plugin.saveSettings();
      }));
    new Setting(c)
      .setName('Rifai l\'inizio')
      .setDesc('Riparte da anno di nascita e domande sul passato. Le note non vengono toccate.')
      .addButton((b) => b.setButtonText('Rifai').onClick(async () => {
        this.plugin.settings.onboarded = false;
        await this.plugin.saveSettings();
        this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((l) => { if (l.view instanceof TrailglowView) l.view.go({ screen: 'main', ob: 'birth', chIdx: 0 }); });
      }));
  }
}

/* ---------- il plugin ---------- */

module.exports = class TrailglowPlugin extends Plugin {
  async onload() {
    const raw = (await this.loadData()) || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, raw);
    if (!this.settings.birthYear || this.settings.birthYear < 1920) this.settings.birthYear = DEFAULT_SETTINGS.birthYear;
    if (raw.folderV !== 1) {
      // dalla v0.2 le giornate vanno in una cartella: usa una "diario" esistente (qualsiasi maiuscola) o crea "Diario"
      if (!raw.folder) {
        const existing = this.app.vault.getAllLoadedFiles().find((f) => f.children && f.path.toLowerCase() === 'diario');
        this.settings.folder = existing ? existing.path : 'Diario';
      }
      this.settings.folderV = 1;
      await this.saveData(this.settings);
    }
    this.app.workspace.onLayoutReady(() => {
      const n = this.misplaced().length;
      if (n) new Notice('Trailglow: ci sono ' + n + ' giornate fuori dalla cartella "' + this.settings.folder + '". Usa il comando "Trailglow: Metti in ordine le giornate" per spostarle.', 10000);
    });
    this.noteCache = new Map();
    this.registerView(VIEW_TYPE, (leaf) => new TrailglowView(leaf, this));
    this.addRibbonIcon('activity', 'Apri Trailglow', () => this.activate());
    this.addCommand({ id: 'open', name: 'Apri la linea', callback: () => this.activate() });
    this.addCommand({ id: 'today', name: "Com'è andata oggi?", callback: async () => { const v = await this.activate(); if (v) v.openDay(iso(todayT())); } });
    this.addCommand({ id: 'tidy', name: 'Metti in ordine le giornate (sposta le note fuori posto nel diario)', callback: () => this.tidy(false) });
    this.addCommand({ id: 'demo', name: 'Crea dati di prova (sottocartella "Trailglow demo" del diario)', callback: () => this.createDemo() });
    this.addSettingTab(new TrailglowSettingTab(this.app, this));

    const refresh = () => this.scheduleRefresh();
    this.registerEvent(this.app.metadataCache.on('changed', refresh));
    this.registerEvent(this.app.metadataCache.on('resolved', refresh));
    this.registerEvent(this.app.vault.on('create', refresh));
    this.registerEvent(this.app.vault.on('delete', refresh));
    this.registerEvent(this.app.vault.on('rename', refresh));
  }

  async saveSettings(quiet) { await this.saveData(this.settings); if (!quiet) this.scheduleRefresh(); }

  views() { return this.app.workspace.getLeavesOfType(VIEW_TYPE).map((l) => l.view).filter((v) => v instanceof TrailglowView); }

  scheduleRefresh() {
    clearTimeout(this._t);
    this._t = setTimeout(() => this.views().forEach((v) => v.render()), 250);
  }

  async activate() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf('tab');
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
    return leaf.view instanceof TrailglowView ? leaf.view : null;
  }

  dailyFiles() {
    const folder = this.settings.folder;
    return this.app.vault.getMarkdownFiles().filter((f) => DATE_RE.test(f.basename) && (!folder || f.path.startsWith(folder + '/')));
  }

  /* mappa YYYY-MM-DD → { mood, evento, hasNote, text, replies, file } */
  async buildIndex() {
    const index = new Map();
    for (const f of this.dailyFiles()) {
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      let parsed;
      const c = this.noteCache.get(f.path);
      if (c && c.mtime === f.stat.mtime) parsed = c.parsed;
      else {
        parsed = splitNote(await this.app.vault.cachedRead(f));
        this.noteCache.set(f.path, { mtime: f.stat.mtime, parsed: parsed });
      }
      index.set(f.basename, {
        mood: moodIndex(fm.mood), evento: fm.evento ? String(fm.evento) : '',
        hasNote: parsed.text.length > 0, text: parsed.text, replies: parsed.replies, file: f
      });
    }
    this.views().forEach((v) => { v.lastIndex = index; });
    return index;
  }

  findDay(id) { return this.dailyFiles().find((f) => f.basename === id) || null; }

  cleanFolder(v) {
    const c = String(v || '').trim().replace(/[\\:*?"<>|]/g, '').replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '');
    return c || 'Diario';
  }

  topFolders() {
    return this.app.vault.getAllLoadedFiles()
      .filter((f) => f.children && f.path && !f.path.includes('/') && !f.path.startsWith('.'))
      .map((f) => f.path).sort((a, b) => a.localeCompare(b));
  }

  /* cambia la cartella del diario e, se vuoi, ci sposta le giornate della vecchia */
  async changeFolder(value) {
    const next = this.cleanFolder(value), prev = this.settings.folder;
    if (next === prev) return;
    const inPrev = prev ? this.app.vault.getMarkdownFiles().filter((f) => DATE_RE.test(f.basename) && f.path.startsWith(prev + '/')) : [];
    this.settings.folder = next;
    await this.saveData(this.settings);
    if (inPrev.length && window.confirm('Trailglow: spostare ' + inPrev.length + ' giornate da "' + prev + '" a "' + next + '"? Se dici di no, restano dove sono ma Trailglow non le legge più.')) {
      let moved = 0, skipped = 0;
      for (const f of inPrev) {
        const dir = this.dayDir(f.basename);
        const target = normalizePath(dir + '/' + f.basename + '.md');
        if (this.app.vault.getAbstractFileByPath(target)) { skipped++; continue; }
        await this.ensureFolder(dir);
        await this.app.fileManager.renameFile(f, target);
        moved++;
      }
      new Notice('Trailglow: ' + moved + ' giornate spostate in "' + next + '"' + (skipped ? ', ' + skipped + ' saltate perché esisteva già una nota con la stessa data.' : '.'));
    }
    this.scheduleRefresh();
  }

  /* cartella dove va una giornata: Diario/2026/11/2026-11-09.md */
  dayDir(id) {
    const folder = this.settings.folder;
    const parts = [];
    if (folder) parts.push(folder);
    if (this.settings.subfolders) parts.push(id.slice(0, 4), id.slice(5, 7));
    return parts.join('/');
  }

  async ensureFolder(dir) {
    if (!dir) return;
    let cur = '';
    for (const seg of dir.split('/')) {
      cur = cur ? cur + '/' + seg : seg;
      if (!this.app.vault.getAbstractFileByPath(cur)) {
        try { await this.app.vault.createFolder(cur); } catch (e) { /* esiste già */ }
      }
    }
  }

  async getOrCreateDay(id) {
    let f = this.findDay(id);
    if (f) return f;
    const dir = this.dayDir(id);
    await this.ensureFolder(dir);
    f = await this.app.vault.create(normalizePath((dir ? dir + '/' : '') + id + '.md'), '');
    return f;
  }

  /* note giornaliere fuori posto: nella radice del vault o non nella sottocartella giusta */
  misplaced() {
    const folder = this.settings.folder;
    return this.app.vault.getMarkdownFiles().filter((f) => {
      if (!DATE_RE.test(f.basename)) return false;
      const dir = f.path.slice(0, Math.max(0, f.path.length - f.name.length - 1));
      if (dir === '') return !!folder || this.settings.subfolders;
      if (folder && dir === folder && this.settings.subfolders) return true;
      return false;
    });
  }

  async tidy(silent) {
    const list = this.misplaced();
    let moved = 0, skipped = 0;
    for (const f of list) {
      const dir = this.dayDir(f.basename);
      const target = normalizePath((dir ? dir + '/' : '') + f.basename + '.md');
      if (target === f.path) continue;
      if (this.app.vault.getAbstractFileByPath(target)) { skipped++; continue; }
      await this.ensureFolder(dir);
      await this.app.fileManager.renameFile(f, target);
      moved++;
    }
    if (!silent || moved || skipped) new Notice('Trailglow: ' + moved + ' giornate spostate in "' + (this.settings.folder || 'radice') + '"' + (skipped ? ', ' + skipped + ' saltate perché esiste già una nota con la stessa data.' : '.'));
    this.scheduleRefresh();
    return moved;
  }

  async openInObsidian(id) {
    const f = await this.getOrCreateDay(id);
    await this.app.workspace.getLeaf('tab').openFile(f);
  }

  async setMood(id, idx) {
    const f = await this.getOrCreateDay(id);
    await this.app.fileManager.processFrontMatter(f, (fm) => { if (idx < 0) delete fm.mood; else fm.mood = MOODS[idx].key; });
    this.scheduleRefresh();
  }

  async setEvento(id, name, mood) {
    const f = await this.getOrCreateDay(id);
    await this.app.fileManager.processFrontMatter(f, (fm) => {
      if (name === null) { delete fm.evento; return; }
      fm.evento = name;
      if (mood >= 0) fm.mood = MOODS[mood].key; else delete fm.mood;
    });
    this.scheduleRefresh();
  }

  async setNoteText(id, text) {
    const f = await this.getOrCreateDay(id);
    await this.app.vault.process(f, (data) => { const p = splitNote(data); return joinNote(p.fm, text, p.replies); });
    this.scheduleRefresh();
  }

  async addReply(id, text) {
    const f = await this.getOrCreateDay(id);
    await this.app.vault.process(f, (data) => {
      const p = splitNote(data);
      return joinNote(p.fm, p.text, p.replies.concat([{ written: iso(todayT()), text: text }]));
    });
    this.scheduleRefresh();
  }

  async createDemo() {
    const folder = (this.settings.folder ? this.settings.folder + '/' : '') + 'Trailglow demo';
    await this.ensureFolder(folder);
    let seed = 20261109;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const notes = [
      'Giornata lunga, ma la cena con gli amici l\'ha salvata.',
      'Corsa la mattina presto. Testa libera.',
      'Niente di speciale, ed è andata bene così.',
      'Giornata pesante. La scrivo qui così non me la porto a letto.',
      'Finita finalmente quella cosa che rimandavo.'
    ];
    const pick = () => { const r = rnd(); return r < 0.25 ? 0 : r < 0.65 ? 1 : r < 0.87 ? 2 : 3; };
    const today = todayT();
    let period = 1, made = 0;
    for (let i = 120; i >= 1; i--) {
      const id = iso(today - i * DAY);
      if (rnd() < 0.1) period = pick();
      const mood = rnd() < 0.65 ? (rnd() < 0.78 ? period : pick()) : -1;
      const note = rnd() < 0.15 ? notes[Math.floor(rnd() * notes.length)] : '';
      const path = normalizePath(folder + '/' + id + '.md');
      if (this.app.vault.getAbstractFileByPath(path)) continue;
      const fm = mood >= 0 ? '---\nmood: ' + MOODS[mood].key + '\n---\n' : '';
      await this.app.vault.create(path, fm + (note ? '\n' + note + '\n' : ''));
      made++;
    }
    new Notice('Trailglow: create ' + made + ' note di prova in "' + folder + '". Cancella quella cartella quando hai finito di provare.');
    this.scheduleRefresh();
  }
};
