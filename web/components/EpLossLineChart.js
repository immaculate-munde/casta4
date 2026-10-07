'use client';

/**
 * Discrete EP-style line: portfolio loss at each return period (left = frequent, right = rare).
 */
export default function EpLossLineChart({ epCurve, maxLoss, activeReturnPeriodYears, formatLoss }) {
  const pts = epCurve ?? [];
  if (!pts.length) {
    return <p className="py-6 text-center text-[11px] text-kenya-muted">No curve data</p>;
  }

  const width = 296;
  const height = 100;
  const pad = { t: 8, r: 8, b: 24, l: 8 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const maxY = Math.max(maxLoss, 1);

  const nodes = pts.map((p, i) => {
    const x = pad.l + (pts.length <= 1 ? innerW / 2 : (i / (pts.length - 1)) * innerW);
    const y = pad.t + innerH - (p.loss_kes / maxY) * innerH;
    return { x, y, ...p };
  });

  const linePath = nodes.map((n, i) => `${i ? 'L' : 'M'}${n.x.toFixed(1)},${n.y.toFixed(1)}`).join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full border-b border-kenya-line text-kenya-blue"
      role="img"
      aria-label="Portfolio ground-up loss by return period"
    >
      <path d={linePath} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {nodes.map((n) => {
        const active = n.return_period_years === activeReturnPeriodYears;
        return (
          <g key={n.return_period_years}>
            <circle
              cx={n.x}
              cy={n.y}
              r={active ? 5 : 3.5}
              className={active ? 'fill-kenya-coral stroke-kenya-panel stroke-[2]' : 'fill-kenya-blue'}
            />
            <title>{`1-in-${n.return_period_years} yr · ${formatLoss(n.loss_kes)}`}</title>
            <text
              x={n.x}
              y={height - 6}
              textAnchor="middle"
              className="fill-kenya-muted text-[8px] font-medium"
              style={{ fontFamily: 'var(--font-sans, Public Sans, sans-serif)' }}
            >
              {`1:${n.return_period_years}y`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
