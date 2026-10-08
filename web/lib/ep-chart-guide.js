/** Copy for EP curve page — what each visualization means and where data comes from. */

export const EP_CHART_IDS = {
  catKpis: 'cat-kpis',
  catAep: 'cat-aep',
  catReturnPeriod: 'cat-rp',
  catElt: 'cat-elt',
  vulnerability: 'vulnerability',
  landscape: 'landscape',
  teamEp: 'team-ep',
  disclosures: 'disclosures',
};

export const EP_CHART_GUIDES = {
  [EP_CHART_IDS.catKpis]: {
    title: '100-year loss summary (KPI cards)',
    short: 'Headline portfolio numbers at the 100-year return period.',
    what:
      'Ground-up loss (GUL), gross loss after policy terms, and net loss after quota share — all at the **100-year** scenario tier (same family as map “Extreme” / long return periods).',
    read:
      'Use these three numbers in pitch or pricing conversations. GUL is physical damage before deductibles; gross is what hits the cedant layer; net is what Kenya Re retains after treaty quota share (see Settings).',
    source: 'Python CAT `/simulate` on the **active workspace exposure CSV**, with deductible & QS from Settings.',
    notSame:
      'Not the hazard landscape index on the map — those are TIV × hazard weights, not modelled financial loss.',
  },
  [EP_CHART_IDS.catAep]: {
    title: 'Exceedance probability (AEP) — CAT',
    short: 'Classic actuarial view: how often losses exceed each level.',
    what:
      '**X-axis:** gross insured loss (millions). **Y-axis:** annual exceedance probability (AEP) — higher on the chart means **more frequent** events.',
    read:
      'Read left-to-right as “larger losses”. The curve shows how probable each loss level is in a given year. Compare dashed **baseline** (hazard proxy only) vs solid **AI rectified** (drainage hotspot penalty) to see model uplift.',
    source: 'Event loss table (ELT) from Linus engine, converted to AEP points.',
    notSame:
      'Differs from the “loss by return period” chart below — that one fixes return periods (2–100 yr tiers) on the X-axis instead of AEP.',
  },
  [EP_CHART_IDS.catReturnPeriod]: {
    title: 'Portfolio loss by return period (CAT)',
    short: 'Loss at each map scenario tier (2–100 year).',
    what:
      '**X-axis:** return period labels (1:2y … 1:100y) aligned with **map flood tiers**. **Y-axis:** modelled gross loss in workspace currency.',
    read:
      'Hover points for AEP and exact loss. Steeper drop means more concentration at frequent tiers. Toggle series in the legend (when two lines) to compare baseline vs AI rectified.',
    source: 'CAT engine EP points derived from portfolio simulation on uploaded exposure.',
    notSame:
      'Not interchangeable with team-uploaded EP CSV — that block is labelled separately below.',
  },
  [EP_CHART_IDS.catElt]: {
    title: 'Event loss table (ELT)',
    short: 'Tier-by-tier numeric output behind the charts.',
    what:
      'Each row is a **scenario tier** (common → extreme) with exceedance probability, gross/net loss, and optional model metadata.',
    read:
      'Use this when you need exact figures for slides or to reconcile with Streamlit Tab 1. Respects AI rectifier on/off from Settings.',
    source: 'Same CAT simulation as the charts — tabular export of `elt` / `elt_ai`.',
    notSame: 'Raw table — charts above are views of this data.',
  },
  [EP_CHART_IDS.vulnerability]: {
    title: 'Vulnerability damage matrix',
    short: 'How much damage to expect for each housing type at a given hazard severity.',
    what:
      '**X-axis:** hazard severity (0–1). **Y-axis:** damage ratio (0–100% of TIV). One line per **housing class** in the matrix CSV.',
    read:
      'Steeper curves mean more fragile construction. Map location dossiers interpolate these curves for underwriting scenarios.',
    source: 'Bundled Nairobi matrix or workspace `vulnerability_matrix.csv` override.',
    notSame: 'Does not include financial treaty terms — CAT simulation applies this to TIV separately.',
  },
  [EP_CHART_IDS.landscape]: {
    title: 'Hazard landscape (exposure CSV)',
    short: 'Spatial exposure index — not financial EP.',
    what:
      'Sum of **TIV × hazard** at each tier across all locations in the uploaded CSV. Shows how the **book’s hazard footprint** shifts by scenario.',
    read:
      'Use to explain accumulation and tier switching on the map. Values change when you upload a new exposure file or change region.',
    source: 'Node `/api/nairobi/loss-curve` computed index from CSV hazard columns.',
    notSame: '**Not** CAT gross/net loss — do not quote these numbers as insured loss.',
  },
  [EP_CHART_IDS.teamEp]: {
    title: 'Optional team EP CSV',
    short: 'External model team exceedance curve overlaid for comparison.',
    what:
      'Your uploaded `return_period_years` + `loss_kes` (optional net, p05/p95). Switch **gross / net / uncertainty** when those columns exist.',
    read:
      'Hover for point detail. Uncertainty view shades p5–p95 when provided. Compare mentally to CAT block above — same return periods should be directionally consistent.',
    source: 'Workspace `ep_model.csv` via upload component on this page.',
    notSame: 'Independent from live Python CAT unless your model uses the same `model-input` export.',
  },
  [EP_CHART_IDS.disclosures]: {
    title: 'Model assumptions & disclosures',
    short: 'Limitations, data lineage, and engine notes.',
    what: 'Text pulled from CAT `/disclosures` and product copy for hackathon transparency.',
    read: 'Read before citing numbers externally — includes proxy hazard and AI rectifier scope.',
    source: 'Python CAT + static product disclosures.',
    notSame: null,
  },
};

export function listAvailableGuides({ hasCat, hasLandscape, hasExternal, hasVulnerability }) {
  const ids = [];
  if (hasCat) {
    ids.push(EP_CHART_IDS.catKpis, EP_CHART_IDS.catAep, EP_CHART_IDS.catReturnPeriod, EP_CHART_IDS.catElt);
  }
  if (hasVulnerability) ids.push(EP_CHART_IDS.vulnerability);
  if (hasLandscape) ids.push(EP_CHART_IDS.landscape);
  if (hasExternal) ids.push(EP_CHART_IDS.teamEp);
  ids.push(EP_CHART_IDS.disclosures);
  return ids;
}

/** @param {string} text markdown-lite **bold** */
export function renderGuideText(text) {
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-[#0f2d52] dark:text-[#e8eaed]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}
