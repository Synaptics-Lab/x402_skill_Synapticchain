"""
Contract interaction helpers for SynapticChain SDK.

This module provides utilities for interacting with deployed contracts.

Example:
    >>> from synapticchain.contract import ContractHelper
    >>> helper = ContractHelper(contract_address, rpc_client)
    >>> result = helper.read("balanceOf", [Value.address(user_address)])
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

from synapticchain.address import Address
from synapticchain.crypto import derive_contract_address
from synapticchain.types import FunctionSelector, UnsignedTransaction, Value

if TYPE_CHECKING:
    from synapticchain.rpc import RpcClient


class ContractHelper:
    """Helper class for contract interaction.

    Provides utilities for reading contract state, building call transactions,
    and encoding/decoding function calls.

    Example:
        >>> helper = ContractHelper(contract_address, rpc_client)
        >>> balance = helper.read("balanceOf", [Value.address(user)])
    """

    def __init__(self, address: Address, rpc_client: Optional[RpcClient] = None) -> None:
        """Initialize a ContractHelper.

        Args:
            address: The contract address
            rpc_client: Optional RPC client for read operations
        """
        self._address = address
        self._rpc_client = rpc_client

    @staticmethod
    def predict_address(deployer: Address, nonce: int) -> Address:
        """Predict the address of a contract before deployment.

        Args:
            deployer: The deployer's address
            nonce: The nonce used for deployment

        Returns:
            The predicted contract address
        """
        return derive_contract_address(deployer, nonce)

    @property
    def address(self) -> Address:
        """Get the contract address."""
        return self._address

    def read(self, function_name: str, args: Optional[list[Value]] = None) -> Value:
        """Make a read-only contract call.

        Args:
            function_name: The function to call
            args: Optional function arguments

        Returns:
            The return value

        Raises:
            RuntimeError: If no RPC client is configured
        """
        if self._rpc_client is None:
            raise RuntimeError("No RPC client configured")

        return self._rpc_client.call(self._address, function_name, args or [])

    def build_call(
        self,
        function_name: str,
        args: Optional[list[Value]] = None,
        *,
        from_address: Optional[Address] = None,
        nonce: int = 0,
        gas_limit: int = 100000,
        gas_price: int = 1000000000,
    ) -> UnsignedTransaction:
        """Build an unsigned transaction for a contract call.

        Args:
            function_name: The function to call
            args: Optional function arguments
            from_address: The sender address (required)
            nonce: Transaction nonce
            gas_limit: Maximum gas to use
            gas_price: Price per gas unit

        Returns:
            The unsigned transaction

        Raises:
            ValueError: If from_address is not provided
        """
        if from_address is None:
            raise ValueError("from_address is required")

        from synapticchain.types import CallPayload

        import time

        return UnsignedTransaction(
            nonce=nonce,
            from_address=from_address,
            payload=CallPayload(
                contract=self._address,
                function=FunctionSelector.from_name(function_name),
                args=args or [],
            ),
            gas_limit=gas_limit,
            gas_price=gas_price,
            parents=[],
            timestamp=int(time.time() * 1000),
        )

    def encode_call(self, function_name: str, args: Optional[list[Value]] = None) -> bytes:
        """Encode a function call to bytes.

        Args:
            function_name: The function to call
            args: Optional function arguments

        Returns:
            The encoded call data (selector + encoded args)
        """
        from synapticchain.serialization import _serialize_value

        parts = []

        # Function selector (4 bytes)
        selector = FunctionSelector.from_name(function_name)
        parts.append(selector.to_bytes())

        # Encoded arguments
        for arg in args or []:
            parts.append(_serialize_value(arg))

        return b"".join(parts)

    def decode_return(self, data: bytes) -> Value:
        """Decode a return value from bytes.

        Args:
            data: The encoded return data

        Returns:
            The decoded Value
        """
        from synapticchain.serialization import _deserialize_value

        value, _ = _deserialize_value(data, 0)
        return value

    def __repr__(self) -> str:
        return f"ContractHelper(address={self._address})"


__all__ = ["ContractHelper"]
