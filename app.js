'use strict';

const STORE_KEY = 'parsnip:v1';

// ---------- State ----------
const defaultState = () => ({
  habits: [], // new users start with none and add their own
  log: [], // { h: habitId, t: epoch ms }
  sound: true,
  music: true,
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

// ---------- Renderer ----------
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

// ---------- Display modes ----------
// Each mode paints a background into the pixel buffer (returning the distance
// field that celebration rings follow), draws its collection of icons on the
// smooth sprite layer, and says where a newly tapped icon should land.
let boost = 0;     // celebration energy, decays to 0
let rings = [];    // expanding shockwave rings { r, w }
let particles = [];
let hero = null;   // the big celebrating icon

const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const toItem = (e) => ({ icon: (habitById(e.h) || {}).icon || 'star', t: e.t, seed: hash(e.t % 1e7), seed2: hash((e.t % 1e7) + 7.3) });
const rgb32 = (c) => (255 << 24) | (Math.min(255, c[2]) << 16) | (Math.min(255, c[1]) << 8) | Math.min(255, c[0]);
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

// Curated palettes: [dark, light, accent]. Each holds for a while, then crossfades to the next.
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
const PAL_HOLD = 5, PAL_FADE = 1.5;
const tri = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; // current dark, light, accent
function evolvePalette(t) {
  const cyc = PAL_HOLD + PAL_FADE, k = Math.floor(t / cyc), f = t - k * cyc;
  const A = PALETTES[k % PALETTES.length], B = PALETTES[(k + 1) % PALETTES.length];
  let m = f < PAL_HOLD ? 0 : (f - PAL_HOLD) / PAL_FADE;
  m = m * m * (3 - 2 * m);
  for (let i = 0; i < 3; i++) for (let c = 0; c < 3; c++) tri[i][c] = A[i][c] + (B[i][c] - A[i][c]) * m;
}

// ----- Vortex: a tunnel of nested polygons, icons flying out at you -----
const RING_ROLES = [0, 1, 0, 1, 0, 2]; // rings run dark, light, dark, light, dark, accent
// Icons ride the tunnel: their distance grows by e every RINGS of phase, exactly like the rings.
const FLY_MIN = Math.log(0.025), FLY_MAX = Math.log(1.4); // log of distance (x maxR) at spawn / exit
let phase = 0;     // flight into the tunnel, faster during celebrations
let travel = 0;    // slow clock for icon drift
const flight = () => phase / (RINGS * (FLY_MAX - FLY_MIN)); // fraction of a full trip

// Distance measured in polygon "apothems": constant along an n-gon outline.
function polyDist(r, a, n) {
  const seg = TAU / n;
  return r * Math.cos(a - seg * Math.floor(a / seg) - seg / 2);
}

let shapeD = new Float32Array(0);
const vortex = {
  items: [],
  center: () => ({ x: cx, y: cy }),
  build(items) { this.items = items.slice(-500); },
  add(it) { it.seed = (((-flight()) % 1) + 1) % 1; this.items.push(it); }, // launch from the core now
  remove(t) { this.items = this.items.filter((i) => i.t !== t); },
  landing: () => ({ x: cx, y: cy, size: 0 }), // dives into the core
  update(dt) {
    phase += dt * (1.8 + boost * 5);
    travel += dt * (1 + boost * 2.5);
  },
  // z runs 1 (far, at the core) to 0 (at the camera); perspective makes icons race outward and grow
  pos(it) {
    const p = (it.seed + flight()) % 1;
    const rr = Math.exp(FLY_MIN + p * (FLY_MAX - FLY_MIN)) * maxR;
    const a = it.seed2 * TAU + p * 1.8 + travel * 0.06;
    return { x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr, z: 1 - p, f: rr / (maxR * 0.33) };
  },
  background(t) {
    const n = W * H;
    if (shapeD.length !== n) shapeD = new Float32Array(n);
    const cols = RING_ROLES.map((r) => rgb32(tri[r]));
    const cyc = SHAPE_HOLD + SHAPE_MORPH, k = Math.floor(t / cyc), f = t - k * cyc;
    const n1 = SHAPES[k % SHAPES.length], n2 = SHAPES[(k + 1) % SHAPES.length];
    let m = f < SHAPE_HOLD ? 0 : (f - SHAPE_HOLD) / SHAPE_MORPH;
    m = m * m * (3 - 2 * m);
    const rot = t * 0.4;                      // whole tunnel turns
    const twist = Math.sin(t * 0.3) * 0.6;    // deeper rings rotate relative to nearer ones
    for (let i = 0; i < n; i++) {
      const r = distA[i];
      const a = angA[i] * TAU - rot - logR[i] * twist;
      let d = polyDist(r, a, n1);
      if (m > 0) d += (polyDist(r, a, n2) - d) * m;
      shapeD[i] = d;
      const v = Math.log(d > 0.003 ? d : 0.003) * RINGS - phase;
      buf[i] = cols[((Math.floor(v) % NB) + NB) % NB];
    }
    return shapeD;
  },
  draw() {
    const placed = this.items.map((it) => ({ it, ...this.pos(it) }));
    placed.sort((a, b) => b.z - a.z); // far first so near ones draw on top
    for (const p of placed) {
      const size = ICON_SIZE * (0.4 + p.f * 1.1); // a head start near the core, then grow with the rings
      if (size >= 2) drawSprite(p.it.icon, p.x, p.y, size);
    }
  },
};

// ----- Landscape: a psychedelic valley with a growing pile of icons -----
// The pile is pseudo-physics: each icon drops near the middle, lands on whatever
// is below it, and rolls downhill until it settles. Icons collide only on a small
// core (DISC) but draw much bigger, so they overlap like a real heap of stuff.
// New arrivals fall in with gravity, bounce, spin and jostle their neighbours.
// Positions are in "units" (an icon draws about 1 unit across), y up from the ground.
const DISC = 0.3;
let ridgeFar = new Float32Array(0), ridgeNear = new Float32Array(0);
const landscape = {
  items: [], discs: [], cols: new Map(), unit: 40, unitTarget: 40,
  center: () => ({ x: cx, y: H * 0.34 }),
  ground: () => H * 0.8,
  build(items) {
    this.items = []; this.discs = []; this.cols = new Map();
    for (const it of items.slice(-900)) this.add(it, true);
    for (const d of this.discs) delete d.path;
    this.fit(true);
  },
  add(it, quiet) {
    const d = it._spot || this.place(it);
    if (!quiet) {
      // drop onto the top of the pile, then tumble down the slope to its spot
      d.stage = 'fall'; d.ax = d.path[0].x; d.ay = d.path[0].y + 1.6; d.vy = -1;
      d.seg = 0; d.speed = 1.2; d.rotNow = 0;
    }
    this.items.push(it); this.discs.push(d);
    for (let c = Math.floor(d.x - d.r); c <= Math.floor(d.x + d.r); c++) {
      if (!this.cols.has(c)) this.cols.set(c, []);
      this.cols.get(c).push(d);
    }
    if (!quiet) this.fit();
  },
  remove(t) {
    const i = this.items.findIndex((x) => x.t === t);
    if (i < 0) return;
    const keep = this.items.filter((_, j) => j !== i);
    this.build(keep);
  },
  // highest resting height for a disc of radius r centred at x
  restAt(x, r) {
    let y = r, on = null;
    for (let c = Math.floor(x - r - 0.6); c <= Math.floor(x + r + 0.6); c++) {
      for (const d of this.cols.get(c) || []) {
        const dx = d.x - x, rr = d.r + r;
        if (Math.abs(dx) >= rr) continue;
        const yc = d.y + Math.sqrt(rr * rr - dx * dx);
        if (yc > y) { y = yc; on = d; }
      }
    }
    return { y, on };
  },
  place(it) {
    const r = DISC * (0.85 + it.seed2 * 0.3);
    // always dropped near the middle (sum of uniforms ≈ narrow bell curve)
    let x = (it.seed + hash(it.seed * 91.7) + hash(it.seed * 13.1) - 1.5) * 0.35;
    let { y, on } = this.restAt(x, r);
    const path = [{ x, y }];
    // Roll downhill. At each dip, look an icon's width ahead: while the pile is
    // steeper than about 45° it tumbles on over the bump; once it eases off, it
    // settles. That keeps the heap tall and steep rather than spread out.
    // It always tumbles a little way first (minRoll) so every drop visibly rolls.
    let dir = 0, rolled = 0;
    const minRoll = 0.2 + hash(it.seed * 2.9) * 0.45;
    for (let i = 0; i < 1600 && on; i++) {
      const lean = Math.sign(x - on.x) || (it.seed2 > 0.5 ? 1 : -1);
      if (!dir) dir = lean;
      const n = this.restAt(x + dir * 0.025, r);
      const dip = n.y > y + 1e-4, steep = y - this.restAt(x + dir * 0.7, r).y >= 0.7 * 0.95;
      if (dip && !steep && rolled >= minRoll) break; // a dip on gentle ground: settled
      rolled += 0.025;
      x += dir * 0.025; y = n.y; on = n.on;
      if (i % 3 === 2) path.push({ x, y });
    }
    path.push({ x, y });
    return {
      x, y, r, path,
      size: 0.95 + hash(it.seed * 5.9) * 0.35,   // drawn size, much bigger than the collision core
      rot: (hash(it.seed * 7.7) - 0.5) * 1.8,
      jx: 0, jy: 0, jvx: 0, jvy: 0,               // jostle offset (springs back)
    };
  },
  // zoom so the whole pile (plus room on top) fits on screen
  fit(snap) {
    let minX = -1.5, maxX = 1.5, maxY = 1.5;
    for (const d of this.discs) { minX = Math.min(minX, d.x - d.size / 2); maxX = Math.max(maxX, d.x + d.size / 2); maxY = Math.max(maxY, d.y + d.size / 2); }
    const halfW = Math.max(-minX, maxX) + 0.5;
    this.unitTarget = Math.min(ICON_SIZE * 1.5, (W * 0.46) / halfW, (this.ground() - H * 0.24) / (maxY + 1));
    if (snap) this.unit = this.unitTarget;
  },
  toScreen(d) { return { x: cx + d.x * this.unit, y: this.ground() - d.y * this.unit }; },
  // the hero hands over above the middle of the pile; the icon then drops in
  landing(it) {
    if (!it) return { x: cx, y: this.ground(), size: this.unit };
    const d = it._spot = it._spot || this.place(it);
    return { ...this.toScreen({ x: d.path[0].x, y: d.path[0].y + 1.6 }), size: d.size * this.unit };
  },
  update(dt) {
    this.unit += (this.unitTarget - this.unit) * Math.min(1, dt * 3);
    for (const d of this.discs) {
      if (d.stage === 'fall') {
        d.vy -= 34 * dt; d.ay += d.vy * dt;
        if (d.ay <= d.path[0].y) { d.ay = d.path[0].y; d.stage = 'roll'; this.jostle(d, -d.vy * 0.6); }
      } else if (d.stage === 'roll') {
        // tumble along the path, picking up speed, spinning as it goes
        d.speed = Math.min(7, d.speed + dt * 10);
        let move = d.speed * dt;
        while (move > 0 && d.seg < d.path.length - 1) {
          const to = d.path[d.seg + 1], dx = to.x - d.ax, dy = to.y - d.ay, dist = Math.hypot(dx, dy);
          if (dist <= move) { d.ax = to.x; d.ay = to.y; d.seg++; move -= dist; d.rotNow += Math.sign(dx) * dist * 2.2; continue; }
          d.ax += dx / dist * move; d.ay += dy / dist * move; d.rotNow += Math.sign(dx) * move * 2.2; move = 0;
        }
        if (d.seg >= d.path.length - 1) { d.stage = 'settle'; this.jostle(d, d.speed * 0.8); }
      } else if (d.stage === 'settle') {
        d.rotNow += (d.rot - d.rotNow) * Math.min(1, dt * 12);
        if (Math.abs(d.rot - d.rotNow) < 0.01) { delete d.stage; delete d.path; }
      }
      if (d.jx || d.jy || d.jvx || d.jvy) {
        // damped spring back to rest
        d.jvx += (-90 * d.jx - 9 * d.jvx) * dt; d.jvy += (-90 * d.jy - 9 * d.jvy) * dt;
        d.jx += d.jvx * dt; d.jy += d.jvy * dt;
        if (Math.abs(d.jx) + Math.abs(d.jy) + Math.abs(d.jvx) + Math.abs(d.jvy) < 1e-3) d.jx = d.jy = d.jvx = d.jvy = 0;
      }
    }
  },
  // an impact shoves nearby icons away and down a little
  jostle(src, speed) {
    for (let c = Math.floor(src.x - 1.5); c <= Math.floor(src.x + 1.5); c++) {
      for (const d of this.cols.get(c) || []) {
        if (d === src) continue;
        const dx = d.x - src.x, dy = d.y - src.y, dist = Math.hypot(dx, dy);
        if (dist > 1.5 || dist === 0) continue;
        const k = (1 - dist / 1.5) * speed * 0.35;
        d.jvx += (dx / dist) * k; d.jvy += (dy / dist) * k - k * 0.5;
      }
    }
  },
  background(t) {
    const [dk, lt, ac] = tri;
    const hz = Math.round(H * 0.6);
    if (ridgeFar.length !== W) { ridgeFar = new Float32Array(W); ridgeNear = new Float32Array(W); }
    for (let x = 0; x < W; x++) {
      ridgeFar[x] = hz - H * (0.1 + Math.sin(x * 0.04 + 1) * 0.04 + Math.sin(x * 0.013) * 0.05 + Math.sin(x * 0.11 + t * 0.5) * 0.012);
      ridgeNear[x] = hz - H * (0.045 + Math.sin(x * 0.07 + 3) * 0.022 + Math.sin(x * 0.023 + 2) * 0.03);
    }
    const sky = [rgb32(mix(dk, ac, 0.3)), rgb32(mix(dk, lt, 0.4)), rgb32(mix(dk, ac, 0.6)), rgb32(mix(dk, lt, 0.68))];
    const sunTop = rgb32(lt), sunBot = rgb32(ac);
    const far = rgb32(mix(dk, ac, 0.35)), near = rgb32(mix(dk, lt, 0.1));
    const fieldA = rgb32(mix(dk, ac, 0.55)), fieldB = rgb32(mix(dk, lt, 0.3)), gridC = rgb32(lt);
    const sunR = Math.min(W, H) * 0.24, sunX = cx, sunY = hz - H * 0.1;
    for (let y = 0; y < H; y++) {
      const row = y * W;
      if (y < hz) {
        for (let x = 0; x < W; x++) {
          let c;
          if (y >= ridgeNear[x]) c = near;
          else if (y >= ridgeFar[x]) c = far;
          else {
            const dx = x - sunX, dy = y - sunY;
            if (dx * dx + dy * dy < sunR * sunR) {
              // striped synth sun: slats widen toward the bottom and scroll down
              const below = (dy + sunR) / (2 * sunR);
              const slat = (y + t * 9) % 9 < below * 5 - 1;
              c = slat ? sky[1] : (below < 0.5 ? sunTop : sunBot);
            } else {
              const k = Math.floor(y / hz * 7 + Math.sin(x * 0.045 + t * 0.9 + y * 0.03) * 0.8 - t * 0.7);
              c = sky[((k % 4) + 4) % 4];
            }
          }
          buf[row + x] = c;
        }
      } else {
        // perspective fields with converging grid lines, rushing toward you
        const d = y - hz + 1, z = H / d;
        const stripe = Math.floor(z * 0.6 - t * 3) & 1;
        const base = stripe ? fieldA : fieldB;
        for (let x = 0; x < W; x++) {
          const g = ((x - cx) * 1.8) / d;
          buf[row + x] = d > 5 && Math.abs(g - Math.round(g)) < 0.05 + 0.5 / d ? gridC : base;
        }
      }
    }
    return distA;
  },
  draw(t) {
    this.items.forEach((it, i) => {
      const d = this.discs[i];
      const moving = d.stage === 'fall' || d.stage === 'roll';
      const p = this.toScreen(moving ? { x: d.ax, y: d.ay } : { x: d.x + d.jx, y: d.y + d.jy });
      const bob = Math.sin(t * 5 + it.seed * 9) * boost * 1.5;
      drawSprite(it.icon, p.x, p.y + bob, d.size * this.unit, d.stage ? d.rotNow : d.rot);
    });
  },
};

// ----- Snake: a self-playing snake that grows by one icon per tap -----
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// A loop visiting every cell of a c x r grid once (r must be even): snake
// right and left across columns 1..c-1, then return up column 0.
function loopCells(c, r) {
  const out = [];
  for (let y = 0; y < r; y++) {
    if (y % 2 === 0) for (let x = 1; x < c; x++) out.push({ x, y });
    else for (let x = c - 1; x >= 1; x--) out.push({ x, y });
  }
  for (let y = r - 1; y >= 0; y--) out.push({ x: 0, y });
  return out;
}
const snake = {
  items: [], body: [], prev: [], pending: 0, food: null, cycle: [], ord: null, cs: 16, cols: 1, rows: 1, ox: 0, oy: 0, acc: 0, tick: 0.13,
  center: () => ({ x: cx, y: H * 0.4 }),
  build(items) { this.items = items.slice(-400); this.layout(); },
  add(it) {
    this.items.push(it);
    if (this.cols * this.rows < this.items.length * 2.5) return this.layout();
    this.pending++;
    this.grow();
  },
  remove(t) {
    const i = this.items.findIndex((x) => x.t === t);
    if (i < 0) return;
    this.items.splice(i, 1);
    if (this.pending) this.pending--; else { this.body.pop(); this.prev.pop(); }
  },
  // Lengthen the tail backwards along the cycle, into the free cell just behind
  // it; if there's no free cell right now, the growth waits for one.
  grow() {
    const N = this.cycle.length, ord = (c) => this.ord[c.y * this.cols + c.x];
    while (this.pending > 0) {
      if (!this.body.length) { const m = this.mid(); this.body.push(m); this.prev.push({ ...m }); this.pending--; continue; }
      const head = this.body[0], tail = this.body[this.body.length - 1];
      const room = this.body.length === 1 ? N : (ord(tail) - ord(head) + N) % N;
      if (room < 2) return;
      const c = this.cycle[(ord(tail) - 1 + N) % N];
      this.body.push({ ...c }); this.prev.push({ ...c });
      this.pending--;
    }
  },
  mid() { return { x: this.cols >> 1, y: this.rows >> 1 }; },
  // Pick a cell size that leaves plenty of room, build a loop through every
  // cell (a Hamiltonian cycle), and coil the snake along it.
  layout() {
    const top = 34, bottom = H - 72, areaH = bottom - top, n = this.items.length;
    let cs = 22;
    while (cs > 7 && Math.floor(W / cs) * Math.floor(areaH / cs) < n * 2.5) cs--;
    this.cs = cs; this.cols = Math.floor(W / cs); this.rows = Math.floor(areaH / cs);
    if (this.cols % 2 && this.rows % 2) this.rows--; // a cycle needs an even side
    this.ox = Math.floor((W - this.cols * cs) / 2); this.oy = top + Math.floor((areaH - this.rows * cs) / 2);
    this.cycle = this.rows % 2 === 0 ? loopCells(this.cols, this.rows) : loopCells(this.rows, this.cols).map(({ x, y }) => ({ x: y, y: x }));
    this.ord = new Int32Array(this.cols * this.rows);
    this.cycle.forEach((c, i) => { this.ord[c.y * this.cols + c.x] = i; });
    this.body = [];
    for (let i = 0; i < n; i++) this.body.push({ ...this.cycle[Math.min(this.cycle.length - 1, n - 1 - i)] });
    this.prev = this.body.map((c) => ({ ...c }));
    this.pending = 0;
    this.placeFood();
  },
  placeFood() {
    const occ = new Set(this.body.map((c) => c.x + ',' + c.y));
    for (let tries = 0; tries < 200; tries++) {
      const f = { x: (Math.random() * this.cols) | 0, y: (Math.random() * this.rows) | 0 };
      if (!occ.has(f.x + ',' + f.y)) { this.food = f; return; }
    }
    this.food = this.mid();
  },
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.cols && y < this.rows; },
  // Never collides: every body cell lies on the cycle between the tail and the
  // head, so the cells ahead of the head (up to the tail) are always free. The
  // snake moves forward along the cycle and only shortcuts into that free stretch,
  // jumping as far as it can toward the food without overshooting it.
  step() {
    const len = this.body.length;
    if (!len) return;
    const N = this.cycle.length, ord = (c) => this.ord[c.y * this.cols + c.x];
    const fwd = (a, b) => (b - a + N) % N;
    const head = this.body[0], tail = this.body[len - 1], h = ord(head);
    const room = len === 1 ? N : fwd(h, ord(tail)); // how far ahead the tail is (its cell frees up as we move)
    // Shortcuts keep a few cells of slack so there's always room to grow; the
    // plain next step along the cycle (d = 1) is always safe.
    const cap = Math.max(1, room - 4);
    const toFood = fwd(h, ord(this.food));
    const limit = toFood > 0 && toFood <= cap ? toFood : cap;
    let next = null, best = 0;
    for (const [dx, dy] of DIRS) {
      const x = head.x + dx, y = head.y + dy;
      if (!this.inBounds(x, y)) continue;
      const d = fwd(h, this.ord[y * this.cols + x]);
      if (d >= 1 && d <= limit && d > best) { best = d; next = { x, y }; }
    }
    if (!next) return; // can't happen: the next cell along the cycle is always free
    this.prev = this.body.map((c) => ({ ...c }));
    this.body.unshift(next);
    this.body.pop();
    if (this.pending) this.grow();
    if (next.x === this.food.x && next.y === this.food.y) this.placeFood();
  },
  update(dt) {
    this.acc += dt * (1 + boost * 1.5);
    while (this.acc >= this.tick) { this.acc -= this.tick; this.step(); }
  },
  cellXY(c) { return { x: this.ox + (c.x + 0.5) * this.cs, y: this.oy + (c.y + 0.5) * this.cs }; },
  segPos(i) {
    const f = this.acc / this.tick, a = this.cellXY(this.prev[i] || this.body[i]), b = this.cellXY(this.body[i]);
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  },
  landing() {
    const i = this.body.length - 1;
    return { ...(i < 0 ? this.cellXY(this.mid()) : this.segPos(i)), size: this.cs * 1.05 };
  },
  background(t) {
    const [dk, lt, ac] = tri;
    const out = rgb32(mix(dk, [0, 0, 0], 0.35)), a = rgb32(dk), b = rgb32(mix(dk, lt, 0.08));
    const food = rgb32(mix(ac, lt, (Math.sin(t * 8) + 1) * 0.25));
    const { ox, oy, cs, cols, rows } = this;
    const fx = this.food ? this.food.x : -1, fy = this.food ? this.food.y : -1, pad = Math.max(1, cs >> 2);
    for (let y = 0; y < H; y++) {
      const gy = Math.floor((y - oy) / cs), row = y * W;
      for (let x = 0; x < W; x++) {
        const gx = Math.floor((x - ox) / cs);
        let c = out;
        if (gx >= 0 && gy >= 0 && gx < cols && gy < rows) {
          c = (gx + gy) & 1 ? a : b;
          if (gx === fx && gy === fy) {
            const lx = x - ox - gx * cs, ly = y - oy - gy * cs;
            if (lx >= pad && ly >= pad && lx < cs - pad && ly < cs - pad) c = food;
          }
        }
        buf[row + x] = c;
      }
    }
    return distA;
  },
  draw() {
    for (let i = this.body.length - 1; i >= 0; i--) { // tail first, head on top
      const p = this.segPos(i);
      drawSprite(this.items[i].icon, p.x, p.y, this.cs * (i === 0 ? 1.35 : 1.05));
    }
  },
};

const MODES = { vortex, landscape, snake };
let MODE = MODES[state.display] || vortex;
function buildInstances() { MODE.build(state.log.map(toItem)); }
function setDisplay(name) {
  state.display = name;
  saveState();
  MODE = MODES[name] || vortex;
  hero = null;
  buildInstances();
}
addEventListener('resize', () => buildInstances());

// Soft drop shadow for each icon, rendered once per sprite and reused.
const _shadows = new WeakMap();
function iconShadow(src) {
  let sh = _shadows.get(src);
  if (!sh) {
    sh = document.createElement('canvas');
    sh.width = src.width; sh.height = src.height;
    const g = sh.getContext('2d');
    g.filter = `blur(${Math.round(src.width * 0.025)}px)`;
    g.drawImage(src, 0, 0);
    g.filter = 'none';
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#000';
    g.fillRect(0, 0, sh.width, sh.height);
    _shadows.set(src, sh);
  }
  return sh;
}

// An icon centred at (x, y), optionally rotated, with its shadow falling down-right.
function drawSprite(name, x, y, size, rot = 0) {
  const src = iconSprite(name), off = size * 0.07;
  if (rot) { sctx.save(); sctx.translate(x, y); sctx.rotate(rot); x = 0; y = 0; }
  sctx.globalAlpha = 0.38;
  sctx.drawImage(iconShadow(src), x - size / 2 + off, y - size / 2 + off, size, size);
  sctx.globalAlpha = 1;
  sctx.drawImage(src, x - size / 2, y - size / 2, size, size);
  if (rot) sctx.restore();
}

let last = performance.now();
function frame(ms) {
  const dt = Math.min((ms - last) / 1000, 0.05);
  last = ms;
  const t = ms / 1000;
  boost = Math.max(0, boost - dt * 0.55);
  rings = rings.filter((r) => (r.r += dt * (0.9 + r.r), r.w = 0.018 + r.r * 0.03, r.r < 1.3));
  MODE.update(dt);

  evolvePalette(t);
  const dist = MODE.background(t);
  const n = W * H;
  for (const ring of rings) {
    for (let i = 0; i < n; i++) {
      const e = Math.abs(dist[i] - ring.r);
      if (e < ring.w && dith[i] > e / ring.w * 0.9) buf[i] = WHITE;
    }
  }
  ctx.putImageData(img, 0, 0);

  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.clearRect(0, 0, sprites.width, sprites.height);
  sctx.setTransform(SX, 0, 0, SX, 0, 0); // draw in vortex-pixel units
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  MODE.draw(t);

  // Confetti
  particles = particles.filter((q) => (q.life -= dt) > 0);
  for (const q of particles) {
    q.vy += 60 * dt; q.vx *= 0.985; q.x += q.vx * dt; q.y += q.vy * dt;
    ctx.fillStyle = q.col;
    ctx.fillRect(Math.round(q.x), Math.round(q.y), q.s, q.s);
  }

  // Hero icon: pops in big, then flies to where the mode wants it
  if (hero) {
    const age = t - hero.start;
    const big = ICON_SIZE * Math.max(2, Math.floor(Math.min(W, H) * 0.55 / ICON_SIZE));
    let x = hero.from.x, y = hero.from.y, s;
    if (age < hero.hold) {
      const k = Math.min(age / 0.35, 1);
      s = big * k * (1 + Math.sin(k * Math.PI * 2.5) * (1 - k) * 0.6);
      if (age > 0.35) x += Math.sin(age * 9) * 1.5;
    } else {
      const k = Math.min((age - hero.hold) / 0.5, 1), e = k * k * (3 - 2 * k);
      const to = MODE.landing(hero.inst);
      x += (to.x - x) * e; y += (to.y - y) * e; s = big + (to.size - big) * e;
      if (k >= 1) { MODE.add(hero.inst); hero = null; }
    }
    if (hero && s >= 1) drawSprite(hero.icon, x, y, s);
  }
  requestAnimationFrame(frame);
}

// ---------- Sound ----------
let audio;
function getAudio() {
  if (!audio) {
    audio = new (window.AudioContext || window.webkitAudioContext)();
    // play through the iPhone's silent switch, like a music app
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
  }
  if (audio.state === 'suspended') audio.resume();
  return audio;
}
function fanfare(combo, count) {
  if (!state.sound) return;
  try {
    audio = getAudio();
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
  const n = 90 + Math.min(s.combo, 30) * 6, from = MODE.center();
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 120;
    particles.push({
      x: from.x, y: from.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
      life: 1 + Math.random() * 1.4, s: Math.random() < 0.25 ? 2 : 1,
      col: RAINBOW[(Math.random() * RAINBOW.length) | 0],
    });
  }
  fanfare(s.combo, s.count);
  Music.hit();
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
  const inst = toItem(entry);
  if (hero) MODE.add(hero.inst); // a previous hero still on screen lands immediately
  hero = { icon: habit.icon, inst, start: now, hold: 1.5, from: MODE.center() };

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
  else MODE.remove(entry.t);
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

const soundEl = document.getElementById('sound');
soundEl.addEventListener('change', () => { state.sound = soundEl.checked; saveState(); });
const musicEl = document.getElementById('music');
musicEl.addEventListener('change', () => {
  state.music = musicEl.checked;
  saveState();
  if (state.music) Music.start(getAudio()); else Music.stop();
});

// ---------- Push notifications ----------
// The app registers this device's push subscription and chosen time with the
// Parsnip push service (a Cloudflare Worker), which sends the daily "Parsnip?".
const PUSH_API = 'https://parsnip-push.joshuakernich.workers.dev';
const VAPID_PUBLIC_KEY = 'BN2swssT80HTByvveACzavE2gUHm9IIViIsLDeY_P2avgEhblqAv5ufg-YrgfNkWvP9992C0uAQMCHxDOSp9Y4U';
const pushStatus = document.getElementById('push-status');
const pushEnable = document.getElementById('push-enable');
const pushOn = document.getElementById('push-on');
const pushTime = document.getElementById('push-time');
const pushTimeRow = document.getElementById('push-time-row');

const b64urlToBytes = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const pushApi = (path, body) => fetch(PUSH_API + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}).then((r) => r.json());

async function currentSub() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? await reg.pushManager.getSubscription() : null;
  } catch { return null; }
}
const notifyTime = () => state.notifyTime || '20:00';
const timeLabel = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

// Tell the push service about this device (and its time); safe to repeat.
async function syncPush(sub) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return pushApi('/subscribe', { subscription: sub.toJSON(), time: notifyTime(), tz });
}

async function refreshPush() {
  pushEnable.hidden = true;
  pushOn.hidden = true;
  pushTimeRow.hidden = true;
  pushTime.value = notifyTime();
  if (!pushSupported()) {
    pushStatus.textContent = /iPhone|iPad/.test(navigator.userAgent) && !standalone
      ? 'Add Parsnip to your Home Screen (Share → Add to Home Screen), open it from there, then turn on notifications.'
      : "This browser can't receive push notifications.";
    return;
  }
  if (Notification.permission === 'denied') {
    pushStatus.textContent = 'Notifications are blocked. Allow them in Settings → Notifications → Parsnip.';
    return;
  }
  pushTimeRow.hidden = false;
  const sub = await currentSub();
  if (sub && Notification.permission === 'granted' && state.notifyOn !== false) {
    pushStatus.textContent = `On: a "Parsnip?" nudge every day at ${timeLabel(notifyTime())}.`;
    pushOn.hidden = false;
  } else {
    pushStatus.textContent = 'Get a "Parsnip?" nudge once a day.';
    pushEnable.hidden = false;
  }
}

pushEnable.addEventListener('click', async () => {
  try {
    if ((await Notification.requestPermission()) !== 'granted') return refreshPush();
    const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('sw.js'));
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription())
      || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(VAPID_PUBLIC_KEY) }));
    const res = await syncPush(sub);
    if (!res.ok) throw new Error(res.error || 'server error');
    state.notifyOn = true;
    saveState();
  } catch (e) {
    alert("Couldn't turn on notifications: " + e.message);
  }
  refreshPush();
});

pushTime.addEventListener('change', async () => {
  if (!pushTime.value) return;
  state.notifyTime = pushTime.value;
  saveState();
  const sub = await currentSub();
  if (sub && state.notifyOn !== false) syncPush(sub).catch(() => {});
  refreshPush();
});

document.getElementById('push-off').addEventListener('click', async () => {
  const sub = await currentSub();
  state.notifyOn = false;
  saveState();
  if (sub) {
    pushApi('/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  refreshPush();
});

document.getElementById('push-test').addEventListener('click', async (e) => {
  const btn = e.target, sub = await currentSub();
  if (!sub) return refreshPush();
  btn.textContent = 'SENDING…';
  try {
    await syncPush(sub);
    const res = await pushApi('/test', { endpoint: sub.endpoint });
    btn.textContent = res.ok ? 'SENT!' : 'FAILED';
  } catch { btn.textContent = 'FAILED'; }
  setTimeout(() => (btn.textContent = 'SEND TEST'), 2000);
});

// Keep the push service up to date each launch (subscriptions can rotate).
(async () => {
  if (!pushSupported() || Notification.permission !== 'granted' || state.notifyOn === false) return;
  const sub = await currentSub();
  if (sub) syncPush(sub).catch(() => {});
})();

const displayOpts = document.getElementById('display-opts');
const showDisplay = () => displayOpts.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(MODE === MODES[b.dataset.mode])));
displayOpts.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  setDisplay(b.dataset.mode);
  showDisplay();
});

function openSettings() {
  showDisplay();
  soundEl.checked = state.sound;
  musicEl.checked = state.music;
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
  document.getElementById('habit-save').textContent = habit ? 'SAVE CHANGES' : 'CREATE NEW HABIT';
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

document.getElementById('editor-close').addEventListener('click', () => (editorEl.hidden = true));
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

// ---------- Soundtrack ----------
// Browsers only allow audio after a gesture, so the music starts on the first touch.
Music.onKick = () => { boost = Math.max(boost, 0.22); }; // the tunnel surges on every kick
addEventListener('pointerdown', () => { if (state.music && !Music.playing) Music.start(getAudio()); });
document.addEventListener('visibilitychange', () => {
  if (!audio) return;
  if (document.hidden) audio.suspend(); else audio.resume();
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
