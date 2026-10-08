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
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={`flex items-center gap-3 rounded-md py-2.5 text-sm font-semibold no-underline transition-colors ${
        collapsed ? 'lg:justify-center lg:px-2' : 'px-3'
      } ${
        active
          ? 'bg-kenya-navy text-white shadow-sm dark:bg-[#1a4a8a] dark:text-white lg:border-l-[3px] lg:border-kenya-coral lg:pl-[calc(0.75rem-3px)]'
          : 'text-kenya-ink hover:bg-kenya-surface dark:hover:bg-[#25282c]'
      } ${active && collapsed ? 'lg:border-l-0 lg:pl-2 lg:ring-2 lg:ring-kenya-coral/80' : ''}`}
    >
      <Icon className="h-5 w-5 shrink-0 opacity-90" />
      <span className={collapsed ? 'lg:sr-only' : ''}>{label}</span>
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
      <header className="flex shrink-0 items-center gap-2 border-t-4 border-kenya-coral border-b border-kenya-line bg-kenya-panel px-3 py-2 sm:gap-3 sm:px-4">
        <button
          type="button"
          onClick={toggleSidebar}
          className={`${btnBase} hidden shrink-0 !p-2 lg:inline-flex`}
          aria-expanded={sidebarOpen}
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <IconPanelLeft className="h-5 w-5" />
        </button>
        <Link href="/map" className="flex min-w-0 items-center gap-2 no-underline">
          <span className="inline-block h-[22px] w-2.5 shrink-0 bg-kenya-coral" aria-hidden />
          <span className="truncate font-serif text-lg font-semibold text-kenya-navy sm:text-xl">Kenya Re</span>
        </Link>
        <span className="hidden text-xs text-kenya-muted sm:inline">Casta4 workspace</span>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <SignOutButton className={`${btnBase} !py-1.5 text-xs`} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <nav
          className={`hidden shrink-0 flex-col gap-0.5 overflow-hidden border-kenya-line bg-kenya-panel transition-[width] duration-200 lg:flex lg:border-r lg:py-3 ${
            sidebarOpen ? 'lg:w-56 lg:px-2' : 'lg:w-[4.25rem] lg:px-1.5'
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
          className={`flex shrink-0 gap-1 overflow-x-auto border-b border-kenya-line bg-kenya-panel px-2 py-2 lg:hidden ${
            onChatPage ? 'hidden' : ''
          }`}
          aria-label="Main mobile"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex shrink-0 flex-col items-center gap-0.5 rounded-md px-2 py-1.5 text-[9px] font-bold uppercase no-underline ${
                pathname === item.href ? 'text-kenya-coral' : 'text-kenya-muted'
              }`}
            >
              <item.Icon className="h-5 w-5" />
              {item.short}
            </Link>
          ))}
        </nav>

        <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
