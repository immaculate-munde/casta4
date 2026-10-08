'use client';

import Image from 'next/image';
import Link from 'next/link';

/**
 * Floating ReAgent mascot: compact by default, full figure + hint on hover.
 * Click navigates to /chat or runs onActivate (e.g. open chat on that page).
 */
export default function ReAgentBotLauncher({ href = '/chat', onActivate, className = '' }) {
  const isButton = typeof onActivate === 'function';

  const inner = (
    <>
      <span
        className="pointer-events-none absolute -top-12 right-0 hidden w-max max-w-[200px] rounded-lg bg-kenya-navy px-3 py-2 text-xs font-semibold text-white shadow-lg md:block"
        aria-hidden
      >
        Chat with ReAgent
        <span className="absolute -bottom-1.5 right-6 h-3 w-3 rotate-45 bg-kenya-navy" />
      </span>

      <span
        className="relative flex items-end justify-center overflow-visible transition-all duration-300 ease-out group-hover:-translate-y-1"
      >
        <span className="relative block h-16 w-16 overflow-hidden rounded-full bg-kenya-panel shadow-lg ring-[3px] ring-kenya-navy/35 transition-all duration-300 group-hover:h-[168px] group-hover:w-[168px] group-hover:rounded-2xl group-hover:shadow-2xl group-hover:ring-kenya-blue dark:ring-white/30">
          <Image
            src="/reagent-bot.png"
            alt=""
            width={168}
            height={168}
            className="h-full w-full scale-125 object-cover object-top transition-transform duration-300 group-hover:scale-100"
          />
        </span>
      </span>

      <span className="mt-2 rounded-full bg-kenya-panel px-2.5 py-1 text-center text-[11px] font-bold normal-case text-kenya-ink shadow-md ring-1 ring-kenya-line">
        Tap to open chat
      </span>
    </>
  );

  const shellClass = `group fixed bottom-6 right-6 z-[800] flex flex-col items-center focus:outline-none ${className}`;

  if (isButton) {
    return (
      <button type="button" className={shellClass} onClick={onActivate} aria-label="Open underwriter chat">
        {inner}
      </button>
    );
  }

  return (
    <Link href={href} className={shellClass} aria-label="Go to underwriter chat">
      {inner}
    </Link>
  );
}
