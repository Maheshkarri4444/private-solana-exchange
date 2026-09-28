/** Browser stand-in for Node's `fs`. @arcium-hq/client only uses it for file loading we never call. */
function unsupported(): never {
  throw new Error("fs is not available in the browser");
}

export const readFileSync = unsupported;
export default { readFileSync };
