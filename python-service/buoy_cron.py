"""
Long-running daemon that pulls fresh buoy data every 30 minutes.

Run:
    python buoy_cron.py

It does not depend on system cron — uses the `schedule` library and stays
in the foreground. Wire it into systemd / launchd / pm2 for production.

On startup it runs one immediate `delta` to backfill anything missed during
downtime, then schedules the recurring 30-min job.
"""
from __future__ import annotations
import time
import signal
import sys
from datetime import datetime, timezone

import schedule

from buoy_ingest import delta


def _job():
    started = datetime.now(timezone.utc).isoformat()
    print(f"[{started}] buoy delta start")
    try:
        result = delta()
        print(f"  -> done: {result['buoys']}")
    except Exception as e:
        print(f"  -> FAILED: {e}")


def _shutdown(signum, frame):
    print(f"\n[buoy_cron] caught signal {signum}, exiting cleanly")
    sys.exit(0)


def main():
    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    print("[buoy_cron] starting; running an immediate delta then every 30 minutes")
    _job()

    schedule.every(30).minutes.do(_job)

    while True:
        schedule.run_pending()
        time.sleep(15)


if __name__ == "__main__":
    main()
