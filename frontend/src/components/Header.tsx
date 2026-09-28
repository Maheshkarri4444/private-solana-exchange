"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

// Reads wallet state, which only exists in the browser.
const ProfileMenu = dynamic(() => import("./ProfileMenu").then((m) => m.ProfileMenu), {
  ssr: false,
});

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold text-fg">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-accent-fg">
            ◈
          </span>
          Private Exchange
        </Link>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">devnet</span>
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}
