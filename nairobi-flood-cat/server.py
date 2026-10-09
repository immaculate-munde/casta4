"""
Headless HTTP API for the Nairobi flood CAT engine (production).
Streamlit app.py is optional dev/demo only — Casta4 calls this service.
"""

from __future__ import annotations

import io
import os
from typing import Any

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from engine.financial import (
    evaluate_single_risk,
    run_portfolio_simulation,
    underwriting_recommendation,
)
from engine.operations import build_operations_view
from engine.geo_sampler import list_available_rasters, sample_hazard_at_point
from engine.hazard_ai import DrainageAIRectifier
from engine.vulnerability import VULN_CONFIG, calculate_damage_ratio

app = FastAPI(title="Nairobi Flood CAT", version="1.0.0")

_rectifier: DrainageAIRectifier | None = None


def get_rectifier() -> DrainageAIRectifier:
    global _rectifier
    if _rectifier is None:
        hotspots = os.environ.get("CAT_HOTSPOTS_CSV")
        _rectifier = DrainageAIRectifier(hotspots) if hotspots else DrainageAIRectifier()
    return _rectifier


class SimulateBody(BaseModel):
    csv: str = Field(..., description="Exposure CSV (Team A schema)")
    use_ai_rectifier: bool = True
    deductible_pct: float = Field(0.05, ge=0, le=0.5)
    reinsurance_qs_pct: float = Field(0.25, ge=0, le=1)
    influence_km: float = Field(1.2, ge=0.2, le=5)
    operations_return_period: int = Field(100, ge=2, le=500)
    risk_load_pct: float = Field(35.0, ge=0, le=100)
    region_id: str = "custom"
    region_label: str = "Portfolio"
    use_hotspot_zones: bool = False


def _elt_to_ep_points(elt: pd.DataFrame, loss_key: str) -> list[dict[str, Any]]:
    out = []
    for _, row in elt.iterrows():
        out.append(
            {
                "return_period_years": int(row["return_period"]),
                "aep": float(row["exceedance_prob"]),
                "loss_kes": float(row[loss_key]) * 1e6,
                "tier": str(row["tier"]),
            }
        )
    return sorted(out, key=lambda p: p["return_period_years"])


def _summary_100yr(elt: pd.DataFrame) -> dict[str, Any] | None:
    row = elt[elt["return_period"] == 100]
    if row.empty:
        return None
    r = row.iloc[0]
    return {
        "ground_up_loss_kes": float(r["ground_up_loss_m"]) * 1e6,
        "gross_loss_kes": float(r["gross_loss_m"]) * 1e6,
        "net_loss_kes": float(r["net_loss_m"]) * 1e6,
    }


def _detail_by_loc(detailed: pd.DataFrame) -> list[dict[str, Any]]:
    lat_col = "latitude" if "latitude" in detailed.columns else "lat"
    lon_col = "longitude" if "longitude" in detailed.columns else "lon"
    rows = []
    for _, r in detailed.iterrows():
        loc_id = str(r.get("loc_id", ""))
        rows.append(
            {
                "loc_id": loc_id,
                "lat": float(r[lat_col]),
                "lon": float(r[lon_col]),
                "construction_type": str(r.get("construction_type", "")),
                "drainage_alpha": float(r.get("drainage_alpha", 1.0)),
                "dr_extreme": float(r.get("dr_Extreme", 0.0)),
                "sum_insured_kes": float(r.get("sum_insured_kes", 0.0)),
            }
        )
    return rows


@app.get("/health")
def health():
    return {"ok": True, "engine": "nairobi-flood-cat"}


@app.get("/vulnerability-curves")
def vulnerability_curves():
    """JRC-style depth → damage ratio curves (Informal / Masonry / RCC)."""
    depths = np.linspace(0, 3.5, 15)
    curves = []
    for ctype in ("Informal", "Masonry", "RCC"):
        drs = calculate_damage_ratio(depths, ctype)
        curves.append(
            {
                "construction_type": ctype,
                "label": ctype,
                "config": VULN_CONFIG.get(ctype),
                "points": [
                    {"hazard_severity": float(min(1.0, d / 3.5)), "depth_m": float(d), "damage_ratio": float(dr)}
                    for d, dr in zip(depths, drs)
                ],
            }
        )
    return {"source": "jrc_sigmoid", "curves": curves}


@app.post("/simulate")
def simulate(body: SimulateBody):
    try:
        df = pd.read_csv(io.StringIO(body.csv))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid CSV: {exc}") from exc

    rectifier = get_rectifier()
    penalties = rectifier.compute_drainage_penalty(df, influence_radius_km=body.influence_km)
    affected = int((penalties > 1.01).sum())

    res_base, detail_base = run_portfolio_simulation(
        df,
        use_ai_rectifier=False,
        drainage_penalties=penalties,
        deductible_pct=body.deductible_pct,
        reinsurance_qs_pct=body.reinsurance_qs_pct,
    )
    res_ai, detail_ai = run_portfolio_simulation(
        df,
        use_ai_rectifier=True,
        drainage_penalties=penalties,
        deductible_pct=body.deductible_pct,
        reinsurance_qs_pct=body.reinsurance_qs_pct,
    )

    current = res_ai if body.use_ai_rectifier else res_base
    current_detail = detail_ai if body.use_ai_rectifier else detail_base

    base_100 = _summary_100yr(res_base)
    ai_100 = _summary_100yr(res_ai)
    uplift_pct = 0.0
    if base_100 and ai_100 and base_100["gross_loss_kes"] > 0:
        uplift_pct = (ai_100["gross_loss_kes"] - base_100["gross_loss_kes"]) / base_100["gross_loss_kes"] * 100

    ep_gross = _elt_to_ep_points(current, "gross_loss_m")
    ep_base = _elt_to_ep_points(res_base, "gross_loss_m")
    ep_ai = _elt_to_ep_points(res_ai, "gross_loss_m")

    use_hotspots = bool(body.use_hotspot_zones) or str(body.region_id).lower() == "nairobi"
    operations = build_operations_view(
        current_detail,
        current,
        rectifier,
        return_period_years=body.operations_return_period,
        deductible_pct=body.deductible_pct,
        risk_load_pct=body.risk_load_pct,
        ep_curve_gross=ep_gross,
        ep_curve_baseline_gross=ep_base,
        ep_curve_ai_gross=ep_ai,
        use_hotspot_zones=use_hotspots,
        region_label=body.region_label,
        region_id=body.region_id,
    )

    return {
        "source": "linus_cat_engine",
        "use_ai_rectifier": body.use_ai_rectifier,
        "hotspot_assets": affected,
        "portfolio_count": len(df),
        "summary_100yr": _summary_100yr(current),
        "summary_100yr_baseline": base_100,
        "summary_100yr_ai": ai_100,
        "ai_uplift_gross_pct": uplift_pct,
        "elt": current.to_dict(orient="records"),
        "elt_baseline": res_base.to_dict(orient="records"),
        "elt_ai": res_ai.to_dict(orient="records"),
        "ep_curve_gross": ep_gross,
        "ep_curve_net": _elt_to_ep_points(current, "net_loss_m"),
        "ep_curve_baseline_gross": ep_base,
        "ep_curve_ai_gross": ep_ai,
        "locations": _detail_by_loc(current_detail),
        "operations": operations,
    }


class UnderwriteSingleBody(BaseModel):
    lat: float
    lon: float
    sum_insured_kes: float
    construction_type: str = "Masonry"
    has_basement: bool = False
    use_ai_rectifier: bool = True
    deductible_pct: float = Field(0.05, ge=0, le=0.5)
    reinsurance_qs_pct: float = Field(0.25, ge=0, le=1)
    influence_km: float = Field(1.2, ge=0.2, le=5)


@app.post("/underwrite-single")
def underwrite_single(body: UnderwriteSingleBody):
    hazards = sample_hazard_at_point(float(body.lat), float(body.lon))
    rectifier = get_rectifier()
    alpha = (
        float(rectifier.penalty_at_point(body.lat, body.lon, influence_radius_km=body.influence_km))
        if body.use_ai_rectifier
        else 1.0
    )
    sheet = evaluate_single_risk(
        hazards,
        sum_insured_kes=float(body.sum_insured_kes),
        construction_type=body.construction_type,
        drainage_alpha=alpha,
        has_basement=bool(body.has_basement),
        deductible_pct=body.deductible_pct,
        reinsurance_qs_pct=body.reinsurance_qs_pct,
    )
    rec = underwriting_recommendation(sheet, has_basement=bool(body.has_basement))
    return {
        "drainage_alpha": alpha,
        "hazards": hazards,
        "recommendation": rec,
        "sheet": sheet.to_dict(orient="records"),
    }


@app.get("/disclosures")
def disclosures():
    from pathlib import Path

    import pandas as pd

    data_dir = Path(__file__).resolve().parent / "data" / "team_a_nairobi"
    hotspots = data_dir / "nairobi_hotspots_geocoded.csv"
    rasters = list_available_rasters(data_dir)
    try:
        hs_count = len(pd.read_csv(hotspots))
    except Exception:
        hs_count = 0
    rows = [
        {
            "category": "Real Open Data",
            "component": "Nairobi pluvial proxy GeoTIFF rasters (5 return periods)",
            "detail": ", ".join(f"{k}: {'yes' if v else 'synthetic fallback'}" for k, v in rasters.items()),
        },
        {
            "category": "Real Open Data",
            "component": "County-mapped flood hotspot coordinates",
            "detail": f"{hotspots.name} — {hs_count} named localities",
        },
        {
            "category": "Assumptions & Synthetic Proxies",
            "component": "Exposure portfolio",
            "detail": "Synthetic / uploaded buildings — not a live book",
        },
        {
            "category": "Assumptions & Synthetic Proxies",
            "component": "JRC / Huizinga vulnerability",
            "detail": "Informal / Masonry / RCC sigmoid curves",
        },
        {
            "category": "Assumptions & Synthetic Proxies",
            "component": "AI drainage rectifier",
            "detail": "BallTree Haversine kernel; α capped at 1.60",
        },
    ]
    return {"rows": rows}
