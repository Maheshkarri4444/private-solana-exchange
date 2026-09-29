"use client";

import "@/lib/polyfills";
import "@solana/wallet-adapter-react-ui/styles.css";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { UnsafeBurnerWalletAdapter } from "@solana/wallet-adapter-unsafe-burner";
import { type ReactNode, useMemo } from "react";
import { PrivateAccountProvider } from "@/hooks/usePrivateAccount";
import { FillNotifier } from "./FillNotifier";
import { LpFeeNotifier } from "./LpFeeNotifier";
import { Toaster } from "./Toaster";
import { RPC_URL } from "@/lib/config";

// Throwaway in-browser wallet for automated testing only. Off unless the env flag is set.
const ENABLE_BURNER = process.env.NEXT_PUBLIC_ENABLE_BURNER_WALLET === "true";

export function Providers({ children }: { children: ReactNode }) {
  // Phantom, Solflare, Backpack… are discovered through the Wallet Standard.
  const wallets = useMemo(() => (ENABLE_BURNER ? [new UnsafeBurnerWalletAdapter()] : []), []);

  return (
    <ConnectionProvider endpoint={RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <PrivateAccountProvider>
            <Toaster>
              <FillNotifier />
              <LpFeeNotifier />
              {children}
            </Toaster>
          </PrivateAccountProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
