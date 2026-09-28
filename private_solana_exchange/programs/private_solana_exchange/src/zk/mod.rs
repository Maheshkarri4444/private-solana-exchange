//! Groth16 verifier for the unshield proof, on Solana's alt_bn128 syscalls.
//!
//! The proof shows, without revealing `balance` or `salt`:
//!   SHA3-256(balance ‖ salt) == the fingerprint Arcium published for the account
//!   0 < amount <= balance
//! Circuit: `zk/circuits/unshield.circom`.

use anchor_lang::prelude::*;
use solana_bn254::prelude::{alt_bn128_addition, alt_bn128_multiplication, alt_bn128_pairing};

use crate::error::ErrorCode;

mod unshield_vk;

/// A Groth16 proof in the syscalls' (EIP-197) encoding: big-endian field
/// elements, G2 as x.c1 ‖ x.c0 ‖ y.c1 ‖ y.c0.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Groth16Proof {
    pub a: [u8; 64],
    pub b: [u8; 128],
    pub c: [u8; 64],
}

/// BN254 base field modulus, used to negate a G1 point.
const FIELD_MODULUS: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x97, 0x81, 0x6a, 0x91, 0x68, 0x71, 0xca, 0x8d, 0x3c, 0x20, 0x8c, 0x16, 0xd8, 0x7c, 0xfd, 0x47,
];

/// Public inputs, in circuit order: the fingerprint's two 16-byte halves, then the amount.
pub fn unshield_inputs(fingerprint: &[u8; 32], amount: u64) -> [[u8; 32]; 3] {
    let mut hi = [0u8; 32];
    let mut lo = [0u8; 32];
    let mut amt = [0u8; 32];
    hi[16..].copy_from_slice(&fingerprint[..16]);
    lo[16..].copy_from_slice(&fingerprint[16..]);
    amt[24..].copy_from_slice(&amount.to_be_bytes());
    [hi, lo, amt]
}

/// Checks e(-A, B) · e(α, β) · e(vk_x, γ) · e(C, δ) == 1,
/// where vk_x = IC₀ + Σ inputᵢ · ICᵢ₊₁.
///
/// Every input must be below the BN254 scalar field; `unshield_inputs` only
/// builds values of at most 128 bits, so they always are.
pub fn verify_unshield(proof: &Groth16Proof, inputs: &[[u8; 32]; 3]) -> Result<()> {
    use unshield_vk::*;

    let mut vk_x = IC[0];
    for (input, ic) in inputs.iter().zip(IC[1..].iter()) {
        let mut mul = [0u8; 96];
        mul[..64].copy_from_slice(ic);
        mul[64..].copy_from_slice(input);
        let term = alt_bn128_multiplication(&mul).map_err(|_| ErrorCode::InvalidProof)?;

        let mut add = [0u8; 128];
        add[..64].copy_from_slice(&vk_x);
        add[64..].copy_from_slice(&term);
        let sum = alt_bn128_addition(&add).map_err(|_| ErrorCode::InvalidProof)?;
        vk_x.copy_from_slice(&sum);
    }

    let mut pairs = Vec::with_capacity(4 * 192);
    pairs.extend_from_slice(&negate_g1(&proof.a)?);
    pairs.extend_from_slice(&proof.b);
    pairs.extend_from_slice(&ALPHA_G1);
    pairs.extend_from_slice(&BETA_G2);
    pairs.extend_from_slice(&vk_x);
    pairs.extend_from_slice(&GAMMA_G2);
    pairs.extend_from_slice(&proof.c);
    pairs.extend_from_slice(&DELTA_G2);

    let result = alt_bn128_pairing(&pairs).map_err(|_| ErrorCode::InvalidProof)?;
    let ok = result[..31].iter().all(|b| *b == 0) && result[31] == 1;
    require!(ok, ErrorCode::InvalidProof);
    Ok(())
}

/// -(x, y) = (x, q - y). Rejects a non-canonical y (y >= q).
fn negate_g1(point: &[u8; 64]) -> Result<[u8; 64]> {
    let mut out = *point;
    if point[32..].iter().all(|b| *b == 0) {
        return Ok(out); // point at infinity
    }
    let mut borrow = 0i16;
    for i in (0..32).rev() {
        let mut diff = FIELD_MODULUS[i] as i16 - point[32 + i] as i16 - borrow;
        borrow = (diff < 0) as i16;
        if diff < 0 {
            diff += 256;
        }
        out[32 + i] = diff as u8;
    }
    require!(borrow == 0, ErrorCode::InvalidProof);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Runs the verifier (host build of the same syscalls) on a proof made by
    /// `zk/scripts/export.mjs`. Skipped when the ZK build has not been run.
    #[test]
    fn verifies_snarkjs_proof() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../../zk/build/fixture.json");
        let Ok(text) = std::fs::read_to_string(path) else {
            eprintln!("skipped: {path} not found");
            return;
        };
        let hex = |key: &str| -> Vec<u8> {
            let start = text.find(&format!("\"{key}\": \"")).unwrap() + key.len() + 5;
            let end = start + text[start..].find('"').unwrap();
            (start..end)
                .step_by(2)
                .map(|i| u8::from_str_radix(&text[i..i + 2], 16).unwrap())
                .collect()
        };
        let proof = Groth16Proof {
            a: hex("a").try_into().unwrap(),
            b: hex("b").try_into().unwrap(),
            c: hex("c").try_into().unwrap(),
        };
        let fingerprint: [u8; 32] = hex("fingerprint").try_into().unwrap();
        let amount = u64::from_str_radix(
            &hex("amount").iter().map(|b| format!("{b:02x}")).collect::<String>(),
            16,
        )
        .unwrap();

        assert!(verify_unshield(&proof, &unshield_inputs(&fingerprint, amount)).is_ok());
        // Same proof, different amount or fingerprint: rejected.
        assert!(verify_unshield(&proof, &unshield_inputs(&fingerprint, amount + 1)).is_err());
        let mut other = fingerprint;
        other[31] ^= 1;
        assert!(verify_unshield(&proof, &unshield_inputs(&other, amount)).is_err());
    }
}
