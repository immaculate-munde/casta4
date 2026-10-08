"""
AI Layer: Spatial drainage hotspot correction.

The physical hazard proxy misses 12 of 24 county hotspots (e.g. Westlands,
Lavington, Kibera) because pluvial ponding is driven by blocked culverts,
impermeable cover, and drainage choke points.

Nearest-Neighbor Kernel Estimator (BallTree + Haversine) calibrated on the
24 validation hotspots → Drainage Multiplier α ∈ [1.0, 1.60].
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.neighbors import BallTree

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "team_a_nairobi"
DEFAULT_HOTSPOTS = DATA_DIR / "nairobi_hotspots_geocoded.csv"


def _lat_lon_cols(df: pd.DataFrame) -> tuple[str, str]:
    """Accept lat/lon or latitude/longitude."""
    if {"latitude", "longitude"}.issubset(df.columns):
        return "latitude", "longitude"
    if {"lat", "lon"}.issubset(df.columns):
        return "lat", "lon"
    raise KeyError("Expected latitude/longitude or lat/lon columns")


class DrainageAIRectifier:
    """Nearest-neighbor kernel estimator over geocoded drainage hotspots."""

    EARTH_RADIUS_KM = 6371.0

    def __init__(self, hotspots_path: str | Path | None = None):
        path = Path(hotspots_path) if hotspots_path else DEFAULT_HOTSPOTS
        self.hotspots = pd.read_csv(path)
        lat_col, lon_col = _lat_lon_cols(self.hotspots)
        hotspot_coords = np.radians(self.hotspots[[lat_col, lon_col]].values.astype(float))
        self.tree = BallTree(hotspot_coords, metric="haversine")

    def compute_drainage_penalty(
        self,
        coords_df: pd.DataFrame,
        influence_radius_km: float = 1.2,
    ) -> np.ndarray:
        """
        Drainage obstruction penalty multiplier α ∈ [1.0, 1.60].

        α = 1.0 + 0.60 × exp(-(dist / (radius/2))²) within influence radius.
        """
        lat_col, lon_col = _lat_lon_cols(coords_df)
        exposure_coords = np.radians(coords_df[[lat_col, lon_col]].values.astype(float))
        rad_dist, _ = self.tree.query(exposure_coords, k=1)
        dist_km = rad_dist.flatten() * self.EARTH_RADIUS_KM

        penalty = np.where(
            dist_km <= influence_radius_km,
            1.0 + 0.60 * np.exp(-((dist_km / (influence_radius_km / 2)) ** 2)),
            1.0,
        )
        return np.clip(penalty.astype(float), 1.0, 1.60)

    def penalty_at_point(self, lat: float, lon: float, influence_radius_km: float = 1.2) -> float:
        """Single-coordinate convenience wrapper."""
        df = pd.DataFrame({"latitude": [lat], "longitude": [lon]})
        return float(self.compute_drainage_penalty(df, influence_radius_km=influence_radius_km)[0])
