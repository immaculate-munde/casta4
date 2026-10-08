"""
Sample pluvial hazard susceptibility from Team A GeoTIFF rasters.

Tiers map to design return periods:
  common 2y · occasional 5y · moderate 10y · severe 50y · extreme 100y
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "team_a_nairobi"

TIER_KEYS = ("common", "occasional", "moderate", "severe", "extreme")

# Preferred filenames, then fallbacks (download renames, etc.)
TIFF_CANDIDATES: dict[str, list[str]] = {
    "common": [
        "nairobi_pluvial_proxy_common.tif",
        "common.tif",
    ],
    "occasional": [
        "nairobi_pluvial_proxy_occasional.tif",
        "nairobi_pluvial_proxy_occasional (1).tif",
        "occasional.tif",
    ],
    "moderate": [
        "nairobi_pluvial_proxy_moderate.tif",
        "moderate.tif",
    ],
    "severe": [
        "nairobi_pluvial_proxy_severe.tif",
        "nairobi_pluvial_proxy_severe (2).tif",
        "severe.tif",
    ],
    "extreme": [
        "nairobi_pluvial_proxy_extreme.tif",
        "extreme.tif",
    ],
}

# Synthetic fallback when a raster is missing / unreadable (demo-ready)
_SYNTHETIC_BASE = {
    "common": 0.18,
    "occasional": 0.28,
    "moderate": 0.40,
    "severe": 0.55,
    "extreme": 0.68,
}

_raster_cache: dict[str, Any] = {}
_transformer_cache: dict[str, Any] = {}


def _resolve_tiff(tier: str, data_dir: Path = DATA_DIR) -> Path | None:
    for name in TIFF_CANDIDATES.get(tier, []):
        path = data_dir / name
        if path.exists():
            return path
    # glob fallback
    matches = list(data_dir.glob(f"*_{tier}*.tif")) + list(data_dir.glob(f"{tier}*.tif"))
    return matches[0] if matches else None


def list_available_rasters(data_dir: Path | str | None = None) -> dict[str, str | None]:
    root = Path(data_dir) if data_dir else DATA_DIR
    return {t: (str(p) if (p := _resolve_tiff(t, root)) else None) for t in TIER_KEYS}


def _open_raster(tier: str, data_dir: Path = DATA_DIR):
    """Lazy-open rasterio dataset; returns None if unavailable."""
    global _raster_cache
    if tier in _raster_cache:
        return _raster_cache[tier]

    path = _resolve_tiff(tier, data_dir)
    if path is None:
        _raster_cache[tier] = None
        return None

    try:
        import rasterio

        src = rasterio.open(path)
        _raster_cache[tier] = src
        return src
    except Exception:
        _raster_cache[tier] = None
        return None


def _to_raster_xy(src, lat: float, lon: float) -> tuple[float, float]:
    """Transform WGS84 lon/lat → raster CRS x/y when needed."""
    crs = src.crs
    if crs is None:
        return lon, lat

    crs_str = str(crs).upper()
    # Already geographic WGS84
    if "4326" in crs_str or "WGS 84" in crs_str or getattr(crs, "is_geographic", False):
        return lon, lat

    key = crs_str
    if key not in _transformer_cache:
        from pyproj import Transformer

        _transformer_cache[key] = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
    x, y = _transformer_cache[key].transform(lon, lat)
    return float(x), float(y)


def _read_pixel(src, lat: float, lon: float) -> float:
    """Read a single pixel; 0.0 if OOB / nodata / error."""
    try:
        x, y = _to_raster_xy(src, lat, lon)
        row, col = src.index(x, y)
        if row < 0 or col < 0 or row >= src.height or col >= src.width:
            return 0.0
        window = ((row, row + 1), (col, col + 1))
        data = src.read(1, window=window, masked=True)
        if data.size == 0:
            return 0.0
        val = data.astype(float).filled(np.nan).flat[0]
        if not np.isfinite(val):
            return 0.0
        nodata = src.nodata
        if nodata is not None and np.isclose(val, float(nodata)):
            return 0.0
        return float(np.clip(val, 0.0, 1.0))
    except Exception:
        return 0.0


def _synthetic_at_point(lat: float, lon: float, tier: str) -> float:
    """
    Smooth demo susceptibility when rasters are missing.
    Mild east/central bias toward Eastlands drainage corridors.
    """
    # Nairobi approx centre
    dlat = lat - (-1.286)
    dlon = lon - 36.820
    # Eastwards / slightly north-east increases hazard
    spatial = 0.55 + 0.35 * np.tanh(8.0 * dlon) - 0.15 * abs(dlat) * 40.0
    base = _SYNTHETIC_BASE.get(tier, 0.3)
    return float(np.clip(base * spatial, 0.0, 1.0))


def sample_hazard_at_point(
    lat: float,
    lon: float,
    data_dir: Path | str | None = None,
) -> dict[str, float]:
    """
    Sample all 5 hazard tiers at a WGS84 point.

    Returns dict keyed by tier name with values clipped to [0, 1].
    Missing / unreadable rasters fall back to synthetic values.
    """
    root = Path(data_dir) if data_dir else DATA_DIR
    out: dict[str, float] = {}

    for tier in TIER_KEYS:
        src = _open_raster(tier, root)
        if src is None:
            out[tier] = _synthetic_at_point(lat, lon, tier)
        else:
            out[tier] = _read_pixel(src, lat, lon)
            # If raster returns zeros everywhere for in-city points, keep raw value
            # (0 is valid low hazard). Only synthetic when file missing.

    return out


def sample_hazard_batch(
    lats: np.ndarray,
    lons: np.ndarray,
    data_dir: Path | str | None = None,
) -> dict[str, np.ndarray]:
    """Vector-friendly wrapper (row-wise sampling)."""
    result = {t: np.zeros(len(lats), dtype=float) for t in TIER_KEYS}
    for i, (la, lo) in enumerate(zip(lats, lons)):
        h = sample_hazard_at_point(float(la), float(lo), data_dir=data_dir)
        for t in TIER_KEYS:
            result[t][i] = h[t]
    return result
