"""
Financial engine: depth calibration, AI drainage penalty, basement uplift,
deductible, Quota Share, ELT and EP curve.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from .vulnerability import calculate_damage_ratio, map_construction_types

# Hazard tiers → return periods and peak reference flood depths (D_max)
TIER_SPECS = {
    "common": {"name": "Common", "return_period": 2, "prob": 0.50, "max_depth": 0.5},
    "occasional": {"name": "Occasional", "return_period": 5, "prob": 0.20, "max_depth": 1.0},
    "moderate": {"name": "Moderate", "return_period": 10, "prob": 0.10, "max_depth": 1.8},
    "severe": {"name": "Severe", "return_period": 50, "prob": 0.02, "max_depth": 2.5},
    "extreme": {"name": "Extreme", "return_period": 100, "prob": 0.01, "max_depth": 3.5},
}

# Portfolio CSV column aliases → tier keys
HAZARD_COL_ALIASES = {
    "common": ["hazard_common", "hazard_score_common", "common"],
    "occasional": ["hazard_occasional", "hazard_score_occasional", "occasional"],
    "moderate": ["hazard_moderate", "hazard_score_moderate", "moderate"],
    "severe": ["hazard_severe", "hazard_score_severe", "severe"],
    "extreme": ["hazard_extreme", "hazard_score_extreme", "extreme"],
}

# Legacy keys used by older callers
_LEGACY_TIER_KEYS = {
    "hazard_common": "common",
    "hazard_occasional": "occasional",
    "hazard_moderate": "moderate",
    "hazard_severe": "severe",
    "hazard_extreme": "extreme",
}


def prepare_portfolio(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize Team A exposure columns to the simulation schema."""
    out = df.copy()

    if "latitude" not in out.columns and "lat" in out.columns:
        out["latitude"] = out["lat"]
    if "longitude" not in out.columns and "lon" in out.columns:
        out["longitude"] = out["lon"]

    if "sum_insured_kes" not in out.columns:
        if "tiv_kes" in out.columns:
            out["sum_insured_kes"] = pd.to_numeric(out["tiv_kes"], errors="coerce").fillna(0.0)
        else:
            raise KeyError("Expected sum_insured_kes or tiv_kes")

    if "construction_type" not in out.columns:
        src = out["housing_class"] if "housing_class" in out.columns else pd.Series(["Masonry"] * len(out))
        out["construction_type"] = map_construction_types(src)

    if "has_basement" not in out.columns:
        out["has_basement"] = False
    else:
        out["has_basement"] = out["has_basement"].astype(bool)

    if "zone" in out.columns:
        out["zone"] = out["zone"].astype(str).str.strip()
    elif "area" in out.columns:
        out["zone"] = out["area"].astype(str).str.strip()

    for tier, aliases in HAZARD_COL_ALIASES.items():
        for alias in aliases:
            if alias in out.columns:
                out[tier] = pd.to_numeric(out[alias], errors="coerce").fillna(0.0)
                break
        else:
            if tier not in out.columns:
                out[tier] = 0.0

    return out


def _basement_factor(has_basement: np.ndarray | bool) -> np.ndarray:
    basements = np.asarray(has_basement, dtype=bool)
    return np.where(basements, 1.25, 1.0).astype(float)


def _drainage_floor_score(alpha: float, tier: str) -> float:
    """
    When the terrain proxy misses a hotspot (score ≈ 0) but AI places the site
    in a drainage corridor (α > 1), imply a minimum susceptibility so α is
    material. Scales with return-period severity.
    """
    uplift = max(0.0, float(alpha) - 1.0)  # 0 … 0.60
    tier_scale = {
        "common": 0.35,
        "occasional": 0.50,
        "moderate": 0.70,
        "severe": 0.90,
        "extreme": 1.00,
    }.get(tier, 0.70)
    return float(np.clip(uplift * tier_scale, 0.0, 1.0))


def evaluate_single_risk(
    hazard_scores: dict[str, float],
    *,
    sum_insured_kes: float,
    construction_type: str,
    drainage_alpha: float = 1.0,
    has_basement: bool = False,
    deductible_pct: float = 0.05,
    reinsurance_qs_pct: float = 0.25,
) -> pd.DataFrame:
    """Per-return-period underwriting sheet for one location."""
    alpha = float(np.clip(drainage_alpha, 1.0, 1.60))
    bas = 1.25 if has_basement else 1.0
    rows = []

    for tier, spec in TIER_SPECS.items():
        raw = float(np.clip(hazard_scores.get(tier, 0.0) or 0.0, 0.0, 1.0))
        # Blend raster score with drainage-corridor floor (covers missed hotspots)
        score = max(raw, _drainage_floor_score(alpha, tier))
        depth = score * spec["max_depth"] * alpha * bas
        dr = float(calculate_damage_ratio(np.array([depth]), construction_type)[0])
        gul = sum_insured_kes * dr
        gross = max(0.0, gul - sum_insured_kes * deductible_pct)
        net = gross * (1.0 - reinsurance_qs_pct)
        rows.append(
            {
                "tier": spec["name"],
                "return_period": spec["return_period"],
                "exceedance_prob": spec["prob"],
                "hazard_score": score,
                "hazard_score_raw": raw,
                "drainage_alpha": alpha,
                "depth_m": depth,
                "damage_ratio": dr,
                "ground_up_loss_kes": gul,
                "gross_loss_kes": gross,
                "net_loss_kes": net,
            }
        )
    return pd.DataFrame(rows).sort_values("return_period").reset_index(drop=True)


def underwriting_recommendation(sheet: pd.DataFrame, has_basement: bool = False) -> str:
    """Simple technical recommendation from extreme / severe severity."""
    extreme = sheet[sheet["return_period"] == 100]
    severe = sheet[sheet["return_period"] == 50]
    if extreme.empty:
        return "Standard Acceptance"
    dr100 = float(extreme["damage_ratio"].iloc[0])
    depth100 = float(extreme["depth_m"].iloc[0])
    alpha = float(extreme["drainage_alpha"].iloc[0])
    dr50 = float(severe["damage_ratio"].iloc[0]) if not severe.empty else dr100

    if has_basement and depth100 >= 1.0:
        return "Basement Exclusion Recommended"
    if dr100 >= 0.55 or (alpha >= 1.35 and dr50 >= 0.40):
        return "Sub-limit Required"
    if dr100 >= 0.35 or alpha >= 1.25:
        return "Enhanced Assessment — Survey Required"
    return "Standard Acceptance"


def run_portfolio_simulation(
    df_portfolio: pd.DataFrame,
    use_ai_rectifier: bool = True,
    drainage_penalties: np.ndarray | None = None,
    deductible_pct: float = 0.05,
    reinsurance_qs_pct: float = 0.25,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Aggregate losses across the portfolio.

    Returns (elt_ep_df, detailed_df) where elt_ep_df is the Event Loss Table /
    Exceedance Probability dataset sorted by return period.
    """
    detailed_df = prepare_portfolio(df_portfolio)

    if use_ai_rectifier and drainage_penalties is not None:
        penalty = np.asarray(drainage_penalties, dtype=float)
    else:
        penalty = np.ones(len(detailed_df), dtype=float)

    basement = _basement_factor(detailed_df["has_basement"].values)
    tiv = detailed_df["sum_insured_kes"].values.astype(float)
    summary: list[dict[str, Any]] = []

    for tier, spec in TIER_SPECS.items():
        tier_name = spec["name"]
        raw_score = detailed_df[tier].fillna(0).values.astype(float)
        # Drainage floor for proxy-missed hotspot corridors
        floor = np.array([_drainage_floor_score(float(a), tier) for a in penalty])
        score = np.maximum(raw_score, floor)
        depth_m = score * spec["max_depth"] * penalty * basement

        drs = np.zeros(len(detailed_df), dtype=float)
        for c_type in ("RCC", "Masonry", "Informal"):
            mask = detailed_df["construction_type"].values == c_type
            if mask.any():
                drs[mask] = calculate_damage_ratio(depth_m[mask], c_type)

        gul = tiv * drs
        gross = np.maximum(0.0, gul - tiv * deductible_pct)
        net = gross * (1.0 - reinsurance_qs_pct)

        detailed_df[f"dr_{tier_name}"] = drs
        detailed_df[f"depth_{tier_name}"] = depth_m
        detailed_df[f"gul_{tier_name}"] = gul
        detailed_df[f"gross_{tier_name}"] = gross
        detailed_df[f"net_{tier_name}"] = net

        summary.append(
            {
                "tier": tier_name,
                "return_period": spec["return_period"],
                "exceedance_prob": spec["prob"],
                "ground_up_loss_m": gul.sum() / 1e6,
                "gross_loss_m": gross.sum() / 1e6,
                "net_loss_m": net.sum() / 1e6,
                "reinsurer_share_m": (gross.sum() * reinsurance_qs_pct) / 1e6,
            }
        )

    detailed_df["drainage_alpha"] = penalty
    elt = pd.DataFrame(summary).sort_values("return_period").reset_index(drop=True)
    return elt, detailed_df


# Backwards-compatible alias
def run_cat_simulation(*args, **kwargs):
    return run_portfolio_simulation(*args, **kwargs)
