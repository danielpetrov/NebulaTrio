"""
Water-quality indicator metadata + scoring thresholds.

Indicators come from Copernicus Marine HR Ocean Colour
(OCEANCOLOUR_BLK_BGC_HR_L3_NRT_009_206) — Sentinel-2 derived,
~100 m resolution along the Black Sea coast.

Thresholds are defaults from EU/OSPAR coastal water assessment
guidance and standard turbidity ranges. Tune as needed.
"""
from typing import Optional


INDICATORS = {
    "chl": {
        "name": "Chlorophyll-a",
        "unit": "mg/m³",
        "description": (
            "Algal biomass proxy. Higher values mean more phytoplankton in the water — "
            "indicates nutrient enrichment, possible bloom, reduced clarity."
        ),
        "thresholds": {"good_max": 2.0, "warn_max": 5.0},
    },
    "tur": {
        "name": "Turbidity",
        "unit": "FNU",
        "description": (
            "How much suspended material scatters light. High = murky water from "
            "sediment, plankton, or runoff."
        ),
        "thresholds": {"good_max": 2.0, "warn_max": 5.0},
    },
    "spm": {
        "name": "Suspended Particulate Matter",
        "unit": "g/m³",
        "description": (
            "Mass of solid particles in water (sediment from rivers, post-storm runoff, "
            "dredging plumes)."
        ),
        "thresholds": {"good_max": 3.0, "warn_max": 10.0},
    },
}


def score_indicator(key: str, value: Optional[float]) -> Optional[str]:
    if value is None:
        return None
    t = INDICATORS[key]["thresholds"]
    if value <= t["good_max"]:
        return "green"
    if value <= t["warn_max"]:
        return "amber"
    return "red"


def overall_score(scores: list) -> str:
    vals = [s for s in scores if s]
    if not vals:
        return "unknown"
    if "red" in vals:
        return "red"
    if "amber" in vals:
        return "amber"
    return "green"


def interpret(key: str, value: Optional[float], score: Optional[str]) -> str:
    if value is None or score is None:
        return "No measurement available"
    meta = INDICATORS[key]
    fragment = f"{meta['name']} {value:.2f} {meta['unit']}"
    if score == "green":
        return f"{fragment} — within normal coastal range"
    if score == "amber":
        return f"{fragment} — elevated; monitor for trend"
    return f"{fragment} — high; possible water-quality concern (bloom / runoff / sediment plume)"


def build_indicator_block(key: str, value: Optional[float]) -> dict:
    """Full per-indicator response: current value, thresholds, score, interpretation."""
    meta = INDICATORS[key]
    score = score_indicator(key, value)
    return {
        "name": meta["name"],
        "unit": meta["unit"],
        "description": meta["description"],
        "current_value": value,
        "normal_range": {
            "good_max": meta["thresholds"]["good_max"],
            "warn_max": meta["thresholds"]["warn_max"],
        },
        "score": score,
        "interpretation": interpret(key, value, score),
    }
