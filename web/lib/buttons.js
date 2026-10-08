/** Shared pill buttons — high contrast on light and dark surfaces. */

const pill =
  'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full font-semibold shadow-sm transition-[background,transform,box-shadow] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kenya-blue';

export const btnBase = `${pill} border-2 border-[#0f2d52] bg-white px-4 py-2 text-xs text-[#0f2d52] hover:bg-[#eef1f5] dark:border-[#dadce0] dark:bg-[#1a1d21] dark:text-[#f1f3f4] dark:hover:bg-[#2d3135]`;

export const btnPrimary = `${pill} border-2 border-[#0f2d52] bg-[#0f2d52] px-4 py-2 text-sm font-bold !text-white hover:bg-[#17386a] dark:border-[#1a4a8a] dark:bg-[#1a4a8a] dark:!text-white dark:hover:bg-[#2563b8]`;

/** Outline / secondary — force text color (globals set button { color: inherit }). */
export const btnSecondary = `${pill} border-2 border-[#0f2d52] bg-white px-4 py-2 text-sm font-bold !text-[#0f2d52] hover:bg-[#eef1f5] dark:border-[#dadce0] dark:bg-[#1a1d21] dark:!text-[#f1f3f4] dark:hover:bg-[#2d3135]`;

export const btnSm = 'px-3 py-1.5 text-xs font-bold normal-case tracking-normal';

export const btnMapOverlay = `${btnBase} ${btnSm} w-max max-w-[min(100%,14rem)] whitespace-normal text-left leading-snug border-[#17386a]/35 bg-white/95 text-[#0f2d52] backdrop-blur-md hover:bg-white dark:border-[#9aa0a6] dark:bg-[#1a1d21]/95 dark:text-[#f1f3f4]`;

export const btnDanger = `${pill} border-2 border-[#9b1c1c] bg-[#fff5f5] px-4 py-2 text-xs font-bold text-[#9b1c1c] hover:bg-[#fde8e8] dark:border-[#f07167] dark:bg-[#3d2020] dark:text-[#ffb4ab] dark:hover:bg-[#4a2828]`;

export function cn(...parts) {
  return parts.filter(Boolean).join(' ');
}
