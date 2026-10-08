'use client';

import { useCallback, useEffect, useRef } from 'react';
import { EP_CHART_GUIDES, renderGuideText } from '@/lib/ep-chart-guide';
import { btnSm, cn } from '@/lib/buttons';

export function EpChartSection({ id, activeId, onSelect, children, className = '' }) {
  const active = activeId === id;
  return (
    <section
      id={`ep-section-${id}`}
      className={cn(
        'scroll-mt-28 rounded-2xl transition-[box-shadow,ring-color] ring-2 ring-offset-2 ring-offset-kenya-surface',
        active ? 'ring-[#1a4a8a] shadow-md' : 'ring-transparent',
        className
      )}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(id);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Focus chart guide: ${EP_CHART_GUIDES[id]?.title || id}`}
    >
      {children}
    </section>
  );
}

export default function EpChartGuide({
  open,
  onOpenChange,
  activeId,
  onSelect,
  availableIds,
  liveHint,
}) {
  const guide = activeId ? EP_CHART_GUIDES[activeId] : null;
  const chipScrollRef = useRef(null);

  const scrollToSection = useCallback(
    (id) => {
      onSelect(id);
      requestAnimationFrame(() => {
        document.getElementById(`ep-section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    },
    [onSelect]
  );

  useEffect(() => {
    if (!open || !activeId || !chipScrollRef.current) return;
    const el = chipScrollRef.current.querySelector(`[data-guide-id="${activeId}"]`);
    el?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [activeId, open]);

  if (!availableIds?.length) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className={cn(
            btnSm,
            'rounded-full border-2 px-3 py-1.5 font-bold normal-case',
            open
              ? 'border-[#0f2d52] bg-[#0f2d52] !text-white dark:border-[#1a4a8a] dark:bg-[#1a4a8a]'
              : 'border-kenya-line bg-kenya-panel !text-[#0f2d52] dark:!text-[#e8eaed]'
          )}
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
        >
          {open ? 'Hide chart guide' : 'Understand these charts'}
        </button>
        {open ? (
          <span className="text-[11px] text-kenya-muted">Click a chart section or chip below — guide updates.</span>
        ) : null}
      </div>

      {open ? (
        <aside
          className="sticky top-[max(0.5rem,env(safe-area-inset-top))] z-10 rounded-xl border border-kenya-line bg-kenya-panel/98 p-3 shadow-sm backdrop-blur-sm lg:p-4"
          aria-live="polite"
        >
          <div
            ref={chipScrollRef}
            className="-mx-1 flex gap-1.5 overflow-x-auto pb-2 scrollbar-thin"
            role="tablist"
            aria-label="Chart types"
          >
            {availableIds.map((id) => {
              const g = EP_CHART_GUIDES[id];
              if (!g) return null;
              const selected = id === activeId;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  data-guide-id={id}
                  className={cn(
                    btnSm,
                    'shrink-0 rounded-full border px-2.5 py-1 normal-case',
                    selected
                      ? 'border-[#0f2d52] bg-[#eef1f5] font-bold !text-[#0f2d52] dark:border-[#8ab4f8] dark:bg-[#25282c] dark:!text-[#e8eaed]'
                      : 'border-kenya-line bg-white font-semibold !text-kenya-muted hover:border-[#0f2d52]/40 dark:bg-[#1a1d21]'
                  )}
                  onClick={() => scrollToSection(id)}
                >
                  {g.short || g.title}
                </button>
              );
            })}
          </div>

          {guide ? (
            <div className="mt-1 space-y-2.5 text-[12px] leading-relaxed text-kenya-ink">
              <h2 className="m-0 font-serif text-base font-semibold text-[#0f2d52] dark:text-[#e8eaed]">{guide.title}</h2>
              {liveHint ? (
                <p className="rounded-md border border-[#1a4a8a]/25 bg-[#eef1f5]/80 px-2.5 py-1.5 text-[11px] font-medium text-[#0f2d52] dark:bg-[#25282c] dark:text-[#8ab4f8]">
                  {liveHint}
                </p>
              ) : null}
              <div>
                <p className="m-0 text-[10px] font-bold uppercase tracking-wide text-kenya-muted">What it shows</p>
                <p className="mt-0.5">{renderGuideText(guide.what)}</p>
              </div>
              <div>
                <p className="m-0 text-[10px] font-bold uppercase tracking-wide text-kenya-muted">How to read it</p>
                <p className="mt-0.5">{renderGuideText(guide.read)}</p>
              </div>
              <div>
                <p className="m-0 text-[10px] font-bold uppercase tracking-wide text-kenya-muted">Data source</p>
                <p className="mt-0.5 text-kenya-muted">{guide.source}</p>
              </div>
              {guide.notSame ? (
                <div className="rounded-md border border-kenya-coral/30 bg-[#fff5f5]/80 px-2.5 py-2 dark:bg-[#3d2020]/40">
                  <p className="m-0 text-[10px] font-bold uppercase text-kenya-coral">Not the same as</p>
                  <p className="mt-0.5 text-[11px] text-kenya-ink dark:text-[#f1f3f4]">{guide.notSame}</p>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-kenya-muted">Select a chart type above.</p>
          )}
        </aside>
      ) : null}
    </div>
  );
}
