"""
Sentinel-2 / MSI water-quality ingest.

For each `aware.beaches` document with `type == "beach"`:
  1. Find the latest day with valid Sentinel-2 (MSI) observation in the
     downloaded HR Ocean Colour mosaic.
  2. Compute chlorophyll-a / turbidity / suspended-particulate-matter values.
  3. Render a 3-panel PNG zoomed to the beach.
  4. Upsert one document per beach into `aware.sentinel2_msi_observations`,
     referencing the beach by `beach_id`.

The beach document itself is NEVER modified.

Run as a CLI:
    python ingest.py --days-back 20

Or trigger from the API:
    POST /beaches/refresh?days_back=20
"""
from __future__ import annotations
import os
import glob
import argparse
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr
import copernicusmarine as cm
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from scoring import build_indicator_block, overall_score
from storage import (
    beaches_col,
    observations_col,
    runs_col,
    BEACH_TYPE_FILTER,
    SENTINEL2_MSI_SOURCE,
)


DS_HR_MOSAIC = SENTINEL2_MSI_SOURCE["dataset_id"]
DS_HR_MOSAIC_VERSION = "202107"

DATA_DIR = Path(__file__).resolve().parent / "hr_data" / "window"
IMAGE_DIR = Path(__file__).resolve().parent / "beach_images"
DATA_DIR.mkdir(parents=True, exist_ok=True)
IMAGE_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Source beaches
# ---------------------------------------------------------------------------
def fetch_source_beaches() -> list[dict]:
    """
    Read beaches we want to enrich. Coordinates in `aware.beaches` are stored
    as [lat, lng] (lat-first) inside a GeoJSON-shaped wrapper — we normalize.
    """
    docs = list(beaches_col.find(BEACH_TYPE_FILTER))
    out = []
    for d in docs:
        coords = (d.get("coordinates") or {}).get("coordinates") or []
        if len(coords) < 2:
            continue
        lat, lon = float(coords[0]), float(coords[1])
        out.append({
            "_id": d["_id"],
            "name": d.get("name") or d["_id"],
            "lat": lat,
            "lon": lon,
        })
    return out


# ---------------------------------------------------------------------------
# Copernicus download
# ---------------------------------------------------------------------------
def download_window(days_back: int, end_date=None) -> list[str]:
    end = end_date or datetime.now(timezone.utc).date()
    for i in range(days_back):
        d = (end - timedelta(days=i)).strftime("%Y%m%d")
        if glob.glob(str(DATA_DIR / f"*{d}_P1D*")):
            continue
        try:
            cm.get(
                dataset_id=DS_HR_MOSAIC,
                dataset_version=DS_HR_MOSAIC_VERSION,
                output_directory=str(DATA_DIR),
                no_directories=True,
                filter=f"*{d}_P1D*",
            )
        except Exception as e:
            print(f"  skip {d}: {e}")
    return sorted(glob.glob(str(DATA_DIR / "*.nc")))


def open_window(files: list[str]) -> xr.Dataset:
    return xr.open_mfdataset(files, combine="by_coords", engine="h5netcdf")


# ---------------------------------------------------------------------------
# Per-beach slicing
# ---------------------------------------------------------------------------
def beach_box(ds: xr.Dataset, lat: float, lon: float, radius_deg: float = 0.005) -> xr.Dataset:
    da = ds["CHL"]
    lat_vals = da["lat"].values
    if len(lat_vals) >= 2 and lat_vals[0] > lat_vals[-1]:
        lat_slice = slice(lat + radius_deg, lat - radius_deg)
    else:
        lat_slice = slice(lat - radius_deg, lat + radius_deg)
    return ds.sel(lon=slice(lon - radius_deg, lon + radius_deg), lat=lat_slice)


def latest_observation_time(box: xr.Dataset):
    chl = box["CHL"]
    arr = chl.values
    if arr.size == 0:
        return None, 0
    valid_per_time = np.isfinite(arr).reshape(arr.shape[0], -1).any(axis=1)
    if not valid_per_time.any():
        return None, 0
    times = box["time"].values
    last_idx = np.where(valid_per_time)[0].max()
    return pd.Timestamp(times[last_idx]), int(valid_per_time.sum())


def values_at_time(box: xr.Dataset, t) -> dict:
    snap = box.sel(time=t)
    out = {}
    for var in ("CHL", "TUR", "SPM"):
        if var not in snap.data_vars:
            out[var.lower()] = None
            continue
        arr = snap[var].values
        finite = np.isfinite(arr)
        out[var.lower()] = float(arr[finite].mean()) if finite.any() else None
    return out


# ---------------------------------------------------------------------------
# Image rendering
# ---------------------------------------------------------------------------
def render_beach_image(box: xr.Dataset, lat: float, lon: float,
                       beach_id: str, observation_time, name: str) -> str | None:
    snap = box.sel(time=observation_time)
    fig, axes = plt.subplots(1, 3, figsize=(15, 5))
    panels = [
        ("CHL", "Chlorophyll-a (mg/m³)", "YlGnBu"),
        ("TUR", "Turbidity (FNU)", "YlOrBr"),
        ("SPM", "Suspended PM (g/m³)", "copper"),
    ]
    rendered_any = False
    for ax, (var, title, cmap) in zip(axes, panels):
        if var not in snap.data_vars:
            ax.set_title(f"{title}\n(not in dataset)")
            continue
        da = snap[var]
        arr = da.values
        if not np.isfinite(arr).any():
            ax.set_title(f"{title}\n(no data this day)")
            ax.scatter([lon], [lat], c="red", marker="x", s=200)
            continue
        plot_data = np.log10(da.where(da > 0))
        plot_data.plot(ax=ax, cmap=cmap, cbar_kwargs={"label": f"log10({var})"})
        ax.scatter([lon], [lat], c="red", marker="x", s=200, label="beach")
        ax.set_title(title)
        rendered_any = True

    fig.suptitle(
        f"{name}\nSentinel-2 MSI · observed {pd.Timestamp(observation_time).strftime('%Y-%m-%d')}",
        fontsize=12,
    )
    plt.tight_layout()
    if not rendered_any:
        plt.close(fig)
        return None
    out_path = IMAGE_DIR / f"{beach_id}.png"
    fig.savefig(out_path, dpi=80, bbox_inches="tight")
    plt.close(fig)
    return str(out_path)


# ---------------------------------------------------------------------------
# Build observation document
# ---------------------------------------------------------------------------
def build_observation(beach: dict, ds: xr.Dataset, window_start, window_end, days_back: int) -> dict:
    bid = beach["_id"]
    name = beach["name"]
    lat = beach["lat"]
    lon = beach["lon"]

    box = beach_box(ds, lat, lon, radius_deg=0.005)
    if box.sizes.get("lat", 0) == 0 or box.sizes.get("lon", 0) == 0:
        box = beach_box(ds, lat, lon, radius_deg=0.01)

    obs_time, n_obs_days = latest_observation_time(box)

    common = {
        "beach_id": bid,
        "beach_name": name,
        "beach_lat": lat,
        "beach_lon": lon,
        "source": SENTINEL2_MSI_SOURCE,
        "window": {
            "start": str(window_start),
            "end": str(window_end),
            "days_back": days_back,
        },
        "updated_at": datetime.now(timezone.utc),
    }

    if obs_time is None:
        return {
            **common,
            "observation_date": None,
            "indicators": {},
            "overall_score": "unknown",
            "data_quality": {
                "n_obs_days_in_window": 0,
                "window_days": days_back,
                "reliability": "no-data",
                "note": "no Sentinel-2 MSI observation in window — cloudy or out of swath",
            },
            "image_path": None,
        }

    values = values_at_time(box, obs_time)
    indicators = {key: build_indicator_block(key, values.get(key)) for key in ("chl", "tur", "spm")}
    scores = [indicators[k]["score"] for k in indicators]
    image_path = render_beach_image(box, lat, lon, bid, obs_time, name)

    return {
        **common,
        "observation_date": pd.Timestamp(obs_time).strftime("%Y-%m-%d"),
        "indicators": indicators,
        "overall_score": overall_score(scores),
        "data_quality": {
            "n_obs_days_in_window": n_obs_days,
            "window_days": days_back,
            "reliability": (
                "high" if n_obs_days >= 5
                else "moderate" if n_obs_days >= 2
                else "low (single observation)"
            ),
        },
        "image_path": image_path,
    }


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------
def run_ingest(days_back: int = 20) -> dict:
    started = datetime.now(timezone.utc)
    end_date = started.date()
    window_start = end_date - timedelta(days=days_back)

    print(f"[{started.isoformat()}] Sentinel-2 MSI ingest start days_back={days_back}")
    files = download_window(days_back, end_date)
    print(f"  files in window: {len(files)}")

    if not files:
        runs_col.insert_one({
            "started_at": started,
            "finished_at": datetime.now(timezone.utc),
            "days_back": days_back,
            "status": "no-files",
        })
        return {"status": "no-files", "files": 0}

    ds = open_window(files)
    print(f"  dataset opened: time={ds.sizes.get('time', 0)} "
          f"lat={ds.sizes.get('lat', 0)} lon={ds.sizes.get('lon', 0)}")

    beaches = fetch_source_beaches()
    print(f"  beaches to process (type=beach): {len(beaches)}")

    processed = 0
    no_data = 0
    failed = 0
    for b in beaches:
        try:
            obs = build_observation(b, ds, window_start, end_date, days_back)
            observations_col.update_one(
                {"beach_id": b["_id"]},
                {"$set": obs},
                upsert=True,
            )
            processed += 1
            if obs["observation_date"] is None:
                no_data += 1
            print(f"  ✓ {b['_id']:24s}  obs={obs['observation_date']}  "
                  f"overall={obs['overall_score']}")
        except Exception as e:
            failed += 1
            print(f"  ✗ {b['_id']}: {e}")

    finished = datetime.now(timezone.utc)
    summary = {
        "started_at": started,
        "finished_at": finished,
        "days_back": days_back,
        "files_used": len(files),
        "beaches_processed": processed,
        "beaches_no_data": no_data,
        "beaches_failed": failed,
        "duration_seconds": (finished - started).total_seconds(),
        "source": SENTINEL2_MSI_SOURCE,
        "status": "ok",
    }
    runs_col.insert_one(summary)
    print(f"[{finished.isoformat()}] done processed={processed} "
          f"no_data={no_data} failed={failed}")
    return {
        "status": "ok",
        "processed": processed,
        "no_data": no_data,
        "failed": failed,
        "files": len(files),
        "duration_seconds": summary["duration_seconds"],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--days-back", type=int, default=20,
                        help="How many days back to download (default 20)")
    args = parser.parse_args()
    result = run_ingest(days_back=args.days_back)
    print(result)
