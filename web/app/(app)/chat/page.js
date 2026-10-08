'use client';

import ReAgentGeminiChat from '@/components/ReAgentGeminiChat';

export default function ChatPage() {
  return (
    <div className="h-full min-h-0">
      <ReAgentGeminiChat fullscreen embedded />
    </div>
  );
}
