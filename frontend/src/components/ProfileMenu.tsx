"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { usePrivateAccount } from "@/hooks/usePrivateAccount";
import { shortAddress } from "@/lib/format";
import { Badge, Button } from "./ui";

/** A colored circle unique to each wallet address. */
export function Avatar({ address, size = 32 }: { address: string; size?: number }) {
  const hue = [...address].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <span
      className="shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(from 120deg, hsl(${hue} 80% 60%), hsl(${(hue + 90) % 360} 80% 55%), hsl(${hue} 80% 60%))`,
      }}
    />
  );
}

export function ProfileMenu() {
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const { keys, lock } = usePrivateAccount();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (!connected || !publicKey) {
    return (
      <Button className="h-10" onClick={() => setVisible(true)}>
        Connect wallet
      </Button>
    );
  }

  const address = publicKey.toBase58();
  const item = "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-white/5";

  const Item = ({ href, icon, children, soon }: { href: string; icon: string; children: ReactNode; soon?: boolean }) => (
    <Link href={href} className={item} onClick={() => setOpen(false)}>
      <span className="w-5 text-center">{icon}</span>
      <span className="flex-1">{children}</span>
      {soon && <Badge className="bg-white/10 text-muted">soon</Badge>}
    </Link>
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Profile menu"
        className="flex items-center gap-2 rounded-full border border-line bg-card py-1 pr-3 pl-1 transition hover:border-accent"
      >
        <Avatar address={address} />
        <span className="font-mono text-sm">{shortAddress(address)}</span>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 rounded-2xl border border-line bg-card-2 p-2 shadow-2xl">
          <p className="px-3 pt-2 pb-3 text-xs text-muted">
            Wallet <span className="font-mono text-fg">{shortAddress(address)}</span>
          </p>
          <Item href="/create/token" icon="🪙">
            Create token
          </Item>
          <Item href="/create/pool" icon="💧">
            Create liquidity pool
          </Item>
          <Item href="/create/orderbook" icon="📖" soon>
            Create order book
          </Item>
          <hr className="my-2 border-line" />
          {keys && (
            <button className={item} onClick={() => { lock(); setOpen(false); }}>
              <span className="w-5 text-center">🔒</span>Lock private balances
            </button>
          )}
          <button className={`${item} text-danger`} onClick={() => { disconnect(); setOpen(false); }}>
            <span className="w-5 text-center">⏻</span>Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
