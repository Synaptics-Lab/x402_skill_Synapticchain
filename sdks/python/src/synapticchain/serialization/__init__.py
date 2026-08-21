"""
Serialization for SynapticChain SDK.

This module provides Borsh and JSON serialization for transactions
and other data types.

Example:
    >>> from synapticchain.serialization import borsh_serialize, borsh_deserialize
    >>> data = borsh_serialize(transaction)
    >>> tx = borsh_deserialize(data)
"""

from __future__ import annotations

import json
import struct
from typing import TYPE_CHECKING, Any, Union

from synapticchain.crypto import hash_sha3_256
from synapticchain.errors import SerializationError

if TYPE_CHECKING:
    from synapticchain.types import (
        CallPayload,
        DeployPayload,
        Payload,
        Transaction,
        TransferPayload,
        UnsignedTransaction,
        Value,
    )


def compute_signing_bytes(tx: Union[UnsignedTransaction, Transaction]) -> bytes:
    """Compute the signing bytes for a transaction.

    The signing bytes format is:
    nonce (8 bytes LE) || nonce_key (8 bytes LE) || from (20 bytes) || borsh(payload) ||
    gas_limit (8 bytes LE) || gas_price (8 bytes LE) || parents_len (4 bytes LE) || parents (raw hashes) || timestamp (8 bytes LE)

    CRITICAL: Parents are serialized WITH a length prefix in signing bytes (matches Rust implementation).

    Args:
        tx: The transaction to compute signing bytes for

    Returns:
        The signing bytes
    """
    parts = []

    # nonce: u64 little-endian
    parts.append(struct.pack("<Q", tx.nonce))

    # nonce_key: u64 little-endian (NEW FIELD for parallel lanes)
    nonce_key = getattr(tx, 'nonce_key', 0)
    parts.append(struct.pack("<Q", nonce_key))

    # from: 20 bytes
    parts.append(tx.from_address.to_bytes())

    # payload: borsh-encoded
    parts.append(_serialize_payload(tx.payload))

    # gas_limit: u64 little-endian
    parts.append(struct.pack("<Q", tx.gas_limit))

    # gas_price: u64 little-endian
    parts.append(struct.pack("<Q", tx.gas_price))

    # parents: length prefix (4 bytes LE) + raw hashes (matches Rust implementation)
    parts.append(struct.pack("<I", len(tx.parents)))
    for parent in tx.parents:
        parts.append(parent)

    # timestamp: u64 little-endian
    parts.append(struct.pack("<Q", tx.timestamp))

    # chain_id: u64 little-endian
    parts.append(struct.pack("<Q", getattr(tx, 'chain_id', 0)))

    # shard_hint: u32 little-endian
    shard_hint = getattr(tx, 'shard_hint', None)
    parts.append(struct.pack("<I", shard_hint if shard_hint is not None else 0))

    # public_key: 32 bytes — binds the signature to the exact key used.
    # The Rust node includes public_key in signing_bytes (C-4 fix); omitting it
    # causes "invalid transaction signature" on newer binaries.
    public_key = getattr(tx, 'public_key', None)
    if public_key is not None and len(public_key) == 32:
        parts.append(public_key)
    else:
        parts.append(bytes(32))

    return b"".join(parts)


def compute_tx_id(tx: Union[UnsignedTransaction, Transaction]) -> bytes:
    """Compute the transaction ID as SHA3-256 of signing bytes.

    Args:
        tx: The transaction to compute ID for

    Returns:
        The 32-byte transaction ID
    """
    signing_bytes = compute_signing_bytes(tx)
    return hash_sha3_256(signing_bytes)


def _serialize_payload(payload: Payload) -> bytes:
    """Serialize a payload to Borsh format.
    
    CRITICAL: Variant order MUST match Rust Payload enum exactly:
    0 = Deploy, 1 = Call, 2 = Transfer
    """
    from synapticchain.types import CallPayload, DeployPayload, TransferPayload

    parts = []

    if isinstance(payload, DeployPayload):
        # Variant 0: Deploy (matches Rust enum order)
        parts.append(struct.pack("<B", 0))
        # code: length prefix + bytes
        parts.append(struct.pack("<I", len(payload.code)))
        parts.append(payload.code)
        # constructor_args: length prefix + values
        parts.append(struct.pack("<I", len(payload.constructor_args)))
        for arg in payload.constructor_args:
            parts.append(_serialize_value(arg))

    elif isinstance(payload, CallPayload):
        # Variant 1: Call (matches Rust enum order)
        parts.append(struct.pack("<B", 1))
        # contract: 20 bytes
        parts.append(payload.contract.to_bytes())
        # function: 4 bytes
        parts.append(payload.function.to_bytes())
        # args: length prefix + values
        parts.append(struct.pack("<I", len(payload.args)))
        for arg in payload.args:
            parts.append(_serialize_value(arg))
        # value: 32 bytes (U256 as BIG-endian for payable calls)
        value_bytes = getattr(payload, 'value', bytes(32))
        if len(value_bytes) != 32:
            value_bytes = bytes(32)
        parts.append(value_bytes)

    elif isinstance(payload, TransferPayload):
        # Variant 2: Transfer (matches Rust enum order)
        parts.append(struct.pack("<B", 2))
        # to: 20 bytes
        parts.append(payload.to.to_bytes())
        # amount: 32 bytes (U256 as BIG-endian, NOT little-endian!)
        parts.append(payload.amount.to_bytes(32, byteorder="big"))

    else:
        raise SerializationError(
            code=SerializationError.UNEXPECTED_TYPE,
            message=f"Unknown payload type: {type(payload)}",
        )

    return b"".join(parts)


def _serialize_value(value: Value) -> bytes:
    """Serialize a Value to Borsh format."""
    from synapticchain.types import ValueType

    parts = []

    # Write type discriminant
    type_map = {
        ValueType.BOOL: 0,
        ValueType.U8: 1,
        ValueType.U16: 2,
        ValueType.U32: 3,
        ValueType.U64: 4,
        ValueType.U128: 5,
        ValueType.U256: 6,
        ValueType.I8: 7,
        ValueType.I16: 8,
        ValueType.I32: 9,
        ValueType.I64: 10,
        ValueType.I128: 11,
        ValueType.ADDRESS: 12,
        ValueType.BYTES: 13,
        ValueType.STRING: 14,
        ValueType.ARRAY: 15,
        ValueType.OPTION: 16,
        ValueType.UNIT: 17,
    }

    parts.append(struct.pack("<B", type_map[value.type]))

    if value.type == ValueType.BOOL:
        parts.append(struct.pack("<B", 1 if value.value else 0))
    elif value.type == ValueType.U8:
        parts.append(struct.pack("<B", value.value))
    elif value.type == ValueType.U16:
        parts.append(struct.pack("<H", value.value))
    elif value.type == ValueType.U32:
        parts.append(struct.pack("<I", value.value))
    elif value.type == ValueType.U64:
        parts.append(struct.pack("<Q", value.value))
    elif value.type == ValueType.U128:
        parts.append(value.value.to_bytes(16, byteorder="little"))
    elif value.type == ValueType.U256:
        parts.append(value.value.to_bytes(32, byteorder="little"))
    elif value.type == ValueType.I8:
        parts.append(struct.pack("<b", value.value))
    elif value.type == ValueType.I16:
        parts.append(struct.pack("<h", value.value))
    elif value.type == ValueType.I32:
        parts.append(struct.pack("<i", value.value))
    elif value.type == ValueType.I64:
        parts.append(struct.pack("<q", value.value))
    elif value.type == ValueType.I128:
        parts.append(value.value.to_bytes(16, byteorder="little", signed=True))
    elif value.type == ValueType.ADDRESS:
        parts.append(value.value.to_bytes())
    elif value.type == ValueType.BYTES:
        parts.append(struct.pack("<I", len(value.value)))
        parts.append(value.value)
    elif value.type == ValueType.STRING:
        encoded = value.value.encode("utf-8")
        parts.append(struct.pack("<I", len(encoded)))
        parts.append(encoded)
    elif value.type == ValueType.ARRAY:
        parts.append(struct.pack("<I", len(value.value)))
        for item in value.value:
            parts.append(_serialize_value(item))
    elif value.type == ValueType.OPTION:
        if value.value is None:
            parts.append(struct.pack("<B", 0))
        else:
            parts.append(struct.pack("<B", 1))
            parts.append(_serialize_value(value.value))
    elif value.type == ValueType.UNIT:
        pass  # No data for unit

    return b"".join(parts)


def borsh_serialize(tx: Transaction) -> bytes:
    """Serialize a transaction to Borsh format.

    CRITICAL: Field order MUST match Rust Transaction struct exactly:
    nonce, nonce_key, from, public_key, signature, payload, gas_limit, gas_price, parents, timestamp, chain_id

    Args:
        tx: The transaction to serialize

    Returns:
        The Borsh-encoded bytes
    """
    parts = []

    # nonce: u64 little-endian
    parts.append(struct.pack("<Q", tx.nonce))

    # nonce_key: u64 little-endian (NEW FIELD for parallel lanes)
    nonce_key = getattr(tx, 'nonce_key', 0)
    parts.append(struct.pack("<Q", nonce_key))

    # from: 20 bytes
    parts.append(tx.from_address.to_bytes())

    # public_key: 32 bytes (BEFORE signature - matches Rust struct order)
    public_key = getattr(tx, 'public_key', b'\x00' * 32)
    if isinstance(public_key, bytes):
        parts.append(public_key)
    else:
        parts.append(bytes(public_key))

    # signature: 64 bytes (AFTER public_key - matches Rust struct order)
    parts.append(tx.signature)

    # payload: borsh-encoded (AFTER signature - matches Rust struct order)
    parts.append(_serialize_payload(tx.payload))

    # gas_limit: u64 little-endian
    parts.append(struct.pack("<Q", tx.gas_limit))

    # gas_price: u64 little-endian
    parts.append(struct.pack("<Q", tx.gas_price))

    # parents: length prefix + hashes
    parts.append(struct.pack("<I", len(tx.parents)))
    for parent in tx.parents:
        parts.append(parent)

    # timestamp: u64 little-endian
    parts.append(struct.pack("<Q", tx.timestamp))

    # chain_id: u64 little-endian (LAST field - matches Rust BorshSerialize derive)
    parts.append(struct.pack("<Q", getattr(tx, 'chain_id', 0)))

    return b"".join(parts)


def borsh_deserialize(data: bytes) -> Transaction:
    """Deserialize a transaction from Borsh format.

    Args:
        data: The Borsh-encoded bytes

    Returns:
        The deserialized Transaction

    Raises:
        SerializationError: If the data is invalid
    """
    from synapticchain.address import Address
    from synapticchain.types import Transaction

    try:
        offset = 0

        # nonce: u64
        nonce = struct.unpack_from("<Q", data, offset)[0]
        offset += 8

        # nonce_key: u64 (NEW FIELD for parallel lanes)
        nonce_key = struct.unpack_from("<Q", data, offset)[0]
        offset += 8

        # from: 20 bytes
        from_address = Address(data[offset : offset + 20])
        offset += 20

        # public_key: 32 bytes (BEFORE signature - matches Rust struct order)
        public_key = data[offset : offset + 32]
        offset += 32

        # signature: 64 bytes (AFTER public_key - matches Rust struct order)
        signature = data[offset : offset + 64]
        offset += 64

        # payload
        payload, offset = _deserialize_payload(data, offset)

        # gas_limit: u64
        gas_limit = struct.unpack_from("<Q", data, offset)[0]
        offset += 8

        # gas_price: u64
        gas_price = struct.unpack_from("<Q", data, offset)[0]
        offset += 8

        # parents
        parents_len = struct.unpack_from("<I", data, offset)[0]
        offset += 4
        parents = []
        for _ in range(parents_len):
            parents.append(data[offset : offset + 32])
            offset += 32

        # timestamp: u64
        timestamp = struct.unpack_from("<Q", data, offset)[0]
        offset += 8

        # chain_id: u64 (LAST field - read if present for backward compatibility)
        chain_id = 0
        if offset + 8 <= len(data):
            chain_id = struct.unpack_from("<Q", data, offset)[0]
            offset += 8

        tx = Transaction(
            nonce=nonce,
            nonce_key=nonce_key,
            from_address=from_address,
            public_key=public_key,
            signature=signature,
            payload=payload,
            gas_limit=gas_limit,
            gas_price=gas_price,
            parents=parents,
            timestamp=timestamp,
            chain_id=chain_id,
        )

        # Compute tx_id
        tx.tx_id = compute_tx_id(tx)

        return tx

    except Exception as e:
        raise SerializationError(
            code=SerializationError.INVALID_FORMAT,
            message=f"Failed to deserialize transaction: {e}",
        ) from e


def _deserialize_payload(data: bytes, offset: int) -> tuple[Payload, int]:
    """Deserialize a payload from Borsh format.
    
    CRITICAL: Variant order MUST match Rust Payload enum exactly:
    0 = Deploy, 1 = Call, 2 = Transfer
    """
    from synapticchain.address import Address
    from synapticchain.types import (
        CallPayload,
        DeployPayload,
        FunctionSelector,
        TransferPayload,
    )

    variant = struct.unpack_from("<B", data, offset)[0]
    offset += 1

    if variant == 0:  # Deploy (matches Rust enum order)
        code_len = struct.unpack_from("<I", data, offset)[0]
        offset += 4
        code = data[offset : offset + code_len]
        offset += code_len

        args_len = struct.unpack_from("<I", data, offset)[0]
        offset += 4
        args = []
        for _ in range(args_len):
            value, offset = _deserialize_value(data, offset)
            args.append(value)

        return DeployPayload(code=code, constructor_args=args), offset

    elif variant == 1:  # Call (matches Rust enum order)
        contract = Address(data[offset : offset + 20])
        offset += 20
        function = FunctionSelector(data[offset : offset + 4])
        offset += 4

        args_len = struct.unpack_from("<I", data, offset)[0]
        offset += 4
        args = []
        for _ in range(args_len):
            value, offset = _deserialize_value(data, offset)
            args.append(value)

        # value: 32 bytes (U256 big-endian)
        call_value = data[offset : offset + 32]
        offset += 32

        return CallPayload(contract=contract, function=function, args=args, value=call_value), offset

    elif variant == 2:  # Transfer (matches Rust enum order)
        to = Address(data[offset : offset + 20])
        offset += 20
        # Amount is BIG-endian (matches Rust U256::from_big_endian)
        amount = int.from_bytes(data[offset : offset + 32], byteorder="big")
        offset += 32
        return TransferPayload(to=to, amount=amount), offset

    else:
        raise SerializationError(
            code=SerializationError.UNEXPECTED_TYPE,
            message=f"Unknown payload variant: {variant}",
        )


def _deserialize_value(data: bytes, offset: int) -> tuple[Value, int]:
    """Deserialize a Value from Borsh format."""
    from synapticchain.address import Address
    from synapticchain.types import Value, ValueType

    type_discriminant = struct.unpack_from("<B", data, offset)[0]
    offset += 1

    type_map = {
        0: ValueType.BOOL,
        1: ValueType.U8,
        2: ValueType.U16,
        3: ValueType.U32,
        4: ValueType.U64,
        5: ValueType.U128,
        6: ValueType.U256,
        7: ValueType.I8,
        8: ValueType.I16,
        9: ValueType.I32,
        10: ValueType.I64,
        11: ValueType.I128,
        12: ValueType.ADDRESS,
        13: ValueType.BYTES,
        14: ValueType.STRING,
        15: ValueType.ARRAY,
        16: ValueType.OPTION,
        17: ValueType.UNIT,
    }

    value_type = type_map.get(type_discriminant)
    if value_type is None:
        raise SerializationError(
            code=SerializationError.UNEXPECTED_TYPE,
            message=f"Unknown value type discriminant: {type_discriminant}",
        )

    if value_type == ValueType.BOOL:
        val = struct.unpack_from("<B", data, offset)[0] != 0
        return Value.bool(val), offset + 1
    elif value_type == ValueType.U8:
        val = struct.unpack_from("<B", data, offset)[0]
        return Value.u8(val), offset + 1
    elif value_type == ValueType.U16:
        val = struct.unpack_from("<H", data, offset)[0]
        return Value.u16(val), offset + 2
    elif value_type == ValueType.U32:
        val = struct.unpack_from("<I", data, offset)[0]
        return Value.u32(val), offset + 4
    elif value_type == ValueType.U64:
        val = struct.unpack_from("<Q", data, offset)[0]
        return Value.u64(val), offset + 8
    elif value_type == ValueType.U128:
        val = int.from_bytes(data[offset : offset + 16], byteorder="little")
        return Value.u128(val), offset + 16
    elif value_type == ValueType.U256:
        val = int.from_bytes(data[offset : offset + 32], byteorder="little")
        return Value.u256(val), offset + 32
    elif value_type == ValueType.I8:
        val = struct.unpack_from("<b", data, offset)[0]
        return Value.i8(val), offset + 1
    elif value_type == ValueType.I16:
        val = struct.unpack_from("<h", data, offset)[0]
        return Value.i16(val), offset + 2
    elif value_type == ValueType.I32:
        val = struct.unpack_from("<i", data, offset)[0]
        return Value.i32(val), offset + 4
    elif value_type == ValueType.I64:
        val = struct.unpack_from("<q", data, offset)[0]
        return Value.i64(val), offset + 8
    elif value_type == ValueType.I128:
        val = int.from_bytes(data[offset : offset + 16], byteorder="little", signed=True)
        return Value.i128(val), offset + 16
    elif value_type == ValueType.ADDRESS:
        val = Address(data[offset : offset + 20])
        return Value.address(val), offset + 20
    elif value_type == ValueType.BYTES:
        length = struct.unpack_from("<I", data, offset)[0]
        offset += 4
        val = data[offset : offset + length]
        return Value.bytes_val(val), offset + length
    elif value_type == ValueType.STRING:
        length = struct.unpack_from("<I", data, offset)[0]
        offset += 4
        val = data[offset : offset + length].decode("utf-8")
        return Value.string(val), offset + length
    elif value_type == ValueType.ARRAY:
        length = struct.unpack_from("<I", data, offset)[0]
        offset += 4
        items = []
        for _ in range(length):
            item, offset = _deserialize_value(data, offset)
            items.append(item)
        return Value.array(items), offset
    elif value_type == ValueType.OPTION:
        is_some = struct.unpack_from("<B", data, offset)[0] != 0
        offset += 1
        if is_some:
            inner, offset = _deserialize_value(data, offset)
            return Value.option(inner), offset
        else:
            return Value.option(None), offset
    elif value_type == ValueType.UNIT:
        return Value.unit(), offset

    raise SerializationError(
        code=SerializationError.UNEXPECTED_TYPE,
        message=f"Unhandled value type: {value_type}",
    )


def json_serialize(tx: Transaction) -> str:
    """Serialize a transaction to JSON format.

    Args:
        tx: The transaction to serialize

    Returns:
        The JSON string
    """
    return json.dumps(_tx_to_dict(tx), indent=2)


def json_deserialize(json_str: str) -> Transaction:
    """Deserialize a transaction from JSON format.

    Args:
        json_str: The JSON string

    Returns:
        The deserialized Transaction

    Raises:
        SerializationError: If the JSON is invalid
    """
    try:
        data = json.loads(json_str)
        return _dict_to_tx(data)
    except Exception as e:
        raise SerializationError(
            code=SerializationError.INVALID_FORMAT,
            message=f"Failed to deserialize JSON: {e}",
        ) from e


def _tx_to_dict(tx: Transaction) -> dict[str, Any]:
    """Convert a transaction to a dictionary matching Rust serde format."""
    from synapticchain.types import CallPayload, DeployPayload, TransferPayload

    # Rust uses tagged enum format: {"Transfer": {...}} not {"type": "transfer", ...}
    payload_dict: dict[str, Any]
    if isinstance(tx.payload, TransferPayload):
        # Amount must be 32-byte array in big-endian format
        amount_bytes = tx.payload.amount.to_bytes(32, byteorder='big')
        payload_dict = {
            "Transfer": {
                "to": tx.payload.to.to_bech32(),  # Bech32m string for human-readable
                "amount": list(amount_bytes),  # Array of bytes
            }
        }
    elif isinstance(tx.payload, DeployPayload):
        payload_dict = {
            "Deploy": {
                "code": list(tx.payload.code),  # Array of bytes
                "constructor_args": [_value_to_dict(v) for v in tx.payload.constructor_args],
            }
        }
    elif isinstance(tx.payload, CallPayload):
        value_bytes = getattr(tx.payload, 'value', bytes(32))
        if len(value_bytes) != 32:
            value_bytes = bytes(32)
        payload_dict = {
            "Call": {
                "contract": tx.payload.contract.to_bech32(),
                "function": list(tx.payload.function.to_bytes()),  # Array of 4 bytes
                "args": [_value_to_dict(v) for v in tx.payload.args],
                "value": list(value_bytes),  # Array of 32 bytes (big-endian U256)
            }
        }
    else:
        raise SerializationError(
            code=SerializationError.UNEXPECTED_TYPE,
            message=f"Unknown payload type: {type(tx.payload)}",
        )

    return {
        "nonce": tx.nonce,
        "from": tx.from_address.to_bech32(),  # Bech32m string for human-readable
        "signature": tx.signature.hex(),  # Hex string for human-readable
        "payload": payload_dict,
        "gas_limit": tx.gas_limit,  # u64, not string
        "gas_price": tx.gas_price,  # u64, not string
        "parents": [[b for b in p] for p in tx.parents],  # Array of byte arrays
        "timestamp": tx.timestamp,  # u64
    }


def _dict_to_tx(data: dict[str, Any]) -> Transaction:
    """Convert a dictionary to a transaction."""
    from synapticchain.address import Address
    from synapticchain.types import (
        CallPayload,
        DeployPayload,
        FunctionSelector,
        Transaction,
        TransferPayload,
    )

    payload_data = data["payload"]
    payload: Payload

    # Rust uses externally tagged enum format: {"Transfer": {...}}
    if "Transfer" in payload_data:
        transfer_data = payload_data["Transfer"]
        # Amount is a byte array in big-endian format
        amount_bytes = bytes(transfer_data["amount"])
        payload = TransferPayload(
            to=Address.from_bech32(transfer_data["to"]),
            amount=int.from_bytes(amount_bytes, byteorder='big'),
        )
    elif "Deploy" in payload_data:
        deploy_data = payload_data["Deploy"]
        payload = DeployPayload(
            code=bytes(deploy_data["code"]),
            constructor_args=[_dict_to_value(v) for v in deploy_data.get("constructor_args", [])],
        )
    elif "Call" in payload_data:
        call_data = payload_data["Call"]
        raw_value = call_data.get("value", [0] * 32)
        call_value_bytes = bytes(raw_value) if isinstance(raw_value, list) else bytes(32)
        payload = CallPayload(
            contract=Address.from_bech32(call_data["contract"]),
            function=FunctionSelector(bytes(call_data["function"])),
            args=[_dict_to_value(v) for v in call_data.get("args", [])],
            value=call_value_bytes,
        )
    else:
        raise SerializationError(
            code=SerializationError.UNEXPECTED_TYPE,
            message=f"Unknown payload type: {list(payload_data.keys())}",
        )

    return Transaction(
        nonce=data["nonce"],
        from_address=Address.from_bech32(data["from"]),
        signature=bytes.fromhex(data["signature"]),
        payload=payload,
        gas_limit=int(data["gas_limit"]),  # Rust uses snake_case
        gas_price=int(data["gas_price"]),  # Rust uses snake_case
        parents=[bytes(p) if isinstance(p, list) else bytes.fromhex(p) for p in data.get("parents", [])],
        timestamp=data["timestamp"],
        tx_id=bytes.fromhex(data.get("tx_id", "0" * 64)) if isinstance(data.get("tx_id"), str) else bytes(data.get("tx_id", [0] * 32)),  # Rust uses snake_case
    )


def _value_to_dict(value: Value) -> Any:
    """Convert a Value to a dictionary matching Rust serde externally-tagged enum format.

    Rust's Value enum uses default serde serialization:
      - Bool(true)        -> {"Bool": true}
      - U64(42)           -> {"U64": 42}
      - U128(123)         -> {"U128": "123"}   (u128 serialized as string)
      - U256([u8; 32])    -> {"U256": [0, 1, ...]}  (little-endian byte array)
      - Address(addr)     -> {"Address": "syn1..."}
      - Bytes(b)          -> {"Bytes": [0, 1, ...]}
      - String(s)         -> {"String": s}
      - Array(items)      -> {"Array": [...]}
      - Option(Some(v))   -> {"Option": {...}}
      - Option(None)      -> {"Option": null}
      - Unit              -> "Unit"  (unit variant serializes as the variant name)
    """
    from synapticchain.types import ValueType

    if value.type == ValueType.BOOL:
        return {"Bool": value.value}
    elif value.type == ValueType.U8:
        return {"U8": value.value}
    elif value.type == ValueType.U16:
        return {"U16": value.value}
    elif value.type == ValueType.U32:
        return {"U32": value.value}
    elif value.type == ValueType.U64:
        return {"U64": value.value}
    elif value.type == ValueType.U128:
        return {"U128": str(value.value)}
    elif value.type == ValueType.U256:
        # Rust U256 stores [u8; 32] in little-endian; serde serializes as byte array
        return {"U256": list(value.value.to_bytes(32, byteorder="little"))}
    elif value.type == ValueType.I8:
        return {"I8": value.value}
    elif value.type == ValueType.I16:
        return {"I16": value.value}
    elif value.type == ValueType.I32:
        return {"I32": value.value}
    elif value.type == ValueType.I64:
        return {"I64": value.value}
    elif value.type == ValueType.I128:
        return {"I128": str(value.value)}
    elif value.type == ValueType.ADDRESS:
        return {"Address": value.value.to_bech32()}
    elif value.type == ValueType.BYTES:
        return {"Bytes": list(value.value)}
    elif value.type == ValueType.STRING:
        return {"String": value.value}
    elif value.type == ValueType.ARRAY:
        return {"Array": [_value_to_dict(v) for v in value.value]}
    elif value.type == ValueType.OPTION:
        return {"Option": _value_to_dict(value.value) if value.value is not None else None}
    elif value.type == ValueType.UNIT:
        return "Unit"

    raise SerializationError(
        code=SerializationError.UNEXPECTED_TYPE,
        message=f"Unknown value type: {value.type}",
    )


def _dict_to_value(data: Any) -> Value:
    """Convert a dictionary (in Rust serde externally-tagged format) to a Value."""
    from synapticchain.address import Address
    from synapticchain.types import Value, ValueType

    # Unit variant is serialized as the bare string "Unit"
    if isinstance(data, str) and data == "Unit":
        return Value.unit()

    if not isinstance(data, dict):
        raise SerializationError(
            code=SerializationError.INVALID_FORMAT,
            message=f"Expected externally-tagged Value object or 'Unit', got {type(data).__name__}",
        )

    if len(data) != 1:
        raise SerializationError(
            code=SerializationError.INVALID_FORMAT,
            message=f"Externally-tagged Value object must have exactly one key, got {list(data.keys())}",
        )

    tag, raw_value = next(iter(data.items()))

    if tag == "Bool":
        return Value.bool(bool(raw_value))
    elif tag == "U8":
        return Value.u8(int(raw_value))
    elif tag == "U16":
        return Value.u16(int(raw_value))
    elif tag == "U32":
        return Value.u32(int(raw_value))
    elif tag == "U64":
        return Value.u64(int(raw_value))
    elif tag == "U128":
        return Value.u128(int(raw_value))
    elif tag == "U256":
        if isinstance(raw_value, list):
            bytes_arr = bytes(raw_value)
            return Value.u256(int.from_bytes(bytes_arr, byteorder="little"))
        return Value.u256(int(raw_value))
    elif tag == "I8":
        return Value.i8(int(raw_value))
    elif tag == "I16":
        return Value.i16(int(raw_value))
    elif tag == "I32":
        return Value.i32(int(raw_value))
    elif tag == "I64":
        return Value.i64(int(raw_value))
    elif tag == "I128":
        return Value.i128(int(raw_value))
    elif tag == "Address":
        return Value.address(Address.from_bech32(str(raw_value)))
    elif tag == "Bytes":
        if isinstance(raw_value, list):
            return Value.bytes_val(bytes(raw_value))
        return Value.bytes_val(bytes.fromhex(str(raw_value)))
    elif tag == "String":
        return Value.string(str(raw_value))
    elif tag == "Array":
        items = raw_value if raw_value is not None else []
        return Value.array([_dict_to_value(v) for v in items])
    elif tag == "Option":
        return Value.option(_dict_to_value(raw_value) if raw_value is not None else None)
    elif tag == "Unit":
        return Value.unit()

    raise SerializationError(
        code=SerializationError.UNEXPECTED_TYPE,
        message=f"Unknown Value variant tag: {tag}",
    )


__all__ = [
    "compute_signing_bytes",
    "compute_tx_id",
    "borsh_serialize",
    "borsh_deserialize",
    "json_serialize",
    "json_deserialize",
]
