'use client';

import { usePathname } from 'next/navigation';
import ReAgentBotLauncher from '@/components/ReAgentBotLauncher';
import { useChatDrawer } from '@/components/ChatDrawerProvider';

/** Floating hover bot on all app pages — opens chat drawer (not a separate route). */
export default function GlobalBotFab() {
  const pathname = usePathname();
  const { openChat } = useChatDrawer();

  if (pathname === '/signin') return null;

  return <ReAgentBotLauncher onActivate={openChat} />;
}
