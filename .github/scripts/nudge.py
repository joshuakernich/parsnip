"""Send the daily "Parsnip?" notification through ntfy."""
import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

server = os.environ["NTFY_SERVER"].rstrip("/")
topic = os.environ.get("NTFY_TOPIC", "").strip()
tz = ZoneInfo(os.environ["PARSNIP_TZ"])
hh, mm = (int(x) for x in os.environ["PARSNIP_TIME"].strip().split(":"))
app_url = os.environ["APP_URL"]
send_now = os.environ.get("SEND_NOW") == "true"

if not topic:
    sys.exit("NTFY_TOPIC secret is not set")

DAILY_CLICK = app_url + "?from=nudge"
now = datetime.now(tz)
target = now.replace(hour=hh, minute=mm, second=0, microsecond=0)


def send(click, at=None):
    headers = {"Click": click, "Icon": app_url + "img/icon-192.png"}
    if at:
        headers["At"] = str(int(at.timestamp()))
    req = urllib.request.Request(f"{server}/{topic}", data=b"Parsnip?", headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=20) as res:
        print("ntfy:", res.status, res.read().decode()[:200])


def already_sent_today():
    """Look in ntfy's cache (incl. scheduled messages) for today's daily nudge."""
    url = f"{server}/{topic}/json?poll=1&since=24h&scheduled=1"
    with urllib.request.urlopen(url, timeout=20) as res:
        for line in res.read().decode().splitlines():
            msg = json.loads(line)
            if msg.get("event") != "message" or msg.get("click") != DAILY_CLICK:
                continue
            if datetime.fromtimestamp(msg["time"], tz).date() == now.date():
                return True
    return False


if send_now:
    send(app_url + "?from=test")
    sys.exit(0)

# Act from 45 min before the target (schedule exact delivery) to 4 h after (catch up late runs).
if not (target - timedelta(minutes=45) <= now <= target + timedelta(hours=4)):
    print(f"{now:%H:%M} {tz.key}: not nudge time ({hh:02d}:{mm:02d})")
    sys.exit(0)
if already_sent_today():
    print("Already sent or scheduled today")
    sys.exit(0)

if now < target - timedelta(seconds=30):
    send(DAILY_CLICK, at=target)
    print(f"Scheduled for {target:%Y-%m-%d %H:%M %Z}")
else:
    send(DAILY_CLICK)
    print("Sent now")
