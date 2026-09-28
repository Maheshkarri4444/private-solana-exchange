import { config } from "./config.js";

const PINATA_API = "https://api.pinata.cloud/pinning";

export const gatewayUrl = (cid: string) => `${config.pinataGateway}/ipfs/${cid}`;

async function pinataRequest(path: string, body: FormData | string): Promise<string> {
  const headers: Record<string, string> = { Authorization: `Bearer ${config.pinataJwt}` };
  if (typeof body === "string") headers["Content-Type"] = "application/json";

  const res = await fetch(`${PINATA_API}/${path}`, { method: "POST", headers, body });
  if (!res.ok) throw new Error(`Pinata ${path} failed: ${res.status} ${await res.text()}`);
  const { IpfsHash } = (await res.json()) as { IpfsHash: string };
  return IpfsHash;
}

/** Pins a file to IPFS and returns its CID. */
export function pinFile(data: Buffer, fileName: string, mimeType: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(data)], { type: mimeType }), fileName);
  form.append("pinataMetadata", JSON.stringify({ name: fileName }));
  return pinataRequest("pinFileToIPFS", form);
}

/** Pins a JSON document to IPFS and returns its CID. */
export function pinJson(name: string, content: object): Promise<string> {
  return pinataRequest(
    "pinJSONToIPFS",
    JSON.stringify({ pinataContent: content, pinataMetadata: { name } }),
  );
}
