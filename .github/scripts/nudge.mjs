// `node nudge.mjs plan`  prints GitHub step outputs: act, wait (seconds), date (local)
// `node nudge.mjs send`  waits WAIT_SECONDS, then pushes "Parsnip?" to every subscription
const { PARSNIP_TIME, PARSNIP_TZ, SEND_NOW } = process.env;
const mode = process.argv[2];

// Wall-clock parts of `date` in the target time zone
function local(date) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: PARSNIP_TZ, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date).map((p) => [p.type, p.value]));
}

if (mode === 'plan') {
  const p = local(new Date());
  const date = `${p.year}-${p.month}-${p.day}`;
  if (SEND_NOW === 'true') {
    console.log(`act=true\nwait=0\ndate=${date}`);
    process.exit(0);
  }
  const [hh, mm] = PARSNIP_TIME.trim().split(':').map(Number);
  const nowSecs = (+p.hour) * 3600 + (+p.minute) * 60 + (+p.second);
  const diff = hh * 3600 + mm * 60 - nowSecs; // seconds until target (negative = past)
  const act = diff <= 35 * 60 && diff >= -4 * 3600;
  console.error(`${date} ${p.hour}:${p.minute} ${PARSNIP_TZ}; target ${PARSNIP_TIME}; act=${act}`);
  console.log(`act=${act}\nwait=${Math.max(0, diff)}\ndate=${date}`);
} else if (mode === 'send') {
  const { default: webpush } = await import('web-push');
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const raw = process.env.PUSH_SUBSCRIPTION?.trim();
  if (!raw) {
    console.log('::warning::PUSH_SUBSCRIPTION secret is not set. Turn on notifications in the app and save its code.');
    process.exit(0);
  }
  const subs = [].concat(JSON.parse(raw));

  const wait = Number(process.env.WAIT_SECONDS || 0);
  if (wait > 0) {
    console.log(`Waiting ${wait}s for ${PARSNIP_TIME}…`);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }

  let failed = 0;
  for (const sub of subs) {
    try {
      const res = await webpush.sendNotification(sub, JSON.stringify({ title: 'Parsnip?' }), { TTL: 4 * 3600, urgency: 'high' });
      console.log('Sent:', res.statusCode, new URL(sub.endpoint).host);
    } catch (e) {
      failed++;
      const gone = e.statusCode === 404 || e.statusCode === 410;
      console.log(`::error::Push failed (${e.statusCode || e.message})${gone ? ": this device's subscription has expired. Open Parsnip → Settings and save the new code as PUSH_SUBSCRIPTION." : ''}`);
      if (e.body) console.log(e.body);
    }
  }
  if (failed === subs.length) process.exit(1);
}
