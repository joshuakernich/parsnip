// Pixel-art icon set. Each icon is a 16x16 grid; each character maps to PALETTE.
// '.' is transparent.
const PALETTE = {
  k: '#1a1020', // outline
  w: '#ffffff',
  W: '#efe6d2',
  g: '#c3cbd6',
  G: '#7a8496',
  d: '#3c3c56',
  r: '#ef3b4f',
  R: '#a3192d',
  o: '#ff8c1f',
  O: '#c25a10',
  y: '#ffd93b',
  Y: '#c9961c',
  l: '#86e04f',
  e: '#2c9e3c',
  E: '#17602a',
  c: '#5fe0ff',
  b: '#3576ee',
  B: '#1d3c9c',
  p: '#b553ea',
  P: '#6b2b9c',
  n: '#ff7ebd',
  N: '#c9437f',
  u: '#a8673a',
  U: '#633a1c',
  s: '#ffcf9e',
  S: '#d9935f',
  m: '#fff4c9', // parsnip flesh
  M: '#dcc27c', // parsnip shade
};

const ICONS = {
  parsnip: { label: 'Parsnip', grid: [
    '...........e..l.',
    '..........ele.l.',
    '.......e..elele.',
    '......eleeleel..',
    '.......eeleel...',
    '.....kkkkkek....',
    '....kmmmmmMk....',
    '...kmwmmmmMk....',
    '...kmwmmmMMk....',
    '...kmmmmMmMk....',
    '..kmmmmmMMk.....',
    '..kmmMmMMk......',
    '..kmmmMMk.......',
    '.kmMMMk.........',
    '.kMMk...........',
    'kk..............',
  ]},
  disco: { label: 'Disco', grid: [
    '.y......k.......',
    'yyy.....k.....c.',
    '.y....kkkkk..ccc',
    '....kkwgcgwkk.c.',
    '...kwgwgwcgwgk..',
    '...kgcgwgwgcgk..',
    '..kwgwgcwgwgwgk.',
    '..kgwcgwgwgcgGk.',
    '..kwgwgwgcgwGgk.',
    '..kgcgwgwgwGgGk.',
    '...kgwgcgwGgGk..',
    '...kwgwgGgGGGk..',
    '....kkgGgGGkk...',
    '.n....kkkkk.....',
    'nnn.........y...',
    '.n.........yyy..',
  ]},
  jazz: { label: 'Jazz', grid: [
    'kkk.............',
    'kddkk...........',
    '.kkyyk..........',
    '....kyyk........',
    '.....kyk........',
    '.....kwyk.kkkkk.',
    '.....kwyYkyUUUUk',
    '....kWwyYkkyUUyk',
    '....kwyyYk.kyyYk',
    '....kWyyYk.kyyk.',
    '....kwyyYk.kyYk.',
    '...kWyyyYk.kyYk.',
    '...kwyyyYk.kyYk.',
    '...kyyyyYYkyyYk.',
    '....kyyyyyyyYk..',
    '.....kkkkkkkk...',
  ]},
  water: { label: 'Water', grid: [
    '................',
    '.......kk.......',
    '......kcck......',
    '......kcck......',
    '.....kccbck.....',
    '.....kcccbk.....',
    '....kcccccbk....',
    '....kwccccbk....',
    '...kwcccccbbk...',
    '...kwcccccbbk...',
    '...kccccccbbk...',
    '...kcccccbbbk...',
    '....kcccbbbk....',
    '....kkbbbbkk....',
    '......kkkk......',
    '................',
  ]},
  run: { label: 'Run', grid: [
    '................',
    '................',
    '................',
    '....kkkk........',
    '...krrrrk.......',
    '...krwrrk.......',
    '...krwrrrk......',
    '...krwrrrrkk....',
    '..krrrrrrrrrkk..',
    '..krrrrrrrrrrrk.',
    '.krrrrrrrrrrrrk.',
    '.kwwwwwwwwwwwwk.',
    '.kgggggggggggk..',
    '..kkkkkkkkkkk...',
    '................',
    '................',
  ]},
  lift: { label: 'Lift', grid: [
    '................',
    '................',
    '................',
    '.kkk........kkk.',
    'kgGdk......kgGdk',
    'kgGdk......kgGdk',
    'kgGdkkkkkkkkgGdk',
    'kgGdkgggggggkGdk',
    'kgGdkGGGGGGGkGdk',
    'kgGdkkkkkkkkgGdk',
    'kgGdk......kgGdk',
    'kgGdk......kgGdk',
    '.kkk........kkk.',
    '................',
    '................',
    '................',
  ]},
  book: { label: 'Read', grid: [
    '................',
    '................',
    '..kkkkkkkkkkkk..',
    '.kbBbbbbbbbbbbk.',
    '.kbBbbwwwwwbbbk.',
    '.kbBbbbbbbbbbbk.',
    '.kbBbbwwwwbbbbk.',
    '.kbBbbbbbbbbbbk.',
    '.kbBbbbbbbbbbbk.',
    '.kbBbbbbbbbbbbk.',
    '.kbBbbbbbbbbbbk.',
    '.kbBkkkkkkkkkkk.',
    '.kbkWWWWWWWWWWk.',
    '.kbBkkkkkkkkkkk.',
    '..kk............',
    '................',
  ]},
  sleep: { label: 'Sleep', grid: [
    '..........cccc..',
    '............c...',
    '...kkkk....c....',
    '..kyyyk...cccc..',
    '.kyyyk..........',
    '.kyyk.....ccc...',
    'kyyyk.......c...',
    'kyyyk......c....',
    'kyyyk.....ccc...',
    'kyyyyk..........',
    'kyyyyyk.....kk..',
    '.kyyyyykkkkkyk..',
    '.kYyyyyyyyyyk...',
    '..kYYyyyyyykk...',
    '...kkYYYYkk.....',
    '.....kkkk.......',
  ]},
  apple: { label: 'Eat well', grid: [
    '................',
    '.......k.ee.....',
    '.......kelle....',
    '........kee.....',
    '...kkk.k.kkk....',
    '..krrrkkkrrrk...',
    '.krwrrrrrrrrRk..',
    '.krwrrrrrrrrRk..',
    '.krrrrrrrrrrRk..',
    '.krrrrrrrrrRRk..',
    '.krrrrrrrrrRRk..',
    '..krrrrrrrRRk...',
    '..krrrrrrRRRk...',
    '...krrkkkRRk....',
    '....kk...kk.....',
    '................',
  ]},
  pill: { label: 'Meds', grid: [
    '................',
    '..........kkk...',
    '.........krrrk..',
    '........krrwrrk.',
    '.......krrwrrrk.',
    '......krrrrrrk..',
    '.....kwkrrrrk...',
    '....kwwwkrrk....',
    '...kwwwwwkk.....',
    '..kwwwwwgk......',
    '.kwwwwwggk......',
    '.kwwwwggk.......',
    '.kwwgggk........',
    '..kgggk.........',
    '...kkk..........',
    '................',
  ]},
  tooth: { label: 'Floss', grid: [
    '................',
    '...kkkk..kkkk...',
    '..kwwwwkkwwwwk..',
    '.kwwwwwwwwwwwgk.',
    '.kwcwwwwwwwwwgk.',
    '.kwcwwwwwwwwwgk.',
    '.kwwwwwwwwwwggk.',
    '..kwwwwwwwwwgk..',
    '..kwwwwwwwwwgk..',
    '..kwwwwkkwwwgk..',
    '..kwwwk..kwwgk..',
    '..kwwgk..kwggk..',
    '...kwk....kgk...',
    '...kwk....kgk...',
    '....k......k....',
    '................',
  ]},
  heart: { label: 'Love', grid: [
    '................',
    '................',
    '..kkkk...kkkk...',
    '.krrrrk.krrrrk..',
    'krwwrrrkrrrrrRk.',
    'krwrrrrrrrrrrRk.',
    'krrrrrrrrrrrrRk.',
    'krrrrrrrrrrrRRk.',
    '.krrrrrrrrrRRk..',
    '..krrrrrrrRRk...',
    '...krrrrrRRk....',
    '....krrrRRk.....',
    '.....krRRk......',
    '......kRk.......',
    '.......k........',
    '................',
  ]},
  sun: { label: 'Outside', grid: [
    '.......o........',
    '..o....o....o...',
    '...o.......o....',
    '......kkkk......',
    '.....kyyyyk.....',
    '....kyywyyyk....',
    'oo..kywyyyyk..oo',
    '....kyyyyyyk....',
    '....kyyyyyok....',
    '.....kyyook.....',
    '......kkkk......',
    '...o.......o....',
    '..o....o....o...',
    '.......o........',
    '................',
    '................',
  ]},
  coffee: { label: 'Coffee', grid: [
    '................',
    '.....g..g.......',
    '....g..g........',
    '.....g..g.......',
    '................',
    '..kkkkkkkkkk....',
    '..kWuuuuuuWkkk..',
    '..kWUUUUUUWk.k..',
    '..kWWWWWWWWk.k..',
    '..kWWWWWWWgkkk..',
    '..kWWWWWWWgk....',
    '...kWWWWWgk.....',
    '..kkkkkkkkkkk...',
    '..kgggggggggk...',
    '...kkkkkkkkk....',
    '................',
  ]},
  plant: { label: 'Plants', grid: [
    '................',
    '.......kk.......',
    '......klek......',
    '..kk..klek..kk..',
    '.kllk.klek.klek.',
    '.kleek.kk.kleek.',
    '..kleekkekkeek..',
    '...kkeeeeeekk...',
    '......keek......',
    '....kkkkkkkk....',
    '...koooooooOk...',
    '....kooooooOk...',
    '....koooooOk....',
    '....kooooOOk....',
    '.....kkkkkk.....',
    '................',
  ]},
  write: { label: 'Write', grid: [
    '................',
    '...........kk...',
    '..........knnk..',
    '.........kgnnk..',
    '........kyggk...',
    '.......kyyyk....',
    '......kyyyk.....',
    '.....kyyyk......',
    '....kyyyk.......',
    '...kYyyk........',
    '...ksYk.........',
    '..kssk..........',
    '..kdk...........',
    '..kk............',
    '................',
    '................',
  ]},
  note: { label: 'Music', grid: [
    '................',
    '......kkkkkkkk..',
    '......kppppppk..',
    '......kpkkkkpk..',
    '......kpk..kpk..',
    '......kpk..kpk..',
    '......kpk..kpk..',
    '......kpk..kpk..',
    '......kpk..kpk..',
    '...kkkkpk.kkpk..',
    '..kppppk.kpppk..',
    '..kpwppk.kpwpk..',
    '..kppppk.kpppk..',
    '...kkkk...kkk...',
    '................',
    '................',
  ]},
  paw: { label: 'Pet', grid: [
    '................',
    '....kkk..kkk....',
    '...kuuuk.kuuuk..',
    '...kuuuk.kuuuk..',
    '.kk.kkk..kkk.kk.',
    'kuuk........kuuk',
    'kuuk..kkkk..kuuk',
    '.kk..kuuuuk..kk.',
    '....kuuuuuuk....',
    '...kuuuuuuuuk...',
    '...kuuuuuuuuk...',
    '...kuuuuuuuuk...',
    '....kuukkuuk....',
    '.....kk..kk.....',
    '................',
    '................',
  ]},
  star: { label: 'Star', grid: [
    '.......kk.......',
    '......kyyk......',
    '......kyyk......',
    '.....kyyyyk.....',
    'kkkkkkywyyykkkkk',
    '.kyyyywyyyyyyyk.',
    '..kyyyyyyyyyyk..',
    '...kyyyyyyyyk...',
    '....kyyyyyyk....',
    '....kyyyyyYk....',
    '...kyyyyYYYYk...',
    '...kyyykkYYYk...',
    '..kyyk....kYYk..',
    '..kyk......kYk..',
    '..kk........kk..',
    '................',
  ]},
  coin: { label: 'Save', grid: [
    '................',
    '.....kkkkkk.....',
    '...kkyyyyyykk...',
    '..kyywyyyyyyYk..',
    '..kywyyYYyyyYk..',
    '.kyyyyYyyYyyyYk.',
    '.kyyyyYyyyyyyYk.',
    '.kyyyyyYYyyyyYk.',
    '.kyyyyyyyYyyyYk.',
    '.kyyyyYyyYyyyYk.',
    '..kyyyyYYyyyYk..',
    '..kyyyyyyyyYYk..',
    '...kkyyyyYYkk...',
    '.....kkkkkk.....',
    '................',
    '................',
  ]},
  broom: { label: 'Tidy', grid: [
    '............kk..',
    '...........kuk..',
    '..........kuk...',
    '.........kuk....',
    '........kuk.....',
    '.......kuk......',
    '......kuk.......',
    '....kkkkk.......',
    '...krrrrk.......',
    '..kyyyyyyk......',
    '.kyYyYyYyk......',
    '.kyYyYyYk.......',
    'kyYyYyYyk.......',
    'kyYyYyYk........',
    'kkkkkkk.........',
    '................',
  ]},
  lotus: { label: 'Meditate', grid: [
    '................',
    '.......kk.......',
    '......knnk......',
    '......knnk......',
    '..kk.knwnnk.kk..',
    '.knnkknwnnkknnk.',
    '.knnnknnnnknnnk.',
    '..knnnknnknnnk..',
    '..kknnnnnnnnkk..',
    '.kennkknnkknnek.',
    '.keeennnnnneeek.',
    '..keeeeeeeeeek..',
    '...kkkkkkkkkk...',
    '................',
    '................',
    '................',
  ]},
  flame: { label: 'Burn', grid: [
    '.......k........',
    '......kok.......',
    '......kook......',
    '.....koook...k..',
    '.....kooook.kok.',
    '....koooooook.ok',
    '...kooorooooook.',
    '...koorroooooook',
    '..koorrrrooooook',
    '..korrryrrooook.',
    '..korryyyrroook.',
    '..korryyyyrrok..',
    '...kryywyyrrk...',
    '....kryyyyrk....',
    '.....kkkkkk.....',
    '................',
  ]},
  game: { label: 'Play', grid: [
    '................',
    '................',
    '................',
    '...kkkkkkkkkk...',
    '..kppppppppppk..',
    '.kppkppppppnppk.',
    '.kpkkkppppnpcpk.',
    '.kppkpppppppnpk.',
    '.kpppppppppppppk',
    '.kpppPkkkkPppppk',
    '.kppPk....kPpppk',
    '..kPk......kPPk.',
    '...k........kk..',
    '................',
    '................',
    '................',
  ]},
  bike: { label: 'Ride', grid: [
    '................',
    '................',
    '...........kk...',
    '..kkk.....kk....',
    '...k.....kk.....',
    '...kkkkkkkk.....',
    '..kbk...kbk.....',
    '.kkbkkkkbkkkk...',
    'kG.bkG.kb.kG.Gk.',
    'kG..kbkb..kG..Gk',
    'kG...kk...kG..Gk',
    '.kG..Gk....kG.Gk',
    '..kGGk......kGk.',
    '................',
    '................',
    '................',
  ]},
  smile: { label: 'Mood', grid: [
    '................',
    '.....kkkkkk.....',
    '...kkyyyyyykk...',
    '..kyyyyyyyyyyk..',
    '.kyywyyyyyyyyYk.',
    '.kywyykyykyyyYk.',
    '.kyyyykyykyyyYk.',
    '.kyyyyyyyyyyyYk.',
    '.knnyyyyyyyynYk.',
    '.kyykyyyyyykYYk.',
    '..kyykkkkkkyYk..',
    '..kyyyyyyyyYYk..',
    '...kkyyyyYYkk...',
    '.....kkkkkk.....',
    '................',
    '................',
  ]},
  guitar: { label: 'Guitar' },
  palette: { label: 'Paint' },
  shower: { label: 'Shower' },
  salad: { label: 'Salad' },
  camera: { label: 'Photo' },
  tree: { label: 'Nature' },
  laptop: { label: 'Work' },
  cat: { label: 'Cat' },
  rocket: { label: 'Launch' },
  trophy: { label: 'Win' },
  bed: { label: 'Rest' },
  journal: { label: 'Journal' },
  dog: { label: 'Dog' },
  mountain: { label: 'Hike' },
  umbrella: { label: 'Rainy day' },
};

// ---------- Hi-fi rendering ----------
// The 16x16 sprites are upscaled to 32x32 with EPX (Scale2x), which rounds off
// diagonals, with no outer outline and softened inner lines. Flat colour, no bevel.
const ICON_SIZE = 32;

function scale2x(rows) {
  const h = rows.length, w = 16;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? '.' : rows[y][x] || '.');
  const out = Array.from({ length: h * 2 }, () => new Array(w * 2));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
      out[y * 2][x * 2] = C === A && C !== D && A !== B ? A : P;
      out[y * 2][x * 2 + 1] = A === B && A !== C && B !== D ? B : P;
      out[y * 2 + 1][x * 2] = D === C && D !== B && C !== A ? C : P;
      out[y * 2 + 1][x * 2 + 1] = B === D && B !== A && D !== C ? D : P;
    }
  }
  return out;
}

const _rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const _mul = (c, k) => c.map((v) => Math.round(v * k));
const OUTLINE = [22, 12, 30];

function iconPixels(name) {
  const g = scale2x((ICONS[name] && ICONS[name].grid) || ICONS.star.grid);
  const n = ICON_SIZE;
  const ch = (x, y) => (x < 0 || y < 0 || x >= n || y >= n ? '.' : g[y][x]);
  const empty = (x, y) => ch(x, y) === '.';
  const px = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const c = ch(x, y);
      if (c === '.') continue;
      let col;
      if (c === 'k') {
        if (empty(x - 1, y) || empty(x + 1, y) || empty(x, y - 1) || empty(x, y + 1)) continue; // no outer outline
        else {
          // inner side of a doubled outline / interior line: a deep shade of the neighbouring fill
          const nb = [ch(x, y + 1), ch(x + 1, y), ch(x - 1, y), ch(x, y - 1)].find((k) => PALETTE[k] && k !== 'k');
          col = nb ? _mul(_rgb(PALETTE[nb]), 0.5) : OUTLINE;
        }
      } else {
        col = _rgb(PALETTE[c]);
      }
      const i = (y * n + x) * 4;
      px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2]; px[i + 3] = 255;
    }
  }
  return px;
}

// ---------- Spritesheet ----------
// img/sprites.png is a 6x7 sheet (generated with ChatGPT) on a flat magenta
// background. At load each cell is keyed, trimmed and centred into its own
// square canvas. Until it loads, icons fall back to the pixel grids above.
const SHEET = {
  src: 'img/sprites.png', cols: 6, rows: 7,
  order: ['parsnip', 'disco', 'jazz', 'water', 'run', 'lift',
    'book', 'sleep', 'apple', 'pill', 'tooth', 'heart',
    'sun', 'coffee', 'plant', 'write', 'note', 'paw',
    'star', 'coin', 'broom', 'lotus', 'flame', 'game',
    'bike', 'smile', 'guitar', 'palette', 'shower', 'salad',
    'camera', 'tree', 'laptop', 'cat', 'rocket', 'trophy',
    'cog', 'bed', 'journal', 'dog', 'mountain', 'umbrella'], // 'cog' is the settings button, not a habit
};
const SPRITE_PX = 256;
const _sprites = {};

function loadSprites() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const cx = c.getContext('2d', { willReadFrequently: true });
      cx.drawImage(img, 0, 0);
      const data = cx.getImageData(0, 0, c.width, c.height);
      const d = data.data;
      // Key out the magenta background (and its anti-aliased fringe)
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const bg = (r > 215 && b > 215 && g < 45 && Math.abs(r - b) < 30) // flat magenta
          || (Math.abs(r - b) < 18 && r - g > 70 && g < 70);               // its darker anti-aliased fringe
        if (bg) d[i + 3] = 0;
      }
      // Despill: pinkish pixels on the edge of the background are leftover anti-aliasing
      const W = c.width, H = c.height, edge = [];
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const i = (y * W + x) * 4;
          if (!d[i + 3]) continue;
          const g = d[i + 1];
          if (d[i] - g > 40 && d[i + 2] - g > 40 && (!d[i - 1] || !d[i + 7] || !d[i - W * 4 + 3] || !d[i + W * 4 + 3])) edge.push(i);
        }
      }
      for (const i of edge) d[i + 3] = 0;
      cx.putImageData(data, 0, 0);
      const cw = c.width / SHEET.cols, ch = c.height / SHEET.rows;
      SHEET.order.forEach((name, n) => {
        const x0 = Math.round((n % SHEET.cols) * cw), y0 = Math.round(Math.floor(n / SHEET.cols) * ch);
        const w = Math.round(cw), h = Math.round(ch);
        const m = Math.round(Math.min(cw, ch) * 0.08); // skip the cell edges, where neighbours' outlines can bleed in
        let minX = w, minY = h, maxX = -1, maxY = -1;
        for (let y = m; y < h - m; y++) {
          for (let x = m; x < w - m; x++) {
            if (d[((y0 + y) * c.width + x0 + x) * 4 + 3] > 40) {
              if (x < minX) minX = x; if (x > maxX) maxX = x;
              if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX < 0) return;
        const bw = maxX - minX + 1, bh = maxY - minY + 1;
        const k = (SPRITE_PX * 0.9) / Math.max(bw, bh);
        const s = document.createElement('canvas');
        s.width = s.height = SPRITE_PX;
        const sx = s.getContext('2d');
        sx.imageSmoothingQuality = 'high';
        sx.drawImage(c, x0 + minX, y0 + minY, bw, bh, (SPRITE_PX - bw * k) / 2, (SPRITE_PX - bh * k) / 2, bw * k, bh * k);
        _sprites[name] = s;
      });
      _iconCache.clear();
      resolve(true);
    };
    img.onerror = () => resolve(false);
    img.src = SHEET.src;
  });
}

// Largest available image of an icon, for drawing big and smooth.
function iconSprite(name) {
  return _sprites[name] || iconCanvas(name, 4);
}

// Render an icon to an offscreen canvas at `scale` canvas pixels per hi-fi pixel.
const _iconCache = new Map();
function iconCanvas(name, scale = 1) {
  const key = name + '@' + scale;
  if (_iconCache.has(key)) return _iconCache.get(key);
  if (_sprites[name]) {
    const c = document.createElement('canvas');
    c.width = c.height = ICON_SIZE * scale;
    const cx = c.getContext('2d');
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(_sprites[name], 0, 0, c.width, c.height);
    _iconCache.set(key, c);
    return c;
  }
  const n = ICON_SIZE;
  const base = document.createElement('canvas');
  base.width = base.height = n;
  base.getContext('2d').putImageData(new ImageData(iconPixels(name), n, n), 0, 0);
  let c = base;
  if (scale !== 1) {
    c = document.createElement('canvas');
    c.width = c.height = n * scale;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(base, 0, 0, n * scale, n * scale);
  }
  _iconCache.set(key, c);
  return c;
}
