# Parsnip

A tiny habit tracker. Add habits, tap one each day, and Parsnip makes a big deal of it: a polygon warp tunnel, a psychedelic landscape with a growing pile, or a self-playing snake. You also see your total taps and your day-streak COMBO, over a generative synthwave soundtrack.

**App:** https://joshuakernich.github.io/parsnip/. On iPhone, open it in Safari, then **Share → Add to Home Screen**.

Check-ins live in the browser's local storage on your device. Use **Settings → Export** to back them up.

## Daily "Parsnip?" nudge

Anyone can turn on a daily push in **Settings → Daily nudge** and pick a time. On iPhone, this only works after adding Parsnip to the Home Screen and opening it from there.

The app registers the device's Web Push subscription, time and time zone with a small Cloudflare Worker (`worker/`). Every minute the Worker sends "Parsnip?" to every device that's due. The Worker uses D1 for storage and implements VAPID and aes128gcm encryption with WebCrypto.

```bash
cd worker
npx wrangler deploy                               # deploy changes
npx wrangler secret put VAPID_PRIVATE_KEY         # VAPID private key ("d"), pairs with the public key in app.js
npx wrangler d1 execute parsnip --remote --file schema.sql
```

Endpoints: `POST /subscribe {subscription, time, tz}`, `POST /unsubscribe {endpoint}`, `POST /test {endpoint}`.

## Development

Static files, no build step. `python3 -m http.server` and open http://localhost:8000.
Regenerate the app icons from the spritesheet: `node tools/make-icons.mjs`. The icon sheets in `img/` were generated with ChatGPT and are sliced at load.
