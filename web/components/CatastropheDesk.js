'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import SignOutButton from '@/components/SignOutButton';
import ThemeToggle from '@/components/ThemeToggle';
import { fetchRagJson, ragApiBase } from '@/lib/api';
import '@/styles/catastrophe.css';

const kes = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('en-KE', { style: 'percent', maximumFractionDigits: 1 });

function hazardPct(score) {
  return `${Math.round((score || 0) * 100)}%`;
}

// Convert locations array → GeoJSON FeatureCollection
function locationsToGeoJSON(locations) {
  return {
    type: 'FeatureCollection',
    features: locations.map((row) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [row.lon, row.lat] },
      properties: {
        loc_id: row.loc_id,
        hazard: row.hazard || 0,
        hazard_band: row.hazard_band || 'low',
        housing_label: row.housing_label || '',
        tiv_kes: row.tiv_kes || 0,
        loss_kes: row.loss_kes || 0,
      },
    })),
  };
}

function hotspotsToGeoJSON(hotspots) {
  return {
    type: 'FeatureCollection',
    features: hotspots.map((h) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [h.lon, h.lat] },
      properties: { name: h.name || '' },
    })),
  };
}

// Band colour lookup (must match CSS pin colours)
const BAND_COLOUR = {
  high: '#e24b4b',
  watch: '#c4a15a',
  low: '#17386a',
};

export default function CatastropheDesk() {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const popupRef = useRef(null);

  const [meta, setMeta] = useState(null);
  const [portfolioSummary, setPortfolioSummary] = useState(null);
  const [summaryText, setSummaryText] = useState('Loading portfolio…');
  const [locations, setLocations] = useState([]);
  const [lossCurve, setLossCurve] = useState(null);
  const [activeTier, setActiveTier] = useState('moderate');
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [caseOpen, setCaseOpen] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [pitch3d, setPitch3d] = useState(true);
  const [dossierTab, setDossierTab] = useState('overview');

  const epNote = lossCurve?.points?.find((p) => p.tier === activeTier);

  // ── Update exposure source when locations or openId changes ──────────────
  const updateExposureSource = useCallback((locs) => {
    const map = mapInstance.current;
    if (!map || !map.getSource('exposure')) return;
    map.getSource('exposure').setData(locationsToGeoJSON(locs));
  }, []);

  // ── Initialise MapLibre once ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const ml = await import('maplibre-gl');
        const maplibregl = ml.default ?? ml;
        if (cancelled || !mapRef.current || mapInstance.current) return;

        // Serve worker from public/ so Next.js sends it with the correct JS MIME type
        maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');

        // Ensure container has rendered with real dimensions
        if (mapRef.current.offsetWidth === 0 || mapRef.current.offsetHeight === 0) {
          await new Promise((r) => requestAnimationFrame(r));
        }

        const map = new maplibregl.Map({
          container: mapRef.current,
          // OpenFreeMap "bright" style — free, no key, includes OSM building heights
          style: 'https://tiles.openfreemap.org/styles/bright',
          center: [36.82, -1.29], // Nairobi
          zoom: 10,
          pitch: 45,          // tilt for 3-D view
          bearing: -15,
          canvasContextAttributes: { antialias: true },
          attributionControl: true,
        });

        map.addControl(new maplibregl.NavigationControl(), 'top-left');

        // Popup for hover
        const popup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 10,
        });
        popupRef.current = popup;

        map.on('load', async () => {
          if (cancelled) return;

          // ── Sources ────────────────────────────────────────────────────
          map.addSource('exposure', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });
          map.addSource('hotspots', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });

          // OpenFreeMap planet source for 3-D building extrusions
          map.addSource('openfreemap', {
            type: 'vector',
            url: 'https://tiles.openfreemap.org/planet',
          });

          // Find the first symbol/label layer so we insert buildings below labels
          const styleLayers = map.getStyle().layers;
          let firstLabelLayer;
          for (const layer of styleLayers) {
            if (layer.type === 'symbol' && layer.layout?.['text-field']) {
              firstLabelLayer = layer.id;
              break;
            }
          }

          // ── 3-D buildings ──────────────────────────────────────────────
          map.addLayer(
            {
              id: '3d-buildings',
              source: 'openfreemap',
              'source-layer': 'building',
              type: 'fill-extrusion',
              minzoom: 15,
              filter: ['!=', ['get', 'hide_3d'], true],
              paint: {
                'fill-extrusion-color': [
                  'interpolate', ['linear'], ['get', 'render_height'],
                  0,   '#c8d4e0',
                  20,  '#a8bfcf',
                  60,  '#7fa4bc',
                  200, '#4a7fa5',
                ],
                'fill-extrusion-height': [
                  'interpolate', ['linear'], ['zoom'],
                  15, 0,
                  16, ['get', 'render_height'],
                ],
                'fill-extrusion-base': [
                  'interpolate', ['linear'], ['zoom'],
                  15, 0,
                  16, ['get', 'render_min_height'],
                ],
                'fill-extrusion-opacity': 0.85,
              },
            },
            firstLabelLayer
          );

          // ── Exposure circles ───────────────────────────────────────────
          map.addLayer({
            id: 'exposure-circles',
            type: 'circle',
            source: 'exposure',
            paint: {
              'circle-radius': [
                'interpolate', ['linear'], ['zoom'],
                9, 5,
                14, 10,
              ],
              'circle-color': [
                'match',
                ['get', 'hazard_band'],
                'high', BAND_COLOUR.high,
                'watch', BAND_COLOUR.watch,
                BAND_COLOUR.low,
              ],
              'circle-stroke-width': 1.5,
              'circle-stroke-color': '#fff',
              'circle-opacity': 0.85,
            },
          });

          // Highlight selected location
          map.addLayer({
            id: 'exposure-selected',
            type: 'circle',
            source: 'exposure',
            filter: ['==', ['get', 'loc_id'], ''],
            paint: {
              'circle-radius': [
                'interpolate', ['linear'], ['zoom'],
                9, 9,
                14, 16,
              ],
              'circle-color': [
                'match',
                ['get', 'hazard_band'],
                'high', BAND_COLOUR.high,
                'watch', BAND_COLOUR.watch,
                BAND_COLOUR.low,
              ],
              'circle-stroke-width': 3,
              'circle-stroke-color': '#2457a6',
              'circle-opacity': 1,
            },
          });

          // ── Hotspot diamonds ───────────────────────────────────────────
          map.addLayer({
            id: 'hotspot-circles',
            type: 'circle',
            source: 'hotspots',
            paint: {
              'circle-radius': 7,
              'circle-color': '#6b2d5c',
              'circle-stroke-width': 1.5,
              'circle-stroke-color': '#fff',
              'circle-opacity': 0.9,
            },
          });

          // ── Interactions ───────────────────────────────────────────────
          map.on('click', 'exposure-circles', (e) => {
            const feat = e.features?.[0];
            if (!feat) return;
            const id = feat.properties.loc_id;
            setOpenId(id);
            setCaseOpen(true);
            map.easeTo({ center: e.lngLat, duration: 300 });
          });

          map.on('mouseenter', 'exposure-circles', (e) => {
            map.getCanvas().style.cursor = 'pointer';
            const feat = e.features?.[0];
            if (!feat) return;
            const { loc_id, housing_label, hazard } = feat.properties;
            popup
              .setLngLat(e.lngLat)
              .setHTML(
                `<strong style="color:#17386a">${loc_id}</strong><br/>${housing_label}<br/>Hazard: ${Math.round(hazard * 100)}%`
              )
              .addTo(map);
          });

          map.on('mouseleave', 'exposure-circles', () => {
            map.getCanvas().style.cursor = '';
            popup.remove();
          });

          map.on('mouseenter', 'hotspot-circles', (e) => {
            map.getCanvas().style.cursor = 'pointer';
            const feat = e.features?.[0];
            if (!feat) return;
            popup
              .setLngLat(e.lngLat)
              .setHTML(`<strong style="color:#6b2d5c">${feat.properties.name}</strong><br/>Flood hotspot`)
              .addTo(map);
          });

          map.on('mouseleave', 'hotspot-circles', () => {
            map.getCanvas().style.cursor = '';
            popup.remove();
          });

          setMapReady(true);

          // ── Load data ──────────────────────────────────────────────────
          const [metaData, curve, summary, hotspotData, exposure] = await Promise.all([
            fetchRagJson('/api/nairobi/meta'),
            fetchRagJson('/api/nairobi/loss-curve'),
            fetchRagJson('/api/nairobi/summary'),
            fetchRagJson('/api/nairobi/hotspots'),
            fetchRagJson('/api/nairobi/exposure?tier=moderate'),
          ]);

          if (cancelled) return;

          setMeta(metaData);
          setPortfolioSummary(summary);
          setLossCurve(curve);
          const locs = exposure.locations || [];
          setLocations(locs);
          const region = metaData.region_label || 'Portfolio';
          const peril = metaData.peril_label || 'pluvial book';
          setSummaryText(
            `${summary.location_count} locations · ${kes.format(summary.total_tiv_kes)} TIV · ${region} · ${peril}`
          );

          // Populate sources
          map.getSource('exposure')?.setData(locationsToGeoJSON(locs));
          map.getSource('hotspots')?.setData(hotspotsToGeoJSON(hotspotData.hotspots || []));

          // Fit bounds
          const allCoords = [
            ...locs.map((r) => [r.lon, r.lat]),
            ...(hotspotData.hotspots || []).map((h) => [h.lon, h.lat]),
          ];
          if (allCoords.length) {
            const bounds = allCoords.reduce(
              (b, c) => [
                [Math.min(b[0][0], c[0]), Math.min(b[0][1], c[1])],
                [Math.max(b[1][0], c[0]), Math.max(b[1][1], c[1])],
              ],
              [allCoords[0], allCoords[0]]
            );
            map.fitBounds(bounds, { padding: 40, maxZoom: 13 });
          }

        });

        mapInstance.current = map;
      } catch (err) {
        if (!cancelled) {
          setLoadError(`Could not reach ${ragApiBase()}. Start node rag-server.js — ${err.message}`);
          setSummaryText('API unavailable');
        }
      }
    })();

    return () => {
      cancelled = true;
      popupRef.current?.remove();
      mapInstance.current?.remove();
      mapInstance.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Toggle 3D pitch ──────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !mapReady) return;
    map.easeTo({ pitch: pitch3d ? 45 : 0, bearing: pitch3d ? -15 : 0, duration: 600 });
  }, [pitch3d, mapReady]);

  // ── Highlight selected marker ────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !mapReady) return;
    if (map.getLayer('exposure-selected')) {
      map.setFilter('exposure-selected', ['==', ['get', 'loc_id'], openId || '']);
    }
  }, [openId, mapReady]);

  // ── Fetch detail when openId changes ─────────────────────────────────────
  useEffect(() => {
    if (!openId) { setDetail(null); return; }
    fetchRagJson(`/api/nairobi/exposure/${encodeURIComponent(openId)}`)
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [openId]);

  // ── Reload exposure when tier changes ────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return;
    fetchRagJson(`/api/nairobi/exposure?tier=${encodeURIComponent(activeTier)}`)
      .then((data) => {
        const locs = data.locations || [];
        setLocations(locs);
        updateExposureSource(locs);
      })
      .catch((err) => setLoadError(err.message));
  }, [activeTier, mapReady, updateExposureSource]);

  // ── Pan to selected location from list ───────────────────────────────────
  const panTo = useCallback((row) => {
    const map = mapInstance.current;
    if (!map) return;
    map.easeTo({ center: [row.lon, row.lat], zoom: Math.max(map.getZoom(), 13), duration: 400 });
  }, []);

  const sorted = [...locations].sort((a, b) => b.hazard - a.hazard).slice(0, 120);
  const activeLoss = detail?.tier_losses?.find((t) => t.tier === activeTier);
  const level = activeLoss
    ? activeLoss.hazard >= 0.5 ? 'high' : activeLoss.hazard >= 0.25 ? 'watch' : 'low'
    : 'low';

  const maxEp = Math.max(...(lossCurve?.ep_curve?.map((p) => p.loss_kes) || [1]), 1);
  const hazardRank = openId ? sorted.findIndex((r) => r.loc_id === openId) + 1 : null;
  const bookAvgHazard =
    locations.length > 0 ? locations.reduce((s, r) => s + (r.hazard || 0), 0) / locations.length : 0;
  const openRow = openId ? locations.find((r) => r.loc_id === openId) : null;
  const tierPortfolioLoss = lossCurve?.points?.find((p) => p.tier === activeTier)?.portfolio_loss_kes;

  return (
    <div className="cat-root">
      <header className="topbar">
        <Link className="mark" href="/">
          <span className="mark-ribbon" aria-hidden="true" />
          <span className="mark-name">Kenya Re</span>
          <span className="mark-desk">{meta?.region_label ? `${meta.region_label} flood desk` : 'Flood desk'}</span>
        </Link>
        <p className="topbar-book">{summaryText}</p>
        <span className="synthetic-badge" title={meta?.data_label}>Synthetic data</span>
        <ThemeToggle className="!px-2 !py-1 !text-xs" />
        <SignOutButton className="text-link border-0 bg-transparent p-0 font-inherit cursor-pointer text-inherit" />
      </header>

      <div className="desk">
        <aside className="register">
          <div className="register-head">
            <h1>Flood book</h1>
            <p>
              {portfolioSummary?.location_count
                ? `${portfolioSummary.location_count} illustrative ${meta?.region_label || 'portfolio'} locations`
                : `Loading ${meta?.region_label || 'portfolio'} locations…`}
            </p>
            <label className="tier-label" htmlFor="tier-select">Hazard scenario</label>
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
            <div className="register-table-head">
              <span>Location</span>
              <span>Hazard</span>
              <span>TIV</span>
            </div>
            {sorted.map((row) => (
              <button
                key={row.loc_id}
                type="button"
                className={`risk-row ${openId === row.loc_id ? 'is-open' : ''}`}
                onClick={() => {
                  setOpenId(row.loc_id);
                  setCaseOpen(true);
                  setDossierTab('overview');
                  panTo(row);
                }}
              >
                <div className="risk-primary">
                  <strong>{row.loc_id}</strong>
                  <span className="risk-sub">{row.housing_label}</span>
                </div>
                <span className={`risk-pct ${row.hazard_band}`}>{hazardPct(row.hazard)}</span>
                <span className="risk-money">{kes.format(row.tiv_kes)}</span>
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
            <span><i className="swatch swatch-high" /> High (≥50%)</span>
            <span><i className="swatch swatch-watch" /> Watch</span>
            <span><i className="swatch swatch-low" /> Lower</span>
            <span><i className="swatch swatch-hotspot" /> Hotspot</span>
          </div>
          <button
            className="btn-3d"
            type="button"
            onClick={() => setPitch3d((v) => !v)}
            title="Toggle 3D buildings"
          >
            {pitch3d ? '2D' : '3D'}
          </button>
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
          <section className="dossier dossier-full">
            {!openId || !detail ? (
              <div className="empty">
                <p className="kicker">Selected area</p>
                <h2>Select a location on the map or from the list.</h2>
                <p className="empty-hint">Use ReAgent in the corner for policy and treaty questions.</p>
              </div>
            ) : (
              <>
                <div className="dossier-top">
                  <p className="kicker">{detail.housing_label} · {meta?.region_label || 'Portfolio'}</p>
                  <h2 className="dossier-title">{detail.loc_id}</h2>
                  <p className="policy-no">
                    {detail.lat.toFixed(5)}, {detail.lon.toFixed(5)}
                  </p>
                </div>
                <nav className="dossier-tabs" aria-label="Location detail sections">
                  {[
                    { id: 'overview', label: 'Overview' },
                    { id: 'scenarios', label: 'Scenarios' },
                    { id: 'exposure', label: 'Exposure' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className={dossierTab === tab.id ? 'is-active' : ''}
                      onClick={() => setDossierTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </nav>
                <div className="dossier-body">
                  {dossierTab === 'overview' ? (
                    <>
                      <div className="stat-row">
                        <div>
                          <strong className={level}>{hazardPct(activeLoss?.hazard)}</strong>
                          <span>Susceptibility ({activeTier})</span>
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
                      <dl className="context-grid">
                        <div>
                          <dt>Hazard rank (book)</dt>
                          <dd>{hazardRank ? `#${hazardRank} of ${sorted.length} listed` : '—'}</dd>
                        </div>
                        <div>
                          <dt>Vs book average</dt>
                          <dd>
                            {openRow
                              ? `${((openRow.hazard - bookAvgHazard) * 100).toFixed(0)} pts ${openRow.hazard >= bookAvgHazard ? 'above' : 'below'} avg`
                              : '—'}
                          </dd>
                        </div>
                        <div>
                          <dt>Active scenario</dt>
                          <dd>{meta?.tiers?.find((t) => t.id === activeTier)?.label || activeTier}</dd>
                        </div>
                        <div>
                          <dt>Portfolio loss @ tier</dt>
                          <dd>{tierPortfolioLoss != null ? kes.format(tierPortfolioLoss) : '—'}</dd>
                        </div>
                      </dl>
                    </>
                  ) : null}
                  {dossierTab === 'scenarios' ? (
                    <>
                      <p className="section-label">Loss by return period</p>
                      <table className="tier-table">
                        <thead>
                          <tr><th>Tier</th><th>Hazard</th><th>Damage</th><th>Loss</th></tr>
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
                    </>
                  ) : null}
                  {dossierTab === 'exposure' ? (
                    <>
                      <p className="section-label">Exposure file</p>
                      <dl className="fields">
                        <div><dt>TIV</dt><dd>{kes.format(detail.tiv_kes)}</dd></div>
                        <div><dt>Floor area</dt><dd>{detail.floor_area_m2.toLocaleString('en-KE')} m²</dd></div>
                        <div><dt>Hazard band</dt><dd>{openRow?.hazard_band || level}</dd></div>
                        <div className="wide"><dt>Data source</dt><dd>{detail.source}</dd></div>
                        <div className="wide"><dt>Model note</dt><dd>{meta?.data_label || 'Synthetic proxy'}</dd></div>
                      </dl>
                    </>
                  ) : null}
                </div>
              </>
            )}
          </section>
        </aside>
      </div>
      {loadError ? <p className="load-error">{loadError}</p> : null}
    </div>
  );
}
