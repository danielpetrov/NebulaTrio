"""MongoDB connection — points at the `aware` database.

Three collections are involved:

  • `aware.beaches`                    (read-only here, owned by main app)
        Source-of-truth for beach locations.
        Sample doc:
          {
            "_id": "varna_beach",
            "type": "beach" | "offshore",
            "name": "Varna Beach",
            "coordinates": { "type": "Point", "coordinates": [lat, lng] },
            ...
          }
        We only ever process docs with `type == "beach"`.

  • `aware.sentinel2_msi_observations` (read+write here)
        One document per beach, holding the latest Sentinel-2 / MSI
        derived water-quality snapshot. References the beach via `beach_id`.

  • `aware.sentinel2_msi_runs`         (read+write here)
        Ingest run history (one doc per refresh job).

Naming convention reflects the actual data origin:
  Sentinel-2 satellite, MSI sensor (MultiSpectral Instrument),
  Copernicus Marine HR Ocean Colour product
  OCEANCOLOUR_BLK_BGC_HR_L3_NRT_009_206 — `cmems_obs_oc_blk_bgc_tur-spm-chl_nrt_l3-hr-mosaic_P1D-m`.
"""
import os
from pathlib import Path
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")
load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    raise RuntimeError(
        "MONGO_URI is not set. Add it to ../.env or python-service/.env."
    )

AWARE_DB_NAME = "aware"

_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=10_000)
db = _client[AWARE_DB_NAME]

# Source of truth — owned by the main app, read-only from this service.
beaches_col = db["beaches"]

# Sentinel-2 / MSI derived water-quality observations — owned by this service.
observations_col = db["sentinel2_msi_observations"]
observations_col.create_index("beach_id", unique=True)
observations_col.create_index("observation_date")
observations_col.create_index("updated_at")

# Run history.
runs_col = db["sentinel2_msi_runs"]
runs_col.create_index("started_at")


# ---------------------------------------------------------------------------
# Buoy observations — MongoDB native time-series collection
# ---------------------------------------------------------------------------
# Schema:
#   timestamp (ISODate, UTC)        — the timeField
#   meta.buoy_id                    — internal buoy alias (varna_bay_io-ban, ...)
#   meta.spot_id                    — Sofar device id (SPOT-30889C, ...)
#   meta.beach_ids                  — list of aware.beaches._id that share this buoy
#   meta.source                     — provenance block
#   water_temp_c, wave_height_m, wave_state_beaufort,
#   wave_direction_deg, wind_speed_ms, wind_direction_deg
BUOY_OBS_COLLECTION = "buoy_observations"

if BUOY_OBS_COLLECTION not in db.list_collection_names():
    db.create_collection(
        BUOY_OBS_COLLECTION,
        timeseries={
            "timeField": "timestamp",
            "metaField": "meta",
            "granularity": "minutes",
        },
    )

buoy_obs_col = db[BUOY_OBS_COLLECTION]
# Time-series collections support secondary indexes on timeField + metaField subfields.
# Used to bootstrap "latest existing point per buoy" queries during delta ingest.
try:
    buoy_obs_col.create_index([("meta.buoy_id", 1), ("timestamp", -1)])
except Exception:
    pass

# Run history for buoy ingest jobs.
buoy_runs_col = db["buoy_ingest_runs"]
buoy_runs_col.create_index("started_at")


# ---------------------------------------------------------------------------
# Marine forecast — Copernicus Marine WAV + PHY-CUR (hourly forecast, 7 days)
# ---------------------------------------------------------------------------
# One document per (beach, forecast_hour) with wave + current values from
# the Copernicus Black Sea hourly forecast model.
MARINE_FORECAST_COLLECTION = "marine_forecast"

if MARINE_FORECAST_COLLECTION not in db.list_collection_names():
    db.create_collection(
        MARINE_FORECAST_COLLECTION,
        timeseries={
            "timeField": "timestamp",
            "metaField": "meta",
            "granularity": "hours",
        },
    )

marine_forecast_col = db[MARINE_FORECAST_COLLECTION]
try:
    marine_forecast_col.create_index([("meta.beach_id", 1), ("timestamp", 1)])
except Exception:
    pass

marine_forecast_runs_col = db["marine_forecast_runs"]
marine_forecast_runs_col.create_index("started_at")


# ---------------------------------------------------------------------------
# BGC chemistry — Copernicus Marine Black Sea Biogeochemistry (offshore only)
# ---------------------------------------------------------------------------
# Daily modeled values for ph / o2 / o2b / no3 / po4 / dissic / talk at 2.5 km
# resolution. Only fetched for `aware.beaches` docs with type == "offshore"
# because 2.5 km is too coarse to distinguish neighbouring swimming beaches.
BGC_CHEMISTRY_COLLECTION = "bgc_chemistry"

if BGC_CHEMISTRY_COLLECTION not in db.list_collection_names():
    db.create_collection(
        BGC_CHEMISTRY_COLLECTION,
        timeseries={
            "timeField": "timestamp",
            "metaField": "meta",
            "granularity": "hours",
        },
    )

bgc_chemistry_col = db[BGC_CHEMISTRY_COLLECTION]
try:
    bgc_chemistry_col.create_index([("meta.beach_id", 1), ("timestamp", -1)])
except Exception:
    pass

bgc_runs_col = db["bgc_chemistry_runs"]
bgc_runs_col.create_index("started_at")

OFFSHORE_TYPE_FILTER = {"type": "offshore"}

BGC_SOURCE = {
    "kind": "Numerical model forecast (biogeochemistry)",
    "data_provider": "Copernicus Marine Service (CMEMS)",
    "product_id": "BLKSEA_ANALYSISFORECAST_BGC_007_010",
    "model": "NEMO-BFM coupled biogeochemical model",
    "datasets": {
        "carbonate": "cmems_mod_blk_bgc-car_anfc_2.5km_P1D-m",
        "oxygen":    "cmems_mod_blk_bgc-pp-o2_anfc_2.5km_P1D-m",
        "nutrients": "cmems_mod_blk_bgc-nut_anfc_2.5km_P1D-m",
    },
    "spatial_resolution_km": 2.5,
    "temporal_resolution": "daily",
    "doi": "10.25423/CMCC/BLKSEA_ANALYSISFORECAST_BGC_007_010",
    "scope_note": (
        "Resolution 2.5 km — appropriate for offshore zones, too coarse for "
        "individual swimming beaches. Only ingested for type=offshore docs."
    ),
}

# Provenance
MARINE_FORECAST_SOURCE = {
    "kind": "Numerical model forecast",
    "data_provider": "Copernicus Marine Service (CMEMS)",
    "wave_product_id": "BLKSEA_ANALYSISFORECAST_WAV_007_003",
    "wave_dataset_id": "cmems_mod_blk_wav_anfc_2.5km_PT1H-i",
    "current_product_id": "BLKSEA_ANALYSISFORECAST_PHY_007_001",
    "current_dataset_id": "cmems_mod_blk_phy-cur_anfc_2.5km_PT1H-m",
    "spatial_resolution_km": 2.5,
    "temporal_resolution": "hourly",
    "doi_wav": "10.25423/CMCC/BLKSEA_ANALYSISFORECAST_WAV_007_003",
    "doi_phy": "10.25423/CMCC/BLKSEA_ANALYSISFORECAST_PHY_007_001",
}

BEACH_TYPE_FILTER = {"type": "beach"}

# Provenance metadata stamped onto every observation document.
SENTINEL2_MSI_SOURCE = {
    "satellite": "Sentinel-2",
    "sensor": "MSI",  # MultiSpectral Instrument
    "provider": "Copernicus Marine Service",
    "product_id": "OCEANCOLOUR_BLK_BGC_HR_L3_NRT_009_206",
    "dataset_id": "cmems_obs_oc_blk_bgc_tur-spm-chl_nrt_l3-hr-mosaic_P1D-m",
    "spatial_resolution_m": 100,
    "processor": "HR-OC L2W (Brockmann Consult / RBINS / VITO)",
    "doi": "10.48670/moi-00086",
}
