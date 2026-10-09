'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  IconChart,
  IconChat,
  IconDashboard,
  IconMap,
  IconPanelLeft,
  IconSettings,
} from '@/components/NavIcons';
import SignOutButton from '@/components/SignOutButton';
import ThemeToggle from '@/components/ThemeToggle';
import { btnBase } from '@/lib/buttons';

const STORAGE_KEY = 'casta4_sidebar_open';

const NAV = [
  { href: '/map', label: 'Map', short: 'Map', Icon: IconMap },
  { href: '/dashboard', label: 'Operations', short: 'Ops', Icon: IconDashboard },
  { href: '/chat', label: 'Chat', short: 'Chat', Icon: IconChat },
  { href: '/ep-curve', label: 'EP curve', short: 'EP', Icon: IconChart },
  { href: '/settings', label: 'Settings', short: 'Set', Icon: IconSettings },
];

function NavLink({ href, label, active, collapsed, Icon }) {
  const activeCls =
    'bg-[#0f2d52] !text-white shadow-sm dark:bg-[#2563b8] dark:!text-white lg:border-l-[3px] lg:border-kenya-coral lg:pl-[calc(0.75rem-3px)]';
  const idleCls =
    'text-[#0f2d52] hover:bg-[#e8ecf2] dark:text-[#e8eaed] dark:hover:bg-[#25282c]';

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-md py-2.5 text-sm font-semibold no-underline transition-colors ${
        collapsed ? 'lg:flex-col lg:gap-1.5 lg:px-1.5 lg:py-2.5 lg:text-center' : 'px-3'
      } ${active ? activeCls : idleCls} ${
        active && collapsed ? 'lg:border-l-0 lg:pl-1.5 lg:ring-2 lg:ring-kenya-coral/80' : ''
      }`}
    >
      <Icon className={`h-5 w-5 shrink-0 ${active ? 'text-white' : 'text-current'}`} />
      <span
        className={`min-w-0 break-words leading-snug ${active ? 'text-white' : 'text-current'} ${
          collapsed ? 'lg:w-full lg:text-[11px] lg:font-bold' : ''
        }`}
      >
        {label}
      </span>
    </Link>
  );
}

export default function AppShell({ children }) {
  const pathname = usePathname();
  const onChatPage = pathname === '/chat' || pathname.startsWith('/chat/');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === '0') setSidebarOpen(false);
    } catch {
      /* ignore */
    }
  }, []);

  function toggleSidebar() {
    setSidebarOpen((open) => {
      const next = !open;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      window.setTimeout(() => window.dispatchEvent(new Event('resize')), 220);
      return next;
    });
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-kenya-surface font-sans text-kenya-ink">
      <header className="flex shrink-0 items-center gap-1.5 border-t-4 border-kenya-coral border-b border-kenya-line bg-kenya-panel px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:gap-3 sm:px-4">
        <button
          type="button"
          onClick={toggleSidebar}
          className={`${btnBase} hidden shrink-0 gap-2 !px-3 !py-2 lg:inline-flex`}
          aria-expanded={sidebarOpen}
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <IconPanelLeft className="h-5 w-5 shrink-0" />
          <span className="text-xs font-bold normal-case">{sidebarOpen ? 'Hide menu' : 'Show menu'}</span>
        </button>
        <Link href="/map" className="flex min-w-0 items-center gap-2 no-underline">
          <span className="inline-block h-[22px] w-2.5 shrink-0 bg-kenya-coral" aria-hidden />
          <span className="truncate font-serif text-lg font-semibold text-kenya-navy sm:text-xl">Kenya Re</span>
        </Link>
        <span className="hidden text-xs text-kenya-muted sm:inline">ReAgent workspace</span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <ThemeToggle compact />
          <SignOutButton className={`${btnBase} !px-2.5 !py-1.5 text-xs sm:!px-4`} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <nav
          className={`hidden shrink-0 flex-col gap-1 overflow-y-auto overflow-x-visible border-kenya-line bg-kenya-panel transition-[width] duration-200 lg:flex lg:border-r lg:py-3 ${
            sidebarOpen ? 'lg:w-56 lg:px-2' : 'lg:w-[6.75rem] lg:px-1.5'
          }`}
          aria-label="Main"
        >
          {NAV.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              Icon={item.Icon}
              collapsed={!sidebarOpen}
              active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
            />
          ))}
        </nav>

        <nav
          className={`flex shrink-0 justify-between gap-0.5 overflow-x-auto overscroll-x-contain border-b border-kenya-line bg-kenya-panel px-1 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] lg:hidden ${
            onChatPage ? 'hidden' : ''
          }`}
          aria-label="Main mobile"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-[3.25rem] flex-1 flex-col items-center gap-0.5 rounded-md px-1 py-2 text-[10px] font-bold normal-case leading-tight no-underline sm:min-w-0 sm:px-2 sm:text-[11px] ${
                pathname === item.href
                  ? 'bg-[#0f2d52] text-white dark:bg-[#2563b8] dark:text-white'
                  : 'text-[#0f2d52] dark:text-[#e8eaed]'
              }`}
            >
              <item.Icon className="h-5 w-5 shrink-0 text-current" />
              <span className="max-w-[4.25rem] truncate text-center sm:max-w-none sm:whitespace-normal">
                <span className="sm:hidden">{item.short}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </span>
            </Link>
          ))}
        </nav>

        <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
