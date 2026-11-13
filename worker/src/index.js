// Parsnip push service: stores each device's push subscription and local
// nudge time in D1, and every minute sends "Parsnip?" to whoever is due.
// Web Push (VAPID + aes128gcm, RFC 8291/8292) is implemented with WebCrypto.

const enc = new TextEncoder();
const b64u = {
  encode(bytes) {
    let s = '';
    for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(str) {
    const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  },
};
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

// ---------- VAPID ----------
let _vapidKey;
async function vapidKey(env) {
  if (_vapidKey) return _vapidKey;
  const pub = b64u.decode(env.VAPID_PUBLIC_KEY);
  _vapidKey = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256', d: env.VAPID_PRIVATE_KEY,
    x: b64u.encode(pub.slice(1, 33)), y: b64u.encode(pub.slice(33, 65)),
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return _vapidKey;
}

async function vapidAuth(env, endpoint) {
  const header = b64u.encode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u.encode(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT,
  })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await vapidKey(env), enc.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64u.encode(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}

// ---------- payload encryption (aes128gcm) ----------
async function encrypt(sub, payload) {
  const uaPublic = b64u.decode(sub.p256dh), authSecret = b64u.decode(sub.auth);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const plain = concat(enc.encode(payload), new Uint8Array([2])); // 0x02 = last record
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plain));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

async function sendPush(env, sub, payload) {
  const body = await encrypt(sub, payload);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuth(env, sub.endpoint),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(4 * 3600),
      Urgency: 'high',
    },
    body,
  });
  return res.status;
}

// ---------- scheduling ----------
// Wall-clock parts of an instant in a time zone
function partsIn(ms, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(ms).filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]));
  return p;
}
// Epoch ms for a wall-clock time in a time zone
function zonedToUtc(y, mo, d, hh, mm, tz) {
  let guess = Date.UTC(y, mo - 1, d, hh, mm);
  for (let i = 0; i < 2; i++) {
    const p = partsIn(guess, tz);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += Date.UTC(y, mo - 1, d, hh, mm) - asUtc;
  }
  return guess;
}
// Next occurrence of local "HH:MM" in tz strictly after `after`
function nextAt(time, tz, after) {
  const [hh, mm] = time.split(':').map(Number);
  const p = partsIn(after, tz);
  for (let add = 0; add < 3; add++) {
    const day = new Date(Date.UTC(p.year, p.month - 1, p.day + add));
    const t = zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), hh, mm, tz);
    if (t > after) return t;
  }
  return after + 864e5;
}

async function sha256Hex(s) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
  return [...h].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- HTTP ----------
function cors(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = env.ALLOWED_ORIGINS.split(',').includes(origin) ? origin : 'null';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}
const json = (data, status, headers) => new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

function validTz(tz) {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
}

async function handle(req, env) {
  const h = cors(req, env);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  const { pathname } = new URL(req.url);
  if (req.method === 'GET' && pathname === '/') return new Response('parsnip push ok');
  if (req.method !== 'POST') return json({ error: 'not found' }, 404, h);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400, h); }

  if (pathname === '/subscribe') {
    const s = body.subscription || {};
    const { time, tz } = body;
    if (!/^https:\/\//.test(s.endpoint || '') || !s.keys?.p256dh || !s.keys?.auth) return json({ error: 'bad subscription' }, 400, h);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '') || !validTz(tz)) return json({ error: 'bad time' }, 400, h);
    const id = await sha256Hex(s.endpoint), now = Date.now(), next = nextAt(time, tz, now);
    await env.DB.prepare(`INSERT INTO subs (id, endpoint, p256dh, auth, time, tz, next_at, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, time = excluded.time, tz = excluded.tz, next_at = excluded.next_at`)
      .bind(id, s.endpoint, s.keys.p256dh, s.keys.auth, time, tz, next, now).run();
    return json({ ok: true, next_at: next }, 200, h);
  }

  if (pathname === '/unsubscribe') {
    if (!body.endpoint) return json({ error: 'missing endpoint' }, 400, h);
    await env.DB.prepare('DELETE FROM subs WHERE id = ?').bind(await sha256Hex(body.endpoint)).run();
    return json({ ok: true }, 200, h);
  }

  if (pathname === '/test') {
    if (!body.endpoint) return json({ error: 'missing endpoint' }, 400, h);
    const row = await env.DB.prepare('SELECT * FROM subs WHERE id = ?').bind(await sha256Hex(body.endpoint)).first();
    if (!row) return json({ error: 'not subscribed' }, 404, h);
    const status = await sendPush(env, row, JSON.stringify({ title: 'Parsnip?' }));
    return json({ ok: status >= 200 && status < 300, status }, 200, h);
  }

  return json({ error: 'not found' }, 404, h);
}

async function runDue(env) {
  const now = Date.now();
  const { results } = await env.DB.prepare('SELECT * FROM subs WHERE next_at <= ? LIMIT 500').bind(now).all();
  for (const row of results) {
    // If we fell far behind (outage), skip the stale nudge rather than sending it late
    let status = 0;
    if (now - row.next_at < 3 * 3600e3) {
      try { status = await sendPush(env, row, JSON.stringify({ title: 'Parsnip?' })); } catch (e) { console.log('push error', e); }
    }
    if (status === 404 || status === 410) {
      await env.DB.prepare('DELETE FROM subs WHERE id = ?').bind(row.id).run(); // subscription expired
    } else {
      await env.DB.prepare('UPDATE subs SET next_at = ? WHERE id = ?').bind(nextAt(row.time, row.tz, now + 60e3), row.id).run();
    }
  }
}

export default {
  fetch: (req, env) => handle(req, env).catch((e) => new Response(JSON.stringify({ error: String(e) }), { status: 500 })),
  scheduled: (event, env, ctx) => ctx.waitUntil(runDue(env)),
};
