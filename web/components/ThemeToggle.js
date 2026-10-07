'use client';

import { useTheme } from '@/components/ThemeProvider';

const base =
  'inline-flex items-center justify-center rounded-md border-2 font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

const variants = {
  light: `${base} border-kenya-line bg-white px-3 py-1.5 text-xs text-kenya-ink hover:bg-kenya-surface dark:border-[#5f6368] dark:bg-[#2d2e30] dark:text-[#e8eaed] dark:hover:bg-[#3c4043]`,
  onDark: `${base} border-white/40 bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20`,
};

export default function ThemeToggle({ variant = 'light', className = '' }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`${variants[variant] || variants.light} ${className}`}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      {isDark ? '☀ Light' : '☾ Dark'}
    </button>
  );
}
