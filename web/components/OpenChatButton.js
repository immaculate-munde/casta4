'use client';

import { useChatDrawer } from '@/components/ChatDrawerProvider';

export default function OpenChatButton({ className = '', children = 'Claims chat →' }) {
  const { openChat } = useChatDrawer();
  return (
    <button type="button" onClick={openChat} className={className}>
      {children}
    </button>
  );
}
