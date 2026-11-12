'use strict';

const REPO = 'joshuakernich/parsnip';
const STORE_KEY = 'parsnip:v1';

// ---------- State ----------
const defaultState = () => ({
  habits: [
    { id: 'parsnip', name: 'Parsnip', icon: 'parsnip' },
    { id: 'disco', name: 'Disco', icon: 'disco' },
    { id: 'jazz', name: 'Jazz', icon: 'jazz' },
  ],
  log: [], // { h: habitId, t: epoch ms }
  sound: true,
});

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && Array.isArray(s.habits) && Array.isArray(s.log)) return { ...defaultState(), ...s };
  } catch {}
  return defaultState();
}
function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
}
let state = loadState();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

const dayKey = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const habitById = (id) => state.habits.find((h) => h.id === id);

// Total taps, current combo (consecutive days ending today, or yesterday if not
// yet tapped today), and best-ever combo.
function statsFor(hid, log = state.log) {
  const taps = log.filter((e) => e.h === hid);
  const days = new Set(taps.map((e) => dayKey(e.t)));
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  const today = days.has(dayKey(d));
  if (!today) d.setDate(d.getDate() - 1);
  let combo = 0;
  while (days.has(dayKey(d))) { combo++; d.setDate(d.getDate() - 1); }

  let best = 0, run = 0, prev = null;
  for (const k of [...days].sort()) {
    const cur = new Date(k + 'T12:00:00');
    run = prev && Math.round((cur - prev) / 864e5) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = cur;
  }
  return { count: taps.length, combo, best, today };
}

// ---------- Vortex renderer ----------
const PX = 3; // screen pixels per vortex pixel
const canvas = document.getElementById('vortex');
const ctx = canvas.getContext('2d');

const RAINBOW = ['#ff2a4d', '#ff6a1f', '#ffb21f', '#ffe83a', '#9cf23a', '#2ee06a',
  '#22e0c8', '#29a8ff', '#3d5bff', '#7a3dff', '#c03dff', '#ff3dc0'];
const SHADES = [0.16, 0.34, 0.6, 0.85, 1.0];
const NB = RAINBOW.length, NS = SHADES.length;
const LUT = new Uint32Array(NB * NS);
RAINBOW.forEach((hex, i) => {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  SHADES.forEach((s, j) => {
    LUT[i * NS + j] = (255 << 24) | (Math.round(b * s) << 16) | (Math.round(g * s) << 8) | Math.round(r * s);
  });
});
const VOID = (255 << 24) | (0x14 << 16) | (0x04 << 8) | 0x0a;
const WHITE = 0xffffffff;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

let W = 0, H = 0, cx = 0, cy = 0, maxR = 1;
let img, buf, angA, logR, distA, dith;

function resize() {
  W = Math.ceil(innerWidth / PX);
  H = Math.ceil(innerHeight / PX);
  canvas.width = W;
  canvas.height = H;
  cx = W / 2;
  cy = H * 0.56;
  maxR = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
  img = ctx.createImageData(W, H);
  buf = new Uint32Array(img.data.buffer);
  const n = W * H;
  angA = new Float32Array(n); logR = new Float32Array(n); distA = new Float32Array(n); dith = new Float32Array(n);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x, dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const r = Math.hypot(dx, dy) / maxR;
      distA[i] = r;
      angA[i] = Math.atan2(dy, dx) / (Math.PI * 2);
      logR[i] = Math.log(Math.max(r, 0.004));
      dith[i] = BAYER[(y & 3) * 4 + (x & 3)];
    }
  }
}
addEventListener('resize', resize);
resize();

const ARMS = 3, TWIST = 1.7, PERIOD = 70; // PERIOD: seconds for an icon to spiral from rim to core
let phase = 0;     // spiral rotation, advances faster during celebrations
let boost = 0;     // celebration energy, decays to 0
let rings = [];    // expanding shockwave rings { r, w }
let particles = [];
let instances = []; // icons in the vortex
let hero = null;   // the big celebrating icon

const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

function buildInstances() {
  const recent = state.log.slice(-500);
  instances = recent.map((e) => ({ icon: (habitById(e.h) || {}).icon || 'star', seed: hash(e.t % 1e7), seed2: hash((e.t % 1e7) + 7.3), t: e.t }));
}

// Position of a vortex instance at time `now` (seconds).
function instPos(it, now) {
  const p = (it.seed + now / PERIOD) % 1;
  const rn = Math.pow(1 - p, 1.25);
  const a = it.seed2 * Math.PI * 2 - Math.log(Math.max(rn, 0.02)) * TWIST * 0.9 + phase * 0.9;
  return { x: cx + Math.cos(a) * rn * maxR * 0.92, y: cy + Math.sin(a) * rn * maxR * 0.92, rn };
}

function drawField(t) {
  const n = W * H;
  const coreR = 0.035 + boost * 0.05 + Math.sin(t * 2) * 0.006;
  for (let i = 0; i < n; i++) {
    const r = distA[i];
    if (r < coreR) { buf[i] = VOID; continue; }
    const v = angA[i] * ARMS + logR[i] * TWIST - phase;
    let band = Math.floor((v - Math.floor(v)) * NB + dith[i] * 0.55) % NB;
    let shade = Math.floor(Math.min(r * 4.2, 1) * (NS - 1) * 0.85 + dith[i] * 0.9 + boost * 0.8);
    if (shade > NS - 1) shade = NS - 1;
    buf[i] = LUT[band * NS + shade];
  }
  for (const ring of rings) {
    const rr = ring.r, w = ring.w;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(distA[i] - rr);
      if (d < w && dith[i] > d / w * 0.9) buf[i] = WHITE;
    }
  }
  ctx.putImageData(img, 0, 0);
}

let last = performance.now();
function frame(ms) {
  const dt = Math.min((ms - last) / 1000, 0.05);
  last = ms;
  const t = ms / 1000;
  phase += dt * (0.22 + boost * 2.2);
  boost = Math.max(0, boost - dt * 0.55);
  rings = rings.filter((r) => (r.r += dt * (0.9 + r.r), r.w = 0.018 + r.r * 0.03, r.r < 1.3));

  drawField(t);
  ctx.imageSmoothingEnabled = false;

  // Vortex icons, far (core) first
  const placed = instances.map((it) => ({ it, ...instPos(it, t) })).filter((p) => p.rn > 0.06);
  placed.sort((a, b) => a.rn - b.rn);
  for (const p of placed) {
    const size = Math.max(4, Math.round(16 * (0.28 + p.rn * 0.95)));
    ctx.globalAlpha = Math.min(1, (p.rn - 0.06) * 8);
    ctx.drawImage(iconCanvas(p.it.icon), Math.round(p.x - size / 2), Math.round(p.y - size / 2), size, size);
  }
  ctx.globalAlpha = 1;

  // Confetti
  particles = particles.filter((q) => (q.life -= dt) > 0);
  for (const q of particles) {
    q.vy += 60 * dt; q.vx *= 0.985; q.x += q.vx * dt; q.y += q.vy * dt;
    ctx.fillStyle = q.col;
    ctx.fillRect(Math.round(q.x), Math.round(q.y), q.s, q.s);
  }

  // Hero icon: pops in big at the core, then shrinks into its spot in the vortex
  if (hero) {
    const age = t - hero.start;
    const big = Math.max(2, Math.floor(Math.min(W, H) * 0.42 / 16));
    if (age < hero.hold) {
      const k = Math.min(age / 0.35, 1);
      const elastic = 1 + Math.sin(k * Math.PI * 2.5) * (1 - k) * 0.6;
      const wob = Math.sin(age * 9) * 1.5 * (age > 0.35 ? 1 : 0);
      const s = Math.max(1, Math.round(big * 16 * k * elastic));
      ctx.drawImage(iconCanvas(hero.icon), Math.round(cx - s / 2 + wob), Math.round(cy - s / 2), s, s);
    } else {
      const k = Math.min((age - hero.hold) / 0.55, 1);
      const e = k * k * (3 - 2 * k);
      const dest = instPos(hero.inst, t);
      const dsize = 16 * (0.28 + dest.rn * 0.95);
      const s = Math.round(big * 16 + (dsize - big * 16) * e);
      const x = cx + (dest.x - cx) * e, y = cy + (dest.y - cy) * e;
      ctx.drawImage(iconCanvas(hero.icon), Math.round(x - s / 2), Math.round(y - s / 2), s, s);
      if (k >= 1) { instances.push(hero.inst); hero = null; }
    }
  }
  requestAnimationFrame(frame);
}

// ---------- Sound ----------
let audio;
function fanfare(combo, count) {
  if (!state.sound) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const now = audio.currentTime;
    const base = 523.25 * Math.pow(2, Math.min(combo - 1, 12) / 24);
    const steps = [0, 4, 7, 12, 16, 19, 24, 28];
    const notes = steps.slice(0, Math.min(3 + combo, steps.length));
    const tone = (f, at, len, type, vol) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(vol, now + at);
      g.gain.exponentialRampToValueAtTime(0.001, now + at + len);
      o.connect(g).connect(audio.destination);
      o.start(now + at); o.stop(now + at + len + 0.02);
    };
    notes.forEach((st, i) => tone(base * Math.pow(2, st / 12), i * 0.07, 0.12, 'square', 0.09));
    const end = notes.length * 0.07;
    const top = base * Math.pow(2, notes[notes.length - 1] / 12);
    tone(top, end, 0.45, 'square', 0.1);
    tone(top / 2, end, 0.45, 'triangle', 0.18);
    if (count % 10 === 0) tone(top * 1.5, end + 0.12, 0.5, 'square', 0.06);
  } catch {}
}

// ---------- Celebration ----------
const celebrateEl = document.getElementById('celebrate');
let celebrateTimer;

function praiseFor(s, newBest) {
  if (s.count === 1) return 'FIRST ONE!';
  if (s.count % 100 === 0) return `${s.count} TAPS! MYTHIC!`;
  if (s.count % 25 === 0) return `${s.count} MILESTONE!`;
  if (newBest && s.combo > 1) return 'NEW BEST COMBO!';
  const c = s.combo;
  if (c >= 100) return 'TRANSCENDENT!';
  if (c >= 30) return 'LEGENDARY!';
  if (c >= 14) return 'UNSTOPPABLE!';
  if (c >= 7) return 'ON FIRE!';
  if (c >= 3) return 'ON A ROLL!';
  return ['NICE!', 'YES!', 'GROOVY!', 'RADICAL!', 'SPLENDID!'][s.count % 5];
}

function celebrate(habit, s, newBest) {
  celebrateEl.querySelector('.c-name').textContent = habit.name.toUpperCase() + '!';
  celebrateEl.querySelector('.c-count .num').textContent = s.count;
  celebrateEl.querySelector('.c-combo .num').textContent = '×' + s.combo;
  celebrateEl.querySelector('.c-combo .unit').textContent = s.combo === 1 ? 'DAY' : 'DAYS IN A ROW';
  celebrateEl.querySelector('.c-praise').textContent = praiseFor(s, newBest);
  celebrateEl.classList.remove('show', 'hot');
  void celebrateEl.offsetWidth; // restart CSS animations
  celebrateEl.classList.add('show');
  celebrateEl.classList.toggle('hot', s.combo >= 7 || newBest);
  clearTimeout(celebrateTimer);
  celebrateTimer = setTimeout(() => celebrateEl.classList.remove('show', 'hot'), 2700);

  canvas.classList.remove('shake');
  void canvas.offsetWidth;
  canvas.classList.add('shake');

  boost = Math.min(1.6, boost + 1 + Math.min(s.combo, 30) / 30);
  rings.push({ r: 0.02, w: 0.02 });
  setTimeout(() => rings.push({ r: 0.02, w: 0.02 }), 140);
  const n = 90 + Math.min(s.combo, 30) * 6;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 120;
    particles.push({
      x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
      life: 1 + Math.random() * 1.4, s: Math.random() < 0.25 ? 2 : 1,
      col: RAINBOW[(Math.random() * NB) | 0],
    });
  }
  fanfare(s.combo, s.count);
}

// ---------- Tapping ----------
let undoTimer;
const undoEl = document.getElementById('undo');

function tap(habit, btn) {
  const before = statsFor(habit.id);
  const entry = { h: habit.id, t: Date.now() };
  state.log.push(entry);
  saveState();
  const s = statsFor(habit.id);
  const newBest = s.combo > before.best && before.best > 0;

  const now = performance.now() / 1000;
  // Land the new icon near the rim of the vortex
  const inst = { icon: habit.icon, seed: ((0.08 - now / PERIOD) % 1 + 1) % 1, seed2: Math.random(), t: entry.t };
  if (hero) instances.push(hero.inst); // a previous hero still mid-flight just joins immediately
  hero = { icon: habit.icon, inst, start: now, hold: 1.5 };

  celebrate(habit, s, newBest);
  if (btn) { btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump'); }
  renderBar();

  undoEl.hidden = false;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => (undoEl.hidden = true), 4000);
}

undoEl.querySelector('button').addEventListener('click', () => {
  const entry = state.log.pop();
  if (!entry) return;
  saveState();
  if (hero && hero.inst.t === entry.t) hero = null;
  instances = instances.filter((i) => i.t !== entry.t);
  celebrateEl.classList.remove('show', 'hot');
  undoEl.hidden = true;
  renderBar();
});

// ---------- Habit bar ----------
const bar = document.getElementById('bar');

function iconEl(name, scale) {
  const src = iconCanvas(name, scale);
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

function renderBar() {
  bar.innerHTML = '';
  for (const habit of state.habits) {
    const s = statsFor(habit.id);
    const b = document.createElement('button');
    b.className = 'habit' + (s.today ? ' done' : '');
    b.setAttribute('aria-label', `${habit.name}: ${s.count} taps, ${s.combo} day combo`);
    b.append(iconEl(habit.icon, 3));
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = s.combo > 0 ? s.combo : '';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = habit.name;
    b.append(badge, name);

    // Tap to celebrate; long-press to edit
    let pressTimer, longPressed = false;
    b.addEventListener('pointerdown', () => {
      longPressed = false;
      pressTimer = setTimeout(() => { longPressed = true; openEditor(habit); }, 600);
    });
    const cancel = () => clearTimeout(pressTimer);
    b.addEventListener('pointerup', cancel);
    b.addEventListener('pointerleave', cancel);
    b.addEventListener('pointercancel', cancel);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    b.addEventListener('click', () => { if (!longPressed) tap(habit, b); });
    bar.append(b);
  }
  const add = document.createElement('button');
  add.className = 'habit add';
  add.textContent = '+';
  add.setAttribute('aria-label', 'Add habit');
  add.addEventListener('click', () => openEditor(null));
  bar.append(add);
  document.getElementById('empty').hidden = state.habits.length > 0;
}

// ---------- Settings ----------
const settingsEl = document.getElementById('settings');
document.getElementById('gear').addEventListener('click', openSettings);
settingsEl.querySelector('.close').addEventListener('click', () => (settingsEl.hidden = true));
settingsEl.addEventListener('click', (e) => { if (e.target === settingsEl) settingsEl.hidden = true; });
document.getElementById('vars-link').href = `https://github.com/${REPO}/settings/variables/actions`;

const soundEl = document.getElementById('sound');
soundEl.addEventListener('change', () => { state.sound = soundEl.checked; saveState(); });

function openSettings() {
  soundEl.checked = state.sound;
  const list = document.getElementById('habit-list');
  list.innerHTML = '';
  state.habits.forEach((habit, i) => {
    const li = document.createElement('li');
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = habit.name;
    const mk = (label, aria, fn, disabled) => {
      const b = document.createElement('button');
      b.className = 'pixbtn'; b.textContent = label; b.setAttribute('aria-label', aria);
      b.disabled = disabled; if (disabled) b.style.opacity = .35;
      b.addEventListener('click', fn);
      return b;
    };
    const move = (d) => () => {
      const [h] = state.habits.splice(i, 1);
      state.habits.splice(i + d, 0, h);
      saveState(); renderBar(); openSettings();
    };
    li.append(iconEl(habit.icon, 2), n,
      mk('◀', 'Move left', move(-1), i === 0),
      mk('▶', 'Move right', move(1), i === state.habits.length - 1),
      mk('EDIT', 'Edit ' + habit.name, () => openEditor(habit)));
    list.append(li);
  });
  settingsEl.hidden = false;
}
document.getElementById('add-habit').addEventListener('click', () => openEditor(null));

document.getElementById('export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `parsnip-backup-${dayKey(Date.now())}.json`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});
document.getElementById('import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const s = JSON.parse(await file.text());
    if (!Array.isArray(s.habits) || !Array.isArray(s.log)) throw new Error('bad file');
    if (!confirm(`Replace current data with this backup (${s.habits.length} habits, ${s.log.length} taps)?`)) return;
    state = { ...defaultState(), ...s };
    saveState(); buildInstances(); renderBar(); openSettings();
  } catch { alert("That doesn't look like a Parsnip backup."); }
});

// ---------- Habit editor ----------
const editorEl = document.getElementById('editor');
const nameInput = document.getElementById('habit-name');
const grid = document.getElementById('icon-grid');
let editing = null, chosenIcon = 'parsnip';

function openEditor(habit) {
  editing = habit;
  chosenIcon = habit ? habit.icon : 'star';
  nameInput.value = habit ? habit.name : '';
  document.getElementById('editor-title').textContent = habit ? 'EDIT HABIT' : 'NEW HABIT';
  document.getElementById('habit-delete').hidden = !habit;
  grid.innerHTML = '';
  for (const [key, icon] of Object.entries(ICONS)) {
    const b = document.createElement('button');
    b.setAttribute('role', 'option');
    b.setAttribute('aria-selected', String(key === chosenIcon));
    b.append(iconEl(key, 3), icon.label);
    b.addEventListener('click', () => {
      chosenIcon = key;
      grid.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      if (!nameInput.value.trim() || Object.values(ICONS).some((i) => i.label === nameInput.value)) nameInput.value = icon.label;
    });
    grid.append(b);
  }
  editorEl.hidden = false;
}

document.getElementById('habit-cancel').addEventListener('click', () => (editorEl.hidden = true));
editorEl.addEventListener('click', (e) => { if (e.target === editorEl) editorEl.hidden = true; });

document.getElementById('habit-save').addEventListener('click', () => {
  const name = nameInput.value.trim() || ICONS[chosenIcon].label;
  if (editing) {
    editing.name = name;
    editing.icon = chosenIcon;
  } else {
    state.habits.push({ id: 'h' + Date.now().toString(36), name, icon: chosenIcon });
  }
  saveState(); buildInstances(); renderBar();
  editorEl.hidden = true;
  if (!settingsEl.hidden) openSettings();
});

document.getElementById('habit-delete').addEventListener('click', () => {
  if (!editing) return;
  const n = state.log.filter((e) => e.h === editing.id).length;
  if (!confirm(`Delete "${editing.name}" and its ${n} taps? This can't be undone.`)) return;
  state.habits = state.habits.filter((h) => h !== editing);
  state.log = state.log.filter((e) => e.h !== editing.id);
  saveState(); buildInstances(); renderBar();
  editorEl.hidden = true;
  if (!settingsEl.hidden) openSettings();
});

// ---------- Install tip (Safari, not yet on the Home Screen) ----------
const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
const tipEl = document.getElementById('install-tip');
let tipDismissed = false;
try { tipDismissed = localStorage.getItem('parsnip:tip') === '1'; } catch {}
if (!standalone && !tipDismissed && /iPhone|iPad/.test(navigator.userAgent)) tipEl.hidden = false;
tipEl.querySelector('.x').addEventListener('click', () => {
  tipEl.hidden = true;
  try { localStorage.setItem('parsnip:tip', '1'); } catch {}
});

// ---------- Go ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
buildInstances();
renderBar();
requestAnimationFrame(frame);
