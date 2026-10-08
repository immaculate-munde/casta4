import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-kenya-surface px-6 py-12 text-kenya-ink">
      <div className="max-w-md rounded-2xl border border-kenya-line bg-kenya-panel p-6 text-center shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-kenya-muted">404</p>
        <h1 className="mt-3 font-serif text-2xl font-semibold text-kenya-navy">Page not found</h1>
        <p className="mt-2 text-sm text-kenya-muted">
          The page you requested does not exist in this workspace.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex rounded-full border-2 border-[#0f2d52] bg-[#0f2d52] px-4 py-2 text-xs font-bold text-white no-underline hover:bg-[#17386a] dark:border-[#1a4a8a] dark:bg-[#1a4a8a] dark:hover:bg-[#2563b8]"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
