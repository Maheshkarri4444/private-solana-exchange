import idl from "@/idl/private_solana_exchange.json";

const byCode = new Map(idl.errors.map((e) => [e.code, e.msg]));

/** Turns wallet / program errors into a sentence a user can act on. */
export function explainError(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e);
  if (/user rejected|rejected the request|declined/i.test(text)) return "You cancelled the transaction.";

  // Program errors show up as "custom program error: 0x1771" or {"Custom":6001}.
  const hex = text.match(/custom program error: 0x([0-9a-f]+)/i);
  const dec = text.match(/"Custom":\s*(\d+)/);
  const code = hex ? parseInt(hex[1], 16) : dec ? Number(dec[1]) : null;
  const known = code !== null ? byCode.get(code) : undefined;
  if (known) return known;

  if (/insufficient (funds|lamports)|debit an account/i.test(text)) {
    return "Your wallet needs a little devnet SOL for transaction fees.";
  }
  return text;
}
