"""
Nairobi Urban Flood CAT Model — Underwriter Platform (Team A).

Run:
  pip install -r requirements.txt
  streamlit run app.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import folium
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st
from streamlit_folium import st_folium

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from engine.doc_parser import parse_property_slip
from engine.financial import (
    evaluate_single_risk,
    prepare_portfolio,
    run_portfolio_simulation,
    underwriting_recommendation,
)
from engine.geo_sampler import list_available_rasters, sample_hazard_at_point
from engine.hazard_ai import DrainageAIRectifier

DATA_DIR = ROOT / "data" / "team_a_nairobi"
EXPOSURE_PATH = DATA_DIR / "exposure_nairobi_with_hazard.csv"
HOTSPOTS_PATH = DATA_DIR / "nairobi_hotspots_geocoded.csv"

st.set_page_config(
    page_title="Nairobi Flood CAT · Team A",
    page_icon="🌊",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.title("🌊 Nairobi Urban Flood CAT Model · Team A")
st.caption(
    "Pluvial flood catastrophe analytics and single-risk underwriting for cedants, "
    "underwriters, and reinsurance analysts."
)

# ── Sidebar ──────────────────────────────────────────────────
st.sidebar.header("Model Controls")
enable_ai = st.sidebar.toggle("Enable AI Urban Drainage Rectifier", value=True)
deductible = st.sidebar.slider("Policy Deductible (%)", 0, 15, 5) / 100.0
quota_share = st.sidebar.slider("Quota Share Reinsurance (%)", 0, 50, 25) / 100.0
influence_km = st.sidebar.slider("Hotspot influence radius (km)", 0.4, 3.0, 1.2, 0.1)


@st.cache_data
def load_portfolio() -> pd.DataFrame:
    return prepare_portfolio(pd.read_csv(EXPOSURE_PATH))


@st.cache_resource
def load_rectifier() -> DrainageAIRectifier:
    return DrainageAIRectifier(HOTSPOTS_PATH)


portfolio = load_portfolio()
rectifier = load_rectifier()
penalties = rectifier.compute_drainage_penalty(portfolio, influence_radius_km=influence_km)

res_ai, detail_ai = run_portfolio_simulation(
    portfolio,
    use_ai_rectifier=True,
    drainage_penalties=penalties,
    deductible_pct=deductible,
    reinsurance_qs_pct=quota_share,
)
res_base, detail_base = run_portfolio_simulation(
    portfolio,
    use_ai_rectifier=False,
    drainage_penalties=penalties,
    deductible_pct=deductible,
    reinsurance_qs_pct=quota_share,
)

current_res = res_ai if enable_ai else res_base
current_detail = detail_ai if enable_ai else detail_base

# ── KPI ribbon ───────────────────────────────────────────────
extreme = current_res[current_res["return_period"] == 100].iloc[0]
base_x = res_base[res_base["return_period"] == 100].iloc[0]
ai_x = res_ai[res_ai["return_period"] == 100].iloc[0]
uplift = (
    (ai_x["gross_loss_m"] - base_x["gross_loss_m"]) / base_x["gross_loss_m"] * 100
    if base_x["gross_loss_m"] > 0
    else 0.0
)

k1, k2, k3, k4 = st.columns(4)
k1.metric("Total Sum Insured (TSI)", f"KES {portfolio['sum_insured_kes'].sum() / 1e9:.2f} B")
k2.metric("100-Yr Ground-Up Loss", f"KES {extreme['ground_up_loss_m']:.1f} M")
k3.metric("100-Yr Gross Insured Loss", f"KES {extreme['gross_loss_m']:.1f} M")
k4.metric(
    f"100-Yr Net Insured Loss ({int(quota_share * 100)}% QS)",
    f"KES {extreme['net_loss_m']:.1f} M",
)

affected = int((penalties > 1.01).sum())
st.info(
    f"AI drainage rectifier: **{affected}/{len(portfolio)}** assets in hotspot corridors "
    f"(α ≤ {penalties.max():.2f}). 100-yr gross uplift vs baseline: **{uplift:+.1f}%**."
)

tab_portfolio, tab_uw, tab_disclose = st.tabs(
    [
        "📊 Portfolio Catastrophe Analytics",
        "🏢 Single Property Underwriting",
        "ℹ️ Model Assumptions & Disclosures",
    ]
)

# ═══════════════════════════════════════════════════════════════
# TAB 1 — Portfolio
# ═══════════════════════════════════════════════════════════════
with tab_portfolio:
    left, right = st.columns([6, 4])

    with left:
        st.subheader("Exceedance Probability (EP) Curve")
        st.caption(
            "Built from portfolio CSV hazard scores (`hazard_score_*`) × tier D_max × "
            "drainage α → JRC damage ratio → GUL − deductible. "
            "GeoTIFF rasters are used in Single Property Underwriting, not this EP curve."
        )
        # Sort high AEP → low so the line reads as a classic EP curve
        base_ep = res_base.sort_values("exceedance_prob", ascending=False)
        ai_ep = res_ai.sort_values("exceedance_prob", ascending=False)
        fig = go.Figure()
        fig.add_trace(
            go.Scatter(
                x=base_ep["gross_loss_m"],
                y=base_ep["exceedance_prob"] * 100,
                mode="lines+markers+text",
                text=base_ep["tier"],
                textposition="top center",
                name="Baseline (Proxy Only)",
                line=dict(dash="dash", color="gray"),
                hovertemplate="%{text}<br>Gross %{x:.1f} M · AEP %{y:.1f}%<extra>Baseline</extra>",
            )
        )
        fig.add_trace(
            go.Scatter(
                x=ai_ep["gross_loss_m"],
                y=ai_ep["exceedance_prob"] * 100,
                mode="lines+markers+text",
                text=ai_ep["tier"],
                textposition="bottom center",
                name="AI-Rectified (Drainage Corrected)",
                line=dict(color="#d9534f", width=3),
                hovertemplate="%{text}<br>Gross %{x:.1f} M · AEP %{y:.1f}%<extra>AI</extra>",
            )
        )
        fig.update_layout(
            xaxis_title="Gross Insured Loss (Million KES)",
            yaxis_title="Annual Exceedance Probability (%)",
            hovermode="closest",
            height=420,
            margin=dict(t=20),
            legend=dict(yanchor="top", y=0.98, xanchor="right", x=0.98),
        )
        st.plotly_chart(fig, width="stretch")

    with right:
        st.subheader("Event Loss Table (ELT)")
        st.dataframe(
            current_res[
                ["tier", "return_period", "ground_up_loss_m", "gross_loss_m", "net_loss_m"]
            ].rename(
                columns={
                    "tier": "Tier",
                    "return_period": "RP (Yrs)",
                    "ground_up_loss_m": "GUL (M KES)",
                    "gross_loss_m": "Gross (M KES)",
                    "net_loss_m": "Net (M KES)",
                }
            ),
            width="stretch",
            hide_index=True,
        )
        st.caption(f"Showing: **{'AI-Rectified' if enable_ai else 'Baseline'}**")

    st.subheader("Portfolio spatial map · 100-year damage ratio")
    map_df = current_detail.copy()
    p95 = float(map_df["sum_insured_kes"].quantile(0.95))
    map_df["marker_size"] = map_df["sum_insured_kes"].clip(upper=max(p95, 1.0))
    fig_map = px.scatter_map(
        map_df,
        lat="latitude",
        lon="longitude",
        color="dr_Extreme",
        size="marker_size",
        size_max=14,
        color_continuous_scale="YlOrRd",
        range_color=(0, 0.95),
        hover_name="loc_id" if "loc_id" in map_df.columns else None,
        hover_data={
            "construction_type": True,
            "dr_Extreme": ":.1%",
            "sum_insured_kes": ":,.0f",
            "drainage_alpha": ":.2f",
            "marker_size": False,
            "latitude": False,
            "longitude": False,
        },
        zoom=10.2,
        height=460,
        map_style="open-street-map",
        labels={"dr_Extreme": "100-yr DR"},
    )
    fig_map.update_layout(
        margin=dict(l=0, r=0, t=0, b=0),
        map=dict(
            center=dict(
                lat=float(map_df["latitude"].mean()),
                lon=float(map_df["longitude"].mean()),
            ),
            zoom=10.2,
            style="open-street-map",
        ),
    )
    st.plotly_chart(fig_map, width="stretch")

# ═══════════════════════════════════════════════════════════════
# TAB 2 — Single property underwriting
# ═══════════════════════════════════════════════════════════════
with tab_uw:
    st.subheader("Point & Document Underwriting")

    if "uw_lat" not in st.session_state:
        st.session_state.uw_lat = -1.2864
        st.session_state.uw_lon = 36.8172
        st.session_state.uw_name = "Selected Risk"
        st.session_state.uw_si = 50_000_000.0
        st.session_state.uw_ctype = "Masonry"
        st.session_state.uw_basement = False

    mode = st.radio(
        "Input mode",
        ["Document Upload", "Interactive Map Click"],
        horizontal=True,
    )

    col_in, col_out = st.columns([5, 5])

    with col_in:
        if mode == "Document Upload":
            uploaded = st.file_uploader("Upload slip / broker note", type=["pdf", "txt"])
            paste = st.text_area(
                "Or paste broker slip text",
                height=160,
                placeholder="e.g. Insured: Westlands Logistics Hub\nSum Insured: KES 150M\nConstruction: RCC with basement parking…",
            )
            if st.button("Analyze Property", type="primary"):
                raw: str | bytes
                if uploaded is not None:
                    raw = uploaded.read()
                    if uploaded.name.lower().endswith(".txt"):
                        raw = raw.decode("utf-8", errors="ignore")
                else:
                    raw = paste
                parsed = parse_property_slip(raw)
                st.session_state.uw_name = parsed["property_name"]
                st.session_state.uw_si = float(parsed["sum_insured_kes"])
                st.session_state.uw_ctype = parsed["construction_type"]
                st.session_state.uw_basement = bool(parsed["has_basement"])
                st.session_state.uw_lat = float(parsed["latitude"])
                st.session_state.uw_lon = float(parsed["longitude"])
                st.success(
                    f"Parsed via **{parsed['parse_source']}**"
                    + (f" · geocoded **{parsed.get('address_hint', '')}**" if parsed.get("address_hint") else "")
                )

        else:
            st.caption("Click anywhere on the Nairobi map to set the risk location.")
            fmap = folium.Map(
                location=[st.session_state.uw_lat, st.session_state.uw_lon],
                zoom_start=12,
                tiles="OpenStreetMap",
            )
            folium.Marker(
                [st.session_state.uw_lat, st.session_state.uw_lon],
                popup="Selected risk",
                icon=folium.Icon(color="red", icon="info-sign"),
            ).add_to(fmap)
            # Hotspots overlay
            try:
                hs = pd.read_csv(HOTSPOTS_PATH)
                for _, row in hs.iterrows():
                    folium.CircleMarker(
                        [row["lat"], row["lon"]],
                        radius=5,
                        color="#6b2d5c",
                        fill=True,
                        fill_opacity=0.7,
                        popup=str(row.get("name", "Hotspot")),
                    ).add_to(fmap)
            except Exception:
                pass

            map_event = st_folium(fmap, width=None, height=380, key="uw_map")
            if map_event and map_event.get("last_clicked"):
                st.session_state.uw_lat = float(map_event["last_clicked"]["lat"])
                st.session_state.uw_lon = float(map_event["last_clicked"]["lng"])

        st.markdown("**Risk parameters**")
        st.session_state.uw_name = st.text_input("Property name", st.session_state.uw_name)
        c1, c2 = st.columns(2)
        st.session_state.uw_lat = c1.number_input("Latitude", value=float(st.session_state.uw_lat), format="%.6f")
        st.session_state.uw_lon = c2.number_input("Longitude", value=float(st.session_state.uw_lon), format="%.6f")
        st.session_state.uw_si = st.number_input(
            "Sum Insured (KES)",
            min_value=0.0,
            value=float(st.session_state.uw_si),
            step=1_000_000.0,
        )
        st.session_state.uw_ctype = st.selectbox(
            "Construction type",
            ["RCC", "Masonry", "Informal"],
            index=["RCC", "Masonry", "Informal"].index(st.session_state.uw_ctype)
            if st.session_state.uw_ctype in ("RCC", "Masonry", "Informal")
            else 1,
        )
        st.session_state.uw_basement = st.checkbox("Has basement / underground parking", value=st.session_state.uw_basement)

    with col_out:
        lat = float(st.session_state.uw_lat)
        lon = float(st.session_state.uw_lon)
        hazards = sample_hazard_at_point(lat, lon)
        alpha = rectifier.penalty_at_point(lat, lon, influence_radius_km=influence_km) if enable_ai else 1.0

        sheet = evaluate_single_risk(
            hazards,
            sum_insured_kes=float(st.session_state.uw_si),
            construction_type=st.session_state.uw_ctype,
            drainage_alpha=alpha,
            has_basement=bool(st.session_state.uw_basement),
            deductible_pct=deductible,
            reinsurance_qs_pct=quota_share,
        )
        rec = underwriting_recommendation(sheet, has_basement=bool(st.session_state.uw_basement))

        st.markdown(f"### Underwriting Risk Sheet — {st.session_state.uw_name}")
        m1, m2, m3 = st.columns(3)
        m1.metric("Drainage α", f"{alpha:.2f}")
        m2.metric("100-yr Hazard", f"{hazards['extreme']:.0%}")
        m3.metric("Recommendation", rec)

        display = sheet.copy()
        display["hazard_score"] = display["hazard_score"].map(lambda x: f"{x:.1%}")
        display["damage_ratio"] = display["damage_ratio"].map(lambda x: f"{x:.1%}")
        display["depth_m"] = display["depth_m"].map(lambda x: f"{x:.2f}")
        for col in ("ground_up_loss_kes", "gross_loss_kes", "net_loss_kes"):
            display[col] = display[col].map(lambda x: f"KES {x:,.0f}")
        st.dataframe(
            display.rename(
                columns={
                    "tier": "Tier",
                    "return_period": "RP (Yrs)",
                    "hazard_score": "Susceptibility",
                    "drainage_alpha": "α",
                    "depth_m": "Depth (m)",
                    "damage_ratio": "Damage Ratio",
                    "ground_up_loss_kes": "GUL",
                    "gross_loss_kes": "Gross Claim",
                    "net_loss_kes": "Net",
                }
            ).drop(columns=["exceedance_prob"], errors="ignore"),
            width="stretch",
            hide_index=True,
        )

        if rec == "Basement Exclusion Recommended":
            st.warning("Basement / sub-level exposure materially increases modelled depth. Consider excluding basement contents or applying a basement sub-limit.")
        elif rec == "Sub-limit Required":
            st.error("Elevated drainage-corridor and severity profile. Recommend flood sub-limit and enhanced survey.")
        elif rec.startswith("Enhanced"):
            st.warning("Above-average pluvial exposure. Route to senior underwriter / enhanced assessment.")
        else:
            st.success("Within standard flood appetite under current assumptions.")

# ═══════════════════════════════════════════════════════════════
# TAB 3 — Disclosures
# ═══════════════════════════════════════════════════════════════
with tab_disclose:
    st.subheader("Model Assumptions & Transparency Disclosures")
    rasters = list_available_rasters()
    disclosure = pd.DataFrame(
        [
            {
                "Category": "Real Open Data",
                "Component": "Nairobi pluvial proxy GeoTIFF rasters (5 return periods)",
                "Detail": ", ".join(f"{k}: {'✓' if v else '✗ (synthetic fallback)'}" for k, v in rasters.items()),
            },
            {
                "Category": "Real Open Data",
                "Component": "County-mapped flood hotspot coordinates",
                "Detail": f"{HOTSPOTS_PATH.name} — {len(pd.read_csv(HOTSPOTS_PATH))} named localities",
            },
            {
                "Category": "Real Open Data",
                "Component": "OpenStreetMap basemap tiles",
                "Detail": "Used for portfolio Plotly map and Folium underwriting map",
            },
            {
                "Category": "Assumptions & Synthetic Proxies",
                "Component": "Exposure portfolio",
                "Detail": "600 synthetic buildings (housing class, TIV) — not a live book",
            },
            {
                "Category": "Assumptions & Synthetic Proxies",
                "Component": "JRC / Huizinga vulnerability",
                "Detail": "Africa-adapted sigmoid curves (Informal / Masonry / RCC) — not Kenya claims-calibrated",
            },
            {
                "Category": "Assumptions & Synthetic Proxies",
                "Component": "Susceptibility → depth calibration",
                "Detail": "D_max = 0.5 / 1.0 / 1.8 / 2.5 / 3.5 m for 2 / 5 / 10 / 50 / 100-yr tiers",
            },
            {
                "Category": "Assumptions & Synthetic Proxies",
                "Component": "AI drainage rectifier",
                "Detail": "BallTree Haversine kernel; α = 1 + 0.6·exp(-(d/(r/2))²), capped at 1.60",
            },
            {
                "Category": "Assumptions & Synthetic Proxies",
                "Component": "Basement uplift",
                "Detail": "×1.25 effective depth when basement / underground parking declared",
            },
            {
                "Category": "Assumptions & Synthetic Proxies",
                "Component": "Document geocoding",
                "Detail": "Keyword lookup for Nairobi neighbourhoods (not full geocoder API)",
            },
        ]
    )
    st.dataframe(disclosure, width="stretch", hide_index=True)
    st.caption(
        "This platform is a hackathon decision-support demonstrator. Modelled losses are illustrative "
        "and do not constitute actuarial advice or binding underwriting authority."
    )
