'use client';

import ReactMarkdown from 'react-markdown';

const mdComponents = {
  h1: ({ children }) => (
    <h1 className="mb-2 mt-4 text-lg font-semibold first:mt-0" style={{ color: 'var(--chat-text)' }}>
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-1.5 mt-3 text-base font-semibold first:mt-0" style={{ color: 'var(--chat-text)' }}>
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1 mt-2 text-sm font-semibold first:mt-0" style={{ color: 'var(--chat-text)' }}>
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="my-2 leading-relaxed first:mt-0 last:mb-0" style={{ color: 'var(--chat-text)' }}>
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="my-2 list-disc space-y-1 pl-5" style={{ color: 'var(--chat-text)' }}>
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-1 pl-5" style={{ color: 'var(--chat-text)' }}>
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  hr: () => <hr className="my-3 border-0 border-t" style={{ borderColor: 'var(--chat-border)' }} />,
  code: ({ className, children }) => {
    const inline = !className;
    if (inline) {
      return (
        <code
          className="rounded px-1 py-0.5 text-[0.85em]"
          style={{ background: 'var(--chat-user-bubble)', color: 'var(--chat-text)' }}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        className="my-2 block overflow-x-auto rounded-md p-3 text-xs leading-relaxed"
        style={{ background: 'var(--chat-user-bubble)', color: 'var(--chat-text)' }}
      >
        {children}
      </code>
    );
  },
};

export default function ChatMarkdown({ text }) {
  if (!text) return null;
  return (
    <ReactMarkdown components={mdComponents} skipHtml>
      {text}
    </ReactMarkdown>
  );
}
