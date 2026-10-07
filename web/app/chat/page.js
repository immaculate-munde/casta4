'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useChatDrawer } from '@/components/ChatDrawerProvider';

/** Legacy route — opens the global chat drawer and returns to landing. */
export default function ChatPage() {
  const router = useRouter();
  const { openChat } = useChatDrawer();

  useEffect(() => {
    openChat();
    router.replace('/');
  }, [openChat, router]);

  return null;
}
