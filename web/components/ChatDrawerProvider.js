'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import ReAgentGeminiChat from '@/components/ReAgentGeminiChat';

const ChatDrawerContext = createContext(null);

export function useChatDrawer() {
  const ctx = useContext(ChatDrawerContext);
  if (!ctx) throw new Error('useChatDrawer must be used within ChatDrawerProvider');
  return ctx;
}

export default function ChatDrawerProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const openChat = useCallback(() => setOpen(true), []);
  const closeChat = useCallback(() => {
    setOpen(false);
    setFullscreen(false);
  }, []);
  const toggleFullscreen = useCallback(() => setFullscreen((v) => !v), []);

  return (
    <ChatDrawerContext.Provider value={{ open, openChat, closeChat, setOpen, fullscreen, toggleFullscreen }}>
      {children}

      {open ? (
        <div className="fixed inset-0 z-[1000]" role="dialog" aria-modal="true" aria-label="ReAgent chat">
          {!fullscreen ? (
            <button
              type="button"
              className="absolute inset-0 bg-[#061018]/65 backdrop-blur-[2px]"
              aria-label="Close chat"
              onClick={closeChat}
            />
          ) : null}
          <aside
            className={`absolute flex flex-col overflow-hidden shadow-2xl ${
              fullscreen
                ? 'inset-0'
                : 'right-0 top-0 h-full w-full max-w-3xl rounded-l-xl border-l border-[#3c4043]'
            }`}
          >
            <ReAgentGeminiChat
              fullscreen={fullscreen}
              onToggleFullscreen={toggleFullscreen}
              onClose={closeChat}
            />
          </aside>
        </div>
      ) : null}
    </ChatDrawerContext.Provider>
  );
}
