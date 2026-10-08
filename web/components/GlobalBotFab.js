'use client';

import { usePathname } from 'next/navigation';
import ReAgentBotLauncher from '@/components/ReAgentBotLauncher';
import { useChatDrawer } from '@/components/ChatDrawerProvider';

/** Floating hover bot on all app pages — opens chat drawer (not a separate route). */
export default function GlobalBotFab() {
  const pathname = usePathname();
  const { openChat, open: chatDrawerOpen } = useChatDrawer();

  if (pathname === '/' || pathname === '/signin') return null;
  if (pathname === '/chat' || pathname.startsWith('/chat/')) return null;
  if (chatDrawerOpen) return null;

  return <ReAgentBotLauncher onActivate={openChat} />;
}
