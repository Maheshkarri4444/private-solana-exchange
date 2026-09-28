#!/usr/bin/env bash
# Compiles the unshield circuit and runs a local trusted setup.
# Dev only: one contributor (this machine). A real launch would use a
# multi-party ceremony so nobody knows the setup secret.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build

circom circuits/unshield.circom --r1cs --wasm --sym -o build

# Phase 1 (powers of tau, 2^18 fits our ~163k constraints). Reused across builds.
if [ ! -f build/pot18_final.ptau ]; then
  npx snarkjs powersoftau new bn128 18 build/pot18_0000.ptau
  npx snarkjs powersoftau contribute build/pot18_0000.ptau build/pot18_0001.ptau \
    --name="private exchange dev" -e="$(openssl rand -hex 32)"
  npx snarkjs powersoftau prepare phase2 build/pot18_0001.ptau build/pot18_final.ptau
  rm build/pot18_0000.ptau build/pot18_0001.ptau
fi

# Phase 2 (circuit specific).
npx snarkjs groth16 setup build/unshield.r1cs build/pot18_final.ptau build/unshield_0000.zkey
npx snarkjs zkey contribute build/unshield_0000.zkey build/unshield.zkey \
  --name="private exchange dev" -e="$(openssl rand -hex 32)"
rm build/unshield_0000.zkey
npx snarkjs zkey export verificationkey build/unshield.zkey build/verification_key.json
echo "done: build/unshield.zkey, build/verification_key.json"
