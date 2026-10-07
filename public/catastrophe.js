const kes = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  maximumFractionDigits: 0,
});

const pct = new Intl.NumberFormat('en-KE', {
  style: 'percent',
  maximumFractionDigits: 1,
});

function apiBase() {
  const meta = document.querySelector('meta[name="cat-api-base"]');
  const fromQuery = new URLSearchParams(window.location.search).get('api');
  return (fromQuery || meta?.content || 'http://localhost:3001').replace(/\/$/, '');
}

async function fetchJson(path) {
  const res = await fetch(`${apiBase()}${path}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${path} → ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

const listEl = document.getElementById('register-list');
const dossierEl = document.getElementById('dossier');
const threadEl = document.getElementById('thread');
const contextEl = document.getElementById('copilot-context');
const caseEl = document.querySelector('.case');
const summaryEl = document.getElementById('book-summary');
const tierSelect = document.getElementById('tier-select');
const epChart = document.getElementById('ep-chart');
const epKey = document.getElementById('ep-key');
const loadError = document.getElementById('load-error');

let meta = null;
let locations = [];
let hotspots = [];
let lossCurve = null;
let openId = null;
let activeTier = 'moderate';
let detailCache = {};

const map = L.map('map', { zoomControl: true, attributionControl: true });
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap',
  maxZoom: 19,
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);
const hotspotLayer = L.layerGroup().addTo(map);
const markers = {};

window.addEventListener('resize', () => map.invalidateSize());

function hazardPct(score) {
  return `${Math.round((score || 0) * 100)}%`;
}

function renderEpChart(curve) {
  if (!curve?.ep_curve?.length) {
    epChart.innerHTML = '<p class="ep-empty">No loss curve data</p>';
    return;
  }
  const points = curve.ep_curve;
  const maxLoss = Math.max(...points.map((p) => p.loss_kes), 1);
  epChart.innerHTML = points
    .map((p) => {
      const h = Math.max(4, (p.loss_kes / maxLoss) * 100);
      return `<div class="ep-bar" title="1-in-${p.return_period_years} yr · ${kes.format(p.loss_kes)}">
        <b style="height:${h}%"></b>
        <em>1:${p.return_period_years}y</em>
      </div>`;
    })
    .join('');

  const moderate = curve.points?.find((p) => p.tier === activeTier);
  epKey.innerHTML = curve.points
    .map((p) => {
      const active = p.tier === activeTier ? ' is-active' : '';
      return `<div class="ep-key-row${active}"><dt>${p.label}</dt><dd>${kes.format(p.portfolio_loss_kes)}</dd></div>`;
    })
    .join('');

  if (moderate) {
    document.getElementById('ep-note').textContent =
      `Active scenario “${moderate.label}”: ${kes.format(moderate.portfolio_loss_kes)} ground-up (${pct.format(moderate.loss_pct_of_tiv)} of TIV)`;
  }
}

function renderTierOptions() {
  tierSelect.innerHTML = (meta?.tiers || [])
    .map(
      (t) =>
        `<option value="${t.id}"${t.id === activeTier ? ' selected' : ''}>${t.label} (~1-in-${t.return_period_years} yr)</option>`
    )
    .join('');
}

function renderList() {
  const sorted = [...locations].sort((a, b) => b.hazard - a.hazard);
  listEl.innerHTML = sorted
    .slice(0, 120)
    .map(
      (row) => `
    <button type="button" class="risk-row ${openId === row.loc_id ? 'is-open' : ''}" data-id="${row.loc_id}">
      <strong>${row.loc_id}</strong>
      <span class="risk-pct ${row.hazard_band}">${hazardPct(row.hazard)}</span>
      <span>${row.housing_label}</span>
      <span>${kes.format(row.tiv_kes)}</span>
    </button>`
    )
    .join('');
  if (sorted.length > 120) {
    listEl.innerHTML += `<p class="list-more">Showing top 120 by hazard · ${sorted.length} total on map</p>`;
  }
}

function renderDossierEmpty() {
  dossierEl.innerHTML = `
    <div class="empty">
      <p class="kicker">Property file</p>
      <h2>Select a location on the map or in the book.</h2>
      <p>Each row is a synthetic Nairobi exposure point with pluvial susceptibility scores (0–1) and modelled ground-up flood loss.</p>
    </div>`;
  contextEl.textContent = 'No property open.';
}

async function renderDossier() {
  if (!openId) {
    renderDossierEmpty();
    return;
  }

  let detail = detailCache[openId];
  if (!detail) {
    detail = await fetchJson(`/api/nairobi/exposure/${encodeURIComponent(openId)}`);
    detailCache[openId] = detail;
  }

  const active = detail.tier_losses?.find((t) => t.tier === activeTier) || detail.tier_losses?.[0];
  const level = active ? (active.hazard >= 0.5 ? 'high' : active.hazard >= 0.25 ? 'watch' : 'low') : 'low';

  contextEl.textContent = `${detail.loc_id} · ${hazardPct(active?.hazard)} susceptibility (${active?.label || activeTier})`;

  const tierRows = (detail.tier_losses || [])
    .map(
      (t) =>
        `<tr class="${t.tier === activeTier ? 'is-active' : ''}"><td>${t.label}</td><td>${hazardPct(t.hazard)}</td><td>${pct.format(t.damage_ratio)}</td><td>${kes.format(t.loss_kes)}</td></tr>`
    )
    .join('');

  dossierEl.innerHTML = `
    <p class="kicker">${detail.housing_label} · Synthetic exposure</p>
    <h2 class="dossier-title">${detail.loc_id}</h2>
    <p class="policy-no">${detail.lat.toFixed(5)}, ${detail.lon.toFixed(5)}</p>
    <div class="stat-row">
      <div><strong class="${level}">${hazardPct(active?.hazard)}</strong><span>Susceptibility</span></div>
      <div><strong>${pct.format(active?.damage_ratio || 0)}</strong><span>Damage ratio</span></div>
      <div><strong>${kes.format(active?.loss_kes || 0)}</strong><span>Modelled loss</span></div>
    </div>
    <div class="risk-meter" aria-hidden="true"><i class="${level}" style="width:${Math.round((active?.hazard || 0) * 100)}%"></i></div>
    <p class="section-label">Loss by return period</p>
    <table class="tier-table">
      <thead><tr><th>Tier</th><th>Hazard</th><th>Damage</th><th>Loss</th></tr></thead>
      <tbody>${tierRows}</tbody>
    </table>
    <p class="section-label">Exposure file</p>
    <dl class="fields">
      <div><dt>Total insured value</dt><dd>${kes.format(detail.tiv_kes)}</dd></div>
      <div><dt>Floor area</dt><dd>${detail.floor_area_m2.toLocaleString('en-KE')} m²</dd></div>
      <div><dt>Cost / m²</dt><dd>${kes.format(detail.cost_per_m2_kes)}</dd></div>
      <div><dt>Max tier score</dt><dd>${hazardPct(detail.max_hazard)}</dd></div>
      <div class="wide"><dt>Data source</dt><dd>${detail.source || 'Hackathon starter kit (synthetic)'}</dd></div>
    </dl>`;
}

function drawMarkers() {
  markerLayer.clearLayers();
  Object.keys(markers).forEach((k) => delete markers[k]);

  locations.forEach((row) => {
    const icon = L.divIcon({
      className: 'pin-wrap',
      html: `<div class="pin pin-${row.hazard_band}" data-pin="${row.loc_id}"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    const marker = L.marker([row.lat, row.lon], { icon, title: row.loc_id });
    marker.on('click', () => select(row.loc_id));
    marker.addTo(markerLayer);
    markers[row.loc_id] = marker;
  });
}

function drawHotspots() {
  hotspotLayer.clearLayers();
  hotspots.forEach((h) => {
    const icon = L.divIcon({
      className: 'pin-wrap',
      html: '<div class="pin pin-hotspot"></div>',
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });
    L.marker([h.lat, h.lon], { icon, title: h.name })
      .bindTooltip(h.name, { direction: 'top', offset: [0, -6] })
      .addTo(hotspotLayer);
  });
}

function fitMap() {
  const bounds = [];
  locations.forEach((r) => bounds.push([r.lat, r.lon]));
  hotspots.forEach((h) => bounds.push([h.lat, h.lon]));
  if (bounds.length) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 13 });
}

async function select(id) {
  openId = id;
  Object.entries(markers).forEach(([key, marker]) => {
    const pin = marker.getElement()?.querySelector('.pin');
    if (pin) pin.classList.toggle('is-open', key === id);
  });
  renderList();
  await renderDossier();
  caseEl.classList.add('is-open');
  const row = locations.find((item) => item.loc_id === id);
  if (row) map.panTo([row.lat, row.lon]);
}

async function reloadExposure(tier) {
  activeTier = tier;
  const data = await fetchJson(`/api/nairobi/exposure?tier=${encodeURIComponent(tier)}`);
  locations = data.locations || [];
  drawMarkers();
  renderList();
  renderEpChart(lossCurve);
  if (openId) await renderDossier();
}

function push(role, text) {
  const bubble = document.createElement('div');
  bubble.className = `bubble ${role}`;
  bubble.textContent = text;
  threadEl.appendChild(bubble);
  threadEl.scrollTop = threadEl.scrollHeight;
}

function answer(question) {
  const row = locations.find((item) => item.loc_id === openId);
  const detail = detailCache[openId];
  if (!row) return 'Open a location first. Answers use susceptibility scores, TIV, and modelled losses from the Nairobi starter portfolio.';

  const q = question.toLowerCase();
  const active = detail?.tier_losses?.find((t) => t.tier === activeTier);

  if (/hazard|score|suscept|flood|risk|tier|return/.test(q)) {
    if (detail?.tier_losses) {
      const lines = detail.tier_losses.map((t) => `${t.label}: ${hazardPct(t.hazard)} susceptibility, loss ${kes.format(t.loss_kes)}`).join('\n');
      return `${row.loc_id} hazard profile (0–1 proxy, not depth in metres):\n${lines}`;
    }
    return `${row.loc_id} is ${hazardPct(row.hazard)} on the active ${activeTier} scenario (band: ${row.hazard_band}).`;
  }
  if (/loss|damage|ground|financial/.test(q)) {
    return `Active scenario loss for ${row.loc_id}: damage ratio ${pct.format(active?.damage_ratio || row.damage_ratio)}, ground-up loss ${kes.format(active?.loss_kes || row.loss_kes)} on TIV ${kes.format(row.tiv_kes)}.`;
  }
  if (/tiv|value|insured|area|cost|construction|housing|class|build/.test(q)) {
    return `${row.loc_id}: ${row.housing_label}, TIV ${kes.format(row.tiv_kes)}, ${detail?.floor_area_m2 || '—'} m² at ${kes.format(detail?.cost_per_m2_kes || 0)}/m². Data is synthetic.`;
  }
  if (/portfolio|total|curve|ep|accumulation/.test(q)) {
    const pt = lossCurve?.points?.find((p) => p.tier === activeTier);
    return pt
      ? `Portfolio ground-up loss at ${pt.label} (~1-in-${pt.return_period_years} yr): ${kes.format(pt.portfolio_loss_kes)} (${pct.format(pt.loss_pct_of_tiv)} of total TIV). Open the exceedance panel on the map for all tiers.`
      : 'Portfolio loss curve loads from /api/nairobi/loss-curve.';
  }
  return `${row.loc_id}: ${row.housing_label}, susceptibility ${hazardPct(row.hazard)} on ${activeTier}, modelled loss ${kes.format(row.loss_kes)}. Ask about hazard tiers, TIV, or portfolio loss.`;
}

listEl.addEventListener('click', (event) => {
  const button = event.target.closest('.risk-row');
  if (button) select(button.dataset.id);
});

tierSelect.addEventListener('change', () => {
  reloadExposure(tierSelect.value).catch(showError);
});

document.getElementById('composer').addEventListener('submit', (event) => {
  event.preventDefault();
  const field = document.getElementById('ask');
  const question = field.value.trim();
  if (!question) return;
  push('user', question);
  push('desk', answer(question));
  field.value = '';
});

function showError(err) {
  loadError.hidden = false;
  loadError.textContent = `Could not reach the catastrophe API at ${apiBase()}. Start the server with: node rag-server.js — ${err.message}`;
  summaryEl.textContent = 'API unavailable';
}

async function init() {
  try {
    [meta, lossCurve] = await Promise.all([
      fetchJson('/api/nairobi/meta'),
      fetchJson('/api/nairobi/loss-curve'),
    ]);
    const [summary, hotspotData] = await Promise.all([
      fetchJson('/api/nairobi/summary'),
      fetchJson('/api/nairobi/hotspots'),
    ]);
    hotspots = hotspotData.hotspots || [];

    renderTierOptions();
    activeTier = tierSelect.value || 'moderate';

    summaryEl.textContent = `${summary.location_count} locations · ${kes.format(summary.total_tiv_kes)} TIV · Nairobi pluvial book`;
    document.getElementById('synthetic-badge').title = meta.data_label;

    renderEpChart(lossCurve);
    drawHotspots();
    await reloadExposure(activeTier);
    fitMap();

    push('desk', 'Nairobi synthetic portfolio loaded. Pick a tier, open a pin, and ask about susceptibility scores or modelled losses.');
  } catch (err) {
    showError(err);
  }
}

init();
