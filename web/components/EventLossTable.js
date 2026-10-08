'use client';

const kesM = (m) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 1 }).format(
    (m || 0) * 1e6
  );

export default function EventLossTable({ elt, caption }) {
  const rows = elt || [];
  if (!rows.length) {
    return <p className="py-4 text-center text-xs text-kenya-muted">No event loss table — start the CAT service.</p>;
  }

  return (
    <div className="overflow-x-auto border border-kenya-line bg-kenya-panel">
      {caption ? <p className="border-b border-kenya-line px-3 py-2 text-[11px] text-kenya-muted">{caption}</p> : null}
      <table className="w-full min-w-[420px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-kenya-line bg-kenya-surface text-left text-[10px] font-bold uppercase text-kenya-muted">
            <th className="px-3 py-2">Tier</th>
            <th className="px-3 py-2">RP (yr)</th>
            <th className="px-3 py-2">GUL</th>
            <th className="px-3 py-2">Gross</th>
            <th className="px-3 py-2">Net</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.tier}-${r.return_period}`} className="border-b border-kenya-line/70">
              <td className="px-3 py-2 font-medium text-kenya-navy">{r.tier}</td>
              <td className="px-3 py-2 tabular-nums">{r.return_period}</td>
              <td className="px-3 py-2 tabular-nums">{kesM(r.ground_up_loss_m)}</td>
              <td className="px-3 py-2 tabular-nums font-semibold">{kesM(r.gross_loss_m)}</td>
              <td className="px-3 py-2 tabular-nums">{kesM(r.net_loss_m)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
