'use client';

/**
 * Classic EP orientation (Streamlit Tab 1): loss on X, AEP % on Y.
 */
function eltToAepPoints(elt) {
  return (elt || []).map((r) => ({
    gross_loss_m: r.gross_loss_m,
    aep: r.exceedance_prob,
    tier: r.tier,
  }));
}

export default function CatEpAepChart({ baselineElt, aiElt, useAi = true, currencyCode = 'KES' }) {
  const baseline = eltToAepPoints(baselineElt);
  const ai = eltToAepPoints(aiElt);
  const series = [
    { id: 'baseline', label: 'Baseline (proxy only)', points: baseline, dashed: true, color: '#6b7280' },
    { id: 'ai', label: 'AI rectified (drainage corrected)', points: ai, dashed: false, color: '#d9534f' },
  ].filter((s) => s.points?.length);

  if (!series.length) {
    return <p className="py-6 text-center text-sm text-kenya-muted">CAT EP curve unavailable.</p>;
  }

  const all = series.flatMap((s) => s.points);
  const maxLossM = Math.max(...all.map((p) => p.gross_loss_m || p.loss_kes / 1e6 || 0), 0.1);

  const width = 640;
  const height = 320;
  const pad = { t: 28, r: 24, b: 48, l: 56 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;

  const xForLoss = (m) => pad.l + (m / maxLossM) * innerW;
  const yForAep = (aep) => pad.t + innerH - aep * innerH;

  return (
    <figure className="border border-kenya-line bg-kenya-panel p-4">
      <figcaption className="font-serif text-lg font-semibold text-kenya-navy">Exceedance probability (CAT)</figcaption>
      <p className="mt-1 text-[11px] text-kenya-muted">
        Gross insured loss (M {currencyCode}) vs annual exceedance probability — matches Streamlit portfolio analytics.
        {useAi ? ' Showing AI-rectified as primary table elsewhere.' : ' AI rectifier off in Settings.'}
      </p>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 w-full max-w-3xl">
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <line
            key={g}
            x1={pad.l}
            x2={width - pad.r}
            y1={yForAep(g)}
            y2={yForAep(g)}
            stroke="var(--kenya-line, #d1d5db)"
          />
        ))}
        {series.map((s) => {
          const sorted = [...s.points].sort((a, b) => (a.aep ?? 0) - (b.aep ?? 0));
          const path = sorted
            .map((p, i) => {
              const lossM = p.gross_loss_m ?? (p.loss_kes || 0) / 1e6;
              const aep = p.aep ?? p.exceedance_prob ?? 0;
              return `${i ? 'L' : 'M'}${xForLoss(lossM).toFixed(1)},${yForAep(aep).toFixed(1)}`;
            })
            .join(' ');
          return (
            <g key={s.id}>
              <path
                d={path}
                fill="none"
                stroke={s.color}
                strokeWidth={s.id === 'ai' ? 3 : 2}
                strokeDasharray={s.dashed ? '6 4' : undefined}
              />
            </g>
          );
        })}
        <text x={pad.l + innerW / 2} y={height - 8} textAnchor="middle" className="fill-kenya-ink text-[10px] font-semibold">
          Gross insured loss (million {currencyCode})
        </text>
      </svg>
      <ul className="mt-2 flex flex-wrap gap-4 text-[11px] font-semibold">
        {series.map((s) => (
          <li key={s.id} className="inline-flex items-center gap-2">
            <span className="inline-block h-0.5 w-6" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
    </figure>
  );
}
