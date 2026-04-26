"""
Sofar Spotter buoy ingest from the IO-BAS BGODC portal.

Source: http://bgodc.io-bas.bg/sofar-buoys/Mobile_form.aspx
        ASP.NET WebForms page that accepts a buoy + date range and returns
        a `<table id="GridView1">` with the historical observations.

Two modes:
    python buoy_ingest.py --backfill 60   # one-shot, last N days
    python buoy_ingest.py --delta          # picks up since last stored point

Or trigger from the API:
    POST /buoys/refresh?days_back=60
"""
from __future__ import annotations
import re
import sys
import argparse
from datetime import datetime, timedelta, timezone
from typing import Iterable

import requests
from bs4 import BeautifulSoup
from pymongo import UpdateOne

from storage import buoy_obs_col, buoy_runs_col, BUOY_OBS_COLLECTION
from buoys import BUOY_REGISTRY, BUOY_SOURCE, beaches_for_buoy, active_spot_ids


PORTAL_URL = "http://bgodc.io-bas.bg/sofar-buoys/Mobile_form.aspx"

# Default chunk size for backfill — keep responses < ~500 KB and avoid
# server-side timeouts on the ASP.NET page.
BACKFILL_CHUNK_DAYS = 7

# Date format used by the form's textboxes
FORM_DT_FMT = "%Y/%m/%d %H:%M:%S"

# Date format used inside the response GridView (e.g. "19.04.2026 0:10:00")
GRID_DT_FMT = "%d.%m.%Y %H:%M:%S"


# ---------------------------------------------------------------------------
# Low-level scrape
# ---------------------------------------------------------------------------
def _new_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "User-Agent": "aware-buoy-ingest/0.1 (+contact: ops@aware.local)",
        "Accept-Language": "bg,en;q=0.7",
    })
    return s


def _hidden_fields(html: str) -> dict[str, str]:
    """Extract __VIEWSTATE/__EVENTVALIDATION/etc. so postbacks are accepted."""
    out = {}
    for name in ("__VIEWSTATE", "__VIEWSTATEGENERATOR", "__VIEWSTATEENCRYPTED",
                 "__PREVIOUSPAGE", "__EVENTVALIDATION"):
        m = re.search(rf'name="{name}"[^>]*value="([^"]*)"', html)
        if m:
            out[name] = m.group(1)
    return out


def _post_form(session: requests.Session, spot_id: str, start: datetime, end: datetime) -> str:
    """Issue a postback to the portal for one buoy + date range. Returns HTML."""
    # Step 1: GET to obtain a fresh viewstate
    initial = session.get(PORTAL_URL, timeout=30)
    initial.raise_for_status()
    payload = _hidden_fields(initial.text)

    # Step 2: POST with the form fields the page expects
    payload.update({
        "DropDownList1": spot_id,
        "TextBox1": start.strftime(FORM_DT_FMT),
        "TextBox2": end.strftime(FORM_DT_FMT),
        "Button1": "Покажи",  # the submit button caption (may be unused but harmless)
    })
    resp = session.post(PORTAL_URL, data=payload, timeout=60)
    resp.raise_for_status()
    return resp.text


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------
def _to_float(s: str | None):
    if s is None:
        return None
    s = s.strip().replace("\xa0", "").replace(",", ".")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_grid(html: str) -> list[dict]:
    """
    Parse the `<table id="GridView1">` returned by the form postback.

    Columns (Bulgarian, in order in the GridView):
        Номер на буя              -> spot_id (str)
        Вълнение (бала)           -> wave_state_beaufort (int)
        Височина на вълната (м)   -> wave_height_m (float)
        Посока вълна (град.)      -> wave_direction_deg (float)
        Скорост на вятъра (м/сек) -> wind_speed_ms (float)
        Посока (град.)            -> wind_direction_deg (float)
        Температура на водата     -> water_temp_c (float, may be empty)
        Време (UTC)               -> timestamp ('dd.mm.yyyy H:MM:SS' UTC)
    """
    soup = BeautifulSoup(html, "html.parser")
    grid = soup.find("table", id="GridView1")
    if grid is None:
        return []

    rows: list[dict] = []
    for tr in grid.find_all("tr"):
        cells = [td.get_text(strip=True) for td in tr.find_all("td")]
        if len(cells) < 8:
            continue
        spot, beaufort, h, wave_dir, wind_spd, wind_dir, water_t, t_str = cells[:8]
        if not spot.startswith("SPOT-"):
            continue
        try:
            ts = datetime.strptime(t_str, GRID_DT_FMT).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        rows.append({
            "spot_id": spot,
            "timestamp": ts,
            "wave_state_beaufort": int(_to_float(beaufort) or 0),
            "wave_height_m": _to_float(h),
            "wave_direction_deg": _to_float(wave_dir),
            "wind_speed_ms": _to_float(wind_spd),
            "wind_direction_deg": _to_float(wind_dir),
            "water_temp_c": _to_float(water_t),
        })
    return rows


# ---------------------------------------------------------------------------
# Insert helpers
# ---------------------------------------------------------------------------
def _make_doc(row: dict, buoy_id: str, beach_ids: list[str]) -> dict:
    return {
        "timestamp": row["timestamp"],
        "meta": {
            "buoy_id": buoy_id,
            "spot_id": row["spot_id"],
            "beach_ids": beach_ids,
            "source": BUOY_SOURCE,
        },
        "water_temp_c": row["water_temp_c"],
        "wave_state_beaufort": row["wave_state_beaufort"],
        "wave_height_m": row["wave_height_m"],
        "wave_direction_deg": row["wave_direction_deg"],
        "wind_speed_ms": row["wind_speed_ms"],
        "wind_direction_deg": row["wind_direction_deg"],
    }


def _latest_timestamp(buoy_id: str) -> datetime | None:
    """Most recent observation already stored for this buoy (always tz-aware UTC)."""
    doc = buoy_obs_col.find_one(
        {"meta.buoy_id": buoy_id},
        sort=[("timestamp", -1)],
        projection={"timestamp": 1, "_id": 0},
    )
    if not doc:
        return None
    ts = doc["timestamp"]
    # MongoDB returns naive datetimes — attach UTC.
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts


def _insert_unique(rows: Iterable[dict], buoy_id: str) -> int:
    """
    Insert only rows whose timestamp isn't already stored.

    Time-series collections don't support unique indexes covering the timeField,
    so we de-dupe in Python with set membership against the existing timestamps
    in the same window. Works equally for backfill (any time direction) and
    delta refreshes.
    """
    rows = list(rows)
    if not rows:
        return 0
    beach_ids = beaches_for_buoy(buoy_id)

    ts_min = min(r["timestamp"] for r in rows)
    ts_max = max(r["timestamp"] for r in rows)

    existing: set[datetime] = set()
    for d in buoy_obs_col.find(
        {"meta.buoy_id": buoy_id, "timestamp": {"$gte": ts_min, "$lte": ts_max}},
        projection={"timestamp": 1, "_id": 0},
    ):
        ts = d["timestamp"]
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        existing.add(ts)

    fresh = [r for r in rows if r["timestamp"] not in existing]
    if not fresh:
        return 0
    docs = [_make_doc(r, buoy_id, beach_ids) for r in fresh]
    buoy_obs_col.insert_many(docs, ordered=False)
    return len(docs)


# ---------------------------------------------------------------------------
# Orchestrators
# ---------------------------------------------------------------------------
def _fetch_chunk(session: requests.Session, spot_id: str, start: datetime, end: datetime) -> list[dict]:
    html = _post_form(session, spot_id, start, end)
    rows = parse_grid(html)
    # Defensively keep only rows for the requested buoy (response includes spot_id per row)
    return [r for r in rows if r["spot_id"] == spot_id]


def backfill(days_back: int = 60) -> dict:
    """One-shot backfill — last N days, chunked to keep responses small."""
    started = datetime.now(timezone.utc)
    end = started
    overall_start = end - timedelta(days=days_back)

    session = _new_session()
    summary = {
        "mode": "backfill",
        "days_back": days_back,
        "buoys": {},
        "started_at": started,
    }

    for spot_id, buoy_id in active_spot_ids():
        inserted = 0
        chunk_end = end
        while chunk_end > overall_start:
            chunk_start = max(overall_start, chunk_end - timedelta(days=BACKFILL_CHUNK_DAYS))
            try:
                rows = _fetch_chunk(session, spot_id, chunk_start, chunk_end)
                inserted += _insert_unique(rows, buoy_id)
                print(f"  {buoy_id} {chunk_start.date()}..{chunk_end.date()}  "
                      f"rows_in_chunk={len(rows)}  inserted_so_far={inserted}")
            except Exception as e:
                print(f"  {buoy_id} {chunk_start.date()}..{chunk_end.date()}  ERROR: {e}")
            chunk_end = chunk_start
        summary["buoys"][buoy_id] = inserted

    finished = datetime.now(timezone.utc)
    summary.update({
        "finished_at": finished,
        "duration_seconds": (finished - started).total_seconds(),
        "status": "ok",
    })
    buoy_runs_col.insert_one({**summary, "source": BUOY_SOURCE})
    return summary


def delta() -> dict:
    """
    Incremental refresh — fetch the last 24h for each buoy and only insert
    points newer than the last stored timestamp. Designed for the 30-min cron.
    """
    started = datetime.now(timezone.utc)
    end = started
    start = end - timedelta(hours=24)

    session = _new_session()
    summary = {
        "mode": "delta",
        "buoys": {},
        "started_at": started,
    }

    for spot_id, buoy_id in active_spot_ids():
        try:
            rows = _fetch_chunk(session, spot_id, start, end)
            inserted = _insert_unique(rows, buoy_id)
            print(f"  {buoy_id}  fetched={len(rows)} new={inserted}")
            summary["buoys"][buoy_id] = inserted
        except Exception as e:
            print(f"  {buoy_id}  ERROR: {e}")
            summary["buoys"][buoy_id] = {"error": str(e)}

    finished = datetime.now(timezone.utc)
    summary.update({
        "finished_at": finished,
        "duration_seconds": (finished - started).total_seconds(),
        "status": "ok",
    })
    buoy_runs_col.insert_one({**summary, "source": BUOY_SOURCE})
    return summary


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--backfill", type=int, metavar="DAYS",
                   help="Backfill the last N days (chunked).")
    g.add_argument("--delta", action="store_true",
                   help="Fetch only points newer than the latest stored.")
    args = ap.parse_args()

    if args.backfill:
        out = backfill(days_back=args.backfill)
    else:
        out = delta()
    print(out)
