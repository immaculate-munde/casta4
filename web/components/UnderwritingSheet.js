'use client';

const kes = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('en-KE', { style: 'percent', maximumFractionDigits: 1 });

export default function UnderwritingSheet({ data, loading, error }) {
  if (loading) return <p className="text-xs text-kenya-muted">Running CAT underwriting sheet…</p>;
  if (error) return <p className="text-xs text-kenya-coral">{error}</p>;
  if (!data?.sheet?.length) {
    return <p className="text-xs text-kenya-muted">Start CAT service to model single-risk losses.</p>;
  }

  const rec = data.recommendation;
  const recClass =
    rec === 'Standard Acceptance'
      ? 'border-kenya-green bg-[#e4f5ee] text-kenya-green'
      : rec?.includes('Sub-limit')
        ? 'border-kenya-coral bg-[#fdeaea] text-kenya-coral'
        : 'border-kenya-watch bg-[#fdf4e3] text-kenya-watch';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="border border-kenya-line bg-kenya-surface p-2">
          <p className="text-[10px] uppercase text-kenya-muted">Drainage α</p>
          <p className="mt-1 font-bold text-kenya-navy">{Number(data.drainage_alpha).toFixed(2)}</p>
        </div>
        <div className="border border-kenya-line bg-kenya-surface p-2">
          <p className="text-[10px] uppercase text-kenya-muted">100-yr hazard</p>
          <p className="mt-1 font-bold text-kenya-navy">
            {pct.format(data.hazards?.extreme ?? 0)}
          </p>
        </div>
        <div className="border border-kenya-line bg-kenya-surface p-2">
          <p className="text-[10px] uppercase text-kenya-muted">Recommendation</p>
          <p className="mt-1 text-[10px] font-bold leading-tight text-kenya-navy">{rec}</p>
        </div>
      </div>
      <p className={`rounded-md border px-3 py-2 text-[11px] font-semibold ${recClass}`}>{rec}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-kenya-line text-left text-[10px] uppercase text-kenya-muted">
              <th className="py-1.5">Tier</th>
              <th className="py-1.5">RP</th>
              <th className="py-1.5">Hazard</th>
              <th className="py-1.5">Depth</th>
              <th className="py-1.5">DR</th>
              <th className="py-1.5">GUL</th>
              <th className="py-1.5">Gross</th>
            </tr>
          </thead>
          <tbody>
            {data.sheet.map((row) => (
              <tr key={row.return_period} className="border-b border-kenya-line/60">
                <td className="py-1.5">{row.tier}</td>
                <td className="py-1.5">{row.return_period}</td>
                <td className="py-1.5">{pct.format(row.hazard_score ?? 0)}</td>
                <td className="py-1.5">{Number(row.depth_m).toFixed(2)} m</td>
                <td className="py-1.5">{pct.format(row.damage_ratio ?? 0)}</td>
                <td className="py-1.5 tabular-nums">{kes.format(row.ground_up_loss_kes ?? 0)}</td>
                <td className="py-1.5 tabular-nums font-semibold">{kes.format(row.gross_loss_kes ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
