'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ChatMarkdown from '@/components/ChatMarkdown';
import ThemeToggle from '@/components/ThemeToggle';
import { useChatDrawer } from '@/components/ChatDrawerProvider';
import { askClaims } from '@/lib/api';
import { pickChatGreeting } from '@/lib/chat-greetings';
import { titleFromFirstMessage } from '@/lib/chat-titles';
import { enrichQuestionWithProperty } from '@/lib/property-context';
import { useUserSession } from '@/lib/use-user-session';
import ChatDocumentUpload from '@/components/ChatDocumentUpload';
import { IconPanelLeft } from '@/components/NavIcons';
import { btnBase, btnPrimary, cn } from '@/lib/buttons';

const STORAGE_KEY_PREFIX = 'reagent_chat_sessions_v2';

function storageKey(email) {
  return email ? `${STORAGE_KEY_PREFIX}_${email}` : `${STORAGE_KEY_PREFIX}_anonymous`;
}

function loadSessionsLocal(email) {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(email));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSessionsLocal(email, sessions) {
  localStorage.setItem(storageKey(email), JSON.stringify(sessions.slice(0, 24)));
}

function newSession(partial = {}) {
  const id = crypto.randomUUID();
  return {
    id,
    greetingSeed: partial.greetingSeed || crypto.randomUUID(),
    title: partial.title || 'New chat',
    contextType: partial.contextType || null,
    contextMeta: partial.contextMeta || null,
    updatedAt: Date.now(),
    messages: partial.messages || [],
  };
}

async function fetchRemoteSessions() {
  const res = await fetch('/api/chat/sessions');
  if (res.status === 401) return { sessions: null, persistence: 'local' };
  if (!res.ok) throw new Error('Could not load chats');
  return res.json();
}

async function persistSessionRemote(session) {
  const res = await fetch(`/api/chat/sessions/${session.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: session.title,
      messages: session.messages,
      contextType: session.contextType,
      contextMeta: session.contextMeta,
    }),
  });
  if (res.status === 401) return;
  if (!res.ok) throw new Error('Could not save chat');
}

async function createSessionRemote(session) {
  const res = await fetch('/api/chat/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: session.id,
      title: session.title,
      contextType: session.contextType,
      contextMeta: session.contextMeta,
      messages: session.messages,
      greetingSeed: session.greetingSeed,
    }),
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error('Could not create chat');
  const data = await res.json();
  return data.session;
}

function SourcePills({ sources }) {
  if (!sources?.length) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-1">
      {sources.map((s) => (
        <li
          key={`${s.file}-${s.id}`}
          title={s.excerpt ? `${s.excerpt}…` : s.file}
          className="truncate rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{
            background: 'var(--chat-user-bubble)',
            color: 'var(--chat-text-muted)',
          }}
        >
          {s.kind} · {s.file}
        </li>
      ))}
    </ul>
  );
}

export default function ReAgentGeminiChat({ onClose, fullscreen, onToggleFullscreen, embedded = false }) {
  const {
    propertyContext,
    pendingPrompt,
    setPendingPrompt,
    newThreadRequest,
    clearNewThreadRequest,
  } = useChatDrawer();
  const { user } = useUserSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatPersistence, setChatPersistence] = useState('local');
  const endRef = useRef(null);
  const saveTimerRef = useRef(null);
  const userEmail = user?.email?.toLowerCase() || null;

  const active = sessions.find((s) => s.id === activeId) || sessions[0];

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const syncSidebar = () => {
      if (embedded) {
        setSidebarOpen(mq.matches);
      } else {
        setSidebarOpen(mq.matches);
      }
    };
    syncSidebar();
    mq.addEventListener('change', syncSidebar);
    return () => mq.removeEventListener('change', syncSidebar);
  }, [embedded]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const remote = await fetchRemoteSessions();
        if (cancelled) return;
        setChatPersistence(remote.persistence || 'local');
        if (remote.sessions?.length) {
          setSessions(remote.sessions);
          setActiveId(remote.sessions[0].id);
          saveSessionsLocal(userEmail, remote.sessions);
          return;
        }
      } catch {
        /* fall back to local */
      }

      const loaded = loadSessionsLocal(userEmail);
      if (loaded.length) {
        setSessions(loaded);
        setActiveId(loaded[0].id);
      } else {
        const s = newSession();
        setSessions([s]);
        setActiveId(s.id);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userEmail]);

  useEffect(() => {
    if (!pendingPrompt) return;
    setInput(pendingPrompt);
    setPendingPrompt('');
  }, [pendingPrompt, setPendingPrompt]);

  useEffect(() => {
    if (!sessions.length) return;
    saveSessionsLocal(userEmail, sessions);
    if (!userEmail || chatPersistence !== 'supabase') return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const activeSession = sessions.find((s) => s.id === activeId) || sessions[0];
      if (activeSession) {
        persistSessionRemote(activeSession).catch(() => {});
      }
    }, 600);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [sessions, activeId, userEmail, chatPersistence]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [active?.messages, loading]);

  const updateSession = useCallback((id, updater) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updater(s), updatedAt: Date.now() } : s))
    );
  }, []);

  function closeSidebarOnMobile() {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      setSidebarOpen(false);
    }
  }

  function handleNewChat() {
    const s = newSession();
    setSessions((prev) => [s, ...prev]);
    setActiveId(s.id);
    if (userEmail) {
      createSessionRemote(s).catch(() => {});
    }
    closeSidebarOnMobile();
  }

  const threadPropertyContext = active?.contextMeta || propertyContext;

  const sendUserMessage = useCallback(
    async (sessionId, text, contextMeta, seedSession = null) => {
      if (!text || loading) return;
      const session = seedSession || sessions.find((s) => s.id === sessionId);
      if (!session) return;

      const userMsg = { role: 'user', text };
      const nextMessages = [...session.messages, userMsg];
      const title =
        session.title === 'New chat' || !session.title?.trim()
          ? titleFromFirstMessage(text)
          : session.title;

      updateSession(sessionId, () => ({
        title,
        messages: nextMessages,
      }));

      setLoading(true);
      try {
        const ctx = contextMeta || session.contextMeta || propertyContext;
        const question = enrichQuestionWithProperty(text, ctx);
        const { answer, sources } = await askClaims(question);
        updateSession(sessionId, (s) => ({
          messages: [...s.messages, { role: 'bot', text: answer, sources }],
        }));
      } catch (err) {
        updateSession(sessionId, (s) => ({
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
    },
    [loading, propertyContext, sessions, updateSession]
  );

  async function onSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading || !active) return;
    setInput('');
    await sendUserMessage(active.id, text, threadPropertyContext);
  }

  useEffect(() => {
    if (!newThreadRequest) return;

    const run = async () => {
      const s = newSession({
        title: newThreadRequest.title || 'New chat',
        contextType: newThreadRequest.contextType || null,
        contextMeta: newThreadRequest.propertyContext || newThreadRequest.contextMeta || null,
      });
      if (userEmail) {
        try {
          await createSessionRemote(s);
          setChatPersistence('supabase');
        } catch {
          /* local still works */
        }
      }
      setSessions((prev) => [s, ...prev].slice(0, 24));
      setActiveId(s.id);
      const prompt = newThreadRequest.prompt || '';
      if (newThreadRequest.autoSend && prompt.trim()) {
        await sendUserMessage(s.id, prompt.trim(), s.contextMeta, s);
      } else if (prompt) {
        setInput(prompt);
      }
      clearNewThreadRequest();
      closeSidebarOnMobile();
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot per nonce
  }, [newThreadRequest?._nonce]);

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
      className="flex h-full min-h-0 w-full transition-colors duration-200"
      style={{ background: 'var(--chat-bg)', color: 'var(--chat-text)' }}
    >
      {sidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-[60] bg-black/45 lg:hidden"
          aria-label="Close chat history"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside
        className={`flex shrink-0 flex-col transition-[width,transform] duration-200 max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-[70] max-lg:w-[min(280px,88vw)] max-lg:shadow-2xl ${
          sidebarOpen ? 'max-lg:translate-x-0' : 'max-lg:pointer-events-none max-lg:-translate-x-full'
        } lg:relative lg:translate-x-0 ${
          sidebarOpen ? 'lg:w-64' : 'lg:w-0 lg:overflow-hidden'
        } ${embedded ? '' : 'border-r'}`}
        style={{
          borderColor: embedded ? undefined : 'var(--chat-border)',
          background: 'var(--chat-sidebar)',
        }}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <span className="text-lg font-semibold tracking-tight" style={{ color: 'var(--chat-text)' }}>
            ReAgent
          </span>
        </div>
        <div className="px-3 pb-2">
          <button type="button" onClick={handleNewChat} className={cn(btnPrimary, 'w-full py-2.5 text-sm normal-case')}>
            <span className="text-base leading-none">+</span> New chat
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
                  onClick={() => {
                    setActiveId(s.id);
                    closeSidebarOnMobile();
                  }}
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
        <ChatDocumentUpload />
        <p className="px-4 pb-4 pt-1 text-[11px] leading-snug" style={{ color: 'var(--chat-text-muted)' }}>
          {chatPersistence === 'supabase' && userEmail
            ? `Chats saved for ${userEmail} (syncs across devices).`
            : 'Chats saved in this browser. Sign in + Supabase on web for sync.'}
        </p>
      </aside>

      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
        {!embedded ? (
          <header
            className="z-20 flex shrink-0 items-center gap-2 border-b bg-[var(--chat-panel)] px-3 py-2.5 sm:px-4"
            style={{ borderColor: 'var(--chat-border)' }}
          >
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              className={cn(btnBase, 'gap-2 !px-3 !py-2 normal-case')}
              aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            >
              <IconPanelLeft className="h-5 w-5 shrink-0" />
              <span className="text-xs font-bold">{sidebarOpen ? 'Hide history' : 'Show history'}</span>
            </button>
            <p
              className="min-w-0 flex-1 truncate text-sm font-semibold sm:text-base"
              style={{ color: 'var(--chat-text)' }}
            >
              {active?.title || 'ReAgent'}
            </p>
            <div className="flex shrink-0 items-center gap-1.5">
              <ThemeToggle />
              {onToggleFullscreen ? (
                <button
                  type="button"
                  onClick={onToggleFullscreen}
                  className={cn(btnBase, 'hidden sm:inline-flex')}
                  aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
                  title={fullscreen ? 'Exit full screen' : 'Full screen'}
                >
                  {fullscreen ? 'Exit full' : 'Full screen'}
                </button>
              ) : null}
              {onClose ? (
                <button type="button" onClick={onClose} className={btnBase}>
                  Close
                </button>
              ) : null}
            </div>
          </header>
        ) : null}

        <div
          className={`relative min-h-0 flex-1 ${
            hasThread ? 'overflow-y-auto overscroll-contain px-3 py-4 sm:px-4' : 'flex items-center justify-center overflow-hidden'
          } ${embedded ? 'pt-2 lg:pt-3' : ''}`}
        >
          {embedded && !sidebarOpen ? (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className={cn(btnBase, 'absolute left-3 top-3 z-10 lg:hidden')}
              aria-label="Open chat history"
            >
              <IconPanelLeft className="h-4 w-4" />
              Chats
            </button>
          ) : null}
          {!hasThread ? (
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#dbe7f7] via-[var(--chat-bg)] to-[var(--chat-bg)] opacity-95 dark:from-[#1a2744] dark:via-[var(--chat-bg)] dark:opacity-90" />
          ) : null}

          {!hasThread ? (
            <h1
              className="relative z-[1] w-full max-w-md px-4 text-center text-2xl font-normal leading-snug tracking-tight text-balance sm:px-6 sm:text-3xl md:max-w-xl md:text-4xl"
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
          className="shrink-0 px-3 pb-4 pt-2 sm:px-4 sm:pb-5"
          style={{ background: 'var(--chat-bg)' }}
        >
          {threadPropertyContext?.loc_id ? (
            <p
              className="mx-auto mb-2 max-w-3xl rounded-lg px-3 py-2 text-[11px] font-medium"
              style={{
                background: 'var(--chat-user-bubble)',
                color: 'var(--chat-text-muted)',
              }}
            >
              Map context: <strong style={{ color: 'var(--chat-text)' }}>{threadPropertyContext.loc_id}</strong>
              {' · '}
              {threadPropertyContext.cedant_name}
              {' · '}
              {threadPropertyContext.kenya_re_in_book ? 'Kenya Re book' : 'Not in treaty book'}
            </p>
          ) : active?.contextType === 'ep_curve' ? (
            <p
              className="mx-auto mb-2 max-w-3xl rounded-lg px-3 py-2 text-[11px] font-medium"
              style={{ background: 'var(--chat-user-bubble)', color: 'var(--chat-text-muted)' }}
            >
              Thread context: <strong style={{ color: 'var(--chat-text)' }}>EP curve &amp; return periods</strong>
            </p>
          ) : null}
          <div
            className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-2xl border px-3 py-2 shadow-md focus-within:ring-2 focus-within:ring-kenya-blue/35 sm:rounded-3xl sm:px-4 sm:py-2.5"
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
              className={cn(btnPrimary, 'shrink-0 !px-5 !py-2 text-sm normal-case')}
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
