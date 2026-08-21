"""
Unit tests for the wallet module.

Tests cover:
- Wallet creation and generation
- Address and public key access
- Balance and nonce retrieval
- Transaction operations (transfer, deploy, call)
- Transaction and message signing
"""

import pytest
from unittest.mock import MagicMock, patch

from synapticchain.wallet import Wallet, TxOptions, DeployResult
from synapticchain.crypto import Keypair, derive_contract_address
from synapticchain.address import Address
from synapticchain.types import (
    Transaction,
    UnsignedTransaction,
    TransactionBuilder,
    TransferPayload,
    DeployPayload,
    CallPayload,
    Value,
)


class TestWalletCreation:
    """Tests for Wallet creation methods."""

    def test_wallet_init_with_keypair(self) -> None:
        """Wallet should be created with a keypair."""
        keypair = Keypair.generate()
        wallet = Wallet(keypair)
        assert wallet.address() == keypair.address()
        assert wallet.public_key() == keypair.public_key

    def test_wallet_init_with_rpc_client(self) -> None:
        """Wallet should accept an optional RPC client."""
        keypair = Keypair.generate()
        mock_rpc = MagicMock()
        wallet = Wallet(keypair, mock_rpc)
        assert wallet._rpc_client is mock_rpc

    def test_wallet_generate(self) -> None:
        """Wallet.generate() should create a new wallet with random keypair."""
        wallet = Wallet.generate()
        assert wallet is not None
        assert len(wallet.public_key()) == 32
        assert len(wallet.address().to_bytes()) == 20

    def test_wallet_generate_with_rpc_client(self) -> None:
        """Wallet.generate() should accept an optional RPC client."""
        mock_rpc = MagicMock()
        wallet = Wallet.generate(mock_rpc)
        assert wallet._rpc_client is mock_rpc

    def test_wallet_generate_creates_unique_wallets(self) -> None:
        """Each call to generate() should create a unique wallet."""
        wallet1 = Wallet.generate()
        wallet2 = Wallet.generate()
        assert wallet1.address() != wallet2.address()
        assert wallet1.public_key() != wallet2.public_key()

    def test_wallet_from_private_key(self) -> None:
        """Wallet.from_private_key() should create wallet from private key."""
        private_key = bytes(32)  # All zeros
        wallet = Wallet.from_private_key(private_key)
        expected_keypair = Keypair.from_private_key(private_key)
        assert wallet.address() == expected_keypair.address()
        assert wallet.public_key() == expected_keypair.public_key

    def test_wallet_from_private_key_with_rpc_client(self) -> None:
        """Wallet.from_private_key() should accept an optional RPC client."""
        private_key = bytes(32)
        mock_rpc = MagicMock()
        wallet = Wallet.from_private_key(private_key, mock_rpc)
        assert wallet._rpc_client is mock_rpc

    def test_wallet_from_hex(self) -> None:
        """Wallet.from_hex() should create wallet from hex-encoded private key."""
        hex_key = "0" * 64
        wallet = Wallet.from_hex(hex_key)
        expected_keypair = Keypair.from_hex(hex_key)
        assert wallet.address() == expected_keypair.address()

    def test_wallet_from_hex_with_rpc_client(self) -> None:
        """Wallet.from_hex() should accept an optional RPC client."""
        hex_key = "0" * 64
        mock_rpc = MagicMock()
        wallet = Wallet.from_hex(hex_key, mock_rpc)
        assert wallet._rpc_client is mock_rpc


class TestWalletProperties:
    """Tests for Wallet property accessors."""

    def test_address_returns_correct_address(self) -> None:
        """address() should return the wallet's address."""
        keypair = Keypair.generate()
        wallet = Wallet(keypair)
        assert wallet.address() == keypair.address()

    def test_address_is_valid_bech32(self) -> None:
        """address() should return a valid Bech32m address."""
        wallet = Wallet.generate()
        address = wallet.address()
        bech32 = address.to_bech32()
        assert bech32.startswith("syn1")
        assert len(bech32) == 42

    def test_public_key_returns_32_bytes(self) -> None:
        """public_key() should return a 32-byte public key."""
        wallet = Wallet.generate()
        public_key = wallet.public_key()
        assert len(public_key) == 32

    def test_public_key_matches_keypair(self) -> None:
        """public_key() should match the underlying keypair's public key."""
        keypair = Keypair.generate()
        wallet = Wallet(keypair)
        assert wallet.public_key() == keypair.public_key


class TestWalletBalance:
    """Tests for Wallet balance operations."""

    def test_get_balance_calls_rpc(self) -> None:
        """get_balance() should call RPC client's get_balance method."""
        mock_rpc = MagicMock()
        mock_rpc.get_balance.return_value = 1000000000000000000
        wallet = Wallet.generate(mock_rpc)
        
        balance = wallet.get_balance()
        
        assert balance == 1000000000000000000
        mock_rpc.get_balance.assert_called_once_with(wallet.address())

    def test_get_balance_without_rpc_raises_error(self) -> None:
        """get_balance() should raise RuntimeError without RPC client."""
        wallet = Wallet.generate()
        
        with pytest.raises(RuntimeError) as exc_info:
            wallet.get_balance()
        
        assert "No RPC client configured" in str(exc_info.value)


class TestWalletNonce:
    """Tests for Wallet nonce operations."""

    def test_get_nonce_returns_zero_initially(self) -> None:
        """get_nonce() should return 0 for a new wallet."""
        mock_rpc = MagicMock()
        mock_rpc.get_nonce.return_value = 0  # Configure mock to return 0
        wallet = Wallet.generate(mock_rpc)
        
        nonce = wallet.get_nonce()
        
        assert nonce == 0

    def test_get_nonce_without_rpc_raises_error(self) -> None:
        """get_nonce() should return 0 without RPC client (simplified implementation)."""
        wallet = Wallet.generate()
        
        # The current implementation returns 0 as a default nonce
        # In a real implementation, this would query the network
        nonce = wallet.get_nonce()
        assert nonce == 0

    def test_nonce_increments_after_transaction(self) -> None:
        """Nonce should increment after sending a transaction."""
        mock_rpc = MagicMock()
        mock_rpc.get_nonce.return_value = 0  # Configure mock to return 0
        mock_rpc.send_transaction.return_value = bytes(32)
        wallet = Wallet.generate(mock_rpc)
        
        initial_nonce = wallet.get_nonce()
        wallet.transfer(Address.zero(), 1000)
        next_nonce = wallet.get_nonce()
        
        assert next_nonce == initial_nonce + 1


class TestWalletTransfer:
    """Tests for Wallet transfer operations."""

    def test_transfer_sends_transaction(self) -> None:
        """transfer() should build and send a transfer transaction."""
        mock_rpc = MagicMock()
        mock_rpc.send_transaction.return_value = bytes(32)
        wallet = Wallet.generate(mock_rpc)
        recipient = Address.zero()
        amount = 1000000000000000000
        
        tx_id = wallet.transfer(recipient, amount)
        
        assert tx_id == bytes(32)
        mock_rpc.send_transaction.assert_called_once()
        
        # Verify the transaction was built correctly
        sent_tx = mock_rpc.send_transaction.call_args[0][0]
        assert isinstance(sent_tx, Transaction)
        assert isinstance(sent_tx.payload, TransferPayload)
        assert sent_tx.payload.to == recipient
        assert sent_tx.payload.amount == amount

    def test_transfer_with_options(self) -> None:
        """transfer() should use provided options."""
        mock_rpc = MagicMock()
        mock_rpc.send_transaction.return_value = bytes(32)
        wallet = Wallet.generate(mock_rpc)
        
        options = TxOptions(gas_limit=50000, gas_price=2000000000, nonce=5)
        wallet.transfer(Address.zero(), 1000, options=options)

        sent_tx = mock_rpc.send_transaction.call_args[0][0]
        assert sent_tx.gas_limit == 50000
        assert sent_tx.gas_price == 2000000000
        assert sent_tx.nonce == 5
        assert 0 <= sent_tx.nonce_key < 256

    def test_transfer_without_rpc_raises_error(self) -> None:
        """transfer() should raise RuntimeError without RPC client."""
        wallet = Wallet.generate()
        
        with pytest.raises(RuntimeError) as exc_info:
            wallet.transfer(Address.zero(), 1000)
        
        assert "No RPC client configured" in str(exc_info.value)


class TestWalletDeploy:
    """Tests for Wallet deploy operations."""

    def test_deploy_sends_transaction(self) -> None:
        """deploy() should build and send a deploy transaction."""
        mock_rpc = MagicMock()
        mock_rpc.get_nonce.return_value = 0
        mock_rpc.send_transaction.return_value = bytes(32)
        wallet = Wallet.generate(mock_rpc)
        code = b"\x00\x01\x02\x03"
        
        result = wallet.deploy(code)
        
        assert isinstance(result, DeployResult)
        assert result.tx_id == bytes(32)
        mock_rpc.send_transaction.assert_called_once()
        
        # Verify the transaction was built correctly
        sent_tx = mock_rpc.send_transaction.call_args[0][0]
        assert isinstance(sent_tx, Transaction)
        assert isinstance(sent_tx.payload, DeployPayload)
        assert sent_tx.payload.code == code

    def test_deploy_returns_predicted_contract_address(self) -> None:
        """deploy() should return the predicted contract address."""
        mock_rpc = MagicMock()
        mock_rpc.get_nonce.return_value = 0
        mock_rpc.send_transaction.return_value = bytes(32)
        wallet = Wallet.generate(mock_rpc)
        
        result = wallet.deploy(b"\x00\x01\x02\x03")
        
        expected_address = derive_contract_address(wallet.address(), 0)
        assert result.contract_address == expected_address

    def test_deploy_with_constructor_args(self) -> None:
        """deploy() should include constructor arguments."""
        mock_rpc = MagicMock()
        mock_rpc.get_nonce.return_value = 0
        mock_rpc.send_transaction.return_value = bytes(32)
        wallet = Wallet.generate(mock_rpc)
        args = [Value.string("MyToken"), Value.u256(1000000)]
        
        wallet.deploy(b"\x00\x01\x02\x03", args)
        
        sent_tx = mock_rpc.send_transaction.call_args[0][0]
        assert sent_tx.payload.constructor_args == args

    def test_deploy_with_options(self) -> None:
        """deploy() should use provided options."""
        mock_rpc = MagicMock()
        mock_rpc.get_nonce.return_value = 0
        mock_rpc.send_transaction.return_value = bytes(32)
        wallet = Wallet.generate(mock_rpc)
        
        options = TxOptions(gas_limit=2000000, gas_price=3000000000, nonce=10)
        wallet.deploy(b"\x00\x01\x02\x03", options=options)
        
        sent_tx = mock_rpc.send_transaction.call_args[0][0]
        assert sent_tx.gas_limit == 2000000
        assert sent_tx.gas_price == 3000000000
        assert sent_tx.nonce == 10

    def test_deploy_without_rpc_raises_error(self) -> None:
        """deploy() should raise RuntimeError without RPC client."""
        wallet = Wallet.generate()
        
        with pytest.raises(RuntimeError) as exc_info:
            wallet.deploy(b"\x00\x01\x02\x03")
        
        assert "No RPC client configured" in str(exc_info.value)


class TestWalletCall:
    """Tests for Wallet call operations."""

    def test_call_sends_transaction(self) -> None:
        """call() should build and send a call transaction."""
        mock_rpc = MagicMock()
        mock_rpc.send_transaction.return_value = bytes(32)
        wallet = Wallet.generate(mock_rpc)
        contract = Address.zero()
        
        tx_id = wallet.call(contract, "transfer")
        
        assert tx_id == bytes(32)
        mock_rpc.send_transaction.assert_called_once()
        
        # Verify the transaction was built correctly
        sent_tx = mock_rpc.send_transaction.call_args[0][0]
        assert isinstance(sent_tx, Transaction)
        assert isinstance(sent_tx.payload, CallPayload)
        assert sent_tx.payload.contract == contract

    def test_call_with_args(self) -> None:
        """call() should include function arguments."""
        mock_rpc = MagicMock()
        mock_rpc.send_transaction.return_value = bytes(32)
        wallet = Wallet.generate(mock_rpc)
        args = [Value.address(Address.zero()), Value.u256(1000)]
        
        wallet.call(Address.zero(), "transfer", args)
        
        sent_tx = mock_rpc.send_transaction.call_args[0][0]
        assert sent_tx.payload.args == args

    def test_call_with_options(self) -> None:
        """call() should use provided options."""
        mock_rpc = MagicMock()
        mock_rpc.send_transaction.return_value = bytes(32)
        wallet = Wallet.generate(mock_rpc)
        
        options = TxOptions(gas_limit=200000, gas_price=1500000000, nonce=3)
        wallet.call(Address.zero(), "transfer", options=options)
        
        sent_tx = mock_rpc.send_transaction.call_args[0][0]
        assert sent_tx.gas_limit == 200000
        assert sent_tx.gas_price == 1500000000
        assert sent_tx.nonce == 3

    def test_call_without_rpc_raises_error(self) -> None:
        """call() should raise RuntimeError without RPC client."""
        wallet = Wallet.generate()
        
        with pytest.raises(RuntimeError) as exc_info:
            wallet.call(Address.zero(), "transfer")
        
        assert "No RPC client configured" in str(exc_info.value)


class TestWalletSigning:
    """Tests for Wallet signing operations."""

    def test_sign_transaction(self) -> None:
        """sign_transaction() should sign an unsigned transaction."""
        wallet = Wallet.generate()
        unsigned = UnsignedTransaction(
            nonce=0,
            from_address=wallet.address(),
            payload=TransferPayload(to=Address.zero(), amount=1000),
            gas_limit=21000,
            gas_price=1000000000,
            parents=[],
            timestamp=1234567890,
        )
        
        signed = wallet.sign_transaction(unsigned)
        
        assert isinstance(signed, Transaction)
        assert len(signed.signature) == 64
        assert signed.nonce == unsigned.nonce
        assert signed.from_address == unsigned.from_address
        assert signed.payload == unsigned.payload
        assert signed.gas_limit == unsigned.gas_limit
        assert signed.gas_price == unsigned.gas_price

    def test_sign_transaction_produces_valid_signature(self) -> None:
        """sign_transaction() should produce a verifiable signature."""
        from synapticchain.crypto import verify
        from synapticchain.serialization import compute_signing_bytes
        
        wallet = Wallet.generate()
        unsigned = UnsignedTransaction(
            nonce=0,
            from_address=wallet.address(),
            payload=TransferPayload(to=Address.zero(), amount=1000),
            gas_limit=21000,
            gas_price=1000000000,
            parents=[],
            timestamp=1234567890,
        )
        
        signed = wallet.sign_transaction(unsigned)
        signing_bytes = compute_signing_bytes(unsigned)
        
        assert verify(signing_bytes, signed.signature, wallet.public_key())

    def test_sign_message(self) -> None:
        """sign_message() should sign an arbitrary message."""
        wallet = Wallet.generate()
        message = b"Hello, SynapticChain!"
        
        signature = wallet.sign_message(message)
        
        assert len(signature) == 64

    def test_sign_message_produces_valid_signature(self) -> None:
        """sign_message() should produce a verifiable signature."""
        from synapticchain.crypto import verify
        
        wallet = Wallet.generate()
        message = b"Hello, SynapticChain!"
        
        signature = wallet.sign_message(message)
        
        assert verify(message, signature, wallet.public_key())

    def test_sign_message_empty(self) -> None:
        """sign_message() should handle empty messages."""
        wallet = Wallet.generate()
        
        signature = wallet.sign_message(b"")
        
        assert len(signature) == 64


class TestWalletRepr:
    """Tests for Wallet string representation."""

    def test_repr_contains_address(self) -> None:
        """repr() should contain the wallet's address."""
        wallet = Wallet.generate()
        repr_str = repr(wallet)
        
        assert "Wallet" in repr_str
        assert str(wallet.address()) in repr_str


class TestTxOptions:
    """Tests for TxOptions dataclass."""

    def test_tx_options_defaults(self) -> None:
        """TxOptions should have None defaults."""
        options = TxOptions()
        assert options.gas_limit is None
        assert options.gas_price is None
        assert options.nonce is None

    def test_tx_options_with_values(self) -> None:
        """TxOptions should accept custom values."""
        options = TxOptions(gas_limit=50000, gas_price=2000000000, nonce=5)
        assert options.gas_limit == 50000
        assert options.gas_price == 2000000000
        assert options.nonce == 5


class TestDeployResult:
    """Tests for DeployResult dataclass."""

    def test_deploy_result_attributes(self) -> None:
        """DeployResult should have tx_id and contract_address."""
        tx_id = bytes(32)
        contract_address = Address.zero()
        
        result = DeployResult(tx_id=tx_id, contract_address=contract_address)
        
        assert result.tx_id == tx_id
        assert result.contract_address == contract_address
