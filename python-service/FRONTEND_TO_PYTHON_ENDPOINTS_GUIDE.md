# Aware Beach Service — Frontend Integration Guide

A FastAPI service exposing per-beach water-quality scores and marine forecasts for the 4 monitored Bulgarian Black Sea beaches.

## TL;DR

```bash
cd python-service
.venv/bin/uvicorn api:app --reload --port 8000
```

Then per location you have two entry points depending on the activity mode:

```
# Swimming beach (type=beach)
GET /beaches/{beach_id}                          # bath_score + recommendation + observation, bundled

# Offshore zone (type=offshore)
GET /beaches/{offshore_id}/offshore-score        # chemistry + waves + currents
GET /beaches/{offshore_id}/chemistry             # raw daily history for charts
```

Add `/forecast` or `/timeline` for chart data on either type.

---

## 1. Starting the server

### Prerequisites

- **Python 3.10 or newer** on PATH
  ```bash
  python3 --version
  # should print: Python 3.10.x or higher
  ```
  If missing, install with `brew install python@3.11` (macOS) or `apt install python3 python3-venv` (Linux).
- **MongoDB connection string.** Create a `.env` file in the **parent folder** (`NebulaTrio/.env`):
  ```
  MONGO_URI=mongodb+srv://danielpetrov222:DaniAniMarti123%24%24@cluster0.ky4bxei.mongodb.net/nebulatrio?appName=Cluster0
  ```

### First-time setup (do this once)

```bash
# 1. Move into the service folder
cd python-service

# 2. Create an isolated Python environment in .venv/
python3 -m venv .venv

# 3. Install all dependencies into that environment
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
```

This creates a `.venv/` folder containing its own Python + pip + ~50 packages (FastAPI, pymongo, xarray, scipy, etc.). The folder is ~600 MB and is git-ignored.

> Don't `pip install` globally — always use `.venv/bin/pip` so dependencies stay isolated and don't conflict with other Python projects on your machine.

### Optional: log into Copernicus Marine (only if you want to refresh satellite/forecast data yourself)

```bash
.venv/bin/copernicusmarine login --username '<email>' --password '<pw>'
```

You can skip this — the API server reads from MongoDB and works fine even if the Copernicus credentials aren't saved. Data is refreshed by whoever runs the ingest scripts.

### Run the server (every time)

```bash
cd python-service
.venv/bin/uvicorn api:app --reload --port 8000
```

You should see `Uvicorn running on http://127.0.0.1:8000`. Open http://localhost:8000/docs for auto-generated Swagger UI you can poke at.

### Background data refresh (optional, recommended)

The service reads from MongoDB. If nobody refreshes the data, it goes stale.

```bash
# Start the buoy cron daemon — pulls new buoy points every 30 min
.venv/bin/python buoy_cron.py
```

The Sentinel-2 satellite ingest and marine forecast ingest aren't on a daemon yet. Run them on demand:

```bash
.venv/bin/python ingest.py --days-back 20         # satellite (do once a week)
.venv/bin/python forecast_ingest.py --days-ahead 1   # forecast (do daily)
```

---

## 2. Locations — beaches and offshore zones

There are **two types** of locations in the system, paired by `group`:

### Swimming beaches (`type: "beach"`)

| `_id` | Name | Group | Lat | Lon |
|---|---|---|---|---|
| `varna_beach` | Varna Beach | varna | 43.20 | 27.92 |
| `shkorpilovtsi_beach` | Shkorpilovtsi Beach | shkorpilovtsi | 42.95 | 27.90 |
| `ahtopol_beach` | Ahtopol Beach | ahtopol | 42.10 | 27.93 |
| `primorsko_beach` | Primorsko Beach | primorsko | 42.25 | 27.75 |

Use these for the **bath_score** endpoint — they get full per-beach scoring including Sentinel-2 (~100 m), buoy data, marine forecast.

### Offshore zones (`type: "offshore"`)

| `_id` | Group | Lat | Lon |
|---|---|---|---|
| `varna_offshore` | varna | 43.20 | 27.92 |
| `shkorpilovtsi_offshore` | shkorpilovtsi | 42.95 | 27.91 |
| `ahtopol_offshore` | ahtopol | 42.11 | 27.93 |
| `primorsko_offshore` | primorsko | 42.25 | 27.76 |

Use these for the **offshore-score** endpoint — they get BGC chemistry (pH, O₂, nitrate, phosphate) at 2.5 km resolution, which is too coarse for individual swimming beaches but appropriate for offshore activities (fishing, sailing, diving).

To list everything:

```
GET http://localhost:8000/beaches
```

Returns all 8 docs (4 beach + 4 offshore). Each carries a `type` field — filter client-side. The `group` field tells you which beach/offshore pair belongs together.

---

## 3. The endpoints your UI actually needs

### A. Headline endpoint — everything bundled

```
GET http://localhost:8000/beaches/{beach_id}
```

Returns the beach metadata, the latest satellite snapshot, the bath score, and the recommendation in one response. **This is the one you call on the beach detail page.**

Optional query params:

| Param | Default | Notes |
|---|---|---|
| `include_bath_score` | `true` | Set false to skip the score computation |
| `include_recommendation` | `true` | Set false to skip the forecast lookup |
| `recommendation_hours` | `4` | How many forecast hours to consider for go/wait/skip |

### Response shape

```jsonc
{
  "beach": {
    "id": "varna_beach",
    "name": "Varna Beach",
    "type": "beach",
    "coordinates": { "type": "Point", "coordinates": [43.20, 27.92] },
    "meta": { "label": "Swimming zone", "buoy": "varna_bay_io-ban" }
  },
  "observation": {
    "beach_id": "varna_beach",
    "observation_date": "2026-04-08",
    "indicators": {
      "chl": { "current_value": 1.69, "score": "green", "interpretation": "..." },
      "tur": { ... },
      "spm": { ... }
    },
    "overall_score": "green",
    "image_path": ".../varna_beach.png",
    "source": { ... Sentinel-2 attribution ... }
  },
  "bath_score": {
    "score": 70.9,                            // 0–100 — show this prominently
    "flag": "amber",                          // green | amber | red
    "credible_interval_95": [49.3, 88.3],     // confidence band
    "interpretation": "Good — typical safe-bathing range",
    "components": { ...full per-indicator breakdown — see Section 5... },
    "methodology": "bayesian-fusion-v2"
  },
  "recommendation": {
    "decision": "go",                         // go | wait | skip | unknown
    "verdict": "Good to go — bath-score 70.9 (95% CI [49, 88])...",
    "score": 70.9,
    "flag": "amber",
    "limiting_indicators": [
      { "indicator": "water_temp", "subscore": 0.21, "latest_value": 12.16, ... }
    ],
    "hour_breakdown": [ ... per-hour wave + current values ... ]
  }
}
```

### B. Standalone bath-score (without the bundled noise)

```
GET http://localhost:8000/beaches/{beach_id}/bath-score
```

Same `bath_score` block as above, plus optional params:

| Param | Default | Range | Notes |
|---|---|---|---|
| `lookback_hours` | `168` | 1–1440 | How much past evidence to fuse |
| `lookahead_hours` | `24` | 0–120 | How much forecast to fuse (set 0 to disable) |

Example:
```
GET /beaches/varna_beach/bath-score?lookback_hours=24&lookahead_hours=4
```

### C. Standalone recommendation (just go/wait/skip)

```
GET http://localhost:8000/beaches/{beach_id}/recommendation?hours_ahead=4
```

Returns just the recommendation block. Same shape as the embedded one.

### D. Future forecast — hourly raw data

```
GET http://localhost:8000/beaches/{beach_id}/forecast?hours_ahead=24
```

`hours_ahead`: 1–120, default 24.

```jsonc
{
  "beach_id": "varna_beach",
  "horizon_hours": 24,
  "from": "2026-04-26T07:52:19Z",
  "to":   "2026-04-27T07:52:19Z",
  "count": 24,
  "data_source": { "kind": "Numerical model forecast", ... },
  "forecast": [
    {
      "timestamp": "2026-04-26T08:00:00",
      "wave_height_m": 0.18,            // significant wave height
      "wave_max_height_m": 0.14,        // max single-wave height in window
      "wave_peak_period_s": 2.67,
      "wave_mean_period_s": 2.80,
      "wave_mean_direction_deg": 145.7,  // °T (true bearing)
      "wave_peak_direction_deg": 154.7,
      "current_speed_ms": 0.016,        // surface current speed
      "current_direction_deg": 111.1,    // °T flow-towards
      "current_eastward_ms": 0.015,
      "current_northward_ms": -0.006
    },
    // ... 23 more rows
  ]
}
```

### E. Past + future timeline (combined buoy + forecast)

```
GET http://localhost:8000/beaches/{beach_id}/timeline?hours_back=48&hours_ahead=24
```

Returns rows tagged `tense: "past" | "future"` with `source` field telling you whether each point came from the buoy or the forecast model. Good for charting "data so far" + "predicted next" on one continuous axis.

```jsonc
{
  "beach_id": "varna_beach",
  "buoy_id": "varna_bay_io-ban",
  "now": "2026-04-26T07:52:19Z",
  "past_count": 96,
  "future_count": 24,
  "rows": [
    { "timestamp": "...", "tense": "past", "source": "sofar-spotter",
      "wave_height_m": 0.16, "wave_state_beaufort": 2, "current_speed_ms": null },
    ...
    { "timestamp": "...", "tense": "future", "source": "copernicus-marine-forecast",
      "wave_height_m": 0.18, "current_speed_ms": 0.016, "current_direction_deg": 111 }
  ]
}
```

### F. Offshore water-quality score (chemistry-aware)

```
GET http://localhost:8000/beaches/{offshore_id}/offshore-score
```

**Use this for offshore zones (`type: "offshore"`), NOT for swimming beaches.**

This is the offshore equivalent of `bath_score`, but built on different evidence:

| | bath_score (beaches) | **offshore-score** |
|---|---|---|
| Sentinel-2 MSI (chl/tur/spm, 100 m) | ✅ | ❌ |
| Sofar Spotter buoy (water_temp, waves, wind) | ✅ | ❌ |
| Marine forecast (waves, currents) | ✅ | ✅ |
| **BGC chemistry (pH, O₂, nitrate, phosphate)** | ❌ | ✅ |

Why the difference: BGC chemistry is at 2.5 km resolution — too coarse to differentiate swimming beaches in the same bay. Offshore zones are spread out enough that the resolution makes sense, and offshore users care about water health more than swimming comfort.

Optional query params (same shape as `/bath-score`):

| Param | Default | Range |
|---|---|---|
| `lookback_hours` | `168` | 1–1440 |
| `lookahead_hours` | `24` | 0–120 |

Response shape:

```jsonc
{
  "score": 82.0,
  "flag": "green",
  "credible_interval_95": [60.9, 95.9],
  "interpretation": "Excellent bathing conditions",
  "components": {
    "ph":   { "latest_value": 8.44, "weighted_subscore": 0.69, "source": "copernicus-bgc", ... },
    "o2":   { "latest_value": 343.8, "weighted_subscore": 1.00, "source": "copernicus-bgc", ... },
    "no3":  { "latest_value": 1.63, "weighted_subscore": 0.80, "source": "copernicus-bgc", ... },
    "po4":  { "latest_value": 0.0006, "weighted_subscore": 1.00, "source": "copernicus-bgc", ... },
    "wave_height_forecast":   { ... },
    "current_speed_forecast": { ... }
  },
  "missing_indicators": [],
  "methodology": "offshore-bayesian-fusion-v1",
  "evidence_sources": ["copernicus-bgc-chemistry", "copernicus-marine-forecast"],
  "beach_id": "varna_offshore"
}
```

Calling this endpoint with a swimming-beach id returns `404` with a redirect hint:

```jsonc
{
  "detail": {
    "error": "Chemistry data not available for swimming beaches",
    "reason": "BGC model resolution is 2.5 km — too coarse for beach-scale differentiation.",
    "use_instead": "varna_offshore"
  }
}
```

### G. Offshore chemistry — raw daily history

```
GET http://localhost:8000/beaches/{offshore_id}/chemistry?days_back=7
```

Returns the daily BGC chemistry time-series for one offshore zone — useful for charts, trend analysis, and the **chemistry tab** of the offshore detail page.

| Param | Default | Range |
|---|---|---|
| `days_back` | `7` | 1–60 |

Response shape:

```jsonc
{
  "beach_id": "varna_offshore",
  "name": "Varna Offshore",
  "group": "varna",
  "data_source": {
    "kind": "Numerical model forecast (biogeochemistry)",
    "data_provider": "Copernicus Marine Service (CMEMS)",
    "product_id": "BLKSEA_ANALYSISFORECAST_BGC_007_010",
    "spatial_resolution_km": 2.5,
    "temporal_resolution": "daily"
  },
  "since": "2026-04-19T08:00:00Z",
  "count": 7,
  "latest": {
    "timestamp": "2026-04-26T00:00:00",
    "ph":     { "value": 8.44,  "unit": "" },
    "o2":     { "value": 343.8, "unit": "mmol/m³" },
    "o2b":    { "value": 0.0,   "unit": "mmol/m³" },   // bottom O2 — see Quirks
    "no3":    { "value": 1.63,  "unit": "mmol/m³" },
    "po4":    { "value": 0.0006,"unit": "mmol/m³" },
    "dissic": { "value": 3.04,  "unit": "mol/m³" },
    "talk":   { "value": 3.39,  "unit": "mol/m³" },
    "nppv":   { "value": 4.35,  "unit": "mg/m³/day" }
  },
  "history": [
    { "timestamp": "2026-04-20T00:00:00", "ph": 8.49, "o2": 326.8, "no3": 4.6, ... },
    // ... 6 more daily snapshots
  ]
}
```

This is the data that replaces the `oxygen / phosphorus / nitrogen / pH` mock metrics in `mockData.js` — but only for **offshore mode**. In beach mode those metrics should be hidden or show "not applicable at beach scale".

### Mapping the chemistry response to your existing metric icons

| `mockData.js` metric | BGC field | Unit conversion needed? |
|---|---|---|
| `oxygen` | `o2` | mmol/m³ → mg/L: divide by 31.25 |
| `phosphorus` | `po4` (phosphate as P) | mmol/m³ → mg/L: × 0.0310 |
| `nitrogen` | `no3` (nitrate as N) | mmol/m³ → mg/L: × 0.0140 |
| `ph` | `ph` | None — already unitless |

The frontend can show the raw `mmol/m³` values too — both conventions are accepted in oceanography.

---

## 4. Bath-score components — what to show in the UI

The `bath_score.components` block contains 9 indicators. Use it to render a "what's pulling the score down?" breakdown.

| `key` | Display name | Unit | Source | Notes |
|---|---|---|---|---|
| `chl` | Chlorophyll-a | mg/m³ | Sentinel-2 MSI | Algal bloom proxy |
| `tur` | Turbidity | FNU | Sentinel-2 MSI | Water clarity |
| `spm` | Suspended matter | g/m³ | Sentinel-2 MSI | Sediment load |
| `water_temp` | Water temperature | °C | Sofar Spotter buoy | The big one for swimming comfort |
| `wave_height` | Wave height (now) | m | Sofar Spotter buoy | What's actually happening |
| `wave_state` | Sea state | Beaufort | Sofar Spotter buoy | 0–9 scale |
| `wind_speed` | Wind speed | m/s | Sofar Spotter buoy | |
| `wave_height_forecast` | Wave height (next hours) | m | Copernicus model | |
| `current_speed_forecast` | Surface current (next hours) | m/s | Copernicus model | Drift / rip-current risk |

Each component has:

```jsonc
{
  "weight": 6.0,                     // how much this indicator can move the score
  "source": "sofar-spotter",         // honest data origin
  "available": true,                 // false → no data, skip in UI
  "n_measurements": 165,
  "latest_value": 12.16,             // raw value, in indicator's unit
  "latest_age_hours": 1.49,          // how stale the latest reading is
  "weighted_subscore": 0.211,        // [0,1] — 1=ideal, 0=unsuitable
  "freshness_factor": 0.676,         // [0,1] — based on closest measurement
  "effective_contribution": 4.910,   // weight × freshness — how much it actually counts
  "tau_hours": 4,                    // time-decay constant
  "past_measurements": 165,
  "future_measurements": 0
}
```

For the UI, the most useful per-indicator fields are:
- `latest_value` — show it
- `weighted_subscore` — colour the row green/amber/red against 0.5 / 0.7 thresholds
- `effective_contribution` — sort by this to find what's dragging the score

### Score → flag mapping

```js
function scoreColor(score, ci_lower) {
  if (score >= 70 && ci_lower >= 50) return "green";
  if (score >= 55) return "amber";
  return "red";
}
```

Or just trust the `flag` field that comes back in the response.

---

## 5. Reference / housekeeping endpoints

| Endpoint | Purpose |
|---|---|
| `GET /health` | Liveness check — returns `{status, data_source}` |
| `GET /docs` | Swagger UI |
| `GET /buoys` | All 4 buoys + their latest readings |
| `GET /buoys/{buoy_id}/observations?days_back=7` | Raw buoy time-series |
| `GET /beaches/bg` | EEA's official Bulgarian bathing-water list (~92 beaches) — used for the "all beaches in BG" map; not part of the main 4 we score |
| `POST /forecast/refresh?days_ahead=1` | Trigger marine forecast re-pull (background) |
| `POST /buoys/refresh?mode=delta` | Trigger buoy delta refresh |
| `POST /chemistry/refresh?days_back=7` | Trigger BGC chemistry re-pull (background) |
| `GET /forecast/refresh/status` | Last 5 forecast ingest runs |
| `GET /buoys/refresh/status` | Last 5 buoy ingest runs |
| `GET /chemistry/refresh/status` | Last 5 BGC chemistry ingest runs |

---

## 6. Common UI patterns

### Location list/grid (beaches + offshore)
```
1× GET /beaches                     # all 8 docs (4 beach + 4 offshore)
                                    # filter client-side by `type`
```

For the score in each card:
```
# In beach mode
4× GET /beaches/{beach_id}/bath-score

# In offshore mode
4× GET /beaches/{offshore_id}/offshore-score
```

### Beach detail page (swimming mode)
```
GET /beaches/{beach_id}                                              # bundle
GET /beaches/{beach_id}/timeline?hours_back=24&hours_ahead=12        # past + future chart
GET /beaches/{beach_id}/recommendation?hours_ahead=4                 # go/wait/skip
```

### Offshore detail page (fishing/sailing/diving mode)
```
GET /beaches/{offshore_id}/offshore-score                            # the score itself
GET /beaches/{offshore_id}/chemistry?days_back=7                     # chemistry history for charts
GET /beaches/{offshore_id}/forecast?hours_ahead=24                   # waves + currents
```

### "Should I go now?" widget (beaches only)
```
GET /beaches/{beach_id}/recommendation?hours_ahead=4
```

Show `decision`, `verdict`, and the worst entry from `limiting_indicators`.

### Forecast slider (next 24 h — works for both beaches and offshore)
```
GET /beaches/{any_id}/forecast?hours_ahead=24
```

Plot `wave_height_m` and `current_speed_ms` over time.

### Chemistry trend chart (offshore only)
```
GET /beaches/{offshore_id}/chemistry?days_back=14
```

Plot `history[].ph`, `history[].o2`, etc. as line charts.

---

## 7. Quirks worth knowing

- **CORS is wide open** (`allow_origins=["*"]`) — any frontend domain can hit the API.
- **Score interpretation** depends on `ci_lower` not just `score`. A score of 73 with CI [40, 90] is less confident than a score of 73 with CI [65, 80]. Show the band when it's wide.
- **`observation_date` per beach can be days old.** Sentinel-2 has a 5-day revisit + cloud constraints. The bath_score time-decay handles this; just expect "satellite data was last updated N days ago" in the UI.
- **Forecast horizon shrinks over time.** Each `forecast_ingest` run stores N future hours from "now". Six hours later, those hours are now 6 in the past and only `N − 6` future hours remain. Run the ingest at least daily.
- **The 4 monitored beaches** are different from the 92 EEA bathing waters in `/beaches/bg`. The full BG list is informational; only the 4 with `type: "beach"` in `aware.beaches` get full scoring.
- **Score is computed on every request** — not cached. Keep that in mind for high-traffic pages; consider client-side caching with a 1–2 minute TTL.
- **Beaches and offshore zones use different scoring methodologies.** Don't call `/offshore-score` on a `beach_id` (and vice versa) — you'll get a 404 with a `use_instead` hint pointing at the paired location in the same `group`.
- **Chemistry endpoint refuses swimming beaches by design.** The 2.5 km BGC grid would give identical values for two adjacent swimming beaches in the same model cell. The endpoint forces you to use the offshore equivalent — its `use_instead` field tells you which one.
- **`o2b` (bottom oxygen) is always ~0 in the chemistry response** for the Black Sea. That's a real Black Sea feature: a permanent anoxic layer below ~150 m. Show it in raw data tables but don't alarm users — it's not pollution, it's geology. The offshore-score deliberately excludes it.
- **Chemistry data is daily** (one snapshot per UTC midnight), not hourly like the buoy or forecast streams. Don't expect intra-day resolution.
- **Buoy `water_temp` is rate-limited before scoring.** Sofar Spotter buoys mount their thermometer inside the floating housing — on calm sunny mornings it can heat 10–15°C above the actual sea surface (we observed Ahtopol jumping 9°C → 27°C between 03:24 and 05:24 UTC on 2026-04-26). To prevent this from poisoning the score, `_load_buoy_measurements` rejects any `water_temp` reading that changes by more than **1°C/hour** vs the previous trusted value (sea has huge thermal mass; 1°C/hour ≈ 24°C/day, already well above any real coastal swing). Wave/wind readings pass through untouched — they can legitimately swing fast during squalls, and we have no evidence of artefacts there. Rejected readings are silently dropped; the next valid reading is compared against the *last trusted* value so a single bad ping doesn't disqualify everything after it. Raw unfiltered values are still visible at `GET /buoys/{buoy_id}/observations` for charting purposes; only the scoring layer filters them.

---

## 8. Sample fetch in the browser

### Beach (swimming) mode

```js
async function loadBeach(beachId) {
  const res = await fetch(`http://localhost:8000/beaches/${beachId}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  return {
    name: data.beach.name,
    score: data.bath_score.score,
    flag: data.bath_score.flag,             // "green" | "amber" | "red"
    decision: data.recommendation.decision, // "go" | "wait" | "skip"
    verdict: data.recommendation.verdict,
    components: data.bath_score.components,
  };
}

const beachCards = await Promise.all([
  "varna_beach",
  "shkorpilovtsi_beach",
  "ahtopol_beach",
  "primorsko_beach",
].map(loadBeach));
```

### Offshore mode

```js
async function loadOffshore(offshoreId) {
  const [scoreRes, chemRes] = await Promise.all([
    fetch(`http://localhost:8000/beaches/${offshoreId}/offshore-score`),
    fetch(`http://localhost:8000/beaches/${offshoreId}/chemistry?days_back=7`),
  ]);
  const score = await scoreRes.json();
  const chemistry = await chemRes.json();

  return {
    id: offshoreId,
    name: chemistry.name,
    score: score.score,
    flag: score.flag,                              // "green" | "amber" | "red"
    interpretation: score.interpretation,
    components: score.components,
    chemistry: chemistry.latest,                   // pH, O2, NO3, PO4, ...
    chemistryHistory: chemistry.history,           // for trend charts
  };
}

const offshoreCards = await Promise.all([
  "varna_offshore",
  "shkorpilovtsi_offshore",
  "ahtopol_offshore",
  "primorsko_offshore",
].map(loadOffshore));
```

---

## 9. Where to ask questions

- API behavior or new endpoints needed → ping me
- MongoDB schema → see `python-service/storage.py`
- Scoring math → see `python-service/bath_score.py` (well commented)
- Source attribution / data provenance → every observation has a `source` block
