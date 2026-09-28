import Link from "next/link";

export default function NotFound() {
  return (
    <section className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <p className="font-mono text-7xl font-semibold text-accent">404</p>
      <h1 className="mt-4 text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-muted">
        This page doesn&apos;t exist. Your balances are still safe and still private.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex h-11 items-center rounded-xl bg-accent px-5 text-sm font-semibold text-accent-fg transition hover:bg-accent-strong"
      >
        Back to the exchange
      </Link>
    </section>
  );
}
