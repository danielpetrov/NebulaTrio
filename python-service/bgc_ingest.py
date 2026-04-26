"""
BGC chemistry ingest — Copernicus Marine Black Sea Biogeochemistry forecast,
restricted to OFFSHORE zones (type=offshore in aware.beaches).

Datasets:
  Carbonate  — cmems_mod_blk_bgc-car_anfc_2.5km_P1D-m  (dissic, ph, talk)
  Oxygen     — cmems_mod_blk_bgc-pp-o2_anfc_2.5km_P1D-m  (o2, o2b, nppv)
  Nutrients  — cmems_mod_blk_bgc-nut_anfc_2.5km_P1D-m  (no3, po4, odu)

Why offshore-only: 2.5 km grid is too coarse to distinguish neighbouring
swimming beaches — the same model cell often contains two beach docs.
Offshore docs are spread out enough that the resolution makes sense.

Run:
    python bgc_ingest.py --days-back 7

Or via API:
    POST /chemistry/refresh?days_back=7
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
    bgc_chemistry_col,
    bgc_runs_col,
    OFFSHORE_TYPE_FILTER,
    BGC_SOURCE,
)


DS_CAR = BGC_SOURCE["datasets"]["carbonate"]
DS_O2  = BGC_SOURCE["datasets"]["oxygen"]
DS_NUT = BGC_SOURCE["datasets"]["nutrients"]

# Surface depth slice — first model level
DEPTH_MIN = 0.5
DEPTH_MAX = 2.0


# ---------------------------------------------------------------------------
# Source offshore points
# ---------------------------------------------------------------------------
def fetch_offshore_points() -> list[dict]:
    out = []
    for d in beaches_col.find(OFFSHORE_TYPE_FILTER):
        coords = (d.get("coordinates") or {}).get("coordinates") or []
        if len(coords) < 2:
            continue
        lat, lon = float(coords[0]), float(coords[1])
        out.append({
            "_id": d["_id"],
            "name": d.get("name") or d["_id"],
            "lat": lat,
            "lon": lon,
            "group": d.get("group"),
        })
    return out


def _bbox(points: list[dict], pad_deg: float = 0.1) -> dict:
    return {
        "min_lon": min(p["lon"] for p in points) - pad_deg,
        "max_lon": max(p["lon"] for p in points) + pad_deg,
        "min_lat": min(p["lat"] for p in points) - pad_deg,
        "max_lat": max(p["lat"] for p in points) + pad_deg,
    }


# ---------------------------------------------------------------------------
# Open datasets
# ---------------------------------------------------------------------------
def _open_bgc(dataset_id: str, variables: list[str], start, end, bbox):
    return cm.open_dataset(
        dataset_id=dataset_id,
        variables=variables,
        minimum_longitude=bbox["min_lon"], maximum_longitude=bbox["max_lon"],
        minimum_latitude=bbox["min_lat"], maximum_latitude=bbox["max_lat"],
        start_datetime=str(start), end_datetime=str(end),
        minimum_depth=DEPTH_MIN, maximum_depth=DEPTH_MAX,
    )


# ---------------------------------------------------------------------------
# Per-point sea-cell snap
# ---------------------------------------------------------------------------
def _nearest_sea_value(da: xr.DataArray, lat: float, lon: float,
                       search_deg: float = 0.05):
    """Find nearest sea cell time-series for one variable. Returns (pandas Series, snap_lat, snap_lon)."""
    box = da.sel(
        longitude=slice(lon - search_deg, lon + search_deg),
        latitude=slice(lat - search_deg, lat + search_deg),
    )
    if box.sizes.get("latitude", 0) == 0 or box.sizes.get("longitude", 0) == 0:
        return None
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
    return box.sel(latitude=snap_lat, longitude=snap_lon).to_pandas(), snap_lat, snap_lon


# ---------------------------------------------------------------------------
# Build documents for one offshore point
# ---------------------------------------------------------------------------
def _build_docs(point: dict, ds_car: xr.Dataset, ds_o2: xr.Dataset, ds_nut: xr.Dataset) -> list[dict]:
    pid = point["_id"]
    lat, lon = point["lat"], point["lon"]

    series_per_var: dict[str, pd.Series] = {}
    snap = None
    for ds, var in [
        (ds_car, "ph"),
        (ds_car, "dissic"),
        (ds_car, "talk"),
        (ds_o2,  "o2"),
        (ds_o2,  "o2b"),
        (ds_o2,  "nppv"),
        (ds_nut, "no3"),
        (ds_nut, "po4"),
    ]:
        if var not in ds.data_vars:
            continue
        result = _nearest_sea_value(ds[var], lat, lon)
        if result is None:
            continue
        series, slat, slon = result
        series_per_var[var] = series
        snap = {"lat": slat, "lon": slon}

    if not series_per_var:
        return []

    # Use the time index of any one series as canonical
    idx = next(iter(series_per_var.values())).index

    docs = []
    for ts in idx:
        t = pd.Timestamp(ts).to_pydatetime()
        if t.tzinfo is None:
            t = t.replace(tzinfo=timezone.utc)

        def _val(var: str):
            s = series_per_var.get(var)
            if s is None:
                return None
            v = s.get(ts)
            if v is None or (isinstance(v, float) and not math.isfinite(v)):
                return None
            return float(v)

        doc = {
            "timestamp": t,
            "meta": {
                "beach_id": pid,                   # the offshore doc's id
                "beach_name": point["name"],
                "group": point["group"],
                "snap": snap,
                "depth_m": DEPTH_MIN,
                "source": BGC_SOURCE,
            },
            "ph":      _val("ph"),
            "dissic":  _val("dissic"),
            "talk":    _val("talk"),
            "o2":      _val("o2"),
            "o2b":     _val("o2b"),
            "nppv":    _val("nppv"),
            "no3":     _val("no3"),
            "po4":     _val("po4"),
        }

        # skip rows where everything is None
        if all(v is None for k, v in doc.items() if k not in ("timestamp", "meta")):
            continue
        docs.append(doc)

    return docs


def _insert_unique(docs: list[dict], beach_id: str) -> int:
    if not docs:
        return 0
    ts_min = min(d["timestamp"] for d in docs)
    ts_max = max(d["timestamp"] for d in docs)
    bgc_chemistry_col.delete_many({
        "meta.beach_id": beach_id,
        "timestamp": {"$gte": ts_min, "$lte": ts_max},
    })
    bgc_chemistry_col.insert_many(docs, ordered=False)
    return len(docs)


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------
def run_bgc_ingest(days_back: int = 7) -> dict:
    started = datetime.now(timezone.utc)
    end = started.date()
    start = end - timedelta(days=days_back)

    print(f"[{started.isoformat()}] BGC chemistry ingest start days_back={days_back}")
    points = fetch_offshore_points()
    if not points:
        return {"status": "no-offshore-points"}

    bbox = _bbox(points)
    print(f"  offshore points: {len(points)}  bbox: {bbox}")

    ds_car = _open_bgc(DS_CAR, ["ph", "dissic", "talk"], start, end, bbox)
    ds_o2  = _open_bgc(DS_O2,  ["o2", "o2b", "nppv"],     start, end, bbox)
    ds_nut = _open_bgc(DS_NUT, ["no3", "po4"],            start, end, bbox)
    print(f"  car time={ds_car.sizes.get('time', 0)} vars={list(ds_car.data_vars)}")
    print(f"  o2  time={ds_o2.sizes.get('time', 0)} vars={list(ds_o2.data_vars)}")
    print(f"  nut time={ds_nut.sizes.get('time', 0)} vars={list(ds_nut.data_vars)}")

    summary = {
        "started_at": started,
        "days_back": days_back,
        "points": {},
    }
    for p in points:
        try:
            docs = _build_docs(p, ds_car, ds_o2, ds_nut)
            n = _insert_unique(docs, p["_id"])
            summary["points"][p["_id"]] = n
            print(f"  ✓ {p['_id']:24s}  daily_docs={n}")
        except Exception as e:
            summary["points"][p["_id"]] = {"error": str(e)}
            print(f"  ✗ {p['_id']}: {e}")

    finished = datetime.now(timezone.utc)
    summary.update({
        "finished_at": finished,
        "duration_seconds": (finished - started).total_seconds(),
        "source": BGC_SOURCE,
        "status": "ok",
    })
    bgc_runs_col.insert_one(summary)
    print(f"[{finished.isoformat()}] done in {summary['duration_seconds']:.1f}s")
    return {
        "status": "ok",
        "points": {k: v for k, v in summary["points"].items()},
        "duration_seconds": summary["duration_seconds"],
    }


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--days-back", type=int, default=7,
                    help="How many days of BGC chemistry to pull (default 7).")
    args = ap.parse_args()
    out = run_bgc_ingest(days_back=args.days_back)
    print(out)
