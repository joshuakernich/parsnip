# Parsnip

A tiny habit tracker. Tap a pixel-art habit button once a day and Parsnip makes a big deal of it in a rainbow pixel vortex, with your total taps and your day-streak COMBO.

**App:** https://joshuakernich.github.io/parsnip/. On iPhone, open it in Safari, then **Share → Add to Home Screen**.

Check-ins live in the browser's local storage on your device. Use **Settings → Export** to back them up.

## Daily "Parsnip?" nudge

Parsnip sends its own push notification. Tapping it opens the installed app.

1. On iPhone, open Parsnip **from the Home Screen** (push only works there), then go to **Settings → Turn on notifications**.
2. Tap **Copy code** and save it as the `PUSH_SUBSCRIPTION` Actions secret ([secrets page](https://github.com/joshuakernich/parsnip/settings/secrets/actions)). For more than one device, use a JSON array of codes.

`.github/workflows/nudge.yml` runs every 30 minutes. When a run lands within 35 minutes of your time, it waits for the exact minute and sends the push through Web Push (VAPID). It sends once per day.

| Setting | Where | Default |
| --- | --- | --- |
| `PUSH_SUBSCRIPTION` | Actions secret: the code copied from the app | — |
| `VAPID_PRIVATE_KEY` | Actions secret: pairs with the public key in `app.js` | — |
| `VAPID_PUBLIC_KEY` | Actions variable | — |
| `PARSNIP_TIME` | Actions variable, 24h `HH:MM` | `20:00` |
| `PARSNIP_TZ` | Actions variable, IANA zone | `Australia/Melbourne` |

```bash
gh variable set PARSNIP_TIME --body 19:30 -R joshuakernich/parsnip
```

To send a test notification now, run **Actions → Daily Parsnip nudge → Run workflow**.

## Development

Static files, no build step. `python3 -m http.server` and open http://localhost:8000.
Regenerate the app icons after editing the parsnip sprite: `node tools/make-icons.mjs`.
