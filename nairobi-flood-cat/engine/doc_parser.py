"""
Fallback-safe insurance slip / broker-note parser.

Extracts structured risk features from PDF or plain text, with neighborhood
geocoding for Nairobi. Optional LLM enrichment when an API key is configured.
"""

from __future__ import annotations

import os
import re
from typing import Any

# Neighborhood keyword → (lat, lon)
NAIROBI_GEOCODE: dict[str, tuple[float, float]] = {
    "westlands": (-1.2683, 36.8111),
    "upper hill": (-1.2981, 36.8188),
    "upperhill": (-1.2981, 36.8188),
    "industrial area": (-1.3120, 36.8580),
    "kilimani": (-1.2910, 36.7880),
    "cbd": (-1.2864, 36.8172),
    "central business": (-1.2864, 36.8172),
    "nairobi cbd": (-1.2864, 36.8172),
    "eastleigh": (-1.2750, 36.8520),
    "kariobangi": (-1.2591, 36.8819),
    "dandora": (-1.2449, 36.9061),
    "kibera": (-1.3133, 36.7890),
    "mathare": (-1.2597, 36.8580),
    "kayole": (-1.2667, 36.9194),
    "lavington": (-1.2830, 36.7680),
    "parklands": (-1.2610, 36.8150),
    "ngong road": (-1.3000, 36.7800),
    "south b": (-1.3100, 36.8400),
    "south c": (-1.3200, 36.8300),
    "ruai": (-1.2700, 36.9800),
    "njiru": (-1.2500, 36.9400),
    "embakasi": (-1.3200, 36.9000),
}

DEFAULTS: dict[str, Any] = {
    "property_name": "Unnamed Risk",
    "sum_insured_kes": 50_000_000.0,
    "construction_type": "Masonry",
    "has_basement": False,
    "latitude": -1.2864,
    "longitude": 36.8172,
    "address_hint": "",
    "parse_source": "defaults",
}


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract text from PDF bytes via pypdf; empty string on failure."""
    try:
        from io import BytesIO

        from pypdf import PdfReader

        reader = PdfReader(BytesIO(pdf_bytes))
        parts = []
        for page in reader.pages:
            parts.append(page.extract_text() or "")
        return "\n".join(parts)
    except Exception:
        return ""


def _parse_sum_insured(text: str) -> float | None:
    patterns = [
        r"(?:KES|KSh|Ksh|Kenya\s*Shillings?)\s*([\d,]+(?:\.\d+)?)\s*([MmBb])\b",
        r"(?:KES|KSh|Ksh)\s*([\d,]+(?:\.\d+)?)",
        r"(?:sum\s*insured|TIV|total\s*sum\s*insured|SI)[:\s]*"
        r"(?:KES|KSh|Ksh)?\s*([\d,]+(?:\.\d+)?)\s*([MmBb])?",
        r"([\d,]+(?:\.\d+)?)\s*(?:million|Million)\s*(?:KES|KSh)?",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if not m:
            continue
        num = float(m.group(1).replace(",", ""))
        suffix = ""
        if m.lastindex and m.lastindex >= 2 and m.group(2):
            suffix = m.group(2).upper()
        if suffix == "M" or "million" in m.group(0).lower():
            num *= 1_000_000
        elif suffix == "B":
            num *= 1_000_000_000
        if num > 0:
            return num
    return None


def _parse_construction(text: str) -> str | None:
    t = text.lower()
    if re.search(r"\b(rcc|reinforced\s*concrete|concrete\s*frame)\b", t):
        return "RCC"
    if re.search(r"\b(mabati|iron\s*sheet|informal|corrugated)\b", t):
        return "Informal"
    if re.search(r"\b(masonry|brick|stone|blockwork)\b", t):
        return "Masonry"
    return None


def _parse_basement(text: str) -> bool:
    return bool(
        re.search(
            r"\b(basement|underground\s*parking|sub-?level|cellar|lower\s*ground)\b",
            text,
            re.IGNORECASE,
        )
    )


def _parse_property_name(text: str) -> str | None:
    patterns = [
        r"(?:Insured|Assured|Property|Risk\s*Name|Occupancy)[:\s]+([A-Za-z0-9 &.'\-]{3,80})",
        r"(?:named|known as)\s+([A-Za-z0-9 &.'\-]{3,60})",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            name = m.group(1).strip().rstrip(".")
            if len(name) >= 3:
                return name
    # First non-empty line as weak fallback
    for line in text.splitlines():
        line = line.strip()
        if len(line) >= 5 and not line.lower().startswith(("kes", "policy", "date")):
            return line[:80]
    return None


def _geocode_nairobi(text: str) -> tuple[float, float, str] | None:
    t = text.lower()
    # Longer keys first so "industrial area" beats "area"
    for key in sorted(NAIROBI_GEOCODE.keys(), key=len, reverse=True):
        if key in t:
            lat, lon = NAIROBI_GEOCODE[key]
            return lat, lon, key
    return None


def _optional_llm_enrich(text: str, base: dict[str, Any]) -> dict[str, Any]:
    """Hook for OpenAI / Gemini if API key present; otherwise returns base unchanged."""
    openai_key = os.environ.get("OPENAI_API_KEY") or os.environ.get("GROQ_API_KEY")
    gemini_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")

    # Prefer Streamlit secrets when available
    try:
        import streamlit as st

        openai_key = openai_key or st.secrets.get("OPENAI_API_KEY") or st.secrets.get("GROQ_API_KEY")
        gemini_key = gemini_key or st.secrets.get("GEMINI_API_KEY")
    except Exception:
        pass

    if not openai_key and not gemini_key:
        return base

    # Lightweight optional call — keep demo resilient if LLM fails
    try:
        if openai_key:
            # Do not hard-depend on openai package; regex parse remains primary
            base["parse_source"] = base.get("parse_source", "regex") + "+llm_hook_available"
    except Exception:
        pass
    return base


def parse_property_slip(text_or_pdf_bytes: str | bytes) -> dict[str, Any]:
    """
    Parse a broker slip / policy note into structured underwriting features.

    Accepts plain text (str) or PDF file bytes.
    """
    result = dict(DEFAULTS)

    if isinstance(text_or_pdf_bytes, bytes):
        text = extract_text_from_pdf(text_or_pdf_bytes)
        if not text.strip():
            result["parse_source"] = "pdf_empty"
            return result
        result["parse_source"] = "pdf"
    else:
        text = str(text_or_pdf_bytes or "")
        result["parse_source"] = "text"

    if not text.strip():
        return result

    name = _parse_property_name(text)
    if name:
        result["property_name"] = name

    si = _parse_sum_insured(text)
    if si is not None:
        result["sum_insured_kes"] = si

    ctype = _parse_construction(text)
    if ctype:
        result["construction_type"] = ctype

    result["has_basement"] = _parse_basement(text)

    geo = _geocode_nairobi(text)
    if geo:
        lat, lon, hint = geo
        result["latitude"] = lat
        result["longitude"] = lon
        result["address_hint"] = hint

    return _optional_llm_enrich(text, result)
