'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { askClaims } from '@/lib/api';
import '@/styles/chat.css';

export default function ClaimsChat() {
  const [messages, setMessages] = useState([
    { role: 'bot', text: 'ReAgent AI — ask about treaty referral, coverage, or claim documentation.' },
  ]);
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
      const answer = await askClaims(text);
      setMessages((m) => [...m, { role: 'bot', text: answer }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: 'bot', text: `Could not reach RAG API (${err.message}). Run node rag-server.js on port 3001.` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-root">
      <header className="chat-header">
        <Link href="/">← Home</Link>
        <span>ReAgent AI · Claims</span>
        <Link href="/catastrophe">Flood desk</Link>
      </header>
      <main className="chat-main">
        <div className="chat-box">
          {messages.map((msg, i) => (
            <div key={i} className={`chat-msg ${msg.role}`}>
              {msg.text}
            </div>
          ))}
          {loading ? <div className="chat-msg bot">…</div> : null}
          <div ref={endRef} />
        </div>
        <form className="chat-form" onSubmit={onSubmit}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. What does the treaty say about claim referral?"
            disabled={loading}
          />
          <button type="submit" disabled={loading}>
            Send
          </button>
        </form>
      </main>
    </div>
  );
}
