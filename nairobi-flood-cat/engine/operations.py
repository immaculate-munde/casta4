"""
Portfolio operations view: scenario waterfall, class/zone breakdown, AAL, EP curve band.
Built from run_portfolio_simulation detailed_df + ELT (insurer gross only — QS out of UI scope).
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from .financial import TIER_SPECS
from .hazard_ai import DrainageAIRectifier, _lat_lon_cols

HOUSING_LABELS: dict[str, str] = {
    "informal_iron_sheet": "Informal iron sheet",
    "semi_permanent": "Semi-permanent",
    "permanent_masonry": "Permanent masonry",
    "concrete_rcc": "Concrete (RCC)",
    "RCC": "Concrete (RCC)",
    "Masonry": "Permanent masonry",
    "Informal": "Informal iron sheet",
}

RETURN_PERIOD_CHIPS = [10, 25, 50, 100, 250]
ENGINE_RETURN_PERIODS = [spec["return_period"] for spec in TIER_SPECS.values()]


def _tier_name_for_return_period(return_period_years: int) -> str:
    best_rp = min(ENGINE_RETURN_PERIODS, key=lambda rp: abs(rp - return_period_years))
    for spec in TIER_SPECS.values():
        if spec["return_period"] == best_rp:
            return spec["name"]
    return "Extreme"


def _housing_label(row: pd.Series) -> str:
    if "housing_class" in row.index and pd.notna(row.get("housing_class")):
        key = str(row["housing_class"]).strip()
        if key in HOUSING_LABELS:
            return HOUSING_LABELS[key]
        return key.replace("_", " ").title()
    ctype = str(row.get("construction_type", "Masonry"))
    return HOUSING_LABELS.get(ctype, ctype)


def _portfolio_sector_zone(lat: float, lon: float, lat_mid: float, lon_mid: float, region_label: str) -> str:
    ns = "North" if float(lat) >= lat_mid else "South"
    ew = "East" if float(lon) >= lon_mid else "West"
    base = (region_label or "Portfolio").strip()
    return f"{base} · {ns}-{ew}"


def _zone_series(
    detailed_df: pd.DataFrame,
    rectifier: DrainageAIRectifier,
    *,
    use_hotspot_zones: bool,
    region_label: str,
) -> pd.Series:
    if "zone" in detailed_df.columns and detailed_df["zone"].notna().any():
        return detailed_df["zone"].fillna("Unassigned").astype(str)

    lat_col = "latitude" if "latitude" in detailed_df.columns else "lat"
    lon_col = "longitude" if "longitude" in detailed_df.columns else "lon"
    lats = detailed_df[lat_col].astype(float)
    lons = detailed_df[lon_col].astype(float)
    lat_mid = float(lats.median())
    lon_mid = float(lons.median())

    if use_hotspot_zones:
        return detailed_df.apply(
            lambda r: _nearest_hotspot_name(rectifier, float(r[lat_col]), float(r[lon_col])),
            axis=1,
        )

    return detailed_df.apply(
        lambda r: _portfolio_sector_zone(float(r[lat_col]), float(r[lon_col]), lat_mid, lon_mid, region_label),
        axis=1,
    )


def _nearest_hotspot_name(
    rectifier: DrainageAIRectifier,
    lat: float,
    lon: float,
    max_km: float = 3.0,
) -> str:
    coords = np.radians([[float(lat), float(lon)]])
    rad_dist, idx = rectifier.tree.query(coords, k=1)
    dist_km = float(rad_dist.flatten()[0] * rectifier.EARTH_RADIUS_KM)
    if dist_km > max_km:
        return "Outside hotspot radius"
    i = int(idx.flatten()[0])
    if "name" in rectifier.hotspots.columns:
        return str(rectifier.hotspots.iloc[i]["name"])
    return f"Hotspot {i + 1}"


def build_operations_view(
    detailed_df: pd.DataFrame,
    elt: pd.DataFrame,
    rectifier: DrainageAIRectifier,
    *,
    return_period_years: int = 100,
    deductible_pct: float = 0.01,
    risk_load_pct: float = 35.0,
    ep_curve_gross: list[dict[str, Any]] | None = None,
    ep_curve_baseline_gross: list[dict[str, Any]] | None = None,
    ep_curve_ai_gross: list[dict[str, Any]] | None = None,
    use_hotspot_zones: bool = False,
    region_label: str = "Portfolio",
    region_id: str = "custom",
) -> dict[str, Any]:
    tier_name = _tier_name_for_return_period(return_period_years)
    tier_rp = next(
        spec["return_period"] for spec in TIER_SPECS.values() if spec["name"] == tier_name
    )

    gul_col = f"gul_{tier_name}"
    gross_col = f"gross_{tier_name}"
    dr_col = f"dr_{tier_name}"

    lat_col = "latitude" if "latitude" in detailed_df.columns else "lat"
    lon_col = "longitude" if "longitude" in detailed_df.columns else "lon"

    tiv = detailed_df["sum_insured_kes"].astype(float)
    total_tiv = float(tiv.sum())
    gul = detailed_df[gul_col].astype(float)
    gross = detailed_df[gross_col].astype(float)
    dr = detailed_df[dr_col].astype(float)

    ground_up = float(gul.sum())
    insured = float(gross.sum())
    deductible_component = max(0.0, ground_up - insured)

    with_loss = int((dr > 0.001).sum())
    n_loc = len(detailed_df)

    # Average annual loss from ELT tier AEP × gross (insurer level)
    aal = 0.0
    for _, row in elt.iterrows():
        aal += float(row["exceedance_prob"]) * float(row["gross_loss_m"]) * 1e6
    risk_load = max(0.0, float(risk_load_pct)) / 100.0
    indicative_premium = aal * (1.0 + risk_load)

    # Annual EP curve + uncertainty band (baseline vs AI when both provided)
    curve_pts = sorted(ep_curve_gross or [], key=lambda p: p["return_period_years"])
    band_low: list[dict[str, Any]] = []
    band_high: list[dict[str, Any]] = []
    if ep_curve_baseline_gross and ep_curve_ai_gross:
        base_map = {p["return_period_years"]: p["loss_kes"] for p in ep_curve_baseline_gross}
        ai_map = {p["return_period_years"]: p["loss_kes"] for p in ep_curve_ai_gross}
        for p in curve_pts:
            rp = p["return_period_years"]
            b, a = base_map.get(rp, p["loss_kes"]), ai_map.get(rp, p["loss_kes"])
            band_low.append({"return_period_years": rp, "loss_kes": min(b, a) * 0.92})
            band_high.append({"return_period_years": rp, "loss_kes": max(b, a) * 1.08})
    else:
        for p in curve_pts:
            band_low.append({"return_period_years": p["return_period_years"], "loss_kes": p["loss_kes"] * 0.85})
            band_high.append({"return_period_years": p["return_period_years"], "loss_kes": p["loss_kes"] * 1.15})

    zones = _zone_series(
        detailed_df,
        rectifier,
        use_hotspot_zones=use_hotspot_zones,
        region_label=region_label,
    )

    # Per-location rows for tables / export
    loc_rows: list[dict[str, Any]] = []
    for idx, r in detailed_df.iterrows():
        hc = str(r.get("housing_class", r.get("construction_type", ""))).strip()
        zone = str(zones.loc[idx])
        loc_rows.append(
            {
                "loc_id": str(r.get("loc_id", idx)),
                "zone": zone,
                "housing_class": hc,
                "housing_label": _housing_label(r),
                "tiv_kes": float(r["sum_insured_kes"]),
                "damage_ratio": float(r[dr_col]),
                "ground_up_kes": float(r[gul_col]),
                "insured_loss_kes": float(r[gross_col]),
            }
        )

    loc_df = pd.DataFrame(loc_rows)

    by_class: list[dict[str, Any]] = []
    for label, grp in loc_df.groupby("housing_label", sort=False):
        cls_tiv = float(grp["tiv_kes"].sum())
        cls_loss = float(grp["insured_loss_kes"].sum())
        by_class.append(
            {
                "class_label": label,
                "value_share": cls_tiv / total_tiv if total_tiv else 0.0,
                "loss_share": cls_loss / insured if insured else 0.0,
                "loss_pct_of_value": cls_loss / cls_tiv if cls_tiv else 0.0,
                "tiv_kes": cls_tiv,
                "loss_kes": cls_loss,
            }
        )
    by_class.sort(key=lambda x: x["tiv_kes"], reverse=True)

    by_zone: list[dict[str, Any]] = []
    for zone, grp in loc_df.groupby("zone", sort=False):
        z_tiv = float(grp["tiv_kes"].sum())
        z_loss = float(grp["insured_loss_kes"].sum())
        by_zone.append(
            {
                "zone": zone,
                "loss_kes": z_loss,
                "loss_share": z_loss / insured if insured else 0.0,
                "loss_pct_of_zone_value": z_loss / z_tiv if z_tiv else 0.0,
                "tiv_kes": z_tiv,
            }
        )
    by_zone.sort(key=lambda x: x["loss_kes"], reverse=True)

    top_risks = loc_df.sort_values("insured_loss_kes", ascending=False).head(10)
    top10_loss = float(top_risks["insured_loss_kes"].sum())
    top_risks_out = [
        {
            "loc_id": row["loc_id"],
            "zone": row["zone"],
            "value_kes": row["tiv_kes"],
            "damage_pct": row["damage_ratio"],
            "insured_loss_kes": row["insured_loss_kes"],
        }
        for _, row in top_risks.iterrows()
    ]

    elt_row = elt[elt["return_period"] == tier_rp]
    annual_gross_at_rp = None
    if not elt_row.empty:
        annual_gross_at_rp = float(elt_row.iloc[0]["gross_loss_m"]) * 1e6

    return {
        "return_period_chips": RETURN_PERIOD_CHIPS,
        "scenario_return_period_years": return_period_years,
        "engine_tier_return_period_years": tier_rp,
        "tier_name": tier_name,
        "deductible_pct": deductible_pct,
        "waterfall": {
            "ground_up_loss_kes": ground_up,
            "deductible_kes": deductible_component,
            "insured_loss_kes": insured,
            "pct_of_tiv": insured / total_tiv if total_tiv else 0.0,
            "buildings_with_loss": with_loss,
            "buildings_total": n_loc,
        },
        "premium_aid": {
            "aal_kes": aal,
            "risk_load_pct": risk_load_pct,
            "indicative_premium_kes": indicative_premium,
            "pct_of_tiv": indicative_premium / total_tiv if total_tiv else 0.0,
        },
        "annual_curve": {
            "points": curve_pts,
            "band_low": band_low,
            "band_high": band_high,
            "gross_at_selected_rp_kes": annual_gross_at_rp,
        },
        "by_construction_class": by_class,
        "by_zone": by_zone[:12],
        "top_risks": {
            "share_of_scenario_loss": top10_loss / insured if insured else 0.0,
            "rows": top_risks_out,
        },
        "location_losses": loc_rows,
        "total_tiv_kes": total_tiv,
        "region_id": region_id,
        "region_label": region_label,
        "zone_mode": "csv_column"
        if "zone" in detailed_df.columns
        else ("nairobi_hotspots" if use_hotspot_zones else "portfolio_sectors"),
    }
