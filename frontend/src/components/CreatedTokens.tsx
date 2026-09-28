"use client";

import { TOKEN_2022_PROGRAM_ID, getMint } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { useEffect, useState } from "react";
import { usePrivateAccount } from "@/hooks/usePrivateAccount";
import type { TokenMeta } from "@/lib/api";
import { explorerUrl } from "@/lib/config";
import { formatAmount, shortAddress } from "@/lib/format";
import { pdas } from "@/lib/program";
import { Card, TokenIcon } from "./ui";

interface Row {
  token: TokenMeta;
  exchangeSupply: bigint;
  splSupply: bigint;
}

/** Tokens you created, with their public supplies. */
export function CreatedTokens({ tokens, version }: { tokens: TokenMeta[]; version: number }) {
  const { program, provider } = usePrivateAccount();
  const [rows, setRows] = useState<Row[]>([]);

  const me = provider?.wallet.publicKey.toBase58();
  const mine = tokens.filter((t) => t.creator === me && !t.isUsdc);

  useEffect(() => {
    if (!program || !provider || mine.length === 0) {
      setRows([]);
      return;
    }
    Promise.all(
      mine.map(async (token) => {
        const mint = new PublicKey(token.mint);
        const [info, spl] = await Promise.all([
          program.account.tokenInfo.fetch(pdas.tokenInfo(mint)),
          getMint(provider.connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID),
        ]);
        return { token, exchangeSupply: BigInt(info.exchangeSupply.toString()), splSupply: spl.supply };
      }),
    )
      .then(setRows)
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, provider, tokens, version]);

  return (
    <Card
      title="Tokens you created"
      subtitle="Supplies are public. Who holds how much is private."
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No tokens yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="pb-3 font-medium">Token</th>
                <th className="pb-3 text-right font-medium">Exchange supply</th>
                <th className="pb-3 text-right font-medium">SPL supply</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map(({ token, exchangeSupply, splSupply }) => (
                <tr key={token.mint}>
                  <td className="py-3">
                    <div className="flex items-center gap-3">
                      <TokenIcon image={token.image} symbol={token.symbol} size={32} />
                      <div>
                        <p className="font-medium">{token.symbol}</p>
                        <a href={explorerUrl(token.mint)} target="_blank" rel="noreferrer" className="text-xs text-muted hover:text-fg">
                          {token.name} · {shortAddress(token.mint)}
                        </a>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 text-right font-mono">{formatAmount(exchangeSupply)}</td>
                  <td className="py-3 text-right font-mono text-muted">{formatAmount(splSupply)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
