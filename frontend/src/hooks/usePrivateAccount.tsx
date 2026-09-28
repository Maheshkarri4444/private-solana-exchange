"use client";

import { AnchorProvider } from "@anchor-lang/core";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { fetchMxePublicKey } from "@/lib/arcium";
import { type PrivateKeys, SIGN_MESSAGE, clearKeys, deriveKeys, loadKeys, saveKeys } from "@/lib/keys";
import { type ExchangeProgram, getProgram, pdas } from "@/lib/program";

interface PrivateAccount {
  provider: AnchorProvider | null;
  program: ExchangeProgram | null;
  /** Derived from the wallet signature; null until the user unlocks. */
  keys: PrivateKeys | null;
  /** The Arcium network's public key (needed to decrypt). */
  mxePublicKey: Uint8Array | null;
  /** null while loading. */
  registered: boolean | null;
  /** On-chain key differs from the derived one (should never happen). */
  keyMismatch: boolean;
  unlock: () => Promise<void>;
  register: () => Promise<void>;
  lock: () => void;
}

const Context = createContext<PrivateAccount | null>(null);

export function PrivateAccountProvider({ children }: { children: ReactNode }) {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { publicKey, signMessage } = useWallet();

  const provider = useMemo(
    () =>
      anchorWallet
        ? new AnchorProvider(connection, anchorWallet, {
            commitment: "confirmed",
            preflightCommitment: "confirmed",
          })
        : null,
    [connection, anchorWallet],
  );
  const program = useMemo(() => (provider ? getProgram(provider) : null), [provider]);

  const [keys, setKeys] = useState<PrivateKeys | null>(null);
  const [mxePublicKey, setMxePublicKey] = useState<Uint8Array | null>(null);
  const [registeredKey, setRegisteredKey] = useState<Uint8Array | null | undefined>(undefined);

  const wallet = publicKey?.toBase58() ?? null;

  // Restore keys for this tab when the wallet (re)connects.
  useEffect(() => {
    setKeys(wallet ? loadKeys(wallet) : null);
  }, [wallet]);

  const refreshRegistration = useCallback(async () => {
    if (!program || !publicKey) {
      setRegisteredKey(undefined);
      return;
    }
    const user = await program.account.userAccount.fetchNullable(pdas.user(publicKey));
    setRegisteredKey(user ? Uint8Array.from(user.encPubkey) : null);
  }, [program, publicKey]);

  useEffect(() => {
    setRegisteredKey(undefined);
    refreshRegistration().catch(console.error);
  }, [refreshRegistration]);

  useEffect(() => {
    if (provider && !mxePublicKey) fetchMxePublicKey(provider).then(setMxePublicKey).catch(console.error);
  }, [provider, mxePublicKey]);

  const unlock = useCallback(async () => {
    if (!wallet || !signMessage) throw new Error("This wallet cannot sign messages");
    const signature = await signMessage(new TextEncoder().encode(SIGN_MESSAGE));
    const derived = deriveKeys(signature);
    saveKeys(wallet, derived);
    setKeys(derived);
  }, [wallet, signMessage]);

  const register = useCallback(async () => {
    if (!program || !publicKey || !keys) throw new Error("Unlock first");
    await program.methods
      .registerUser(Array.from(keys.publicKey))
      .accountsPartial({ owner: publicKey })
      .rpc({ commitment: "confirmed" });
    await refreshRegistration();
  }, [program, publicKey, keys, refreshRegistration]);

  const lock = useCallback(() => {
    if (wallet) clearKeys(wallet);
    setKeys(null);
  }, [wallet]);

  const keyMismatch =
    !!keys &&
    !!registeredKey &&
    Buffer.compare(Buffer.from(keys.publicKey), Buffer.from(registeredKey)) !== 0;

  const value: PrivateAccount = {
    provider,
    program,
    keys,
    mxePublicKey,
    registered: registeredKey === undefined ? null : registeredKey !== null,
    keyMismatch,
    unlock,
    register,
    lock,
  };

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePrivateAccount(): PrivateAccount {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("usePrivateAccount must be used inside PrivateAccountProvider");
  return ctx;
}
