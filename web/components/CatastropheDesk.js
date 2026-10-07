'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import SignOutButton from '@/components/SignOutButton';
import ThemeToggle from '@/components/ThemeToggle';
import { useChatDrawer } from '@/components/ChatDrawerProvider';
import { fetchRagJson, ragApiBase } from '@/lib/api';

const hazardPctClass = {
  high: 'text-kenya-coral',
  watch: 'text-kenya-watch',
  low: 'text-kenya-navy',
};

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
        cedant_name: row.cedant_name || '',
        cedant_id: row.cedant_id || '',
        kenya_re_in_book: row.kenya_re_in_book ? 1 : 0,
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
  const [bookOnly, setBookOnly] = useState(false);
  const { setPropertyContext, openChat } = useChatDrawer();

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
              'circle-stroke-width': [
                'case',
                ['==', ['get', 'kenya_re_in_book'], 1],
                3,
                1.5,
              ],
              'circle-stroke-color': [
                'case',
                ['==', ['get', 'kenya_re_in_book'], 1],
                '#c93434',
                '#ffffff',
              ],
              'circle-opacity': 0.88,
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
            const { loc_id, housing_label, hazard, cedant_name, kenya_re_in_book } = feat.properties;
            const bookLabel =
              kenya_re_in_book === 1 || kenya_re_in_book === true
                ? '<span style="color:#c93434;font-weight:700">Kenya Re treaty book</span>'
                : '<span style="color:#666">Not in Kenya Re book</span>';
            popup
              .setLngLat(e.lngLat)
              .setHTML(
                `<strong style="color:#17386a">${loc_id}</strong><br/>${housing_label}<br/>Cedant: ${cedant_name || '—'}<br/>${bookLabel}<br/>Hazard: ${Math.round(hazard * 100)}%`
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

  useEffect(() => {
    if (!openId || !detail) {
      setPropertyContext(null);
      return;
    }
    const row = locations.find((r) => r.loc_id === openId);
    const tierRow = detail.tier_losses?.find((t) => t.tier === activeTier);
    setPropertyContext({
      loc_id: detail.loc_id,
      cedant_id: detail.cedant_id,
      cedant_name: detail.cedant_name,
      kenya_re_in_book: Boolean(detail.kenya_re_in_book),
      housing_class: detail.housing_class,
      housing_label: detail.housing_label,
      tiv_kes: detail.tiv_kes,
      lat: detail.lat,
      lon: detail.lon,
      active_tier: activeTier,
      hazard: tierRow?.hazard ?? row?.hazard,
      loss_kes: tierRow?.loss_kes ?? row?.loss_kes,
    });
    return () => setPropertyContext(null);
  }, [openId, detail, activeTier, locations, setPropertyContext]);

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

  const sortedAll = [...locations].sort((a, b) => b.hazard - a.hazard);
  const sorted = (bookOnly ? sortedAll.filter((r) => r.kenya_re_in_book) : sortedAll).slice(0, 120);
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

  const bookBadge =
    'mt-1 inline-block w-fit border px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide';
  const bookBadgeIn = `${bookBadge} border-kenya-coral/40 bg-[#fdeaea] text-kenya-coral dark:bg-[#3d2020] dark:text-[#f07167]`;
  const bookBadgeOut = `${bookBadge} border-kenya-line bg-kenya-surface text-kenya-muted dark:bg-[#25282c]`;

  return (
    <div className="flex h-[100dvh] flex-col bg-kenya-surface font-sans text-sm text-kenya-ink">
      <header className="sticky top-0 z-50 flex shrink-0 items-center gap-3 border-t-4 border-kenya-coral border-b border-kenya-line bg-kenya-panel px-3 py-2 sm:h-14 sm:px-4">
        <Link
          href="/"
          className="flex min-w-0 shrink-0 items-center gap-2.5 text-kenya-navy no-underline"
        >
          <span className="inline-block h-[22px] w-2.5 shrink-0 bg-kenya-coral" aria-hidden="true" />
          <span className="truncate font-serif text-lg font-semibold sm:text-[22px]">Kenya Re</span>
          <span className="truncate text-xs text-kenya-muted sm:text-[13px]">
            {meta?.region_label ? `${meta.region_label} flood desk` : 'Flood desk'}
          </span>
        </Link>

        <p
          className="hidden min-w-0 flex-1 truncate text-[13px] font-medium text-kenya-ink/90 md:block"
          title={summaryText}
        >
          {summaryText}
        </p>

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <SignOutButton className="text-xs font-semibold text-kenya-blue hover:underline disabled:opacity-60 dark:text-[#8ab4f8]" />
        </div>
      </header>

      <p className="truncate border-b border-kenya-line bg-kenya-panel px-3 py-1.5 text-xs font-medium text-kenya-muted md:hidden" title={summaryText}>
        {summaryText}
      </p>

      {caseOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-[550] bg-black/40 lg:hidden"
          aria-label="Close location panel"
          onClick={() => setCaseOpen(false)}
        />
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(280px,1fr)] sm:grid-cols-[minmax(200px,38%)_minmax(0,1fr)] sm:grid-rows-1 lg:grid-cols-[250px_minmax(0,1fr)_minmax(300px,360px)]">
        <aside className="flex max-h-[38vh] min-h-0 flex-col border-kenya-line bg-kenya-panel sm:max-h-none sm:border-r">
          <div className="shrink-0 border-b border-kenya-line px-4 py-4">
            <h1 className="m-0 font-serif text-[22px] font-semibold text-kenya-navy">Flood book</h1>
            <p className="mt-1.5 text-kenya-muted">
              {portfolioSummary?.location_count
                ? `${portfolioSummary.location_count} illustrative ${meta?.region_label || 'portfolio'} locations`
                : `Loading ${meta?.region_label || 'portfolio'} locations…`}
            </p>
            <label className="mt-3 block text-[11px] font-bold uppercase text-kenya-navy" htmlFor="tier-select">
              Hazard scenario
            </label>
            <select
              id="tier-select"
              className="mt-1 w-full border border-kenya-line bg-kenya-panel px-2 py-2 text-sm"
              value={activeTier}
              onChange={(e) => setActiveTier(e.target.value)}
            >
              {(meta?.tiers || [{ id: 'moderate', label: 'Moderate', return_period_years: 25 }]).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} (~1-in-{t.return_period_years} yr)
                </option>
              ))}
            </select>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs font-semibold text-kenya-ink">
              <input
                type="checkbox"
                checked={bookOnly}
                onChange={(e) => setBookOnly(e.target.checked)}
              />
              Kenya Re treaty book only
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-auto pb-2">
            <div className="sticky top-0 z-[2] grid grid-cols-[1fr_52px_76px] gap-2 border-b border-kenya-line bg-[#e8ecf2] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-kenya-ink dark:bg-[#25282c] dark:text-kenya-ink">
              <span>Location</span>
              <span className="text-right">Hazard</span>
              <span className="text-right">TIV</span>
            </div>
            {sorted.map((row) => (
              <button
                key={row.loc_id}
                type="button"
                className={`grid w-full cursor-pointer grid-cols-[1fr_52px_76px] gap-x-2 gap-y-0.5 border-b border-l-[3px] border-kenya-line px-3 py-2.5 text-left transition-colors hover:bg-kenya-surface ${
                  openId === row.loc_id
                    ? 'border-l-kenya-blue bg-[#f3f6fb] dark:bg-[#25282c]'
                    : 'border-l-transparent bg-transparent'
                }`}
                onClick={() => {
                  setOpenId(row.loc_id);
                  setCaseOpen(true);
                  setDossierTab('overview');
                  panTo(row);
                }}
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <strong className="text-[13px] font-semibold text-kenya-navy">{row.loc_id}</strong>
                  <span className="truncate text-[11px] text-kenya-muted">{row.cedant_name || row.cedant_id}</span>
                  <span className="truncate text-[11px] text-kenya-muted">{row.housing_label}</span>
                  {row.kenya_re_in_book ? (
                    <span className={bookBadgeIn}>Kenya Re book</span>
                  ) : (
                    <span className={bookBadgeOut}>Modeled only</span>
                  )}
                </div>
                <span className={`text-right text-xs font-bold ${hazardPctClass[row.hazard_band] || hazardPctClass.low}`}>
                  {hazardPct(row.hazard)}
                </span>
                <span className="text-right text-[11px] tabular-nums text-kenya-muted">{kes.format(row.tiv_kes)}</span>
              </button>
            ))}
            {locations.length > 120 ? (
              <p className="px-3 py-2 text-xs text-kenya-muted">Top 120 by hazard · {locations.length} on map</p>
            ) : null}
          </div>
        </aside>

        <main className="relative min-h-[280px] min-w-0 bg-[#d9dee6] dark:bg-[#2a2d32]">
          <div ref={mapRef} className="h-full min-h-[280px] w-full sm:min-h-[400px]" />
          <div className="absolute bottom-3 left-3 z-[500] flex max-w-[calc(100%-1.5rem)] flex-wrap gap-x-3 gap-y-1 border border-kenya-line bg-kenya-panel px-3 py-2 text-[11px] font-medium sm:text-xs">
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-2.5 bg-kenya-coral" aria-hidden /> High (≥50%)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-2.5 bg-kenya-watch" aria-hidden /> Watch
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-2.5 bg-[#17386a] dark:bg-kenya-navy" aria-hidden /> Lower
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-2.5 border border-white bg-[#6b2d5c]" aria-hidden /> Hotspot
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-2.5 rounded-full border-2 border-kenya-coral bg-transparent" aria-hidden /> Treaty book (ring)
            </span>
          </div>
          <button
            className="absolute bottom-14 left-3 z-[500] border border-kenya-line bg-kenya-panel px-3 py-1.5 text-xs font-bold tracking-wide text-kenya-navy hover:bg-kenya-surface sm:bottom-12"
            type="button"
            onClick={() => setPitch3d((v) => !v)}
            title="Toggle 3D buildings"
          >
            {pitch3d ? '2D' : '3D'}
          </button>
          <section className="absolute right-3 top-3 z-[500] w-[min(320px,calc(100%-1.5rem))] border border-kenya-line bg-kenya-panel p-3 max-sm:hidden sm:block">
            <h3 className="m-0 font-serif text-base font-semibold text-kenya-navy">Exceedance curve</h3>
            <p className="mt-1 text-[11px] font-medium text-kenya-ink/90">
              {epNote
                ? `${epNote.label}: ${kes.format(epNote.portfolio_loss_kes)} (${pct.format(epNote.loss_pct_of_tiv)} of TIV)`
                : 'Portfolio ground-up loss by tier'}
            </p>
            <div className="grid h-[88px] grid-cols-5 items-end gap-1.5 border-b border-kenya-line">
              {(lossCurve?.ep_curve || []).map((p) => (
                <div key={p.return_period_years} className="flex h-full flex-col items-center justify-end gap-1" title={kes.format(p.loss_kes)}>
                  <b
                    className="block min-h-[2px] w-full bg-kenya-blue"
                    style={{ height: `${Math.max(4, (p.loss_kes / maxEp) * 100)}%` }}
                  />
                  <em className="text-[9px] not-italic text-kenya-muted">1:{p.return_period_years}y</em>
                </div>
              ))}
            </div>
            <dl className="mt-2 grid gap-1">
              {(lossCurve?.points || []).map((p) => (
                <div key={p.tier} className="flex justify-between text-[11px]">
                  <dt className={p.tier === activeTier ? 'font-bold text-kenya-navy' : 'text-kenya-muted'}>{p.label}</dt>
                  <dd className="m-0 font-semibold text-kenya-navy">{kes.format(p.portfolio_loss_kes)}</dd>
                </div>
              ))}
            </dl>
          </section>
        </main>

        <aside
          className={`fixed inset-y-0 right-0 z-[600] flex w-full max-w-md flex-col border-l border-kenya-line bg-kenya-panel shadow-xl transition-transform duration-200 max-lg:top-14 lg:static lg:max-w-none lg:shadow-none lg:transition-none ${
            caseOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
          }`}
        >
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {!openId || !detail ? (
              <div className="px-4 py-6">
                <p className="m-0 text-[11px] font-bold uppercase text-kenya-muted">Selected area</p>
                <h2 className="mt-1 font-serif text-xl font-semibold text-kenya-navy sm:text-2xl">
                  Select a location on the map or from the list.
                </h2>
                <p className="mt-3 text-[13px] font-semibold text-[#153a6e] dark:text-kenya-blue">
                  Use ReAgent in the corner for policy and treaty questions.
                </p>
              </div>
            ) : (
              <>
                <div className="relative shrink-0 px-4 pt-4">
                  <button
                    type="button"
                    className="absolute right-3 top-3 rounded border border-kenya-line px-2 py-1 text-xs font-semibold text-kenya-muted hover:bg-kenya-surface lg:hidden"
                    onClick={() => setCaseOpen(false)}
                  >
                    Close
                  </button>
                  <p className="m-0 pr-16 text-[11px] font-bold uppercase text-kenya-muted lg:pr-0">
                    {detail.housing_label} · {meta?.region_label || 'Portfolio'}
                  </p>
                  <h2 className="mt-1 font-serif text-2xl font-semibold text-kenya-navy sm:text-[28px]">{detail.loc_id}</h2>
                  <p className="mt-1 text-kenya-muted">
                    Cedant: <strong className="text-kenya-ink">{detail.cedant_name}</strong> ({detail.cedant_id})
                  </p>
                  <p className="mt-1">
                    {detail.kenya_re_in_book ? (
                      <span className={`${bookBadgeIn} text-[10px] px-2 py-1`}>In Kenya Re reinsurance book</span>
                    ) : (
                      <span className={`${bookBadgeOut} text-[10px] px-2 py-1`}>Not in Kenya Re book (modeled)</span>
                    )}
                  </p>
                  <p className="mt-2 text-kenya-muted">
                    {detail.lat.toFixed(5)}, {detail.lon.toFixed(5)}
                  </p>
                  <button
                    type="button"
                    className="mt-3 w-full cursor-pointer border-0 bg-kenya-blue px-3 py-2 text-xs font-bold text-white hover:bg-[#153a6e] sm:w-auto dark:bg-[#669df6] dark:text-[#0f1114] dark:hover:bg-[#8ab4f8]"
                    onClick={openChat}
                  >
                    Ask ReAgent about this property →
                  </button>
                </div>
                <nav className="mt-3 flex shrink-0 gap-0 border-b border-kenya-line px-4" aria-label="Location detail sections">
                  {[
                    { id: 'overview', label: 'Overview' },
                    { id: 'scenarios', label: 'Scenarios' },
                    { id: 'exposure', label: 'Exposure' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className={`-mb-px cursor-pointer border-0 border-b-2 bg-transparent px-3.5 py-2.5 text-xs font-semibold ${
                        dossierTab === tab.id
                          ? 'border-kenya-blue bg-[#f0f4fa] text-kenya-navy dark:bg-[#25282c]'
                          : 'border-transparent text-kenya-muted hover:text-kenya-ink'
                      }`}
                      onClick={() => setDossierTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </nav>
                <div className="min-h-0 flex-1 overflow-auto p-4">
                  {dossierTab === 'overview' ? (
                    <>
                      <div className="grid grid-cols-3 border-y border-kenya-line py-3">
                        <div className="px-1 text-center sm:px-2">
                          <strong className={`block text-lg ${level === 'high' ? 'text-kenya-coral' : level === 'watch' ? 'text-kenya-watch' : 'text-kenya-navy'}`}>
                            {hazardPct(activeLoss?.hazard)}
                          </strong>
                          <span className="text-[11px] uppercase text-kenya-muted">Susceptibility ({activeTier})</span>
                        </div>
                        <div className="px-1 text-center sm:px-2">
                          <strong className="block text-lg text-kenya-navy">{pct.format(activeLoss?.damage_ratio || 0)}</strong>
                          <span className="text-[11px] uppercase text-kenya-muted">Damage ratio</span>
                        </div>
                        <div className="px-1 text-center sm:px-2">
                          <strong className="block text-lg text-kenya-navy">{kes.format(activeLoss?.loss_kes || 0)}</strong>
                          <span className="text-[11px] uppercase text-kenya-muted">Modelled loss</span>
                        </div>
                      </div>
                      <div className="my-3.5 h-1.5 bg-[#c8ced8] dark:bg-[#3c4043]">
                        <i
                          className={`block h-full ${level === 'high' ? 'bg-kenya-coral' : level === 'watch' ? 'bg-kenya-watch' : 'bg-[#17386a] dark:bg-kenya-blue'}`}
                          style={{ width: `${Math.round((activeLoss?.hazard || 0) * 100)}%` }}
                        />
                      </div>
                      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <dt className="text-[10px] font-bold uppercase text-kenya-muted">Hazard rank (book)</dt>
                          <dd className="mt-1 text-[13px] font-semibold text-kenya-navy">{hazardRank ? `#${hazardRank} of ${sorted.length} listed` : '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] font-bold uppercase text-kenya-muted">Vs book average</dt>
                          <dd className="mt-1 text-[13px] font-semibold text-kenya-navy">
                            {openRow
                              ? `${((openRow.hazard - bookAvgHazard) * 100).toFixed(0)} pts ${openRow.hazard >= bookAvgHazard ? 'above' : 'below'} avg`
                              : '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] font-bold uppercase text-kenya-muted">Active scenario</dt>
                          <dd className="mt-1 text-[13px] font-semibold text-kenya-navy">{meta?.tiers?.find((t) => t.id === activeTier)?.label || activeTier}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] font-bold uppercase text-kenya-muted">Portfolio loss @ tier</dt>
                          <dd className="mt-1 text-[13px] font-semibold text-kenya-navy">{tierPortfolioLoss != null ? kes.format(tierPortfolioLoss) : '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] font-bold uppercase text-kenya-muted">Cedant</dt>
                          <dd className="mt-1 text-[13px] font-semibold text-kenya-navy">{detail.cedant_name}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] font-bold uppercase text-kenya-muted">Kenya Re book</dt>
                          <dd className="mt-1 text-[13px] font-semibold text-kenya-navy">{detail.kenya_re_in_book ? 'Yes — reinsured' : 'No'}</dd>
                        </div>
                      </dl>
                    </>
                  ) : null}
                  {dossierTab === 'scenarios' ? (
                    <>
                      <p className="mb-2 mt-4 text-xs font-bold uppercase text-kenya-navy">Loss by return period</p>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[280px] border-collapse text-xs">
                          <thead>
                            <tr>
                              <th className="border-b border-kenya-line py-1.5 text-left">Tier</th>
                              <th className="border-b border-kenya-line py-1.5 text-left">Hazard</th>
                              <th className="border-b border-kenya-line py-1.5 text-left">Damage</th>
                              <th className="border-b border-kenya-line py-1.5 text-left">Loss</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(detail.tier_losses || []).map((t) => (
                              <tr key={t.tier} className={t.tier === activeTier ? 'bg-[#f3f6fb] dark:bg-[#25282c]' : ''}>
                                <td className="border-b border-kenya-line py-1.5">{t.label}</td>
                                <td className="border-b border-kenya-line py-1.5">{hazardPct(t.hazard)}</td>
                                <td className="border-b border-kenya-line py-1.5">{pct.format(t.damage_ratio)}</td>
                                <td className="border-b border-kenya-line py-1.5">{kes.format(t.loss_kes)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : null}
                  {dossierTab === 'exposure' ? (
                    <>
                      <p className="mb-2 mt-4 text-xs font-bold uppercase text-kenya-navy">Exposure file</p>
                      <dl className="grid grid-cols-1 border-t border-kenya-line sm:grid-cols-2">
                        <div className="border-b border-kenya-line py-2 pr-2">
                          <dt className="text-[11px] text-kenya-muted">TIV</dt>
                          <dd className="mt-0.5 font-semibold text-kenya-navy">{kes.format(detail.tiv_kes)}</dd>
                        </div>
                        <div className="border-b border-kenya-line py-2 pr-2">
                          <dt className="text-[11px] text-kenya-muted">Floor area</dt>
                          <dd className="mt-0.5 font-semibold text-kenya-navy">{detail.floor_area_m2.toLocaleString('en-KE')} m²</dd>
                        </div>
                        <div className="border-b border-kenya-line py-2 pr-2">
                          <dt className="text-[11px] text-kenya-muted">Hazard band</dt>
                          <dd className="mt-0.5 font-semibold text-kenya-navy">{openRow?.hazard_band || level}</dd>
                        </div>
                        <div className="border-b border-kenya-line py-2 pr-2">
                          <dt className="text-[11px] text-kenya-muted">Cedant ID</dt>
                          <dd className="mt-0.5 font-semibold text-kenya-navy">{detail.cedant_id}</dd>
                        </div>
                        <div className="border-b border-kenya-line py-2 pr-2">
                          <dt className="text-[11px] text-kenya-muted">Reinsured</dt>
                          <dd className="mt-0.5 font-semibold text-kenya-navy">{detail.kenya_re_in_book ? 'Yes' : 'No'}</dd>
                        </div>
                        <div className="col-span-full border-b border-kenya-line py-2">
                          <dt className="text-[11px] text-kenya-muted">Data source</dt>
                          <dd className="mt-0.5 font-semibold text-kenya-navy">{detail.source}</dd>
                        </div>
                        <div className="col-span-full border-b border-kenya-line py-2">
                          <dt className="text-[11px] text-kenya-muted">Model note</dt>
                          <dd className="mt-0.5 font-semibold text-kenya-navy">{meta?.data_label || 'Synthetic proxy'}</dd>
                        </div>
                      </dl>
                    </>
                  ) : null}
                </div>
              </>
            )}
          </section>
        </aside>
      </div>
      {loadError ? (
        <p className="shrink-0 bg-[#fdeaea] px-4 py-2.5 text-[#8a1f1f] dark:bg-[#3d2020] dark:text-[#f8d7d7]">{loadError}</p>
      ) : null}
    </div>
  );
}
