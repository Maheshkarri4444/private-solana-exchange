import { TOKEN_DECIMALS } from "./config";

const SCALE = 10n ** BigInt(TOKEN_DECIMALS);

/** 1234560000n → "1,234.56" */
export function formatAmount(base: bigint, maxFractionDigits = 2): string {
  const whole = base / SCALE;
  const fraction = (base % SCALE).toString().padStart(TOKEN_DECIMALS, "0");
  const shown = fraction.slice(0, maxFractionDigits).replace(/0+$/, "");
  return whole.toLocaleString("en-US") + (shown ? `.${shown}` : "");
}

/** "12.5" → 12500000n. Returns null for invalid or too-precise input. */
export function parseAmount(input: string): bigint | null {
  const value = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > TOKEN_DECIMALS) return null;
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(TOKEN_DECIMALS, "0"));
}

export const shortAddress = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;
