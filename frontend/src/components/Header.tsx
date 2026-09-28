"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";

// The wallet button reads browser-only state, so skip server rendering.
const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false },
);

const links = [
  { href: "/profile", label: "Profile" },
  { href: "/profile/creator", label: "Creator" },
];

export function Header() {
  const pathname = usePathname();
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 font-semibold text-fg">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm">
              ◈
            </span>
            Private Exchange
          </Link>
          <nav className="flex gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  pathname === l.href ? "bg-white/10 text-fg" : "text-muted hover:text-fg"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">devnet</span>
          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
}
