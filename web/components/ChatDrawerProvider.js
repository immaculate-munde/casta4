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
  const [propertyContext, setPropertyContext] = useState(null);
  /** Move floating ReAgent away from the map property panel when open. */
  const [fabPreferLeft, setFabPreferLeft] = useState(false);

  const openChat = useCallback(() => setOpen(true), []);
  const closeChat = useCallback(() => {
    setOpen(false);
    setFullscreen(false);
  }, []);
  const toggleFullscreen = useCallback(() => setFullscreen((v) => !v), []);

  return (
    <ChatDrawerContext.Provider
      value={{
        open,
        openChat,
        closeChat,
        setOpen,
        fullscreen,
        toggleFullscreen,
        propertyContext,
        setPropertyContext,
        fabPreferLeft,
        setFabPreferLeft,
      }}
    >
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
            className={`absolute flex min-h-0 flex-col overflow-hidden bg-[var(--chat-bg)] shadow-2xl ${
              fullscreen
                ? 'inset-0'
                : 'inset-y-0 right-0 h-[100dvh] w-full max-w-none shadow-2xl sm:max-w-3xl sm:rounded-l-xl'
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
