"""
Error types for SynapticChain SDK.

This module defines typed error classes for each category of errors:
- CryptoError: Cryptographic operation failures
- AddressError: Address encoding/decoding failures
- TransactionError: Transaction building/validation failures
- RpcError: JSON-RPC communication failures
- SerializationError: Serialization/deserialization failures
"""

from typing import Any, Optional


class SynapticError(Exception):
    """Base exception for all SynapticChain SDK errors.

    Attributes:
        code: Machine-readable error code (e.g., "INVALID_KEY_LENGTH")
        message: Human-readable error description
        details: Optional additional context about the error
    """

    def __init__(
        self,
        code: str,
        message: str,
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        self.code = code
        self.message = message
        self.details = details or {}
        super().__init__(f"[{code}] {message}")

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(code={self.code!r}, message={self.message!r})"


class CryptoError(SynapticError):
    """Error during cryptographic operations.

    Error codes:
        - INVALID_KEY_LENGTH: Key is not 32 bytes
        - INVALID_SIGNATURE: Signature is malformed
        - SIGNING_FAILED: Signing operation failed
    """

    # Error codes
    INVALID_KEY_LENGTH = "INVALID_KEY_LENGTH"
    INVALID_SIGNATURE = "INVALID_SIGNATURE"
    SIGNING_FAILED = "SIGNING_FAILED"


class AddressError(SynapticError):
    """Error during address operations.

    Error codes:
        - INVALID_BECH32: Bech32m decoding failed
        - INVALID_PREFIX: Prefix is not "syn"
        - INVALID_LENGTH: Address is not 20 bytes
        - INVALID_CHECKSUM: Checksum validation failed
    """

    # Error codes
    INVALID_BECH32 = "INVALID_BECH32"
    INVALID_PREFIX = "INVALID_PREFIX"
    INVALID_LENGTH = "INVALID_LENGTH"
    INVALID_CHECKSUM = "INVALID_CHECKSUM"


class TransactionError(SynapticError):
    """Error during transaction operations.

    Error codes:
        - MISSING_FIELD: Required field not set
        - INVALID_PAYLOAD: Payload validation failed
        - SERIALIZATION_FAILED: Borsh/JSON serialization failed
    """

    # Error codes
    MISSING_FIELD = "MISSING_FIELD"
    INVALID_PAYLOAD = "INVALID_PAYLOAD"
    SERIALIZATION_FAILED = "SERIALIZATION_FAILED"


class RpcError(SynapticError):
    """Error during RPC communication.

    Error codes:
        - CONNECTION_FAILED: Could not connect to node
        - TIMEOUT: Request timed out
        - INVALID_RESPONSE: Response is not valid JSON-RPC
        - METHOD_NOT_FOUND: RPC method does not exist

    Attributes:
        rpc_code: JSON-RPC error code (-32600 to -32603, or custom)
        rpc_message: Original error message from node
    """

    # Error codes
    CONNECTION_FAILED = "CONNECTION_FAILED"
    TIMEOUT = "TIMEOUT"
    INVALID_RESPONSE = "INVALID_RESPONSE"
    METHOD_NOT_FOUND = "METHOD_NOT_FOUND"

    def __init__(
        self,
        code: str,
        message: str,
        details: Optional[dict[str, Any]] = None,
        rpc_code: Optional[int] = None,
        rpc_message: Optional[str] = None,
    ) -> None:
        super().__init__(code, message, details)
        self.rpc_code = rpc_code
        self.rpc_message = rpc_message

    def __repr__(self) -> str:
        return (
            f"{self.__class__.__name__}(code={self.code!r}, message={self.message!r}, "
            f"rpc_code={self.rpc_code!r})"
        )


class SerializationError(SynapticError):
    """Error during serialization/deserialization.

    Error codes:
        - INVALID_FORMAT: Data format is invalid
        - UNEXPECTED_TYPE: Unexpected type encountered
        - BUFFER_OVERFLOW: Buffer size exceeded
    """

    # Error codes
    INVALID_FORMAT = "INVALID_FORMAT"
    UNEXPECTED_TYPE = "UNEXPECTED_TYPE"
    BUFFER_OVERFLOW = "BUFFER_OVERFLOW"


__all__ = [
    "SynapticError",
    "CryptoError",
    "AddressError",
    "TransactionError",
    "RpcError",
    "SerializationError",
]
