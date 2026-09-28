pragma circom 2.1.6;

include "vendor/keccak/sha3_bytes.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

// Splits a number into `n` little-endian bytes (range-checks it to 8n bits).
template ToBytesLE(n) {
    signal input in;
    signal output out[n];

    component bits = Num2Bits(8 * n);
    bits.in <== in;
    for (var i = 0; i < n; i++) {
        var byte = 0;
        for (var j = 0; j < 8; j++) {
            byte += bits.out[8 * i + j] * (1 << j);
        }
        out[i] <== byte;
    }
}

// Proves, without revealing `balance` or `salt`:
//   1. SHA3-256(balance ‖ salt) is the fingerprint Arcium published for your account
//   2. 0 < amount <= balance
//
// Arcium hashed exactly these 24 bytes: balance (8, little-endian) ‖ salt (16, little-endian).
template Unshield() {
    // Public: the fingerprint (as two 128-bit halves, big-endian) and the amount.
    signal input commitmentHi;
    signal input commitmentLo;
    signal input amount;

    // Private: only the owner knows these.
    signal input balance;
    signal input salt;

    component balanceBytes = ToBytesLE(8);
    component saltBytes = ToBytesLE(16);
    balanceBytes.in <== balance;
    saltBytes.in <== salt;

    component sha3 = SHA3_256_bytes(24);
    for (var i = 0; i < 8; i++) sha3.inp_bytes[i] <== balanceBytes.out[i];
    for (var i = 0; i < 16; i++) sha3.inp_bytes[8 + i] <== saltBytes.out[i];

    // The digest must be exactly the published fingerprint.
    var hi = 0;
    var lo = 0;
    for (var i = 0; i < 16; i++) {
        hi = hi * 256 + sha3.out_bytes[i];
        lo = lo * 256 + sha3.out_bytes[16 + i];
    }
    hi === commitmentHi;
    lo === commitmentLo;

    // 0 < amount <= balance (both range-checked to 64 bits).
    component amountBits = Num2Bits(64);
    amountBits.in <== amount;
    component enough = LessEqThan(64);
    enough.in[0] <== amount;
    enough.in[1] <== balance;
    enough.out === 1;
    component isZero = IsZero();
    isZero.in <== amount;
    isZero.out === 0;
}

component main { public [commitmentHi, commitmentLo, amount] } = Unshield();
