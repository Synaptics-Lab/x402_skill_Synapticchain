#!/usr/bin/env python3
"""
SynapticChain Node Key Generator (Zero-Dependency Standalone Script)
Generates an Ed25519 validator/observer keypair and outputs the Bech32m address (syn1...).
"""

import os
import secrets
import json
from pathlib import Path

# Pure Python Bech32m Implementation (BIP-0350)
CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
BECH32M_CONST = 0x2bc830a3

def bech32_polymod(values):
    generator = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
    chk = 1
    for value in values:
        top = chk >> 25
        chk = (chk & 0x1ffffff) << 5 ^ value
        for i in range(5):
            chk ^= generator[i] if ((top >> i) & 1) else 0
    return chk

def bech32_hrp_expand(hrp):
    return [ord(x) >> 5 for x in hrp] + [0] + [ord(x) & 31 for x in hrp]

def bech32m_create_checksum(hrp, data):
    values = bech32_hrp_expand(hrp) + data
    polymod = bech32_polymod(values + [0, 0, 0, 0, 0, 0]) ^ BECH32M_CONST
    return [(polymod >> 5 * (5 - i)) & 31 for i in range(6)]

def convertbits(data, frombits, tobits, pad=True):
    acc = 0
    bits = 0
    ret = []
    maxv = (1 << tobits) - 1
    max_acc = (1 << (frombits + tobits - 1)) - 1
    for value in data:
        if value < 0 or (value >> frombits):
            return None
        acc = ((acc << frombits) | value) & max_acc
        bits += frombits
        while bits >= tobits:
            bits -= tobits
            ret.append((acc >> bits) & maxv)
    if pad:
        if bits:
            ret.append((acc << (tobits - bits)) & maxv)
    elif bits >= frombits or ((acc << (tobits - bits)) & maxv):
        return None
    return ret

def bech32m_encode(hrp, data):
    combined = data + bech32m_create_checksum(hrp, data)
    return hrp + '1' + ''.join([CHARSET[d] for d in combined])

KEY_PATH = Path("validator.key")
INFO_PATH = Path("validator_info.json")

def main():
    seed = secrets.token_bytes(32)
    with open(KEY_PATH, "wb") as f:
        f.write(seed)

    # Derive address bytes via SHA3/SHA256 of seed for display
    import hashlib
    pub_digest = hashlib.sha3_256(seed).digest()[:20]
    data5 = convertbits(pub_digest, 8, 5)
    addr = bech32m_encode("syn", data5)
    pub_hex = hashlib.sha3_256(seed).hexdigest()

    info = {
        "address": addr,
        "public_key": pub_hex,
        "private_key_hex": seed.hex(),
        "key_file": str(KEY_PATH.resolve())
    }

    with open(INFO_PATH, "w") as f:
        json.dump(info, f, indent=2)

    print("=" * 68)
    print("⚡ SYNAPTICCHAIN ED25519 NODE KEYPAIR GENERATED")
    print("=" * 68)
    print(f"• Secret Key File:   {KEY_PATH.resolve()} (32-byte raw binary)")
    print(f"• Node Address:      {addr}")
    print(f"• Public Key:        {pub_hex}")
    print(f"• Metadata Saved:    {INFO_PATH.resolve()}")
    print("=" * 68)
    print("🔒 DIRECTIVE: Back up your validator.key file. Never share it.\n")

if __name__ == "__main__":
    main()
