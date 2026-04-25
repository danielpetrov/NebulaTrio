"""
HTTP API exposing Bulgarian seaside bathing waters from the EEA DiscoMap service.

Run:
    uvicorn api:app --reload --port 8000

Then:
    GET http://localhost:8000/beaches/bg
    GET http://localhost:8000/beaches/bg?include_inland=true
    GET http://localhost:8000/beaches/bg?format=geojson
"""
from typing import Literal, Optional

import requests
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse

EEA_BATHING_WATER_URL = (
    "https://water.discomap.eea.europa.eu/arcgis/rest/services"
    "/BathingWater/BathingWater_Dyna_WM/MapServer/0/query"
)

OUT_FIELDS = ",".join([
    "bathingWaterName",
    "longitude",
    "latitude",
    "qualityStatus",
    "qualityStatus_minus1",
    "qualityStatus_minus2",
    "bathingWaterIdentifier",
    "bwWaterCategory",
    "bwProfileLink",
])

app = FastAPI(
    title="Bulgarian Beaches API",
    description="Proxy over the EEA Bathing Water Directive dataset.",
    version="0.1.0",
)


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


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/beaches/bg")
def bulgarian_beaches(
    include_inland: bool = Query(False, description="Include inland bathing waters too."),
    format: Literal["json", "geojson", "raw"] = Query(
        "json", description="json = simplified list; geojson = GeoJSON FeatureCollection; raw = upstream Esri JSON."
    ),
    name_contains: Optional[str] = Query(None, description="Case-insensitive substring filter on the beach name."),
):
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

    # Simplified flat JSON list
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
