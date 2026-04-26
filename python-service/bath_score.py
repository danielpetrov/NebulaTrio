"""
Bayesian bath-score fusion (methodology: bayesian-fusion-v1).

Combines Sentinel-2 / MSI water-quality observations with Sofar Spotter
buoy time-series into a single 0-100 bath-score per beach, with a
95 % credible interval.

How it works
------------
1.  Each indicator (chl, tur, spm, water_temp, wave_height, wave_state,
    wind_speed) defines a subscore function `s(value) -> [0, 1]` where
    1 = ideal bathing, 0 = unsuitable.

2.  For each indicator we pull all measurements within a recent window
    and compute an exponentially-time-weighted mean subscore. Recent
    samples weigh more (decay constant per indicator, see TAU_HOURS).

3.  The contribution of each indicator to the posterior is scaled by:
        W_i  ×  freshness(latest_measurement)
    where W_i is a fixed indicator weight and freshness ∈ [0, 1] decays
    if there's been no measurement for a long time.

4.  Bayesian aggregation uses a Beta-Bernoulli model:
        α = 1 + Σ contribution_i × weighted_subscore_i        (uninformative prior 1, 1 -> Uniform[0,1])
        β = 1 + Σ contribution_i × (1 - weighted_subscore_i)
        score = mean(Beta(α, β)) × 100
        CI95  = [Beta.ppf(.025, α, β), Beta.ppf(.975, α, β)] × 100

EEA prior is intentionally NOT used here.
"""
from __future__ import annotations
import math
from datetime import datetime, timezone, timedelta
from typing import Optional

from scipy.stats import beta as beta_dist

from storage import (
    observations_col,
    buoy_obs_col,
    marine_forecast_col,
    bgc_chemistry_col,
    beaches_col,
)


# ---------------------------------------------------------------------------
# Indicator metadata: weight, time-decay, subscore function
# ---------------------------------------------------------------------------
# Weight = importance of this indicator in the final score (relative).
# tau_hours = exponential time-decay constant.  After τ hours, evidence
#   weight drops to 1/e ≈ 0.37; after 3τ ≈ 0.05.
INDICATORS_META = {
    # Sentinel-2 / MSI — slow, ~5-day revisit
    "chl":          {"weight": 6.0, "tau_hours": 24 * 5,
                     "source": "sentinel-2-msi"},
    "tur":          {"weight": 4.0, "tau_hours": 24 * 5,
                     "source": "sentinel-2-msi"},
    "spm":          {"weight": 2.0, "tau_hours": 24 * 5,
                     "source": "sentinel-2-msi"},

    # Sofar Spotter buoys — fast, ~30 min cadence
    # Fast buoy indicators — tau=4h means ~80% of the score weight comes from
    # the last 6 hours and ~95% from the last 12 hours. Recent points dominate
    # but a single bad ping is diluted against ~12 surrounding good readings.
    # water_temp gets the highest single weight (tied with chl) because cold
    # water is a hard gate — if it's <16°C nobody is swimming, regardless of
    # everything else looking great.
    "water_temp":         {"weight": 6.0, "tau_hours": 4,  "source": "sofar-spotter"},
    "wave_height":        {"weight": 4.0, "tau_hours": 4,  "source": "sofar-spotter"},
    "wave_state":         {"weight": 2.0, "tau_hours": 4,  "source": "sofar-spotter"},
    "wind_speed":         {"weight": 2.0, "tau_hours": 4,  "source": "sofar-spotter"},

    # Copernicus Marine forecast — every indicator below comes from the model,
    # not the buoy. Kept separate so each component honestly cites its source.
    "wave_height_forecast":  {"weight": 4.0, "tau_hours": 12,
                              "source": "copernicus-marine-forecast"},
    "current_speed_forecast": {"weight": 2.0, "tau_hours": 6,
                               "source": "copernicus-marine-forecast"},
}


# ---------------------------------------------------------------------------
# Subscore functions: map raw measurement -> [0, 1]
# ---------------------------------------------------------------------------
def _piecewise(x: float, anchors: list[tuple[float, float]]) -> float:
    """Linear interpolation between (x, y) anchor points; clamped at edges."""
    anchors = sorted(anchors, key=lambda p: p[0])
    if x <= anchors[0][0]:
        return anchors[0][1]
    if x >= anchors[-1][0]:
        return anchors[-1][1]
    for (x0, y0), (x1, y1) in zip(anchors, anchors[1:]):
        if x0 <= x <= x1:
            t = (x - x0) / (x1 - x0) if x1 > x0 else 0.0
            return y0 + t * (y1 - y0)
    return 0.0


# Lower-is-better for chl/tur/spm — anchored on the same green/amber/red
# thresholds used in scoring.py (good_max, warn_max).
def subscore_chl(v: float) -> float:
    # 0–2 mg/m³ excellent → 1.0; 5 mg/m³ marginal → 0.4; 15+ disastrous → 0
    return _piecewise(v, [(0, 1.0), (2.0, 1.0), (5.0, 0.4), (15.0, 0.0)])


def subscore_tur(v: float) -> float:
    # FNU
    return _piecewise(v, [(0, 1.0), (2.0, 1.0), (5.0, 0.4), (20.0, 0.0)])


def subscore_spm(v: float) -> float:
    # g/m³
    return _piecewise(v, [(0, 1.0), (3.0, 1.0), (10.0, 0.4), (50.0, 0.0)])


def subscore_water_temp(v: float) -> float:
    """Comfort + Vibrio-risk window. Sweet spot 20–26 °C."""
    return _piecewise(v, [
        (8, 0.0),    # too cold to swim
        (16, 0.4),
        (20, 1.0),   # ideal lower
        (26, 1.0),   # ideal upper
        (28, 0.6),   # Vibrio risk rising
        (30, 0.2),
        (32, 0.0),
    ])


def subscore_wave_height(v: float) -> float:
    """Lower = calmer = safer for casual bathers."""
    return _piecewise(v, [
        (0.0, 1.0),
        (0.3, 1.0),
        (0.7, 0.7),
        (1.2, 0.4),
        (2.0, 0.1),
        (3.0, 0.0),
    ])


def subscore_wave_state(v: float) -> float:
    """Beaufort-like sea state, 0–9."""
    return _piecewise(v, [
        (0, 1.0),
        (1, 1.0),
        (2, 0.85),
        (3, 0.6),
        (4, 0.35),
        (5, 0.15),
        (6, 0.0),
    ])


# ---------------------------------------------------------------------------
# Offshore (BGC chemistry) subscores
# ---------------------------------------------------------------------------
def subscore_ph(v: float) -> float:
    """pH 8.0–8.3 ideal for healthy seawater. < 7.7 acidified, > 8.5 hypersaline anomaly."""
    return _piecewise(v, [
        (7.4, 0.0),
        (7.7, 0.4),
        (7.9, 0.85),
        (8.0, 1.0),
        (8.3, 1.0),
        (8.5, 0.6),
        (8.8, 0.0),
    ])


def subscore_o2_surface(v: float) -> float:
    """Surface dissolved O₂ in mmol/m³. > 250 ideal, < 100 hypoxic."""
    return _piecewise(v, [
        (50,  0.0),
        (100, 0.2),
        (150, 0.5),
        (200, 0.8),
        (250, 1.0),
        (400, 1.0),
    ])


def subscore_o2_bottom(v: float) -> float:
    """Bottom dissolved O₂ in mmol/m³. > 200 healthy, < 60 severe hypoxia."""
    return _piecewise(v, [
        (30,  0.0),
        (60,  0.2),
        (100, 0.5),
        (150, 0.75),
        (200, 1.0),
        (350, 1.0),
    ])


def subscore_no3(v: float) -> float:
    """Nitrate (mmol/m³). Low = pristine, high = nutrient pollution."""
    return _piecewise(v, [
        (0,  1.0),
        (1,  1.0),
        (3,  0.7),
        (8,  0.4),
        (20, 0.0),
    ])


def subscore_po4(v: float) -> float:
    """Phosphate (mmol/m³)."""
    return _piecewise(v, [
        (0,    1.0),
        (0.1,  1.0),
        (0.3,  0.7),
        (0.6,  0.4),
        (1.5,  0.0),
    ])


def subscore_current_speed(v: float) -> float:
    """Surface current speed (m/s). > 0.5 m/s → rip-current territory."""
    return _piecewise(v, [
        (0.0, 1.0),
        (0.2, 0.95),
        (0.4, 0.7),
        (0.6, 0.4),
        (1.0, 0.1),
        (1.5, 0.0),
    ])


def subscore_wind_speed(v: float) -> float:
    """m/s. >12 m/s = strong breeze, choppy water."""
    return _piecewise(v, [
        (0, 1.0),
        (5, 0.9),
        (8, 0.7),
        (12, 0.4),
        (16, 0.1),
        (20, 0.0),
    ])


SUBSCORES = {
    "chl":                     subscore_chl,
    "tur":                     subscore_tur,
    "spm":                     subscore_spm,
    "water_temp":              subscore_water_temp,
    "wave_height":             subscore_wave_height,
    "wave_height_forecast":    subscore_wave_height,    # same physics
    "wave_state":              subscore_wave_state,
    "wind_speed":              subscore_wind_speed,
    "current_speed_forecast":  subscore_current_speed,
    # Offshore-only BGC chemistry
    "ph":                      subscore_ph,
    "o2":                      subscore_o2_surface,
    "o2b":                     subscore_o2_bottom,
    "no3":                     subscore_no3,
    "po4":                     subscore_po4,
}


# ---------------------------------------------------------------------------
# Offshore indicator weights — what matters for fishing / sailing / diving
# ---------------------------------------------------------------------------
# Different from bath INDICATORS_META: offshore users care about water health
# (chemistry, O₂, nutrients) more than bather comfort (water_temp).
OFFSHORE_INDICATORS_META = {
    # BGC chemistry — the main reason this score exists
    "ph":   {"weight": 5.0, "tau_hours": 96, "source": "copernicus-bgc"},
    "o2":   {"weight": 5.0, "tau_hours": 72, "source": "copernicus-bgc"},
    # o2b (bottom oxygen) intentionally excluded — Black Sea anoxic layer
    # below ~150 m makes o2b ≈ 0 by physics, would always score 0/red.
    "no3":  {"weight": 3.0, "tau_hours": 96, "source": "copernicus-bgc"},
    "po4":  {"weight": 3.0, "tau_hours": 96, "source": "copernicus-bgc"},

    # Buoy — paired offshore buoy via beach.meta.buoy. Note: same buoy
    # serves both beach and offshore docs in the same group, so these are
    # NOT independent observations from the bath_score versions.
    "water_temp":  {"weight": 3.0, "tau_hours": 4, "source": "sofar-spotter"},
    "wave_height": {"weight": 3.0, "tau_hours": 4, "source": "sofar-spotter"},
    "wind_speed":  {"weight": 2.0, "tau_hours": 4, "source": "sofar-spotter"},

    # Sea state from forecast — important for going out on a boat
    "wave_height_forecast":   {"weight": 4.0, "tau_hours": 12, "source": "copernicus-marine-forecast"},
    "current_speed_forecast": {"weight": 3.0, "tau_hours": 6,  "source": "copernicus-marine-forecast"},
}

# Map indicator name -> field in the buoy observation document.
BUOY_FIELDS = {
    "water_temp":  "water_temp_c",
    "wave_height": "wave_height_m",
    "wave_state":  "wave_state_beaufort",
    "wind_speed":  "wind_speed_ms",
}

# Map indicator name -> field path in the Sentinel-2 observation document.
S2_FIELDS = {
    "chl": "indicators.chl.current_value",
    "tur": "indicators.tur.current_value",
    "spm": "indicators.spm.current_value",
}


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------
def _hours_distance(then: datetime, now: datetime) -> float:
    """Absolute hours between `then` and `now`. Handles past or future timestamps
    symmetrically — a 4h-old observation and a 4h-ahead forecast contribute the
    same freshness weight. Used by exp-decay so forecast is treated as evidence
    of the same kind as a recent measurement, just decaying by distance from now."""
    if then.tzinfo is None:
        then = then.replace(tzinfo=timezone.utc)
    return abs((now - then).total_seconds() / 3600.0)


# Back-compat alias
_hours_since = _hours_distance


def _load_forecast_measurements(beach_id: str, now: datetime,
                                lookahead_hours: int = 24):
    """
    Pull Copernicus marine_forecast hours within [now, now + lookahead_hours]
    as evidence rows. Each forecast hour contributes:
      - wave_height_forecast    (separate from buoy wave_height — different source)
      - current_speed_forecast  (model-only — buoys don't measure currents)
    """
    if beach_id is None:
        return []
    until = now + timedelta(hours=lookahead_hours)
    rows = []
    cursor = marine_forecast_col.find(
        {"meta.beach_id": beach_id, "timestamp": {"$gte": now, "$lte": until}},
        sort=[("timestamp", 1)],
    )
    for d in cursor:
        ts = d["timestamp"]
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        wh = d.get("wave_height_m")
        if wh is not None:
            rows.append((ts, "wave_height_forecast", float(wh)))
        cs = d.get("current_speed_ms")
        if cs is not None:
            rows.append((ts, "current_speed_forecast", float(cs)))
    return rows


def _load_bgc_measurements(beach_id: str, now: datetime, lookback_hours: int = 168):
    """
    Pull BGC chemistry rows for one offshore point. Returns
    (timestamp, indicator_name, value) tuples.
    """
    if beach_id is None:
        return []
    since = now - timedelta(hours=lookback_hours)
    rows = []
    cursor = bgc_chemistry_col.find(
        {"meta.beach_id": beach_id, "timestamp": {"$gte": since}},
        sort=[("timestamp", 1)],
    )
    for d in cursor:
        ts = d["timestamp"]
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        for var in ("ph", "o2", "o2b", "no3", "po4"):
            v = d.get(var)
            if v is None:
                continue
            rows.append((ts, var, float(v)))
    return rows


# Sofar Spotter buoys mount the thermistor inside the floating housing.
# On calm sunny mornings the housing heats 10–15°C above true sea surface
# temperature — see the Ahtopol 9°C → 27°C jump observed 2026-04-26.
# Sea has huge thermal mass; 1°C/hour is already 24°C/day, well above any
# physically plausible coastal swing. We rate-limit ONLY water_temp.
WATER_TEMP_MAX_RATE_C_PER_HOUR = 1.0


def _load_buoy_measurements(buoy_id: str, now: datetime, lookback_hours: int):
    """
    Return list of (timestamp, indicator_name, value) for one buoy.

    Only water_temp is rate-limited (see WATER_TEMP_MAX_RATE_C_PER_HOUR).
    Wave/wind readings pass through untouched — they can legitimately swing
    fast during squalls and we have no evidence of artefacts there yet.
    """
    if buoy_id is None:
        return []
    since = now - timedelta(hours=lookback_hours)
    rows = []
    cursor = buoy_obs_col.find(
        {"meta.buoy_id": buoy_id, "timestamp": {"$gte": since}},
        sort=[("timestamp", 1)],
    )

    last_trusted_temp: tuple[datetime, float] | None = None

    for d in cursor:
        ts = d["timestamp"]
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)

        for ind, field in BUOY_FIELDS.items():
            v = d.get(field)
            if v is None:
                continue
            v = float(v)

            if ind == "water_temp" and last_trusted_temp is not None:
                prev_ts, prev_val = last_trusted_temp
                dt_h = max(0.05, (ts - prev_ts).total_seconds() / 3600.0)
                if abs(v - prev_val) / dt_h > WATER_TEMP_MAX_RATE_C_PER_HOUR:
                    # Reject as housing artefact — last_trusted_temp unchanged.
                    continue

            if ind == "water_temp":
                last_trusted_temp = (ts, v)

            rows.append((ts, ind, v))

    return rows


def _load_s2_measurements(beach_id: str, now: datetime):
    """
    Return list of (timestamp, indicator_name, value) for the beach's latest
    Sentinel-2 observation. No hard age cutoff: exponential decay in
    `_aggregate_indicator` shrinks the contribution of stale obs to ~0
    automatically (freshness = exp(-Δt/τ), τ_chl = 5 days).
    """
    obs = observations_col.find_one({"beach_id": beach_id})
    if not obs or not obs.get("observation_date"):
        return []
    try:
        ts = datetime.strptime(obs["observation_date"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        return []
    rows = []
    inds = obs.get("indicators") or {}
    for ind in ("chl", "tur", "spm"):
        block = inds.get(ind) or {}
        v = block.get("current_value")
        if v is None:
            continue
        rows.append((ts, ind, float(v)))
    return rows


# ---------------------------------------------------------------------------
# Bayesian fusion
# ---------------------------------------------------------------------------
def _annotate_component(comp_value: dict, measurements: list, now: datetime) -> dict:
    """Add a future_n / past_n breakdown so consumers see how much forecast vs
    observation contributed to this indicator."""
    def _ts_aware(ts):
        return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
    past_n = sum(1 for ts, _, _ in measurements if _ts_aware(ts) <= now)
    future_n = sum(1 for ts, _, _ in measurements if _ts_aware(ts) > now)
    comp_value["past_measurements"] = past_n
    comp_value["future_measurements"] = future_n
    return comp_value


def _aggregate_indicator(measurements, tau_hours: float, now: datetime):
    """
    For one indicator, compute:
      - weighted_mean_subscore  (in [0, 1], NaN if no measurements)
      - freshness_factor        (in [0, 1], based on latest measurement age)
      - n_measurements
      - latest_age_hours
      - latest_value
    """
    if not measurements:
        return None
    sub = SUBSCORES[next(iter(measurements))[1]]  # fetch by indicator name
    # All measurements should be for the same indicator
    ws, ss = [], []
    closest_dist = None        # smallest |Δt| from now (drives freshness)
    closest_ts = None
    closest_value = None
    for ts, _ind, v in measurements:
        age_h = _hours_distance(ts, now)
        w = math.exp(-age_h / tau_hours)
        ws.append(w)
        ss.append(sub(v))
        if closest_dist is None or age_h < closest_dist:
            closest_dist = age_h
            # ensure closest_ts is tz-aware for downstream compare
            closest_ts = ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
            closest_value = v
    sum_w = sum(ws)
    if sum_w == 0:
        return None
    weighted_mean = sum(w * s for w, s in zip(ws, ss)) / sum_w
    freshness = math.exp(-closest_dist / tau_hours)
    return {
        "subscore_weighted_mean": weighted_mean,
        "freshness_factor": freshness,
        "n_measurements": len(measurements),
        "latest_age_hours": round(closest_dist, 2),  # distance, signed by past/future not stored
        "latest_value": closest_value,
        "closest_was_in_future": closest_ts > now if closest_ts else False,
    }


def compute_bath_score(beach_id: str, buoy_id: Optional[str],
                       lookback_hours: int = 168,
                       lookahead_hours: int = 24) -> dict:
    """
    Compute bath-score for one beach via Bayesian fusion of:
      - past Sentinel-2 / MSI observations (latest snapshot)
      - past Sofar Spotter buoy measurements (last `lookback_hours`)
      - Copernicus Marine *forecast* hours (next `lookahead_hours`)

    All three sources are treated as evidence of the same underlying state,
    each weighted by `exp(-|Δt|/τ)` so a 4h-old observation and a 4h-ahead
    forecast contribute equally per indicator. Forecast feeds `wave_height`
    (extending the buoy time-series forward) and the new `current_speed`
    indicator.
    """
    now = datetime.now(timezone.utc)

    # Pull raw measurements once, partition by indicator
    by_indicator: dict[str, list] = {k: [] for k in INDICATORS_META}
    for ts, ind, v in _load_s2_measurements(beach_id, now):
        by_indicator.setdefault(ind, []).append((ts, ind, v))
    for ts, ind, v in _load_buoy_measurements(buoy_id, now, lookback_hours):
        by_indicator.setdefault(ind, []).append((ts, ind, v))
    for ts, ind, v in _load_forecast_measurements(beach_id, now, lookahead_hours):
        by_indicator.setdefault(ind, []).append((ts, ind, v))

    # Bayesian accumulation — start from uninformative Uniform[0,1] prior Beta(1,1)
    alpha = 1.0
    beta = 1.0
    components = {}
    missing = []

    for ind, meta in INDICATORS_META.items():
        meas = by_indicator.get(ind) or []
        agg = _aggregate_indicator(meas, meta["tau_hours"], now)
        if agg is None:
            missing.append(ind)
            components[ind] = {
                "weight": meta["weight"],
                "source": meta["source"],
                "available": False,
            }
            continue

        contribution = meta["weight"] * agg["freshness_factor"]
        ws = agg["subscore_weighted_mean"]
        alpha += contribution * ws
        beta += contribution * (1.0 - ws)

        comp = {
            "weight": meta["weight"],
            "source": meta["source"],
            "available": True,
            "n_measurements": agg["n_measurements"],
            "latest_value": agg["latest_value"],
            "latest_age_hours": agg["latest_age_hours"],
            "weighted_subscore": round(ws, 4),
            "freshness_factor": round(agg["freshness_factor"], 4),
            "effective_contribution": round(contribution, 4),
            "tau_hours": meta["tau_hours"],
        }
        components[ind] = _annotate_component(comp, meas, now)

    score_mean = alpha / (alpha + beta)
    score_value = round(score_mean * 100, 1)
    ci_low = float(beta_dist.ppf(0.025, alpha, beta))
    ci_high = float(beta_dist.ppf(0.975, alpha, beta))

    if not missing:
        flag = "green" if score_value >= 75 else "amber" if score_value >= 50 else "red"
    else:
        flag = "green" if score_value >= 75 else "amber" if score_value >= 50 else "red"

    return {
        "score": score_value,
        "flag": flag,
        "credible_interval_95": [round(ci_low * 100, 1), round(ci_high * 100, 1)],
        "posterior": {"alpha": round(alpha, 4), "beta": round(beta, 4)},
        "components": components,
        "missing_indicators": missing,
        "lookback_hours": lookback_hours,
        "lookahead_hours": lookahead_hours,
        "methodology": "bayesian-fusion-v2",
        "evidence_sources": ["sentinel-2-msi", "sofar-spotter", "copernicus-marine-forecast"],
        "computed_at": now.isoformat(),
        "uses_eea_prior": False,
    }


# ---------------------------------------------------------------------------
# Offshore conditions score (BGC chemistry + forecast)
# ---------------------------------------------------------------------------
def compute_offshore_score(beach_id: str,
                           lookback_hours: int = 168,
                           lookahead_hours: int = 24) -> dict:
    """
    Bayesian fusion for OFFSHORE points (type=offshore).

    Inputs:
      - BGC chemistry (ph, o2, no3, po4)            — past, daily, 2.5 km
      - Paired Sofar Spotter buoy (water_temp,
        wave_height, wind_speed)                    — past, ~30 min cadence
      - Marine forecast (wave_height, current_speed)— future, hourly

    The buoy comes from the offshore doc's `meta.buoy` field. Same buoy serves
    both beach and offshore docs in a group, so buoy contributions are not
    independent measurements between the two scores — they share the source.
    """
    now = datetime.now(timezone.utc)

    # Resolve paired buoy via the offshore doc's meta
    offshore_doc = beaches_col.find_one({"_id": beach_id}) or {}
    buoy_id = (offshore_doc.get("meta") or {}).get("buoy")

    by_indicator: dict[str, list] = {k: [] for k in OFFSHORE_INDICATORS_META}
    # Past chemistry
    for ts, ind, v in _load_bgc_measurements(beach_id, now, lookback_hours):
        by_indicator.setdefault(ind, []).append((ts, ind, v))
    # Past buoy data (water_temp, wave_height, wind_speed, ...)
    if buoy_id:
        for ts, ind, v in _load_buoy_measurements(buoy_id, now, lookback_hours):
            # Only feed the indicators we actually want in offshore scoring
            if ind in OFFSHORE_INDICATORS_META:
                by_indicator.setdefault(ind, []).append((ts, ind, v))
    # Future forecast
    for ts, ind, v in _load_forecast_measurements(beach_id, now, lookahead_hours):
        by_indicator.setdefault(ind, []).append((ts, ind, v))

    alpha = 1.0
    beta = 1.0
    components = {}
    missing = []

    for ind, meta in OFFSHORE_INDICATORS_META.items():
        meas = by_indicator.get(ind) or []
        agg = _aggregate_indicator(meas, meta["tau_hours"], now)
        if agg is None:
            missing.append(ind)
            components[ind] = {
                "weight": meta["weight"],
                "source": meta["source"],
                "available": False,
            }
            continue

        contribution = meta["weight"] * agg["freshness_factor"]
        ws = agg["subscore_weighted_mean"]
        alpha += contribution * ws
        beta += contribution * (1.0 - ws)

        comp = {
            "weight": meta["weight"],
            "source": meta["source"],
            "available": True,
            "n_measurements": agg["n_measurements"],
            "latest_value": agg["latest_value"],
            "latest_age_hours": agg["latest_age_hours"],
            "weighted_subscore": round(ws, 4),
            "freshness_factor": round(agg["freshness_factor"], 4),
            "effective_contribution": round(contribution, 4),
            "tau_hours": meta["tau_hours"],
        }
        components[ind] = _annotate_component(comp, meas, now)

    score_mean = alpha / (alpha + beta)
    score_value = round(score_mean * 100, 1)
    ci_low = float(beta_dist.ppf(0.025, alpha, beta))
    ci_high = float(beta_dist.ppf(0.975, alpha, beta))

    flag = "green" if score_value >= 75 else "amber" if score_value >= 50 else "red"

    return {
        "score": score_value,
        "flag": flag,
        "credible_interval_95": [round(ci_low * 100, 1), round(ci_high * 100, 1)],
        "posterior": {"alpha": round(alpha, 4), "beta": round(beta, 4)},
        "components": components,
        "missing_indicators": missing,
        "lookback_hours": lookback_hours,
        "lookahead_hours": lookahead_hours,
        "methodology": "offshore-bayesian-fusion-v1",
        "evidence_sources": ["copernicus-bgc-chemistry", "copernicus-marine-forecast"],
        "computed_at": now.isoformat(),
    }


# ---------------------------------------------------------------------------
# Forecast-based recommendation: should I go to the beach in the next N hours?
# ---------------------------------------------------------------------------
def _load_forecast_window(beach_id: str, hours_ahead: int):
    """Pull marine_forecast hours within [now, now+hours_ahead]."""
    now = datetime.now(timezone.utc)
    until = now + timedelta(hours=hours_ahead)
    return list(marine_forecast_col.find(
        {"meta.beach_id": beach_id, "timestamp": {"$gte": now, "$lte": until}},
        sort=[("timestamp", 1)],
    ))


def compute_recommendation(beach_id: str, buoy_id: Optional[str],
                           hours_ahead: int = 4) -> dict:
    """
    "Should I go to the beach?" — thin wrapper around `compute_bath_score`.

    The bath_score itself already fuses past observations + future forecast
    via Bayesian time-decay (methodology bayesian-fusion-v2). This function
    just:
      • Calls compute_bath_score with `lookahead_hours = hours_ahead`
        so only the relevant slice of forecast is included
      • Applies a go / wait / skip decision threshold
      • Surfaces the per-forecast-hour breakdown for chart display

    No separate scoring math — the score is the score.
    """
    now = datetime.now(timezone.utc)

    # 1. Unified bath-score with the forecast horizon limited to the request
    bs = compute_bath_score(
        beach_id=beach_id, buoy_id=buoy_id,
        lookahead_hours=hours_ahead,
    )
    score = bs["score"]
    ci = bs["credible_interval_95"]

    # 2. Decision rule on the unified score (with conservative CI guard:
    #    if the lower CI bound is below 50 we never say "go")
    if score >= 70 and ci[0] >= 50:
        decision = "go"
        verdict = (
            f"Good to go — bath-score {score:.1f} (95% CI {ci}). "
            f"Forecast already factored into the score."
        )
    elif score >= 55:
        decision = "wait"
        verdict = (
            f"Marginal — bath-score {score:.1f} (95% CI {ci}). "
            "Wait for better conditions or check later."
        )
    else:
        decision = "skip"
        verdict = (
            f"Not recommended — bath-score {score:.1f} (95% CI {ci})."
        )

    # 3. Pull the per-hour forecast slice for chart-friendly breakdown
    fc_rows = _load_forecast_window(beach_id, hours_ahead)
    hour_breakdown = []
    for r in fc_rows:
        ts = r["timestamp"]
        if hasattr(ts, "tzinfo") and ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        wh = r.get("wave_height_m")
        cs = r.get("current_speed_ms")
        hour_breakdown.append({
            "timestamp": ts.isoformat(),
            "wave_height_m": wh,
            "wave_subscore": round(subscore_wave_height(wh), 3) if wh is not None else None,
            "wave_source": "copernicus-marine-forecast",
            "current_speed_ms": cs,
            "current_subscore": round(subscore_current_speed(cs), 3) if cs is not None else None,
            "current_source": "copernicus-marine-forecast",
        })

    # 4. Surface which indicators are pulling the score down right now
    contributing_red_flags = []
    for ind, comp in bs["components"].items():
        if not comp.get("available"):
            continue
        ws = comp.get("weighted_subscore", 1.0)
        if ws < 0.5:
            contributing_red_flags.append({
                "indicator": ind,
                "subscore": ws,
                "latest_value": comp.get("latest_value"),
                "source": comp.get("source"),
                "future_n": comp.get("future_measurements", 0),
                "past_n": comp.get("past_measurements", 0),
            })

    return {
        "beach_id": beach_id,
        "decision": decision,
        "verdict": verdict,
        "score": score,
        "flag": bs["flag"],
        "credible_interval_95": ci,
        "interpretation": interpret_score(score),
        "uses_forecast": True,
        "lookahead_hours": hours_ahead,
        "now": now.isoformat(),
        "limiting_indicators": contributing_red_flags,
        "missing_indicators": bs["missing_indicators"],
        "hour_breakdown": hour_breakdown,
        "underlying_bath_score_methodology": bs["methodology"],
        "methodology": "forecast-recommendation-v2",
        "computed_at": now.isoformat(),
    }


def interpret_score(value: float) -> str:
    if value >= 80:
        return "Excellent bathing conditions"
    if value >= 65:
        return "Good — typical safe-bathing range"
    if value >= 50:
        return "Marginal — monitor; check fresh observations"
    if value >= 30:
        return "Poor — bathing not recommended"
    return "Unsuitable for bathing"
