"""
HTTP API.

Exposes:
  • EEA Bulgarian bathing-water list (public proxy, unchanged)
  • Sentinel-2 MSI water-quality observations joined to `aware.beaches`
    documents with `type == "beach"`
  • The 3-panel PNG image rendered for each beach's latest observation

Run:
    uvicorn api:app --reload --port 8000
"""
from __future__ import annotations
from typing import Literal, Optional

import requests
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse

from datetime import datetime, timedelta, timezone

from storage import (
    beaches_col,
    observations_col,
    runs_col,
    buoy_obs_col,
    buoy_runs_col,
    marine_forecast_col,
    marine_forecast_runs_col,
    bgc_chemistry_col,
    bgc_runs_col,
    BEACH_TYPE_FILTER,
    OFFSHORE_TYPE_FILTER,
    SENTINEL2_MSI_SOURCE,
    MARINE_FORECAST_SOURCE,
    BGC_SOURCE,
)
from ingest import run_ingest
from buoys import BUOY_REGISTRY, BUOY_SOURCE, beaches_for_buoy, all_referenced_buoys
from buoy_ingest import backfill as buoy_backfill, delta as buoy_delta
from forecast_ingest import run_forecast_ingest
from bgc_ingest import run_bgc_ingest
from scoring import INDICATORS
from bath_score import (
    compute_bath_score,
    compute_recommendation,
    compute_offshore_score,
    interpret_score,
)

EEA_BATHING_WATER_URL = (
    "https://water.discomap.eea.europa.eu/arcgis/rest/services"
    "/BathingWater/BathingWater_Dyna_WM/MapServer/0/query"
)

OUT_FIELDS = ",".join([
    "bathingWaterName", "longitude", "latitude",
    "qualityStatus", "qualityStatus_minus1", "qualityStatus_minus2",
    "bathingWaterIdentifier", "bwWaterCategory", "bwProfileLink",
])

app = FastAPI(
    title="Aware — Sentinel-2 MSI Water-Quality API",
    description=(
        "Joins beach locations from `aware.beaches` (type=beach) with water-quality "
        "observations derived from the Sentinel-2 MSI sensor (Copernicus Marine "
        "HR Ocean Colour product OCEANCOLOUR_BLK_BGC_HR_L3_NRT_009_206)."
    ),
    version="0.4.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _serialize(doc: dict | None) -> dict | None:
    """Stringify _id so FastAPI's JSON encoder is happy."""
    if doc is None:
        return None
    if "_id" in doc:
        doc["id"] = str(doc.pop("_id"))
    for k in ("started_at", "finished_at", "updated_at"):
        if k in doc and hasattr(doc[k], "isoformat"):
            doc[k] = doc[k].isoformat()
    return doc


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/health")
def health() -> dict:
    return {"status": "ok", "data_source": SENTINEL2_MSI_SOURCE}


# ---------------------------------------------------------------------------
# EEA proxy — public list, unchanged
# ---------------------------------------------------------------------------
def _fetch_eea(country_code: str, include_inland: bool, fmt: str) -> dict:
    where = f"countryCode='{country_code}'"
    if not include_inland:
        where += " AND bwWaterCategory='Coastal'"
    params = {
        "where": where,
        "outFields": OUT_FIELDS,
        "returnGeometry": "true" if fmt == "geojson" else "false",
        "f": fmt,
    }
    try:
        resp = requests.get(EEA_BATHING_WATER_URL, params=params, timeout=15)
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"EEA upstream error: {exc}") from exc


@app.get("/beaches/bg")
def bulgarian_beaches(
    include_inland: bool = Query(False),
    format: Literal["json", "geojson", "raw"] = Query("json"),
    name_contains: Optional[str] = Query(None),
):
    """All Bulgarian bathing waters from the EEA registry (~92 records)."""
    upstream_fmt = "geojson" if format == "geojson" else "json"
    data = _fetch_eea("BG", include_inland=include_inland, fmt=upstream_fmt)
    if format == "raw":
        return data
    if format == "geojson":
        if name_contains:
            needle = name_contains.lower()
            data["features"] = [
                f for f in data.get("features", [])
                if needle in (f.get("properties", {}).get("bathingWaterName") or "").lower()
            ]
        return JSONResponse(content=data, media_type="application/geo+json")
    items = []
    for feat in data.get("features", []):
        attrs = feat.get("attributes", {})
        name = attrs.get("bathingWaterName") or ""
        if name_contains and name_contains.lower() not in name.lower():
            continue
        items.append({
            "id": attrs.get("bathingWaterIdentifier"),
            "name": name,
            "category": attrs.get("bwWaterCategory"),
            "lat": attrs.get("latitude"),
            "lng": attrs.get("longitude"),
            "quality": {
                "current": attrs.get("qualityStatus"),
                "previous": attrs.get("qualityStatus_minus1"),
                "two_seasons_ago": attrs.get("qualityStatus_minus2"),
            },
            "profile_url": attrs.get("bwProfileLink"),
        })
    return {"country": "BG", "count": len(items), "beaches": items}


# ---------------------------------------------------------------------------
# Beaches + Sentinel-2 MSI water-quality (joined)
# ---------------------------------------------------------------------------
def _join_beach_with_observation(beach_doc: dict) -> dict:
    """Read a beach doc + its latest observation, return a merged response."""
    obs = observations_col.find_one({"beach_id": beach_doc["_id"]})
    return {
        "beach": _serialize(beach_doc),
        "observation": _serialize(obs),
    }


@app.get("/beaches")
def list_beaches(
    overall_score: Optional[Literal["green", "amber", "red", "unknown"]] = Query(
        None, description="Filter by computed overall water-quality score."
    ),
    has_observation_only: bool = Query(False, description="Only beaches that have a Sentinel-2 MSI observation."),
):
    """
    All `aware.beaches` documents with `type == "beach"`, paired with their
    latest Sentinel-2 MSI water-quality observation (if any).
    """
    beach_docs = list(beaches_col.find(BEACH_TYPE_FILTER).sort("_id", 1))

    # Pull all observations once, index by beach_id for the join.
    obs_by_id = {o["beach_id"]: o for o in observations_col.find({})}

    rows = []
    for b in beach_docs:
        obs = obs_by_id.get(b["_id"])
        if has_observation_only and (obs is None or obs.get("observation_date") is None):
            continue
        if overall_score and (obs is None or obs.get("overall_score") != overall_score):
            continue
        rows.append({
            "beach": _serialize(dict(b)),
            "observation": _serialize(dict(obs)) if obs else None,
        })

    last_run = _serialize(runs_col.find_one(sort=[("started_at", -1)]))

    return {
        "count": len(rows),
        "with_observation": sum(1 for r in rows if r["observation"] and r["observation"].get("observation_date")),
        "thresholds": INDICATORS,
        "data_source": SENTINEL2_MSI_SOURCE,
        "last_refresh": last_run,
        "items": rows,
    }


@app.get("/beaches/{beach_id}")
def get_beach(
    beach_id: str,
    include_bath_score: bool = Query(True),
    include_recommendation: bool = Query(True),
    recommendation_hours: int = Query(4, ge=1, le=24),
):
    """
    One beach + its latest Sentinel-2 MSI observation + Bayesian bath-score
    + go/wait/skip recommendation for the next `recommendation_hours` hours.
    """
    beach_doc = beaches_col.find_one({"_id": beach_id, **BEACH_TYPE_FILTER})
    if not beach_doc:
        raise HTTPException(status_code=404, detail=f"No beach with id={beach_id} of type=beach")
    out = _join_beach_with_observation(beach_doc)
    buoy_id = (beach_doc.get("meta") or {}).get("buoy")
    if include_bath_score:
        bs = compute_bath_score(beach_id=beach_id, buoy_id=buoy_id)
        bs["interpretation"] = interpret_score(bs["score"])
        out["bath_score"] = bs
    if include_recommendation:
        out["recommendation"] = compute_recommendation(
            beach_id=beach_id, buoy_id=buoy_id, hours_ahead=recommendation_hours,
        )
    return out


@app.get("/beaches/{beach_id}/recommendation")
def beach_recommendation(
    beach_id: str,
    hours_ahead: int = Query(4, ge=1, le=24,
                             description="How many hours of forecast to consider (default 4)."),
):
    """
    "Should I go to the beach?" — combines current bath_score with the
    marine forecast for the next N hours and returns a go / wait / skip
    decision plus reasoning.
    """
    beach_doc = beaches_col.find_one({"_id": beach_id, **BEACH_TYPE_FILTER})
    if not beach_doc:
        raise HTTPException(status_code=404, detail=f"No beach with id={beach_id} of type=beach")
    buoy_id = (beach_doc.get("meta") or {}).get("buoy")
    rec = compute_recommendation(beach_id=beach_id, buoy_id=buoy_id, hours_ahead=hours_ahead)
    rec["beach_id"] = beach_id
    return rec


@app.get("/beaches/{beach_id}/bath-score")
def beach_bath_score(
    beach_id: str,
    lookback_hours: int = Query(168, ge=1, le=24 * 60,
                                description="Window of past evidence (default 7 days)."),
    lookahead_hours: int = Query(24, ge=0, le=120,
                                 description="Window of forecast evidence (default 24h, 0 to disable)."),
):
    """
    Bayesian bath-score for one beach (methodology: bayesian-fusion-v2).

    Fuses three evidence sources via exponential time-decay per indicator:
      • Past Sentinel-2 MSI snapshot (chl/tur/spm)
      • Past Sofar Spotter buoy time-series
      • Future Copernicus marine forecast (wave_height, current_speed)

    Returns posterior mean (0–100), 95% credible interval, and per-indicator
    breakdown including past_measurements / future_measurements counts.
    """
    beach_doc = beaches_col.find_one({"_id": beach_id, **BEACH_TYPE_FILTER})
    if not beach_doc:
        raise HTTPException(status_code=404, detail=f"No beach with id={beach_id} of type=beach")
    buoy_id = (beach_doc.get("meta") or {}).get("buoy")
    bs = compute_bath_score(
        beach_id=beach_id,
        buoy_id=buoy_id,
        lookback_hours=lookback_hours,
        lookahead_hours=lookahead_hours,
    )
    bs["interpretation"] = interpret_score(bs["score"])
    bs["beach_id"] = beach_id
    bs["buoy_id"] = buoy_id
    return bs


@app.get("/beaches/{beach_id}/observation")
def get_observation(beach_id: str):
    """The Sentinel-2 MSI observation document for one beach."""
    obs = observations_col.find_one({"beach_id": beach_id})
    if not obs:
        raise HTTPException(
            status_code=404,
            detail=f"No Sentinel-2 MSI observation for beach_id={beach_id}. Trigger /beaches/refresh.",
        )
    return _serialize(obs)


@app.get("/beaches/{beach_id}/image")
def get_beach_image(beach_id: str):
    """3-panel PNG (CHL / TUR / SPM) for the beach's latest observation day."""
    obs = observations_col.find_one({"beach_id": beach_id})
    if not obs:
        raise HTTPException(status_code=404, detail=f"No observation for beach_id={beach_id}")
    image_path = obs.get("image_path")
    if not image_path:
        raise HTTPException(status_code=404, detail="No image rendered (no usable observation in window).")
    return FileResponse(image_path, media_type="image/png", filename=f"{beach_id}.png")


# ---------------------------------------------------------------------------
# Refresh / status
# ---------------------------------------------------------------------------
@app.post("/beaches/refresh", status_code=202)
def trigger_refresh(
    background_tasks: BackgroundTasks,
    days_back: int = Query(20, ge=1, le=60),
):
    """
    Background ingest:
      1. Download Copernicus HR Ocean Colour mosaic for the last N days.
      2. For each `type=beach` doc, find latest day with valid Sentinel-2 MSI data.
      3. Compute CHL/TUR/SPM, score, render PNG.
      4. Upsert into `aware.sentinel2_msi_observations`.

    Returns 202 immediately. Poll `/beaches/refresh/status`.
    """
    background_tasks.add_task(run_ingest, days_back=days_back)
    return {"status": "accepted", "days_back": days_back, "message": "Sentinel-2 MSI ingest started in background"}


@app.get("/beaches/refresh/status")
def refresh_status(limit: int = Query(5, ge=1, le=50)):
    runs = [_serialize(r) for r in runs_col.find().sort("started_at", -1).limit(limit)]
    return {"runs": runs}


# ===========================================================================
# Buoy time-series (Sofar Spotter via IO-BAS BGODC)
# ===========================================================================
@app.get("/buoys")
def list_buoys():
    """All buoys we ingest, with the beach docs that reference each."""
    out = []
    for spot_id, meta in BUOY_REGISTRY.items():
        latest = buoy_obs_col.find_one(
            {"meta.buoy_id": meta["buoy_id"]},
            sort=[("timestamp", -1)],
        )
        out.append({
            "buoy_id": meta["buoy_id"],
            "spot_id": spot_id,
            "label_bg": meta["label_bg"],
            "label_en": meta["label_en"],
            "operator": meta["operator"],
            "beach_ids": beaches_for_buoy(meta["buoy_id"]),
            "latest_observation": _serialize(latest),
        })
    return {"count": len(out), "data_source": BUOY_SOURCE, "buoys": out}


@app.get("/buoys/{buoy_id}/observations")
def buoy_observations(
    buoy_id: str,
    days_back: int = Query(7, ge=1, le=90, description="Window length in days from now backwards."),
    limit: int = Query(2000, ge=1, le=20000),
):
    """Time-series observations for one buoy."""
    if buoy_id not in {m["buoy_id"] for m in BUOY_REGISTRY.values()}:
        raise HTTPException(status_code=404, detail=f"Unknown buoy_id={buoy_id}")
    since = datetime.now(timezone.utc) - timedelta(days=days_back)
    cursor = buoy_obs_col.find(
        {"meta.buoy_id": buoy_id, "timestamp": {"$gte": since}},
        sort=[("timestamp", -1)],
        limit=limit,
    )
    rows = []
    for d in cursor:
        d.pop("_id", None)
        if hasattr(d.get("timestamp"), "isoformat"):
            d["timestamp"] = d["timestamp"].isoformat()
        rows.append(d)
    return {
        "buoy_id": buoy_id,
        "since": since.isoformat(),
        "count": len(rows),
        "data_source": BUOY_SOURCE,
        "observations": rows,
    }


@app.get("/beaches/{beach_id}/buoy-observations")
def observations_for_beach(
    beach_id: str,
    days_back: int = Query(7, ge=1, le=90),
    limit: int = Query(2000, ge=1, le=20000),
):
    """Buoy time-series for the buoy associated with this beach."""
    beach = beaches_col.find_one({"_id": beach_id})
    if not beach:
        raise HTTPException(status_code=404, detail=f"No beach with id={beach_id}")
    buoy_id = (beach.get("meta") or {}).get("buoy")
    if not buoy_id:
        raise HTTPException(status_code=404, detail=f"Beach {beach_id} has no associated buoy")
    return buoy_observations(buoy_id=buoy_id, days_back=days_back, limit=limit)


@app.post("/buoys/refresh", status_code=202)
def trigger_buoy_refresh(
    background_tasks: BackgroundTasks,
    mode: Literal["delta", "backfill"] = Query("delta"),
    days_back: int = Query(60, ge=1, le=180, description="Only used when mode=backfill."),
):
    """
    Background buoy ingest.
      mode=delta     — pull last 24h, insert only newer-than-stored points (cheap)
      mode=backfill  — pull last `days_back` days in 7-day chunks
    """
    if mode == "backfill":
        background_tasks.add_task(buoy_backfill, days_back=days_back)
    else:
        background_tasks.add_task(buoy_delta)
    return {"status": "accepted", "mode": mode, "days_back": days_back if mode == "backfill" else None}


@app.get("/buoys/refresh/status")
def buoy_refresh_status(limit: int = Query(10, ge=1, le=100)):
    runs = [_serialize(r) for r in buoy_runs_col.find().sort("started_at", -1).limit(limit)]
    return {"runs": runs}


# ===========================================================================
# Marine forecast — Copernicus WAV + PHY-CUR (next 7 days hourly)
# ===========================================================================
@app.get("/beaches/{beach_id}/forecast")
def get_beach_forecast(
    beach_id: str,
    hours_ahead: int = Query(24, ge=1, le=120,
                             description="How far ahead to return (default 24 h)."),
):
    """Hourly marine forecast (waves + currents) for one beach."""
    beach = beaches_col.find_one({"_id": beach_id, **BEACH_TYPE_FILTER})
    if not beach:
        raise HTTPException(status_code=404, detail=f"No beach with id={beach_id} of type=beach")

    now = datetime.now(timezone.utc)
    until = now + timedelta(hours=hours_ahead)
    cursor = marine_forecast_col.find(
        {"meta.beach_id": beach_id, "timestamp": {"$gte": now, "$lte": until}},
        sort=[("timestamp", 1)],
    )
    rows = []
    for d in cursor:
        d.pop("_id", None)
        if hasattr(d.get("timestamp"), "isoformat"):
            d["timestamp"] = d["timestamp"].isoformat()
        rows.append(d)

    return {
        "beach_id": beach_id,
        "horizon_hours": hours_ahead,
        "from": now.isoformat(),
        "to": until.isoformat(),
        "count": len(rows),
        "data_source": MARINE_FORECAST_SOURCE,
        "forecast": rows,
    }


@app.get("/beaches/{beach_id}/timeline")
def get_beach_timeline(
    beach_id: str,
    hours_back: int = Query(48, ge=1, le=720,
                            description="How many hours of past buoy data (default 48h)."),
    hours_ahead: int = Query(24, ge=1, le=120,
                             description="How many hours of forecast (default 24h)."),
):
    """
    Combined timeline for one beach:
      - PAST  wave_height_m from Sofar Spotter buoy
      - FUTURE wave_height_m from Copernicus marine_forecast
      - FUTURE current_speed_ms from Copernicus marine_forecast
    Each row tagged with `source` and `tense` (past/future).
    """
    beach = beaches_col.find_one({"_id": beach_id, **BEACH_TYPE_FILTER})
    if not beach:
        raise HTTPException(status_code=404, detail=f"No beach with id={beach_id} of type=beach")
    buoy_id = (beach.get("meta") or {}).get("buoy")
    if not buoy_id:
        raise HTTPException(status_code=404, detail="Beach has no associated buoy")

    now = datetime.now(timezone.utc)
    past_since = now - timedelta(hours=hours_back)
    future_until = now + timedelta(hours=hours_ahead)

    past_rows = []
    for d in buoy_obs_col.find(
        {"meta.buoy_id": buoy_id, "timestamp": {"$gte": past_since, "$lte": now}},
        sort=[("timestamp", 1)],
    ):
        ts = d["timestamp"]
        if hasattr(ts, "tzinfo") and ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        past_rows.append({
            "timestamp": ts.isoformat(),
            "tense": "past",
            "source": "sofar-spotter",
            "wave_height_m": d.get("wave_height_m"),
            "wave_state_beaufort": d.get("wave_state_beaufort"),
            "current_speed_ms": None,
        })

    future_rows = []
    for d in marine_forecast_col.find(
        {"meta.beach_id": beach_id, "timestamp": {"$gte": now, "$lte": future_until}},
        sort=[("timestamp", 1)],
    ):
        ts = d["timestamp"]
        if hasattr(ts, "tzinfo") and ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        future_rows.append({
            "timestamp": ts.isoformat(),
            "tense": "future",
            "source": "copernicus-marine-forecast",
            "wave_height_m": d.get("wave_height_m"),
            "wave_state_beaufort": None,
            "current_speed_ms": d.get("current_speed_ms"),
            "current_direction_deg": d.get("current_direction_deg"),
        })

    return {
        "beach_id": beach_id,
        "buoy_id": buoy_id,
        "now": now.isoformat(),
        "hours_back": hours_back,
        "hours_ahead": hours_ahead,
        "past_count": len(past_rows),
        "future_count": len(future_rows),
        "data_sources": {
            "past": BUOY_SOURCE,
            "future": MARINE_FORECAST_SOURCE,
        },
        "rows": past_rows + future_rows,
    }


@app.get("/beaches/{beach_id}/timeline/image")
def get_beach_timeline_image(
    beach_id: str,
    hours_back: int = Query(48, ge=1, le=720),
    hours_ahead: int = Query(24, ge=1, le=120),
):
    """
    PNG chart of past buoy wave_height + future forecast wave_height +
    future current_speed for one beach.
    """
    import io
    from fastapi.responses import StreamingResponse
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.dates as mdates

    beach = beaches_col.find_one({"_id": beach_id, **BEACH_TYPE_FILTER})
    if not beach:
        raise HTTPException(status_code=404, detail=f"No beach with id={beach_id} of type=beach")
    buoy_id = (beach.get("meta") or {}).get("buoy")
    if not buoy_id:
        raise HTTPException(status_code=404, detail="Beach has no associated buoy")

    now = datetime.now(timezone.utc)
    past_since = now - timedelta(hours=hours_back)
    future_until = now + timedelta(hours=hours_ahead)

    past_t, past_wh = [], []
    for d in buoy_obs_col.find(
        {"meta.buoy_id": buoy_id, "timestamp": {"$gte": past_since, "$lte": now}},
        sort=[("timestamp", 1)],
    ):
        ts = d["timestamp"]
        if hasattr(ts, "tzinfo") and ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        wh = d.get("wave_height_m")
        if wh is not None:
            past_t.append(ts)
            past_wh.append(wh)

    fut_t, fut_wh, fut_cs = [], [], []
    for d in marine_forecast_col.find(
        {"meta.beach_id": beach_id, "timestamp": {"$gte": now, "$lte": future_until}},
        sort=[("timestamp", 1)],
    ):
        ts = d["timestamp"]
        if hasattr(ts, "tzinfo") and ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        fut_t.append(ts)
        fut_wh.append(d.get("wave_height_m"))
        fut_cs.append(d.get("current_speed_ms"))

    if not past_t and not fut_t:
        raise HTTPException(status_code=404, detail="No timeline data available.")

    fig, axes = plt.subplots(2, 1, figsize=(13, 7), sharex=True)
    fig.suptitle(
        f"{beach.get('name', beach_id)} — Wave height + current speed timeline\n"
        f"Past (Sofar Spotter buoy {buoy_id}) · Future (Copernicus Marine forecast)",
        fontsize=12,
    )

    # Top: wave height
    ax = axes[0]
    if past_t:
        ax.plot(past_t, past_wh, color="C0", lw=2, label=f"Past — buoy ({len(past_t)} pts)")
    if fut_t:
        ax.plot(fut_t, fut_wh, color="C0", lw=2, ls="--",
                label=f"Future — forecast ({len(fut_t)} h)")
    ax.axvline(now, color="red", lw=1, ls=":", label="now")
    ax.set_ylabel("Wave height (m)")
    ax.axhline(0.5, color="green",  lw=0.7, ls=":", alpha=0.5)
    ax.axhline(1.0, color="orange", lw=0.7, ls=":", alpha=0.5)
    ax.axhline(2.0, color="red",    lw=0.7, ls=":", alpha=0.5)
    ax.grid(alpha=0.3)
    ax.legend(loc="upper left", fontsize=9)

    # Bottom: surface current speed (forecast only)
    ax = axes[1]
    if fut_t and any(v is not None for v in fut_cs):
        ax.plot(fut_t, fut_cs, color="C4", lw=2, label="Future — forecast")
        ax.axhline(0.4, color="orange", lw=0.7, ls=":", alpha=0.5)
        ax.axhline(0.6, color="red",    lw=0.7, ls=":", alpha=0.5)
    else:
        ax.text(0.5, 0.5, "No current_speed forecast for this window",
                ha="center", va="center", transform=ax.transAxes, color="gray")
    ax.axvline(now, color="red", lw=1, ls=":", label="now")
    ax.set_ylabel("Surface current (m/s)")
    ax.grid(alpha=0.3)
    ax.legend(loc="upper left", fontsize=9)
    ax.xaxis.set_major_locator(mdates.HourLocator(interval=max(2, (hours_back + hours_ahead) // 12)))
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%m-%d %Hh"))
    fig.autofmt_xdate()

    plt.tight_layout(rect=[0, 0, 1, 0.94])
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=90, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")


@app.get("/beaches/{beach_id}/forecast/image")
def get_beach_forecast_image(
    beach_id: str,
    hours_ahead: int = Query(168, ge=1, le=240,
                             description="How far ahead to plot (default 7 days)."),
):
    """
    PNG chart of the upcoming marine forecast: wave height, wave period,
    wave direction, and surface current speed/direction over the next N hours.
    Rendered on demand from the latest data in `aware.marine_forecast`.
    """
    import io
    import math
    from fastapi.responses import StreamingResponse
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.dates as mdates

    beach = beaches_col.find_one({"_id": beach_id, **BEACH_TYPE_FILTER})
    if not beach:
        raise HTTPException(status_code=404, detail=f"No beach with id={beach_id} of type=beach")

    now = datetime.now(timezone.utc)
    until = now + timedelta(hours=hours_ahead)
    rows = list(marine_forecast_col.find(
        {"meta.beach_id": beach_id, "timestamp": {"$gte": now, "$lte": until}},
        sort=[("timestamp", 1)],
    ))
    if not rows:
        raise HTTPException(status_code=404, detail="No forecast data; trigger /forecast/refresh first.")

    times = [r["timestamp"] for r in rows]
    wave_h = [r.get("wave_height_m") for r in rows]
    wave_max = [r.get("wave_max_height_m") for r in rows]
    wave_period = [r.get("wave_peak_period_s") for r in rows]
    wave_dir = [r.get("wave_mean_direction_deg") for r in rows]
    cur_speed = [r.get("current_speed_ms") for r in rows]
    cur_dir = [r.get("current_direction_deg") for r in rows]

    fig, axes = plt.subplots(4, 1, figsize=(12, 11), sharex=True)
    fig.suptitle(
        f"{beach.get('name', beach_id)} — Marine forecast ({hours_ahead} h)\n"
        f"Source: Copernicus Marine WAV + PHY-CUR · 2.5 km hourly",
        fontsize=12,
    )

    # Panel 1: wave height + max wave height envelope
    ax = axes[0]
    ax.plot(times, wave_h, color="C0", lw=2, label="Significant wave height (Hm0)")
    if any(v is not None for v in wave_max):
        ax.plot(times, wave_max, color="C0", lw=1, ls="--", alpha=0.6, label="Max wave height")
    ax.set_ylabel("Wave height (m)")
    ax.axhline(0.5, color="green",  lw=0.8, ls=":", alpha=0.5)
    ax.axhline(1.0, color="orange", lw=0.8, ls=":", alpha=0.5)
    ax.axhline(2.0, color="red",    lw=0.8, ls=":", alpha=0.5)
    ax.legend(loc="upper right", fontsize=9)
    ax.grid(alpha=0.3)

    # Panel 2: wave peak period
    ax = axes[1]
    ax.plot(times, wave_period, color="C2", lw=2)
    ax.set_ylabel("Peak period (s)")
    ax.grid(alpha=0.3)

    # Panel 3: wave direction (degrees from N, °T)
    ax = axes[2]
    ax.scatter(times, wave_dir, s=12, color="C3", label="Wave dir (°T)")
    if any(v is not None for v in cur_dir):
        ax.scatter(times, cur_dir, s=10, color="C4", marker="x",
                   label="Current dir (°T flow-towards)")
    ax.set_ylabel("Direction (°T)")
    ax.set_ylim(0, 360)
    ax.set_yticks([0, 90, 180, 270, 360])
    ax.set_yticklabels(["N", "E", "S", "W", "N"])
    ax.legend(loc="upper right", fontsize=9)
    ax.grid(alpha=0.3)

    # Panel 4: current speed
    ax = axes[3]
    if any(v is not None for v in cur_speed):
        ax.plot(times, cur_speed, color="C4", lw=2)
        ax.set_ylabel("Surface current (m/s)")
    else:
        ax.text(0.5, 0.5, "No current forecast available in window",
                ha="center", va="center", transform=ax.transAxes, color="gray")
    ax.grid(alpha=0.3)
    ax.xaxis.set_major_locator(mdates.HourLocator(interval=12))
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%m-%d %Hh"))
    fig.autofmt_xdate()

    plt.tight_layout(rect=[0, 0, 1, 0.96])
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=90, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")


@app.post("/forecast/refresh", status_code=202)
def trigger_forecast_refresh(
    background_tasks: BackgroundTasks,
    days_ahead: int = Query(1, ge=1, le=5),
):
    """
    Background marine-forecast ingest:
      1. Open Copernicus WAV + PHY-CUR datasets for the next N days.
      2. For each `type=beach` doc, snap to nearest sea cell.
      3. Compute current speed/direction from u/v.
      4. Replace any overlapping forecast hours in `aware.marine_forecast`.
    """
    background_tasks.add_task(run_forecast_ingest, days_ahead=days_ahead)
    return {"status": "accepted", "days_ahead": days_ahead}


@app.get("/forecast/refresh/status")
def forecast_refresh_status(limit: int = Query(10, ge=1, le=100)):
    runs = [_serialize(r) for r in marine_forecast_runs_col.find().sort("started_at", -1).limit(limit)]
    return {"runs": runs}


# ===========================================================================
# BGC chemistry — offshore zones only (2.5 km grid too coarse for beaches)
# ===========================================================================
def _ensure_offshore(beach_id: str):
    """Resolve a doc and 404 with a redirect hint if it isn't an offshore zone."""
    doc = beaches_col.find_one({"_id": beach_id})
    if not doc:
        raise HTTPException(status_code=404, detail=f"No location with id={beach_id}")
    if doc.get("type") != "offshore":
        group = doc.get("group")
        sibling = beaches_col.find_one({"group": group, "type": "offshore"}) if group else None
        raise HTTPException(
            status_code=404,
            detail={
                "error": "Chemistry data not available for swimming beaches",
                "reason": (
                    "BGC model resolution is 2.5 km — too coarse for beach-scale "
                    "differentiation. Swimming beaches in the same model cell would "
                    "show identical chemistry."
                ),
                "use_instead": sibling["_id"] if sibling else None,
            },
        )
    return doc


@app.get("/beaches/{beach_id}/chemistry")
def get_offshore_chemistry(
    beach_id: str,
    days_back: int = Query(7, ge=1, le=60,
                           description="How many days of past chemistry to return."),
):
    """
    Daily BGC chemistry (ph, dissolved O₂, nitrate, phosphate, etc.) for one
    offshore zone. Refuses with a 404 + redirect hint for swimming beaches.
    """
    doc = _ensure_offshore(beach_id)
    since = datetime.now(timezone.utc) - timedelta(days=days_back)

    rows = list(bgc_chemistry_col.find(
        {"meta.beach_id": beach_id, "timestamp": {"$gte": since}},
        sort=[("timestamp", 1)],
    ))
    if not rows:
        return {
            "beach_id": beach_id,
            "name": doc.get("name"),
            "data_source": BGC_SOURCE,
            "since": since.isoformat(),
            "count": 0,
            "history": [],
            "latest": None,
            "note": "No data yet — call POST /chemistry/refresh first.",
        }

    cleaned = []
    for r in rows:
        r.pop("_id", None)
        if hasattr(r.get("timestamp"), "isoformat"):
            r["timestamp"] = r["timestamp"].isoformat()
        cleaned.append(r)

    latest = cleaned[-1]
    return {
        "beach_id": beach_id,
        "name": doc.get("name"),
        "group": doc.get("group"),
        "data_source": BGC_SOURCE,
        "since": since.isoformat(),
        "count": len(cleaned),
        "latest": {
            "timestamp": latest["timestamp"],
            "ph":     {"value": latest.get("ph"),     "unit": ""},
            "o2":     {"value": latest.get("o2"),     "unit": "mmol/m³"},
            "o2b":    {"value": latest.get("o2b"),    "unit": "mmol/m³"},
            "no3":    {"value": latest.get("no3"),    "unit": "mmol/m³"},
            "po4":    {"value": latest.get("po4"),    "unit": "mmol/m³"},
            "dissic": {"value": latest.get("dissic"), "unit": "mol/m³"},
            "talk":   {"value": latest.get("talk"),   "unit": "mol/m³"},
            "nppv":   {"value": latest.get("nppv"),   "unit": "mg/m³/day"},
        },
        "history": cleaned,
    }


@app.get("/beaches/{beach_id}/offshore-score")
def get_offshore_score_endpoint(
    beach_id: str,
    lookback_hours: int = Query(168, ge=1, le=24 * 60),
    lookahead_hours: int = Query(24, ge=0, le=120),
):
    """
    Bayesian offshore-conditions score (chemistry + waves/currents).
    Only valid for type=offshore docs. Methodology: offshore-bayesian-fusion-v1.
    """
    _ensure_offshore(beach_id)
    s = compute_offshore_score(
        beach_id=beach_id,
        lookback_hours=lookback_hours,
        lookahead_hours=lookahead_hours,
    )
    s["interpretation"] = interpret_score(s["score"])
    s["beach_id"] = beach_id
    return s


@app.post("/chemistry/refresh", status_code=202)
def trigger_chemistry_refresh(
    background_tasks: BackgroundTasks,
    days_back: int = Query(7, ge=1, le=60),
):
    """Background BGC chemistry ingest for all offshore points."""
    background_tasks.add_task(run_bgc_ingest, days_back=days_back)
    return {"status": "accepted", "days_back": days_back}


@app.get("/chemistry/refresh/status")
def chemistry_refresh_status(limit: int = Query(10, ge=1, le=100)):
    runs = [_serialize(r) for r in bgc_runs_col.find().sort("started_at", -1).limit(limit)]
    return {"runs": runs}
