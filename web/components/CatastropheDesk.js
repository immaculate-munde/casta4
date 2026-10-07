'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchRagJson, ragApiBase } from '@/lib/api';
import 'leaflet/dist/leaflet.css';
import '@/styles/catastrophe.css';

const kes = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('en-KE', { style: 'percent', maximumFractionDigits: 1 });

function hazardPct(score) {
  return `${Math.round((score || 0) * 100)}%`;
}

export default function CatastropheDesk() {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerLayer = useRef(null);
  const hotspotLayer = useRef(null);
  const markersRef = useRef({});

  const [meta, setMeta] = useState(null);
  const [summaryText, setSummaryText] = useState('Loading portfolio…');
  const [locations, setLocations] = useState([]);
  const [hotspots, setHotspots] = useState([]);
  const [lossCurve, setLossCurve] = useState(null);
  const [activeTier, setActiveTier] = useState('moderate');
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [caseOpen, setCaseOpen] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [thread, setThread] = useState([{ role: 'desk', text: 'Loading Nairobi synthetic portfolio…' }]);
  const [ask, setAsk] = useState('');

  const epNote = lossCurve?.points?.find((p) => p.tier === activeTier);

  const drawMarkers = useCallback(
    (L, locs) => {
      if (!markerLayer.current || !mapInstance.current) return;
      markerLayer.current.clearLayers();
      markersRef.current = {};
      locs.forEach((row) => {
        const icon = L.divIcon({
          className: 'pin-wrap',
          html: `<div class="pin pin-${row.hazard_band}${openId === row.loc_id ? ' is-open' : ''}"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        const marker = L.marker([row.lat, row.lon], { icon, title: row.loc_id });
        marker.on('click', () => {
          setOpenId(row.loc_id);
          setCaseOpen(true);
          mapInstance.current?.panTo([row.lat, row.lon]);
        });
        marker.addTo(markerLayer.current);
        markersRef.current[row.loc_id] = marker;
      });
    },
    [openId]
  );

  const drawHotspots = useCallback((L, spots) => {
    if (!hotspotLayer.current) return;
    hotspotLayer.current.clearLayers();
    spots.forEach((h) => {
      const icon = L.divIcon({
        className: 'pin-wrap',
        html: '<div class="pin pin-hotspot"></div>',
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });
      L.marker([h.lat, h.lon], { icon, title: h.name })
        .bindTooltip(h.name, { direction: 'top', offset: [0, -6] })
        .addTo(hotspotLayer.current);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const L = (await import('leaflet')).default;
        if (cancelled || !mapRef.current || mapInstance.current) return;

        const map = L.map(mapRef.current, { zoomControl: true });
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap',
          maxZoom: 19,
        }).addTo(map);
        markerLayer.current = L.layerGroup().addTo(map);
        hotspotLayer.current = L.layerGroup().addTo(map);
        mapInstance.current = map;

        const [metaData, curve, summary, hotspotData, exposure] = await Promise.all([
          fetchRagJson('/api/nairobi/meta'),
          fetchRagJson('/api/nairobi/loss-curve'),
          fetchRagJson('/api/nairobi/summary'),
          fetchRagJson('/api/nairobi/hotspots'),
          fetchRagJson('/api/nairobi/exposure?tier=moderate'),
        ]);

        if (cancelled) return;
        setMeta(metaData);
        setLossCurve(curve);
        setHotspots(hotspotData.hotspots || []);
        setLocations(exposure.locations || []);
        setSummaryText(
          `${summary.location_count} locations · ${kes.format(summary.total_tiv_kes)} TIV · Nairobi pluvial book`
        );
        drawHotspots(L, hotspotData.hotspots || []);
        drawMarkers(L, exposure.locations || []);

        const bounds = [];
        (exposure.locations || []).forEach((r) => bounds.push([r.lat, r.lon]));
        (hotspotData.hotspots || []).forEach((h) => bounds.push([h.lat, h.lon]));
        if (bounds.length) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 13 });

        setThread([
          {
            role: 'desk',
            text: 'Nairobi synthetic portfolio loaded. Pick a tier, open a pin, and ask about susceptibility or modelled loss.',
          },
        ]);
      } catch (err) {
        if (!cancelled) {
          setLoadError(`Could not reach ${ragApiBase()}. Start node rag-server.js — ${err.message}`);
          setSummaryText('API unavailable');
        }
      }
    })();

    return () => {
      cancelled = true;
      mapInstance.current?.remove();
      mapInstance.current = null;
    };
  }, [drawHotspots, drawMarkers]);

  useEffect(() => {
    if (!openId) {
      setDetail(null);
      return;
    }
    fetchRagJson(`/api/nairobi/exposure/${encodeURIComponent(openId)}`)
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [openId]);

  useEffect(() => {
    (async () => {
      if (!mapInstance.current) return;
      const L = (await import('leaflet')).default;
      try {
        const data = await fetchRagJson(`/api/nairobi/exposure?tier=${encodeURIComponent(activeTier)}`);
        setLocations(data.locations || []);
        drawMarkers(L, data.locations || []);
      } catch (err) {
        setLoadError(err.message);
      }
    })();
  }, [activeTier, drawMarkers]);

  const sorted = [...locations].sort((a, b) => b.hazard - a.hazard).slice(0, 120);
  const activeLoss = detail?.tier_losses?.find((t) => t.tier === activeTier);
  const level = activeLoss
    ? activeLoss.hazard >= 0.5
      ? 'high'
      : activeLoss.hazard >= 0.25
        ? 'watch'
        : 'low'
    : 'low';

  function answerQuestion(question) {
    const row = locations.find((item) => item.loc_id === openId);
    if (!row) return 'Open a location first.';
    const q = question.toLowerCase();
    if (/hazard|score|loss|tiv|value|portfolio|curve/.test(q)) {
      if (detail?.tier_losses) {
        return detail.tier_losses
          .map((t) => `${t.label}: ${hazardPct(t.hazard)}, loss ${kes.format(t.loss_kes)}`)
          .join('\n');
      }
    }
    return `${row.loc_id}: ${row.housing_label}, ${hazardPct(row.hazard)} on ${activeTier}, loss ${kes.format(row.loss_kes)}.`;
  }

  function onSubmit(e) {
    e.preventDefault();
    const q = ask.trim();
    if (!q) return;
    setThread((t) => [...t, { role: 'user', text: q }, { role: 'desk', text: answerQuestion(q) }]);
    setAsk('');
  }

  const maxEp = Math.max(...(lossCurve?.ep_curve?.map((p) => p.loss_kes) || [1]), 1);

  return (
    <div className="cat-root">
      <header className="topbar">
        <Link className="mark" href="/">
          <span className="mark-ribbon" aria-hidden="true" />
          <span className="mark-name">Kenya Re</span>
          <span className="mark-desk">Nairobi flood desk</span>
        </Link>
        <p className="topbar-book">{summaryText}</p>
        <span className="synthetic-badge" title={meta?.data_label}>Synthetic data</span>
        <Link className="text-link" href="/chat">
          Claims chat
        </Link>
      </header>

      <div className="desk">
        <aside className="register">
          <div className="register-head">
            <h1>Flood book</h1>
            <p>600 illustrative Nairobi locations</p>
            <label className="tier-label" htmlFor="tier-select">
              Hazard scenario
            </label>
            <select
              id="tier-select"
              className="tier-select"
              value={activeTier}
              onChange={(e) => setActiveTier(e.target.value)}
            >
              {(meta?.tiers || [{ id: 'moderate', label: 'Moderate', return_period_years: 25 }]).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} (~1-in-{t.return_period_years} yr)
                </option>
              ))}
            </select>
          </div>
          <div className="register-list">
            {sorted.map((row) => (
              <button
                key={row.loc_id}
                type="button"
                className={`risk-row ${openId === row.loc_id ? 'is-open' : ''}`}
                onClick={() => {
                  setOpenId(row.loc_id);
                  setCaseOpen(true);
                  const m = markersRef.current[row.loc_id];
                  if (m) mapInstance.current?.panTo(m.getLatLng());
                }}
              >
                <strong>{row.loc_id}</strong>
                <span className={`risk-pct ${row.hazard_band}`}>{hazardPct(row.hazard)}</span>
                <span>{row.housing_label}</span>
                <span>{kes.format(row.tiv_kes)}</span>
              </button>
            ))}
            {locations.length > 120 && (
              <p className="list-more">Top 120 by hazard · {locations.length} on map</p>
            )}
          </div>
        </aside>

        <main className="map-wrap">
          <div ref={mapRef} className="cat-map" />
          <div className="legend">
            <span>
              <i className="swatch swatch-high" /> High (≥50%)
            </span>
            <span>
              <i className="swatch swatch-watch" /> Watch
            </span>
            <span>
              <i className="swatch swatch-low" /> Lower
            </span>
            <span>
              <i className="swatch swatch-hotspot" /> Hotspot
            </span>
          </div>
          <section className="ep-panel">
            <h3>Exceedance curve</h3>
            <p className="ep-note">
              {epNote
                ? `${epNote.label}: ${kes.format(epNote.portfolio_loss_kes)} (${pct.format(epNote.loss_pct_of_tiv)} of TIV)`
                : 'Portfolio ground-up loss by tier'}
            </p>
            <div className="ep-chart">
              {(lossCurve?.ep_curve || []).map((p) => (
                <div key={p.return_period_years} className="ep-bar" title={kes.format(p.loss_kes)}>
                  <b style={{ height: `${Math.max(4, (p.loss_kes / maxEp) * 100)}%` }} />
                  <em>1:{p.return_period_years}y</em>
                </div>
              ))}
            </div>
            <dl className="ep-key">
              {(lossCurve?.points || []).map((p) => (
                <div key={p.tier} className={`ep-key-row${p.tier === activeTier ? ' is-active' : ''}`}>
                  <dt>{p.label}</dt>
                  <dd>{kes.format(p.portfolio_loss_kes)}</dd>
                </div>
              ))}
            </dl>
          </section>
        </main>

        <aside className={`case${caseOpen ? ' is-open' : ''}`}>
          <section className="dossier">
            {!openId || !detail ? (
              <div className="empty">
                <p className="kicker">Property file</p>
                <h2>Select a location on the map.</h2>
              </div>
            ) : (
              <>
                <p className="kicker">{detail.housing_label} · Synthetic</p>
                <h2 className="dossier-title">{detail.loc_id}</h2>
                <p className="policy-no">
                  {detail.lat.toFixed(5)}, {detail.lon.toFixed(5)}
                </p>
                <div className="stat-row">
                  <div>
                    <strong className={level}>{hazardPct(activeLoss?.hazard)}</strong>
                    <span>Susceptibility</span>
                  </div>
                  <div>
                    <strong>{pct.format(activeLoss?.damage_ratio || 0)}</strong>
                    <span>Damage ratio</span>
                  </div>
                  <div>
                    <strong>{kes.format(activeLoss?.loss_kes || 0)}</strong>
                    <span>Modelled loss</span>
                  </div>
                </div>
                <div className="risk-meter">
                  <i className={level} style={{ width: `${Math.round((activeLoss?.hazard || 0) * 100)}%` }} />
                </div>
                <p className="section-label">Loss by return period</p>
                <table className="tier-table">
                  <thead>
                    <tr>
                      <th>Tier</th>
                      <th>Hazard</th>
                      <th>Damage</th>
                      <th>Loss</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.tier_losses || []).map((t) => (
                      <tr key={t.tier} className={t.tier === activeTier ? 'is-active' : ''}>
                        <td>{t.label}</td>
                        <td>{hazardPct(t.hazard)}</td>
                        <td>{pct.format(t.damage_ratio)}</td>
                        <td>{kes.format(t.loss_kes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="section-label">Exposure file</p>
                <dl className="fields">
                  <div>
                    <dt>TIV</dt>
                    <dd>{kes.format(detail.tiv_kes)}</dd>
                  </div>
                  <div>
                    <dt>Floor area</dt>
                    <dd>{detail.floor_area_m2.toLocaleString('en-KE')} m²</dd>
                  </div>
                  <div className="wide">
                    <dt>Source</dt>
                    <dd>{detail.source}</dd>
                  </div>
                </dl>
              </>
            )}
          </section>
          <section className="copilot">
            <header className="copilot-head">
              <h2>Underwriter</h2>
              <p>{openId ? `${openId} open` : 'No property open'}</p>
            </header>
            <div className="thread">
              {thread.map((m, i) => (
                <div key={i} className={`bubble ${m.role}`}>
                  {m.text}
                </div>
              ))}
            </div>
            <form className="composer" onSubmit={onSubmit}>
              <textarea
                value={ask}
                onChange={(e) => setAsk(e.target.value)}
                rows={2}
                placeholder="Ask about hazard, TIV, or loss"
              />
              <button type="submit">Ask</button>
            </form>
          </section>
        </aside>
      </div>
      {loadError ? <p className="load-error">{loadError}</p> : null}
    </div>
  );
}
