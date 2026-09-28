import { BACKEND_URL } from "./config";

export interface TokenMeta {
  mint: string;
  creator: string;
  name: string;
  symbol: string;
  uri: string;
  image: string | null;
  description: string | null;
  maxSupply: string;
  isUsdc: boolean;
  createdAt: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Backend error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Pins the image + metadata JSON to IPFS. Returns the metadata URI. */
export function uploadMetadata(input: {
  name: string;
  symbol: string;
  description: string;
  image: File;
}): Promise<{ uri: string; image: string }> {
  const form = new FormData();
  form.append("name", input.name);
  form.append("symbol", input.symbol);
  form.append("description", input.description);
  form.append("image", input.image);
  return request("/api/metadata", { method: "POST", body: form });
}

/** Asks the backend to index a token (it re-reads everything from the chain). */
export function registerToken(mint: string): Promise<TokenMeta> {
  return request("/api/tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mint }),
  });
}

export function listTokens(creator?: string): Promise<TokenMeta[]> {
  return request(`/api/tokens${creator ? `?creator=${creator}` : ""}`);
}
