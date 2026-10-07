'use client';

import { useEffect, useRef, useState } from 'react';
import { askClaims } from '@/lib/api';

const DEFAULT_INTRO =
  'Ask about coverage, treaty referral, claim documentation, or flood investigation findings.';

function ShortSources({ sources, compact }) {
  if (!sources?.length) {
    return (
      <p className={`italic text-kenya-muted ${compact ? 'text-[10px]' : 'text-xs'}`}>
        No matching docs
      </p>
    );
  }
  return (
    <ul className={`flex flex-wrap gap-1 ${compact ? 'mt-1' : 'mt-1.5'}`}>
      {sources.map((s) => (
        <li
          key={`${s.file}-${s.id}`}
          title={s.excerpt ? `${s.excerpt}…` : s.file}
          className={`max-w-full truncate rounded ring-1 ring-kenya-line bg-white font-medium text-kenya-navy ${
            compact ? 'px-1 py-0.5 text-[9px]' : 'px-1.5 py-0.5 text-[10px]'
          }`}
        >
          <span className="text-kenya-muted">{s.kind}</span> · {s.file}
        </li>
      ))}
    </ul>
  );
}

export default function UnderwriterChat({
  className = '',
  title = 'Underwriter assistant',
  hint = 'Grounded on ingested policy & treaty docs',
  initialMessage = DEFAULT_INTRO,
  enrichQuestion,
  placeholder = 'e.g. When must a cedant refer a claim under the treaty?',
  compact = false,
}) {
  const [messages, setMessages] = useState([{ role: 'bot', text: initialMessage, sources: [] }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function onSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text }]);
    setLoading(true);
    try {
      const question = enrichQuestion ? enrichQuestion(text) : text;
      const { answer, sources } = await askClaims(question);
      setMessages((m) => [...m, { role: 'bot', text: answer, sources }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: 'bot',
          text: `Could not reach RAG API (${err.message}). Run node rag-server.js on port 3001.`,
          sources: [],
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const root = compact
    ? 'flex min-h-0 flex-col border-t border-kenya-line bg-[#fbfbfc]'
    : 'flex min-h-0 flex-1 flex-col';

  return (
    <section className={`${root} ${className}`.trim()}>
      <header
        className={
          compact
            ? 'shrink-0 border-b border-kenya-line bg-white px-3 py-2'
            : 'shrink-0 border-b border-kenya-line bg-white px-4 py-3'
        }
      >
        <h2 className={`font-semibold text-kenya-navy ${compact ? 'text-xs' : 'text-sm'}`}>{title}</h2>
        <p className={`text-kenya-muted ${compact ? 'text-[10px]' : 'text-xs'}`}>{hint}</p>
      </header>

      <div className={`flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto ${compact ? 'p-2' : 'p-4'}`}>
        {messages.map((msg, i) => (
          <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div
              className={`whitespace-pre-wrap leading-snug ${
                compact ? 'max-w-[95%] px-2 py-1.5 text-[11px]' : 'max-w-[92%] rounded-lg px-3 py-2 text-sm'
              } ${
                msg.role === 'user'
                  ? 'bg-kenya-navy text-white'
                  : 'border border-kenya-line bg-white text-[#1c2430]'
              } ${!compact && msg.role === 'bot' ? 'rounded-lg' : ''}`}
            >
              {msg.text}
            </div>
            {msg.role === 'bot' && i > 0 && !msg.isError ? (
              <div className={`w-full ${compact ? 'max-w-[95%] pl-0.5' : 'max-w-[92%]'}`}>
                <span className={`font-semibold uppercase tracking-wide text-kenya-muted ${compact ? 'text-[8px]' : 'text-[9px]'}`}>
                  Sources
                </span>
                <ShortSources sources={msg.sources} compact={compact} />
              </div>
            ) : null}
          </div>
        ))}
        {loading ? (
          <div
            className={`text-kenya-muted ${compact ? 'text-[11px]' : 'text-sm'} border border-kenya-line bg-white px-2 py-1.5`}
          >
            Searching documents…
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={onSubmit}
        className={`grid shrink-0 grid-cols-[1fr_auto] gap-2 border-t border-kenya-line bg-white ${
          compact ? 'p-2' : 'p-3'
        }`}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={compact ? 2 : 2}
          placeholder={placeholder}
          disabled={loading}
          className={`resize-none border border-kenya-line outline-none focus:border-kenya-blue focus:ring-1 focus:ring-kenya-blue disabled:opacity-60 ${
            compact ? 'min-h-[40px] px-2 py-1 text-[11px]' : 'min-h-[44px] rounded-md px-3 py-2 text-sm'
          }`}
        />
        <button
          type="submit"
          disabled={loading}
          className={`self-end bg-kenya-blue font-semibold text-white hover:bg-kenya-navy disabled:cursor-not-allowed disabled:opacity-60 ${
            compact ? 'px-2 py-1 text-[11px]' : 'rounded-md px-4 py-2 text-sm'
          }`}
        >
          Send
        </button>
      </form>
    </section>
  );
}
