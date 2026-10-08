'use client';

import { useTheme } from '@/components/ThemeProvider';
import { btnBase } from '@/lib/buttons';

const onDark =
  'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full border-2 border-white/70 bg-white/15 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

export default function ThemeToggle({ variant = 'light', className = '', compact = false }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`${variant === 'onDark' ? onDark : btnBase} ${compact ? '!px-2.5 !py-1.5' : ''} ${className}`}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      {compact ? (isDark ? '☀' : '☾') : isDark ? '☀ Light' : '☾ Dark'}
    </button>
  );
}
