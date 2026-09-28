// Checks the circuit against an independent SHA3-256: a valid withdrawal must
// produce a witness, and every cheat must be rejected.
import * as snarkjs from "snarkjs";
import { commitment } from "./commitment.mjs";

const WASM = "build/unshield_js/unshield.wasm";
const R1CS = "build/unshield.r1cs";

async function accepts(input) {
  try {
    await snarkjs.wtns.calculate(input, WASM, "build/test.wtns");
    return await snarkjs.wtns.check(R1CS, "build/test.wtns", { info() {}, warn() {}, error() {} });
  } catch {
    return false;
  }
}

const balance = 250_000_000n; // 250 tokens
const salt = 0x0f1e2d3c4b5a69788796a5b4c3d2e1f0n;
const { hi, lo } = commitment(balance, salt);
const base = { commitmentHi: hi, commitmentLo: lo, balance, salt };

const cases = [
  ["withdraw part of the balance", { ...base, amount: 100_000_000n }, true],
  ["withdraw the whole balance", { ...base, amount: balance }, true],
  ["withdraw more than the balance", { ...base, amount: balance + 1n }, false],
  ["withdraw zero", { ...base, amount: 0n }, false],
  ["lie about the balance", { ...base, balance: balance * 10n, amount: 100_000_000n }, false],
  ["wrong salt", { ...base, salt: salt + 1n, amount: 1n }, false],
  ["someone else's fingerprint", { ...base, commitmentLo: lo ^ 1n, amount: 1n }, false],
];

let failed = 0;
for (const [name, input, expected] of cases) {
  const ok = await accepts(input);
  const pass = ok === expected;
  if (!pass) failed++;
  console.log(`${pass ? "✔" : "✘"} ${name}: ${ok ? "accepted" : "rejected"}`);
}
console.log(failed ? `${failed} case(s) FAILED` : "all cases passed");
process.exit(failed ? 1 : 0);
