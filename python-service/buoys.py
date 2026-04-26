"""
Registry of Sofar Spotter wave buoys served by IO-BAS' BGODC portal,
mapped to the buoy IDs referenced in `aware.beaches[*].meta.buoy`.

Source portal:  http://bgodc.io-bas.bg/sofar-buoys/Mobile_form.aspx
Underlying hw:  Sofar Ocean Spotter wave buoys (https://www.sofarocean.com)
Operators:      IO-BAS (Institute of Oceanology, Bulgarian Academy of Sciences)
                NIMH   (National Institute of Meteorology and Hydrology)
"""
from __future__ import annotations
from typing import Iterable

from storage import beaches_col


# spot_id -> Bulgarian dropdown label + operator + our internal buoy_id alias
BUOY_REGISTRY: dict[str, dict] = {
    "SPOT-30889C": {
        "buoy_id": "varna_bay_io-ban",
        "label_bg": "Варна залив (ИО-БАН)",
        "label_en": "Varna Bay",
        "operator": "IO-BAS",
    },
    "SPOT-32732C": {
        "buoy_id": "shkorpilovtsi_io-ban",
        "label_bg": "Шкорпиловци (ИО-БАН)",
        "label_en": "Shkorpilovtsi",
        "operator": "IO-BAS",
    },
    "SPOT-1289": {
        "buoy_id": "ahtopol_nimh",
        "label_bg": "Ахтопол (НИМХ)",
        "label_en": "Ahtopol",
        "operator": "NIMH",
    },
    "SPOT-31672C": {
        "buoy_id": "primorsko_io-ban",
        "label_bg": "Приморско (ИО-БАН)",
        "label_en": "Primorsko",
        "operator": "IO-BAS",
    },
}

# Reverse lookup: buoy_id -> spot_id
BY_BUOY_ID = {v["buoy_id"]: spot for spot, v in BUOY_REGISTRY.items()}


# Provenance metadata stamped onto every observation.
BUOY_SOURCE = {
    "platform": "Sofar Spotter wave buoy",
    "data_provider": "IO-BAS / NIMH",
    "data_portal": "http://bgodc.io-bas.bg/sofar-buoys/Mobile_form.aspx",
    "vendor": "Sofar Ocean",
    "vendor_product_url": "https://www.sofarocean.com/products/spotter",
    "national_data_center": "Bulgarian Oceanographic Data Center (BGODC)",
}


def beaches_for_buoy(buoy_id: str) -> list[str]:
    """Return all `aware.beaches._id`s that reference this buoy_id."""
    return [d["_id"] for d in beaches_col.find({"meta.buoy": buoy_id}, {"_id": 1})]


def all_referenced_buoys() -> list[str]:
    """Distinct buoy_ids referenced by any doc in `aware.beaches`."""
    return sorted(set(beaches_col.distinct("meta.buoy")) - {None})


def active_spot_ids() -> list[tuple[str, str]]:
    """
    Returns [(spot_id, buoy_id), ...] for buoys we both have in the registry
    AND are referenced by at least one beach doc.
    """
    referenced = set(all_referenced_buoys())
    return [
        (spot_id, meta["buoy_id"])
        for spot_id, meta in BUOY_REGISTRY.items()
        if meta["buoy_id"] in referenced
    ]
