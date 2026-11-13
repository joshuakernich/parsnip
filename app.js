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
const canvas = document.getElementById('vortex');
const ctx = canvas.getContext('2d');
const stage = document.getElementById('stage');
const sprites = document.getElementById('sprites');
const sctx = sprites.getContext('2d');
let SX = 1; // sprite canvas pixels per vortex pixel

// Confetti colours
const RAINBOW = ['#ff2a4d', '#ff6a1f', '#ffb21f', '#ffe83a', '#9cf23a', '#2ee06a',
  '#22e0c8', '#29a8ff', '#3d5bff', '#7a3dff', '#c03dff', '#ff3dc0'];
const WHITE = 0xffffffff;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

// Tunnel of nested polygons we fly into. Each ring takes the next of NB palette
// colours, alternating dark and light.
const NB = 6, RINGS = 1.9; // RINGS: rings per e-fold of distance (lower = more space between shapes)
const SHAPES = [6, 4, 3, 8, 5, 4]; // polygon sides, morphing from one to the next
const SHAPE_HOLD = 3, SHAPE_MORPH = 1.2;
const TAU = Math.PI * 2;

let PX = 2; // screen pixels per vortex pixel
let W = 0, H = 0, cx = 0, cy = 0, maxR = 1;
let img, buf, angA, logR, distA, dith;

function resize() {
  PX = Math.max(2, Math.round(Math.max(innerWidth, innerHeight) / 520));
  W = Math.ceil(innerWidth / PX);
  H = Math.ceil(innerHeight / PX);
  canvas.width = W;
  canvas.height = H;
  SX = PX * Math.min(devicePixelRatio || 1, 3);
  sprites.width = Math.round(W * SX);
  sprites.height = Math.round(H * SX);
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

// Icons ride the tunnel: their distance grows by e every RINGS of phase, exactly like the rings.
const FLY_MIN = Math.log(0.025), FLY_MAX = Math.log(1.4); // log of distance (x maxR) at spawn / exit
const flight = () => phase / (RINGS * (FLY_MAX - FLY_MIN)); // fraction of a full trip
let phase = 0;     // spiral rotation, advances faster during celebrations
let travel = 0;    // flight clock, also sped up by celebrations
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

// Where an instance is on its flight out of the core. z runs 1 (far, at the
// core) to 0 (at the camera); perspective makes it race outward and grow.
function instPos(it) {
  const p = (it.seed + flight()) % 1;
  const z = 1 - p;
  const rr = Math.exp(FLY_MIN + p * (FLY_MAX - FLY_MIN)) * maxR;
  const f = rr / (maxR * 0.33); // size grows with distance, like the rings
  const a = it.seed2 * Math.PI * 2 + p * 1.8 + travel * 0.06;
  return { x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr, z, f };
}

// Curated warp palettes: [dark, light, accent]. Rings run dark, light, dark,
// light, dark, accent. Each palette holds for a while, then crossfades to the next.
const PALETTES = [
  ['#1b1340', '#ffb38a', '#ff5f7e'], // midnight peach
  ['#0b2545', '#8de4ff', '#13c4a3'], // ocean
  ['#3b0a45', '#ffd166', '#ef476f'], // sunset
  ['#0f3d3e', '#b8f2e6', '#ffa69e'], // mint
  ['#2d1b69', '#e0c3fc', '#8ec5fc'], // lilac
  ['#1b3a2b', '#d8f3dc', '#f4a261'], // forest
  ['#4a0d3a', '#ffd6e8', '#ff7ab6'], // bubblegum
  ['#2b2d42', '#fdf0a6', '#4cc9f0'], // lemon
].map((p) => p.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))));
const RING_ROLES = [0, 1, 0, 1, 0, 2];
const PAL_HOLD = 5, PAL_FADE = 1.5;
const pal = Array.from({ length: NB }, () => [0, 0, 0]);
function evolvePalette(t) {
  const cyc = PAL_HOLD + PAL_FADE, k = Math.floor(t / cyc), f = t - k * cyc;
  const A = PALETTES[k % PALETTES.length], B = PALETTES[(k + 1) % PALETTES.length];
  let m = f < PAL_HOLD ? 0 : (f - PAL_HOLD) / PAL_FADE;
  m = m * m * (3 - 2 * m);
  for (let i = 0; i < NB; i++) {
    const a = A[RING_ROLES[i]], b = B[RING_ROLES[i]];
    for (let c = 0; c < 3; c++) pal[i][c] = a[c] + (b[c] - a[c]) * m;
  }
}

// Distance measured in polygon "apothems": constant along an n-gon outline.
function polyDist(r, a, n) {
  const seg = TAU / n;
  return r * Math.cos(a - seg * Math.floor(a / seg) - seg / 2);
}

let shapeD = new Float32Array(0);
function drawField(t) {
  evolvePalette(t);
  const n = W * H;
  if (shapeD.length !== n) shapeD = new Float32Array(n);

  const cyc = SHAPE_HOLD + SHAPE_MORPH, k = Math.floor(t / cyc), f = t - k * cyc;
  const n1 = SHAPES[k % SHAPES.length], n2 = SHAPES[(k + 1) % SHAPES.length];
  let mix = f < SHAPE_HOLD ? 0 : (f - SHAPE_HOLD) / SHAPE_MORPH;
  mix = mix * mix * (3 - 2 * mix);
  const rot = t * 0.4;                      // whole tunnel turns
  const twist = Math.sin(t * 0.3) * 0.6;    // deeper rings rotate relative to nearer ones

  for (let i = 0; i < n; i++) {
    const r = distA[i];
    const a = angA[i] * TAU - rot - logR[i] * twist;
    let d = polyDist(r, a, n1);
    if (mix > 0) d += (polyDist(r, a, n2) - d) * mix;
    shapeD[i] = d;
    const v = Math.log(d > 0.003 ? d : 0.003) * RINGS - phase;
    const band = ((Math.floor(v) % NB) + NB) % NB;
    const c = pal[band];
    const R = c[0], G = c[1], B = c[2];
    buf[i] = (255 << 24) | (Math.min(255, B) << 16) | (Math.min(255, G) << 8) | Math.min(255, R);
  }
  for (const ring of rings) {
    const rr = ring.r, w = ring.w;
    for (let i = 0; i < n; i++) {
      const e = Math.abs(shapeD[i] - rr);
      if (e < w && dith[i] > e / w * 0.9) buf[i] = WHITE;
    }
  }
  ctx.putImageData(img, 0, 0);
}

let last = performance.now();
function frame(ms) {
  const dt = Math.min((ms - last) / 1000, 0.05);
  last = ms;
  const t = ms / 1000;
  phase += dt * (1.8 + boost * 5); // flight speed into the tunnel (icons fly on their own clock)
  travel += dt * (1 + boost * 2.5);
  boost = Math.max(0, boost - dt * 0.55);
  rings = rings.filter((r) => (r.r += dt * (0.9 + r.r), r.w = 0.018 + r.r * 0.03, r.r < 1.3));

  drawField(t);
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.clearRect(0, 0, sprites.width, sprites.height);
  sctx.setTransform(SX, 0, 0, SX, 0, 0); // draw in vortex-pixel units
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';

  // Flying icons, far first so near ones draw on top
  const placed = instances.map((it) => ({ it, ...instPos(it) }));
  placed.sort((a, b) => b.z - a.z);
  for (const p of placed) {
    const size = ICON_SIZE * p.f * 0.75;
    if (size < 2) continue;
    sctx.globalAlpha = Math.min(1, (1 - p.z) / 0.12);
    sctx.drawImage(iconSprite(p.it.icon), p.x - size / 2, p.y - size / 2, size, size);
  }
  sctx.globalAlpha = 1;

  // Confetti
  particles = particles.filter((q) => (q.life -= dt) > 0);
  for (const q of particles) {
    q.vy += 60 * dt; q.vx *= 0.985; q.x += q.vx * dt; q.y += q.vy * dt;
    ctx.fillStyle = q.col;
    ctx.fillRect(Math.round(q.x), Math.round(q.y), q.s, q.s);
  }

  // Hero icon: pops in big, then dives into the core and starts flying out at you
  if (hero) {
    const age = t - hero.start;
    const big = ICON_SIZE * Math.max(2, Math.floor(Math.min(W, H) * 0.55 / ICON_SIZE));
    let s;
    if (age < hero.hold) {
      const k = Math.min(age / 0.35, 1);
      s = big * k * (1 + Math.sin(k * Math.PI * 2.5) * (1 - k) * 0.6);
    } else {
      const k = Math.min((age - hero.hold) / 0.45, 1);
      s = big * (1 - k * k);
      if (k >= 1) {
        hero.inst.seed = (((-flight()) % 1) + 1) % 1; // start at the core, right now
        instances.push(hero.inst);
        hero = null;
      }
    }
    if (hero && s >= 1) {
      const wob = age > 0.35 && age < hero.hold ? Math.sin(age * 9) * 1.5 : 0;
      sctx.drawImage(iconSprite(hero.icon), cx - s / 2 + wob, cy - s / 2, s, s);
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

  stage.classList.remove('shake');
  void stage.offsetWidth;
  stage.classList.add('shake');

  boost = Math.min(1.6, boost + 1 + Math.min(s.combo, 30) / 30);
  rings.push({ r: 0.02, w: 0.02 });
  setTimeout(() => rings.push({ r: 0.02, w: 0.02 }), 140);
  const n = 90 + Math.min(s.combo, 30) * 6;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 120;
    particles.push({
      x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
      life: 1 + Math.random() * 1.4, s: Math.random() < 0.25 ? 2 : 1,
      col: RAINBOW[(Math.random() * RAINBOW.length) | 0],
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
  const inst = { icon: habit.icon, seed: 0, seed2: Math.random(), t: entry.t };
  if (hero) { // a previous hero still on screen launches from the core immediately
    hero.inst.seed = (((-flight()) % 1) + 1) % 1;
    instances.push(hero.inst);
  }
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
    b.append(iconEl(habit.icon, 4));
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
// Pixel gear for the settings button
(() => {
  const g = ['.....##.....', '..#.####.#..', '.##########.', '..###..###..', '.###....###.', '####....####',
    '####....####', '.###....###.', '..###..###..', '.##########.', '..#.####.#..', '.....##.....'];
  const c = document.createElement('canvas');
  c.width = c.height = 12;
  const gx = c.getContext('2d');
  gx.fillStyle = '#fff';
  g.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && gx.fillRect(x, y, 1, 1)));
  document.getElementById('gear').append(c);
})();

const settingsEl = document.getElementById('settings');
document.getElementById('gear').addEventListener('click', openSettings);
settingsEl.querySelector('.close').addEventListener('click', () => (settingsEl.hidden = true));
settingsEl.addEventListener('click', (e) => { if (e.target === settingsEl) settingsEl.hidden = true; });
document.getElementById('vars-link').href = `https://github.com/${REPO}/settings/variables/actions`;

const soundEl = document.getElementById('sound');
soundEl.addEventListener('change', () => { state.sound = soundEl.checked; saveState(); });

// ---------- Push notifications ----------
// The daily "Parsnip?" is sent by a GitHub Action using this device's push
// subscription, stored in the repo's PUSH_SUBSCRIPTION secret.
const VAPID_PUBLIC_KEY = 'BN2swssT80HTByvveACzavE2gUHm9IIViIsLDeY_P2avgEhblqAv5ufg-YrgfNkWvP9992C0uAQMCHxDOSp9Y4U';
const pushStatus = document.getElementById('push-status');
const pushEnable = document.getElementById('push-enable');
const pushLink = document.getElementById('push-link');
const pushCode = document.getElementById('push-code');
document.getElementById('push-secret').href = `https://github.com/${REPO}/settings/secrets/actions`;

const b64urlToBytes = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

async function refreshPush() {
  pushEnable.hidden = true;
  pushLink.hidden = true;
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!supported) {
    pushStatus.textContent = /iPhone|iPad/.test(navigator.userAgent) && !standalone
      ? 'Add Parsnip to your Home Screen (Share → Add to Home Screen), open it from there, then turn on notifications.'
      : "This browser can't receive push notifications.";
    return;
  }
  if (Notification.permission === 'denied') {
    pushStatus.textContent = 'Notifications are blocked. Allow them in Settings → Notifications → Parsnip.';
    return;
  }
  let sub = null;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) sub = await reg.pushManager.getSubscription();
  } catch {}
  if (!sub || Notification.permission !== 'granted') {
    pushStatus.textContent = 'Get a "Parsnip?" nudge once a day.';
    pushEnable.hidden = false;
    return;
  }
  let saved = null;
  try { saved = localStorage.getItem('parsnip:pushEndpoint'); } catch {}
  pushStatus.textContent = saved === sub.endpoint
    ? 'Notifications are on for this device.'
    : 'Notifications are allowed. One last step:';
  pushCode.value = JSON.stringify(sub);
  pushLink.hidden = false;
}

pushEnable.addEventListener('click', async () => {
  try {
    if ((await Notification.requestPermission()) !== 'granted') return refreshPush();
    const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('sw.js'));
    await navigator.serviceWorker.ready;
    await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(VAPID_PUBLIC_KEY) });
  } catch (e) {
    alert("Couldn't turn on notifications: " + e.message);
  }
  refreshPush();
});

document.getElementById('push-copy').addEventListener('click', async (e) => {
  const sub = JSON.parse(pushCode.value);
  try { await navigator.clipboard.writeText(pushCode.value); } catch { pushCode.select(); document.execCommand('copy'); }
  try { localStorage.setItem('parsnip:pushEndpoint', sub.endpoint); } catch {}
  e.target.textContent = 'COPIED!';
  setTimeout(() => (e.target.textContent = 'COPY CODE'), 1500);
});

function openSettings() {
  soundEl.checked = state.sound;
  refreshPush();
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
    b.setAttribute('aria-label', icon.label);
    b.append(iconEl(key, 3));
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
loadSprites().then((ok) => {
  if (!ok) return;
  renderBar();
  if (_sprites.cog) document.getElementById('gear').replaceChildren(iconEl('cog', 2));
});
