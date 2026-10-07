'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ChatMarkdown from '@/components/ChatMarkdown';
import ThemeToggle from '@/components/ThemeToggle';
import { useChatDrawer } from '@/components/ChatDrawerProvider';
import { askClaims } from '@/lib/api';
import { pickChatGreeting } from '@/lib/chat-greetings';
import { enrichQuestionWithProperty } from '@/lib/property-context';
import { useUserSession } from '@/lib/use-user-session';

const STORAGE_KEY = 'reagent_chat_sessions_v1';

function loadSessions() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSessions(sessions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, 24)));
}

function newSession() {
  return {
    id: crypto.randomUUID(),
    greetingSeed: crypto.randomUUID(),
    title: 'New chat',
    updatedAt: Date.now(),
    messages: [],
  };
}

function SourcePills({ sources }) {
  if (!sources?.length) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-1">
      {sources.map((s) => (
        <li
          key={`${s.file}-${s.id}`}
          title={s.excerpt ? `${s.excerpt}…` : s.file}
          className="truncate rounded-full border px-2 py-0.5 text-[10px] font-medium"
          style={{
            borderColor: 'var(--chat-border)',
            background: 'var(--chat-panel)',
            color: 'var(--chat-text-muted)',
          }}
        >
          {s.kind} · {s.file}
        </li>
      ))}
    </ul>
  );
}

export default function ReAgentGeminiChat({ onClose, fullscreen, onToggleFullscreen }) {
  const { propertyContext } = useChatDrawer();
  const { user } = useUserSession();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  const active = sessions.find((s) => s.id === activeId) || sessions[0];

  useEffect(() => {
    const loaded = loadSessions();
    if (loaded.length) {
      setSessions(loaded);
      setActiveId(loaded[0].id);
    } else {
      const s = newSession();
      setSessions([s]);
      setActiveId(s.id);
    }
  }, []);

  useEffect(() => {
    if (sessions.length) saveSessions(sessions);
  }, [sessions]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [active?.messages, loading]);

  const updateSession = useCallback((id, updater) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updater(s), updatedAt: Date.now() } : s))
    );
  }, []);

  function handleNewChat() {
    const s = newSession();
    setSessions((prev) => [s, ...prev]);
    setActiveId(s.id);
  }

  async function onSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading || !active) return;
    setInput('');

    const userMsg = { role: 'user', text };
    const nextMessages = [...active.messages, userMsg];
    const title = active.title === 'New chat' ? text.slice(0, 42) : active.title;

    updateSession(active.id, () => ({
      title,
      messages: nextMessages,
    }));

    setLoading(true);
    try {
      const question = enrichQuestionWithProperty(text, propertyContext);
      const { answer, sources } = await askClaims(question);
      updateSession(active.id, (s) => ({
        messages: [...s.messages, { role: 'bot', text: answer, sources }],
      }));
    } catch (err) {
      updateSession(active.id, (s) => ({
        messages: [
          ...s.messages,
          {
            role: 'bot',
            text: `Could not reach RAG API (${err.message}). Start node rag-server.js on port 3001.`,
            sources: [],
          },
        ],
      }));
    } finally {
      setLoading(false);
    }
  }

  const hasThread = (active?.messages?.length || 0) > 0;

  const emptyGreeting = useMemo(
    () =>
      pickChatGreeting({
        name: user?.name,
        email: user?.email,
        seed: active?.greetingSeed || active?.id || 'new',
      }),
    [user?.name, user?.email, active?.greetingSeed, active?.id]
  );

  return (
    <div
      className="flex h-full min-h-0 transition-colors duration-200"
      style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)' }}
    >
      <aside
        className={`flex shrink-0 flex-col border-r transition-[width] duration-300 ${
          sidebarOpen ? 'w-64' : 'w-0 overflow-hidden border-r-0'
        }`}
        style={{ borderColor: 'var(--chat-border)', background: 'var(--chat-sidebar)' }}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <span className="text-lg font-semibold tracking-tight" style={{ color: 'var(--chat-text)' }}>
            ReAgent
          </span>
        </div>
        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={handleNewChat}
            className="flex w-full items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium hover:opacity-90"
            style={{ borderColor: 'var(--chat-border)', color: 'var(--chat-text)' }}
          >
            <span className="text-lg leading-none">+</span> New chat
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2">
          <p
            className="px-2 py-2 text-xs font-bold uppercase tracking-wide"
            style={{ color: 'var(--chat-text-muted)' }}
          >
            Recent
          </p>
          <ul className="space-y-0.5">
            {sessions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(s.id)}
                  className={`w-full truncate rounded-lg px-3 py-2 text-left text-sm ${
                    s.id === active?.id ? 'font-semibold' : 'opacity-90 hover:opacity-100'
                  }`}
                  style={{
                    background: s.id === active?.id ? 'var(--chat-user-bubble)' : 'transparent',
                    color: 'var(--chat-text)',
                  }}
                >
                  {s.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <p
          className="border-t px-4 py-3 text-[11px]"
          style={{ borderColor: 'var(--chat-border)', color: 'var(--chat-text-muted)' }}
        >
          Grounded on ingested policy, treaty & claim docs
        </p>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header
          className="z-20 flex shrink-0 items-center gap-2 border-b px-2 py-2 sm:px-3"
          style={{
            borderColor: 'var(--chat-border)',
            background: 'var(--chat-panel)',
          }}
        >
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:opacity-80"
            style={{ color: 'var(--chat-text)' }}
            aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          >
            ☰
          </button>
          <p
            className="min-w-0 flex-1 truncate text-sm font-semibold sm:text-base"
            style={{ color: 'var(--chat-text)' }}
          >
            {active?.title || 'ReAgent'}
          </p>
          <div
            className="flex shrink-0 items-center gap-1 rounded-lg border p-0.5 sm:gap-1.5 sm:p-1"
            style={{ borderColor: 'var(--chat-border)', background: 'var(--chat-bg)' }}
          >
            <ThemeToggle className="!border-0 !bg-transparent !px-2 !py-1.5 dark:!bg-transparent" />
            <button
              type="button"
              onClick={onToggleFullscreen}
              className="flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium hover:opacity-80 sm:h-9 sm:w-auto sm:px-2"
              style={{ color: 'var(--chat-text)' }}
              aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
              title={fullscreen ? 'Exit full screen' : 'Full screen'}
            >
              <span className="sm:hidden">{fullscreen ? '⊡' : '⛶'}</span>
              <span className="hidden sm:inline">{fullscreen ? 'Exit full' : 'Full screen'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 items-center justify-center rounded-md px-2 text-sm font-semibold hover:opacity-80 sm:h-9 sm:px-3"
              style={{ color: 'var(--chat-text)' }}
            >
              Close
            </button>
          </div>
        </header>

        <div
          className={`relative min-h-0 flex-1 ${
            hasThread ? 'overflow-y-auto overscroll-contain px-3 py-4 sm:px-4' : 'flex items-center justify-center overflow-hidden'
          }`}
        >
          {!hasThread ? (
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#dbe7f7] via-[var(--chat-bg)] to-[var(--chat-bg)] opacity-95 dark:from-[#1a2744] dark:via-[var(--chat-bg)] dark:opacity-90" />
          ) : null}

          {!hasThread ? (
            <h1
              className="relative z-[1] max-w-xl px-6 text-center text-3xl font-normal tracking-tight md:text-4xl"
              style={{ color: 'var(--chat-text)' }}
            >
              {emptyGreeting}
            </h1>
          ) : (
            <div className="mx-auto w-full max-w-3xl space-y-6">
              {(active?.messages || []).map((msg, i) => (
                <div key={i} className={msg.role === 'user' ? 'text-right' : ''}>
                  {msg.role === 'user' ? (
                    <p
                      className="ml-auto inline-block max-w-[85%] rounded-2xl px-4 py-2 text-left text-sm whitespace-pre-wrap"
                      style={{ background: 'var(--chat-user-bubble)', color: 'var(--chat-text)' }}
                    >
                      {msg.text}
                    </p>
                  ) : (
                    <div className="max-w-[95%] text-sm" style={{ color: 'var(--chat-text)' }}>
                      <ChatMarkdown text={msg.text} />
                      <SourcePills sources={msg.sources} />
                    </div>
                  )}
                </div>
              ))}
              {loading ? (
                <p className="text-sm font-medium" style={{ color: 'var(--chat-text-muted)' }}>
                  Searching documents…
                </p>
              ) : null}
              <div ref={endRef} aria-hidden />
            </div>
          )}
        </div>

        <form
          onSubmit={onSubmit}
          className="shrink-0 border-t px-3 pb-4 pt-3 sm:px-4 sm:pb-5"
          style={{
            borderColor: 'var(--chat-border)',
            background: 'var(--chat-bg)',
          }}
        >
          {propertyContext?.loc_id ? (
            <p
              className="mx-auto mb-2 max-w-3xl rounded-md border px-3 py-2 text-[11px] font-medium"
              style={{
                borderColor: 'var(--chat-border)',
                background: 'var(--chat-panel)',
                color: 'var(--chat-text-muted)',
              }}
            >
              Map context: <strong style={{ color: 'var(--chat-text)' }}>{propertyContext.loc_id}</strong>
              {' · '}
              {propertyContext.cedant_name}
              {' · '}
              {propertyContext.kenya_re_in_book ? 'Kenya Re book' : 'Not in treaty book'}
            </p>
          ) : null}
          <div
            className="mx-auto flex max-w-3xl items-end gap-2 rounded-3xl border-2 px-4 py-3 shadow-lg focus-within:ring-2 focus-within:ring-kenya-blue/40"
            style={{ borderColor: 'var(--chat-border)', background: 'var(--chat-panel)' }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={1}
              placeholder="Ask ReAgent"
              disabled={loading}
              className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent text-sm outline-none"
              style={{ color: 'var(--chat-text)' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit(e);
                }
              }}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="shrink-0 rounded-full bg-kenya-blue px-4 py-1.5 text-sm font-bold text-white disabled:opacity-50 dark:bg-[#aecbfa] dark:text-[#0b1a2e]"
            >
              Send
            </button>
          </div>
          <p className="mx-auto mt-2 max-w-3xl text-center text-[11px]" style={{ color: 'var(--chat-text-muted)' }}>
            ReAgent cites ingested documents; verify with a human reviewer before decisions.
          </p>
        </form>
      </div>
    </div>
  );
}
