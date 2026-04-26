"""
Marine forecast ingest — wave + surface-current forecast for the next N days
at every `aware.beaches` doc with `type == "beach"`.

Sources:
  Waves    — BLKSEA_ANALYSISFORECAST_WAV_007_003
             dataset: cmems_mod_blk_wav_anfc_2.5km_PT1H-i (hourly, instant)
  Currents — BLKSEA_ANALYSISFORECAST_PHY_007_001
             dataset: cmems_mod_blk_phy-cur_anfc_2.5km_PT1H-m (hourly mean)

For each beach we extract the nearest sea grid cell time-series, compute
current speed/direction from u/v components, and upsert one document per
(beach, forecast_hour) into `aware.marine_forecast` (time-series collection).

Run:
    python forecast_ingest.py --days-ahead 7

Or via API:
    POST /forecast/refresh?days_ahead=7
"""
from __future__ import annotations
import argparse
import math
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
import xarray as xr
import copernicusmarine as cm

from storage import (
    beaches_col,
    marine_forecast_col,
    marine_forecast_runs_col,
    BEACH_TYPE_FILTER,
    MARINE_FORECAST_SOURCE,
)


DS_WAV = "cmems_mod_blk_wav_anfc_2.5km_PT1H-i"
DS_CUR = "cmems_mod_blk_phy-cur_anfc_2.5km_PT1H-m"


# ---------------------------------------------------------------------------
# Source beaches
# ---------------------------------------------------------------------------
def fetch_source_beaches() -> list[dict]:
    """Forecast covers BOTH swimming beaches AND offshore zones — both need waves+currents."""
    out = []
    for d in beaches_col.find({"type": {"$in": ["beach", "offshore"]}}):
        coords = (d.get("coordinates") or {}).get("coordinates") or []
        if len(coords) < 2:
            continue
        lat, lon = float(coords[0]), float(coords[1])
        out.append({"_id": d["_id"], "name": d.get("name") or d["_id"], "lat": lat, "lon": lon})
    return out


def _bbox(beaches: list[dict], pad_deg: float = 0.05) -> dict:
    return {
        "min_lon": min(b["lon"] for b in beaches) - pad_deg,
        "max_lon": max(b["lon"] for b in beaches) + pad_deg,
        "min_lat": min(b["lat"] for b in beaches) - pad_deg,
        "max_lat": max(b["lat"] for b in beaches) + pad_deg,
    }


# ---------------------------------------------------------------------------
# Open datasets
# ---------------------------------------------------------------------------
def open_wav(start, end, bbox):
    return cm.open_dataset(
        dataset_id=DS_WAV,
        variables=["VHM0", "VTPK", "VTM10", "VMDR", "VPED", "VCMX"],
        minimum_longitude=bbox["min_lon"], maximum_longitude=bbox["max_lon"],
        minimum_latitude=bbox["min_lat"], maximum_latitude=bbox["max_lat"],
        start_datetime=str(start), end_datetime=str(end),
    )


def open_cur(start, end, bbox):
    return cm.open_dataset(
        dataset_id=DS_CUR,
        variables=["uo", "vo"],
        minimum_longitude=bbox["min_lon"], maximum_longitude=bbox["max_lon"],
        minimum_latitude=bbox["min_lat"], maximum_latitude=bbox["max_lat"],
        start_datetime=str(start), end_datetime=str(end),
        minimum_depth=0, maximum_depth=2,  # surface only
    )


# ---------------------------------------------------------------------------
# Per-beach extraction with sea-cell snap
# ---------------------------------------------------------------------------
def _nearest_sea_point(da: xr.DataArray, lat: float, lon: float,
                       search_deg: float = 0.05) -> tuple[xr.DataArray, float, float] | None:
    """
    Spiral outward from (lat, lon) to find the closest grid cell whose
    time-series has at least one finite value. Returns (1D series, snap_lat, snap_lon).
    """
    box = da.sel(
        longitude=slice(lon - search_deg, lon + search_deg),
        latitude=slice(lat - search_deg, lat + search_deg),
    )
    if box.sizes.get("latitude", 0) == 0 or box.sizes.get("longitude", 0) == 0:
        return None
    sea_mask = np.isfinite(box.values).any(axis=tuple(box.dims.index(d) for d in box.dims if d != "time" and d != "depth"))
    # collapse non-spatial dims if any (e.g., depth)
    # actually for 2D grids (time, lat, lon) any over time gives (lat, lon)
    if "depth" in box.dims:
        box = box.isel(depth=0)
    finite_any_t = np.isfinite(box.values).any(axis=box.dims.index("time"))
    if not finite_any_t.any():
        return None
    lon2d, lat2d = np.meshgrid(box["longitude"].values, box["latitude"].values)
    dist = np.sqrt((lon2d - lon) ** 2 + (lat2d - lat) ** 2)
    dist = np.where(finite_any_t, dist, np.inf)
    iy, ix = np.unravel_index(np.argmin(dist), dist.shape)
    snap_lat = float(box["latitude"].values[iy])
    snap_lon = float(box["longitude"].values[ix])
    series = box.sel(latitude=snap_lat, longitude=snap_lon)
    return series, snap_lat, snap_lon


def _series_for_beach(ds: xr.Dataset, var: str, lat: float, lon: float):
    snap = _nearest_sea_point(ds[var], lat, lon)
    if snap is None:
        return None, None, None
    series, snap_lat, snap_lon = snap
    return series.to_pandas(), snap_lat, snap_lon


# ---------------------------------------------------------------------------
# Build documents for one beach
# ---------------------------------------------------------------------------
def _uv_to_speed_dir(u: float, v: float):
    """u=east, v=north → (speed m/s, direction °T flowing-towards)."""
    if u is None or v is None or not (math.isfinite(u) and math.isfinite(v)):
        return None, None
    speed = math.sqrt(u * u + v * v)
    deg = (math.degrees(math.atan2(u, v)) + 360.0) % 360.0
    return speed, deg


def _build_docs(beach: dict, ds_wav: xr.Dataset, ds_cur: xr.Dataset) -> list[dict]:
    bid = beach["_id"]
    lat, lon = beach["lat"], beach["lon"]

    # Pull wave variables
    wav_data = {}
    snap_wav = None
    for v in ("VHM0", "VTPK", "VTM10", "VMDR", "VPED", "VCMX"):
        if v not in ds_wav.data_vars:
            continue
        s, snap_lat, snap_lon = _series_for_beach(ds_wav, v, lat, lon)
        if s is None:
            continue
        wav_data[v] = s
        snap_wav = (snap_lat, snap_lon)

    # Pull u/v currents
    cur_data = {}
    snap_cur = None
    for v in ("uo", "vo"):
        if v not in ds_cur.data_vars:
            continue
        s, snap_lat, snap_lon = _series_for_beach(ds_cur, v, lat, lon)
        if s is None:
            continue
        cur_data[v] = s
        snap_cur = (snap_lat, snap_lon)

    if not wav_data and not cur_data:
        return []

    # Use wave time index as the canonical hourly index; align currents.
    if wav_data:
        idx = next(iter(wav_data.values())).index
    else:
        idx = next(iter(cur_data.values())).index

    docs = []
    for ts in idx:
        t = pd.Timestamp(ts).to_pydatetime()
        if t.tzinfo is None:
            t = t.replace(tzinfo=timezone.utc)

        def _val(d: dict, key: str):
            if key not in d:
                return None
            v = d[key].get(ts)
            if v is None or (isinstance(v, float) and not math.isfinite(v)):
                return None
            return float(v)

        wave_h = _val(wav_data, "VHM0")
        wave_tpk = _val(wav_data, "VTPK")
        wave_t10 = _val(wav_data, "VTM10")
        wave_mdr = _val(wav_data, "VMDR")
        wave_ped = _val(wav_data, "VPED")
        wave_cmx = _val(wav_data, "VCMX")

        u = _val(cur_data, "uo")
        v = _val(cur_data, "vo")
        cur_speed, cur_dir = _uv_to_speed_dir(u, v)

        if all(x is None for x in (wave_h, wave_tpk, wave_mdr, cur_speed)):
            continue

        docs.append({
            "timestamp": t,
            "meta": {
                "beach_id": bid,
                "beach_name": beach["name"],
                "snap_wav": {"lat": snap_wav[0], "lon": snap_wav[1]} if snap_wav else None,
                "snap_cur": {"lat": snap_cur[0], "lon": snap_cur[1]} if snap_cur else None,
                "source": MARINE_FORECAST_SOURCE,
            },
            "wave_height_m": wave_h,
            "wave_max_height_m": wave_cmx,
            "wave_peak_period_s": wave_tpk,
            "wave_mean_period_s": wave_t10,
            "wave_mean_direction_deg": wave_mdr,
            "wave_peak_direction_deg": wave_ped,
            "current_speed_ms": cur_speed,
            "current_direction_deg": cur_dir,
            "current_eastward_ms": u,
            "current_northward_ms": v,
        })
    return docs


def _insert_unique(docs: list[dict], beach_id: str) -> int:
    """Replace existing forecast points in the same window. Forecast values
    update each refresh, so we *delete-then-insert* rather than skip dupes."""
    if not docs:
        return 0
    ts_min = min(d["timestamp"] for d in docs)
    ts_max = max(d["timestamp"] for d in docs)
    marine_forecast_col.delete_many({
        "meta.beach_id": beach_id,
        "timestamp": {"$gte": ts_min, "$lte": ts_max},
    })
    marine_forecast_col.insert_many(docs, ordered=False)
    return len(docs)


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------
def run_forecast_ingest(days_ahead: int = 1) -> dict:
    started = datetime.now(timezone.utc)
    end = started + timedelta(days=days_ahead)

    print(f"[{started.isoformat()}] marine forecast ingest start days_ahead={days_ahead}")
    beaches = fetch_source_beaches()
    if not beaches:
        return {"status": "no-beaches"}

    bbox = _bbox(beaches)
    print(f"  beaches: {len(beaches)}  bbox: {bbox}")

    ds_wav = open_wav(started, end, bbox)
    ds_cur = open_cur(started, end, bbox)
    print(f"  WAV time={ds_wav.sizes.get('time', 0)}  vars={list(ds_wav.data_vars)[:6]}")
    print(f"  CUR time={ds_cur.sizes.get('time', 0)}  vars={list(ds_cur.data_vars)}")

    summary = {"started_at": started, "days_ahead": days_ahead, "beaches": {}}
    for b in beaches:
        try:
            docs = _build_docs(b, ds_wav, ds_cur)
            n = _insert_unique(docs, b["_id"])
            summary["beaches"][b["_id"]] = n
            print(f"  ✓ {b['_id']:24s}  forecast_hours={n}")
        except Exception as e:
            summary["beaches"][b["_id"]] = {"error": str(e)}
            print(f"  ✗ {b['_id']}: {e}")

    finished = datetime.now(timezone.utc)
    summary.update({
        "finished_at": finished,
        "duration_seconds": (finished - started).total_seconds(),
        "source": MARINE_FORECAST_SOURCE,
        "status": "ok",
    })
    marine_forecast_runs_col.insert_one(summary)
    print(f"[{finished.isoformat()}] done in {summary['duration_seconds']:.1f}s")
    return summary


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--days-ahead", type=int, default=1,
                    help="How many days of forecast to pull (default 1 = 24h).")
    args = ap.parse_args()
    out = run_forecast_ingest(days_ahead=args.days_ahead)
    print({k: v for k, v in out.items() if k != "source"})
