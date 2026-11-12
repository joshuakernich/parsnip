# Parsnip

A tiny habit tracker. Tap a pixel-art habit button once a day and Parsnip makes a big deal of it in a rainbow pixel vortex, with your total taps and your day-streak COMBO.

**App:** https://joshuakernich.github.io/parsnip/. On iPhone, open it in Safari, then **Share → Add to Home Screen**.

Check-ins live in the browser's local storage on your device. Use **Settings → Export** to back them up.

## Daily "Parsnip?" nudge

`.github/workflows/nudge.yml` sends a daily push through [ntfy](https://ntfy.sh). It runs twice an hour and sends once a day at your chosen time.

| Setting | Where | Default |
| --- | --- | --- |
| `NTFY_TOPIC` | Actions **secret**: your private ntfy topic name | — |
| `PARSNIP_TIME` | Actions variable, 24h `HH:MM` | `20:00` |
| `PARSNIP_TZ` | Actions variable, IANA zone | `Australia/Melbourne` |

```bash
gh variable set PARSNIP_TIME --body 19:30 -R joshuakernich/parsnip
```

To send a test notification now, run **Actions → Daily Parsnip nudge → Run workflow**.

## Development

Static files, no build step. `python3 -m http.server` and open http://localhost:8000.
Regenerate the app icons after editing the parsnip sprite: `node tools/make-icons.mjs`.
