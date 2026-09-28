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

/** Base units → plain number (for display math only). */
export const toNumber = (base: bigint) => Number(base) / Number(SCALE);

const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉";

/**
 * Memecoin-style prices: 0.0012345 → "0.001234", 0.0000001234 → "0.0₆1234".
 */
export function formatPrice(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return "0";
  if (price >= 1) return price.toLocaleString("en-US", { maximumFractionDigits: 4 });
  const zeros = Math.floor(-Math.log10(price)); // leading zeros after "0."
  const digits = Math.round(price * 10 ** (zeros + 4)).toString().slice(0, 4).replace(/0+$/, "");
  if (zeros < 4) return `0.${"0".repeat(zeros)}${digits}`;
  const sub = String(zeros).split("").map((d) => SUBSCRIPT[Number(d)]).join("");
  return `0.0${sub}${digits}`;
}

/** 1234567 → "$1.23M" */
export function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "$0";
  if (value < 1) return `$${formatPrice(value)}`;
  return `$${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value)}`;
}

export function formatPct(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export const shortAddress = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;
