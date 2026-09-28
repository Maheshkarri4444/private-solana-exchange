import { Buffer } from "buffer";

// @arcium-hq/client and @anchor-lang/core expect Node's global Buffer.
if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = Buffer;
}
