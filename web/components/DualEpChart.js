'use client';

import { useMemo, useState } from 'react';

const COLORS = {
  raw: '#2563eb',
  rectified: '#e24b4f',
  net: '#3d8c55',
  external: '#6b2d5c',
  external_net: '#8b5a7a',
};

function pctAep(aep) {
  if (aep == null || !Number.isFinite(aep)) return '—';
  return `${(aep * 100).toFixed(2)}%`;
}

export default function DualEpChart({
  series,
  formatLoss,
  title = 'Exceedance probability curve',
  uncertaintyBand = null,
  subtitle,
  singleSeries = false,
  onFocus,
}) {
  const [hover, setHover] = useState(null);
  const [hiddenSeries, setHiddenSeries] = useState(() => new Set());

  const toggleSeries = (id) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const rawDisplay = singleSeries && series?.length ? [series[0]] : series || [];
  const displaySeries = rawDisplay.filter((s) => !hiddenSeries.has(s.id));
  const allPts = displaySeries.flatMap((s) => s.points || []);
  const bandPts = uncertaintyBand || [];

  const maxLoss = useMemo(() => {
    const vals = [
      ...allPts.map((p) => p.loss_kes),
      ...bandPts.map((p) => p.p95_kes).filter(Boolean),
    ];
    return Math.max(...vals, 1);
  }, [allPts, bandPts]);

  if (!allPts.length) {
    const msg =
      rawDisplay.length && hiddenSeries.size >= rawDisplay.length
        ? 'All series hidden — click a legend button above to show a line.'
        : 'Load portfolio data or upload a team EP CSV.';
    return <p className="py-8 text-center text-sm text-kenya-muted">{msg}</p>;
  }

  const width = 640;
  const height = 300;
  const pad = { t: 24, r: 24, b: 44, l: 56 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const n = (displaySeries[0]?.points || []).length;

  const xForIndex = (i) => pad.l + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yForLoss = (loss) => pad.t + innerH - (loss / maxLoss) * innerH;

  const bandPath =
    bandPts.length >= 2
      ? (() => {
          const top = bandPts.map((p, i) => `${i ? 'L' : 'M'}${xForIndex(i).toFixed(1)},${yForLoss(p.p95_kes).toFixed(1)}`).join(' ');
          const bottom = [...bandPts]
            .reverse()
            .map((p, i) => {
              const idx = bandPts.length - 1 - i;
              return `L${xForIndex(idx).toFixed(1)},${yForLoss(p.p05_kes).toFixed(1)}`;
            })
            .join(' ');
          return `${top} ${bottom} Z`;
        })()
      : null;

  function pointTooltip(p, seriesLabel, extra = {}) {
    return {
      returnPeriod: p.return_period_years,
      aep: p.aep,
      loss: p.loss_kes,
      label: seriesLabel,
      ...extra,
    };
  }

  return (
    <figure
      className="relative border border-kenya-line bg-kenya-panel p-4"
      onMouseEnter={() => onFocus?.()}
      onFocus={() => onFocus?.()}
    >
      <figcaption className="font-serif text-lg font-semibold text-kenya-navy">{title}</figcaption>
      <p className="mt-1 text-[11px] text-kenya-muted">
        {subtitle || 'Hover points for return period, AEP, and loss. Upload team CSV to replace the primary model line.'}
      </p>

      {hover ? (
        <div
          className="pointer-events-none absolute right-4 top-16 z-10 max-w-[240px] border border-kenya-line bg-kenya-panel/95 px-3 py-2 text-[11px] shadow-md backdrop-blur-sm"
          role="status"
        >
          <p className="font-bold text-kenya-navy">{hover.label}</p>
          <p className="mt-1 text-kenya-ink">
            1-in-{hover.returnPeriod} yr · AEP {pctAep(hover.aep)}
          </p>
          <p className="mt-0.5 font-semibold tabular-nums text-kenya-navy">{formatLoss(hover.loss)}</p>
          {hover.p05 != null && hover.p95 != null ? (
            <p className="mt-1 text-kenya-muted">
              Band {formatLoss(hover.p05)} – {formatLoss(hover.p95)}
            </p>
          ) : null}
          {hover.net != null ? (
            <p className="mt-0.5 text-kenya-muted">Net {formatLoss(hover.net)}</p>
          ) : null}
        </div>
      ) : null}

      <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 w-full max-w-3xl" role="img">
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <line
            key={g}
            x1={pad.l}
            x2={width - pad.r}
            y1={yForLoss(maxLoss * g)}
            y2={yForLoss(maxLoss * g)}
            stroke="var(--kenya-line, #d1d5db)"
          />
        ))}
        {bandPath ? <path d={bandPath} fill="#6b2d5c" fillOpacity="0.12" stroke="none" /> : null}
        {displaySeries.map((s) => {
          const pts = s.points || [];
          const color = COLORS[s.id] || '#17386a';
          const path = pts
            .map((p, i) => `${i ? 'L' : 'M'}${xForIndex(i).toFixed(1)},${yForLoss(p.loss_kes).toFixed(1)}`)
            .join(' ');
          return (
            <g key={s.id}>
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={s.id === 'external' ? 3 : 2.5}
                strokeDasharray={s.dashed ? '6 4' : undefined}
              />
              {pts.map((p, i) => {
                const band = bandPts[i];
                return (
                  <circle
                    key={`${s.id}-${p.return_period_years}`}
                    cx={xForIndex(i)}
                    cy={yForLoss(p.loss_kes)}
                    r={hover?.seriesId === s.id && hover?.returnPeriod === p.return_period_years ? 7 : 5}
                    fill={color}
                    className="cursor-pointer"
                    onMouseEnter={() =>
                      setHover({
                        ...pointTooltip(p, s.label),
                        seriesId: s.id,
                        p05: band?.p05_kes,
                        p95: band?.p95_kes,
                        net: s.netAt?.(i),
                      })
                    }
                    onMouseLeave={() => setHover(null)}
                  />
                );
              })}
            </g>
          );
        })}
        {(displaySeries[0]?.points || []).map((p, i) => (
          <text
            key={p.return_period_years}
            x={xForIndex(i)}
            y={height - 10}
            textAnchor="middle"
            className="fill-kenya-muted text-[9px]"
          >
            1:{p.return_period_years}y
          </text>
        ))}
      </svg>

      {!singleSeries && rawDisplay.length > 1 ? (
        <ul className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
          {rawDisplay.map((s) => {
            const off = hiddenSeries.has(s.id);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 normal-case transition ${
                    off
                      ? 'border-kenya-line bg-transparent text-kenya-muted line-through opacity-60'
                      : 'border-kenya-line/80 bg-kenya-surface text-kenya-ink hover:border-[#0f2d52]/50'
                  }`}
                  onClick={() => toggleSeries(s.id)}
                  aria-pressed={!off}
                  title={off ? 'Show series' : 'Hide series'}
                >
                  <span
                    className="inline-block h-0.5 w-6"
                    style={{ background: off ? '#9aa0a6' : COLORS[s.id] || '#17386a' }}
                  />
                  {s.label}
                </button>
              </li>
            );
          })}
          {bandPts.length ? (
            <li className="inline-flex items-center gap-2 text-kenya-muted">
              <span className="inline-block h-3 w-6 bg-[#6b2d5c]/20" />
              Model uncertainty (p5–p95)
            </li>
          ) : null}
        </ul>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[320px] border-collapse text-xs">
          <thead>
            <tr className="border-b border-kenya-line text-left text-kenya-muted">
              <th className="py-2 pr-2">Return period</th>
              <th className="py-2 pr-2">AEP</th>
              <th className="py-2 pr-2">{displaySeries[0]?.label || 'Loss'}</th>
            </tr>
          </thead>
          <tbody>
            {(displaySeries[0]?.points || []).map((p, rowIdx) => (
              <tr key={p.return_period_years} className="border-b border-kenya-line/60">
                <td className="py-2 font-medium text-kenya-navy">1-in-{p.return_period_years} yr</td>
                <td className="py-2 tabular-nums text-kenya-muted">{pctAep(p.aep)}</td>
                <td className="py-2 tabular-nums font-medium text-kenya-navy">
                  {formatLoss(p.loss_kes ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
