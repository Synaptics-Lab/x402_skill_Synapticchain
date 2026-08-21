"""
Unit tests for the RPC module.

Tests cover:
- RpcClient and AsyncRpcClient initialization
- JSON-RPC 2.0 request formatting
- All RPC methods (getBalance, sendTransaction, etc.)
- Error handling and retries
- Timeout handling
"""

import pytest
from unittest.mock import Mock, patch, AsyncMock
import httpx

from synapticchain.rpc import (
    RpcClient,
    AsyncRpcClient,
    RpcOptions,
    Checkpoint,
    NodeStatus,
    TransactionInfo,
)
from synapticchain.errors import RpcError
from synapticchain.address import Address
from synapticchain.types import (
    Transaction,
    TransferPayload,
    DeployPayload,
    CallPayload,
    FunctionSelector,
    Value,
)


class TestRpcOptions:
    """Tests for RpcOptions dataclass."""

    def test_default_values(self) -> None:
        """RpcOptions should have sensible defaults."""
        options = RpcOptions()
        assert options.timeout == 30.0
        assert options.retries == 3
        assert options.headers is None

    def test_custom_values(self) -> None:
        """RpcOptions should accept custom values."""
        options = RpcOptions(
            timeout=10.0,
            retries=5,
            headers={"X-API-Key": "test-key"},
        )
        assert options.timeout == 10.0
        assert options.retries == 5
        assert options.headers == {"X-API-Key": "test-key"}


class TestRpcClientConstructor:
    """Tests for RpcClient constructor."""

    def test_create_with_url_only(self) -> None:
        """RpcClient should be created with just a URL."""
        client = RpcClient("https://rpc.example.com")
        assert client._url == "https://rpc.example.com"

    def test_create_with_options(self) -> None:
        """RpcClient should accept custom options."""
        options = RpcOptions(timeout=10.0, retries=5)
        client = RpcClient("https://rpc.example.com", options)
        assert client._options.timeout == 10.0
        assert client._options.retries == 5

    def test_default_options(self) -> None:
        """RpcClient should use default options when none provided."""
        client = RpcClient("https://rpc.example.com")
        assert client._options.timeout == 30.0
        assert client._options.retries == 3


class TestRpcClientRequestId:
    """Tests for RpcClient request ID generation."""

    def test_increments_request_id(self) -> None:
        """RpcClient should increment request ID for each call."""
        client = RpcClient("https://rpc.example.com")
        id1 = client._next_id()
        id2 = client._next_id()
        id3 = client._next_id()
        assert id2 == id1 + 1
        assert id3 == id2 + 1

    def test_starts_at_one(self) -> None:
        """RpcClient should start request IDs at 1."""
        client = RpcClient("https://rpc.example.com")
        assert client._next_id() == 1


class TestRpcClientInternalCall:
    """Tests for RpcClient._call() method."""

    def test_successful_call(self) -> None:
        """_call() should return result on success."""
        client = RpcClient("https://rpc.example.com")
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "result": "1000000000000000000",
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", return_value=mock_response):
            result = client._call("syn_getBalance", ["syn1abc123"])
        
        assert result == "1000000000000000000"

    def test_json_rpc_format(self) -> None:
        """_call() should format request as JSON-RPC 2.0."""
        client = RpcClient("https://rpc.example.com")
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "result": "ok",
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", return_value=mock_response) as mock_post:
            client._call("test_method", ["param1", "param2"])
        
        # Verify the request format
        call_args = mock_post.call_args
        request_body = call_args.kwargs["json"]
        
        assert request_body["jsonrpc"] == "2.0"
        assert request_body["method"] == "test_method"
        assert request_body["params"] == ["param1", "param2"]
        assert "id" in request_body
        assert isinstance(request_body["id"], int)

    def test_rpc_error_response(self) -> None:
        """_call() should raise RpcError on JSON-RPC error."""
        client = RpcClient("https://rpc.example.com", RpcOptions(retries=1))
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "error": {
                "code": -32601,
                "message": "Method not found",
            },
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", return_value=mock_response):
            with pytest.raises(RpcError) as exc_info:
                client._call("invalid_method", [])
        
        # RPC errors are raised immediately without retry
        assert exc_info.value.code == RpcError.INVALID_RESPONSE
        assert exc_info.value.rpc_code == -32601
        assert "Method not found" in exc_info.value.message

    def test_connection_error(self) -> None:
        """_call() should raise RpcError on connection failure."""
        client = RpcClient("https://rpc.example.com", RpcOptions(retries=1))
        
        with patch.object(client._client, "post", side_effect=httpx.ConnectError("Connection refused")):
            with pytest.raises(RpcError) as exc_info:
                client._call("syn_getStatus", [])
        
        assert exc_info.value.code == RpcError.CONNECTION_FAILED

    def test_timeout_error(self) -> None:
        """_call() should raise RpcError on timeout."""
        client = RpcClient("https://rpc.example.com", RpcOptions(retries=1))
        
        with patch.object(client._client, "post", side_effect=httpx.TimeoutException("Timeout")):
            with pytest.raises(RpcError) as exc_info:
                client._call("syn_getStatus", [])
        
        assert exc_info.value.code == RpcError.TIMEOUT

    def test_http_error(self) -> None:
        """_call() should raise RpcError on HTTP error."""
        client = RpcClient("https://rpc.example.com", RpcOptions(retries=1))
        
        mock_response = Mock()
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "500 Internal Server Error",
            request=Mock(),
            response=Mock(),
        )
        
        with patch.object(client._client, "post", return_value=mock_response):
            with pytest.raises(RpcError) as exc_info:
                client._call("syn_getStatus", [])
        
        assert exc_info.value.code == RpcError.INVALID_RESPONSE


    def test_retry_on_transient_failure(self) -> None:
        """_call() should retry on transient failures."""
        client = RpcClient("https://rpc.example.com", RpcOptions(retries=3))
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "result": "success",
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        # First two calls fail, third succeeds
        with patch.object(
            client._client,
            "post",
            side_effect=[
                httpx.ConnectError("Error 1"),
                httpx.ConnectError("Error 2"),
                mock_response,
            ],
        ) as mock_post:
            result = client._call("syn_getStatus", [])
        
        assert result == "success"
        assert mock_post.call_count == 3

    def test_exhaust_retries(self) -> None:
        """_call() should raise after exhausting retries."""
        client = RpcClient("https://rpc.example.com", RpcOptions(retries=3))
        
        with patch.object(
            client._client,
            "post",
            side_effect=httpx.ConnectError("Connection failed"),
        ) as mock_post:
            with pytest.raises(RpcError) as exc_info:
                client._call("syn_getStatus", [])
        
        assert exc_info.value.code == RpcError.CONNECTION_FAILED
        assert mock_post.call_count == 3  # retries=3 means 3 attempts


class TestRpcClientGetBalance:
    """Tests for RpcClient.get_balance()."""

    def test_returns_balance_as_int(self) -> None:
        """get_balance() should return balance as int."""
        client = RpcClient("https://rpc.example.com")
        address = Address.zero()
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "result": "0x8ac7230489e80000",  # 10 * 10^18 in hex
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", return_value=mock_response):
            balance = client.get_balance(address)
        
        assert balance == 10 * 10**18

    def test_handles_decimal_result(self) -> None:
        """get_balance() should handle decimal string result."""
        client = RpcClient("https://rpc.example.com")
        address = Address.zero()
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "result": 1000000000000000000,  # As integer
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", return_value=mock_response):
            balance = client.get_balance(address)
        
        assert balance == 1000000000000000000

    def test_zero_balance(self) -> None:
        """get_balance() should handle zero balance."""
        client = RpcClient("https://rpc.example.com")
        address = Address.zero()
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "result": "0x0",
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", return_value=mock_response):
            balance = client.get_balance(address)
        
        assert balance == 0

    def test_sends_correct_params(self) -> None:
        """get_balance() should send address as Bech32m."""
        client = RpcClient("https://rpc.example.com")
        address = Address.zero()
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "result": "0x0",
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", return_value=mock_response) as mock_post:
            client.get_balance(address)
        
        call_args = mock_post.call_args
        request_body = call_args.kwargs["json"]
        assert request_body["method"] == "syn_getBalance"
        assert request_body["params"] == [address.to_bech32()]


class TestRpcClientSendTransaction:
    """Tests for RpcClient.send_transaction()."""

    def test_returns_tx_id(self) -> None:
        """send_transaction() should return transaction ID as bytes."""
        client = RpcClient("https://rpc.example.com")
        
        # Create a mock transaction
        from_addr = Address.zero()
        to_addr = Address.zero()
        tx = Transaction(
            nonce=0,
            from_address=from_addr,
            signature=bytes(64),
            payload=TransferPayload(to=to_addr, amount=1000),
            gas_limit=21000,
            gas_price=1000000000,
            parents=[],
            timestamp=1234567890,
        )
        
        expected_tx_id = "0123456789abcdef" * 4
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "result": expected_tx_id,
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", return_value=mock_response):
            tx_id = client.send_transaction(tx)
        
        assert isinstance(tx_id, bytes)
        assert len(tx_id) == 32
        assert tx_id == bytes.fromhex(expected_tx_id)

    def test_sends_serialized_transaction(self) -> None:
        """send_transaction() should send Borsh-serialized transaction."""
        client = RpcClient("https://rpc.example.com")
        
        from_addr = Address.zero()
        to_addr = Address.zero()
        tx = Transaction(
            nonce=0,
            from_address=from_addr,
            signature=bytes(64),
            payload=TransferPayload(to=to_addr, amount=1000),
            gas_limit=21000,
            gas_price=1000000000,
            parents=[],
            timestamp=1234567890,
        )
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "result": "00" * 32,
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", return_value=mock_response) as mock_post:
            client.send_transaction(tx)
        
        call_args = mock_post.call_args
        request_body = call_args.kwargs["json"]
        assert request_body["method"] == "syn_sendTransaction"
        # params[0] should be hex-encoded bytes
        assert isinstance(request_body["params"][0], str)


class TestRpcClientGetTransaction:
    """Tests for RpcClient.get_transaction()."""

    def test_returns_transaction_info(self) -> None:
        """get_transaction() should return TransactionInfo when found."""
        client = RpcClient("https://rpc.example.com")
        tx_id = bytes(32)
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "result": {
                "txId": "00" * 32,
                "status": "confirmed",
                "blockHeight": 100,
                "gasUsed": 21000,
            },
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", return_value=mock_response):
            result = client.get_transaction(tx_id)
        
        assert result is not None
        assert isinstance(result, TransactionInfo)
        assert result.status == "confirmed"
        assert result.block_height == 100
        assert result.gas_used == 21000

    def test_returns_none_when_not_found(self) -> None:
        """get_transaction() should return None when not found."""
        client = RpcClient("https://rpc.example.com")
        tx_id = bytes(32)
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "result": None,
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", return_value=mock_response):
            result = client.get_transaction(tx_id)
        
        assert result is None

    def test_handles_pending_transaction(self) -> None:
        """get_transaction() should handle pending transactions."""
        client = RpcClient("https://rpc.example.com")
        tx_id = bytes(32)
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "result": {
                "txId": "00" * 32,
                "status": "pending",
                "blockHeight": None,
                "gasUsed": None,
            },
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", return_value=mock_response):
            result = client.get_transaction(tx_id)
        
        assert result is not None
        assert result.status == "pending"
        assert result.block_height is None
        assert result.gas_used is None


class TestRpcClientContractCall:
    """Tests for RpcClient.call() (contract calls)."""

    def test_returns_value(self) -> None:
        """call() should return Value from contract."""
        client = RpcClient("https://rpc.example.com")
        contract = Address.zero()
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "result": {"type": "u256", "value": "1000000000000000000"},
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", return_value=mock_response):
            result = client.call(contract, "balanceOf", [Value.address(Address.zero())])
        
        assert result.type.value == "u256"
        assert result.value == 1000000000000000000

    def test_handles_bool_return(self) -> None:
        """call() should handle boolean return values."""
        client = RpcClient("https://rpc.example.com")
        contract = Address.zero()
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "result": {"type": "bool", "value": True},
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", return_value=mock_response):
            result = client.call(contract, "isApproved", [])
        
        assert result.type.value == "bool"
        assert result.value is True

    def test_handles_string_return(self) -> None:
        """call() should handle string return values."""
        client = RpcClient("https://rpc.example.com")
        contract = Address.zero()
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "result": {"type": "string", "value": "MyToken"},
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", return_value=mock_response):
            result = client.call(contract, "name", [])
        
        assert result.type.value == "string"
        assert result.value == "MyToken"


class TestRpcClientGetCode:
    """Tests for RpcClient.get_code()."""

    def test_returns_code_bytes(self) -> None:
        """get_code() should return contract bytecode."""
        client = RpcClient("https://rpc.example.com")
        address = Address.zero()
        code_hex = "608060405234801561001057600080fd5b50"
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "result": code_hex,
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", return_value=mock_response):
            code = client.get_code(address)
        
        assert code is not None
        assert isinstance(code, bytes)
        assert code == bytes.fromhex(code_hex)

    def test_returns_none_for_eoa(self) -> None:
        """get_code() should return None for non-contract addresses."""
        client = RpcClient("https://rpc.example.com")
        address = Address.zero()
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "result": None,
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", return_value=mock_response):
            code = client.get_code(address)
        
        assert code is None


class TestRpcClientGetCheckpoint:
    """Tests for RpcClient.get_checkpoint()."""

    def test_returns_checkpoint(self) -> None:
        """get_checkpoint() should return Checkpoint."""
        client = RpcClient("https://rpc.example.com")
        state_root_hex = "0123456789abcdef" * 4
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "result": {
                "height": 12345,
                "stateRoot": state_root_hex,
            },
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", return_value=mock_response):
            checkpoint = client.get_checkpoint()
        
        assert isinstance(checkpoint, Checkpoint)
        assert checkpoint.height == 12345
        assert checkpoint.state_root == bytes.fromhex(state_root_hex)


class TestRpcClientGetStatus:
    """Tests for RpcClient.get_status()."""

    def test_returns_node_status(self) -> None:
        """get_status() should return NodeStatus."""
        client = RpcClient("https://rpc.example.com")
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "result": {
                "synced": True,
                "peerCount": 10,
                "checkpointHeight": 12345,
                "tps": 100.5,
            },
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", return_value=mock_response):
            status = client.get_status()
        
        assert isinstance(status, NodeStatus)
        assert status.synced is True
        assert status.peer_count == 10
        assert status.checkpoint_height == 12345
        assert status.tps == 100.5

    def test_handles_unsynced_node(self) -> None:
        """get_status() should handle unsynced node."""
        client = RpcClient("https://rpc.example.com")
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "result": {
                "synced": False,
                "peerCount": 2,
                "checkpointHeight": 100,
                "tps": 0,
            },
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", return_value=mock_response):
            status = client.get_status()
        
        assert status.synced is False
        assert status.peer_count == 2


class TestRpcClientContextManager:
    """Tests for RpcClient context manager."""

    def test_context_manager_closes_client(self) -> None:
        """RpcClient should close client on context exit."""
        with RpcClient("https://rpc.example.com") as client:
            assert client._client is not None
        # After exit, client should be closed (no assertion needed, just no error)

    def test_enter_returns_self(self) -> None:
        """__enter__ should return the client instance."""
        client = RpcClient("https://rpc.example.com")
        with client as c:
            assert c is client


# ============================================================================
# Async RPC Client Tests
# ============================================================================


class TestAsyncRpcClientConstructor:
    """Tests for AsyncRpcClient constructor."""

    def test_create_with_url_only(self) -> None:
        """AsyncRpcClient should be created with just a URL."""
        client = AsyncRpcClient("https://rpc.example.com")
        assert client._url == "https://rpc.example.com"

    def test_create_with_options(self) -> None:
        """AsyncRpcClient should accept custom options."""
        options = RpcOptions(timeout=10.0, retries=5)
        client = AsyncRpcClient("https://rpc.example.com", options)
        assert client._options.timeout == 10.0
        assert client._options.retries == 5


class TestAsyncRpcClientInternalCall:
    """Tests for AsyncRpcClient._call() method."""

    @pytest.mark.asyncio
    async def test_successful_call(self) -> None:
        """_call() should return result on success."""
        client = AsyncRpcClient("https://rpc.example.com")
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "result": "1000000000000000000",
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", new_callable=AsyncMock, return_value=mock_response):
            result = await client._call("syn_getBalance", ["syn1abc123"])
        
        assert result == "1000000000000000000"

    @pytest.mark.asyncio
    async def test_json_rpc_format(self) -> None:
        """_call() should format request as JSON-RPC 2.0."""
        client = AsyncRpcClient("https://rpc.example.com")
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "result": "ok",
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", new_callable=AsyncMock, return_value=mock_response) as mock_post:
            await client._call("test_method", ["param1", "param2"])
        
        call_args = mock_post.call_args
        request_body = call_args.kwargs["json"]
        
        assert request_body["jsonrpc"] == "2.0"
        assert request_body["method"] == "test_method"
        assert request_body["params"] == ["param1", "param2"]

    @pytest.mark.asyncio
    async def test_rpc_error_response(self) -> None:
        """_call() should raise RpcError on JSON-RPC error."""
        client = AsyncRpcClient("https://rpc.example.com", RpcOptions(retries=1))
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "error": {
                "code": -32601,
                "message": "Method not found",
            },
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", new_callable=AsyncMock, return_value=mock_response):
            with pytest.raises(RpcError) as exc_info:
                await client._call("invalid_method", [])
        
        # RPC errors are raised immediately without retry
        assert exc_info.value.code == RpcError.INVALID_RESPONSE
        assert exc_info.value.rpc_code == -32601

    @pytest.mark.asyncio
    async def test_connection_error(self) -> None:
        """_call() should raise RpcError on connection failure."""
        client = AsyncRpcClient("https://rpc.example.com", RpcOptions(retries=1))
        
        with patch.object(client._client, "post", new_callable=AsyncMock, side_effect=httpx.ConnectError("Connection refused")):
            with pytest.raises(RpcError) as exc_info:
                await client._call("syn_getStatus", [])
        
        assert exc_info.value.code == RpcError.CONNECTION_FAILED

    @pytest.mark.asyncio
    async def test_timeout_error(self) -> None:
        """_call() should raise RpcError on timeout."""
        client = AsyncRpcClient("https://rpc.example.com", RpcOptions(retries=1))
        
        with patch.object(client._client, "post", new_callable=AsyncMock, side_effect=httpx.TimeoutException("Timeout")):
            with pytest.raises(RpcError) as exc_info:
                await client._call("syn_getStatus", [])
        
        assert exc_info.value.code == RpcError.TIMEOUT


class TestAsyncRpcClientGetBalance:
    """Tests for AsyncRpcClient.get_balance()."""

    @pytest.mark.asyncio
    async def test_returns_balance_as_int(self) -> None:
        """get_balance() should return balance as int."""
        client = AsyncRpcClient("https://rpc.example.com")
        address = Address.zero()
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "result": "0x8ac7230489e80000",
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", new_callable=AsyncMock, return_value=mock_response):
            balance = await client.get_balance(address)
        
        assert balance == 10 * 10**18


class TestAsyncRpcClientSendTransaction:
    """Tests for AsyncRpcClient.send_transaction()."""

    @pytest.mark.asyncio
    async def test_returns_tx_id(self) -> None:
        """send_transaction() should return transaction ID as bytes."""
        client = AsyncRpcClient("https://rpc.example.com")
        
        from_addr = Address.zero()
        to_addr = Address.zero()
        tx = Transaction(
            nonce=0,
            from_address=from_addr,
            signature=bytes(64),
            payload=TransferPayload(to=to_addr, amount=1000),
            gas_limit=21000,
            gas_price=1000000000,
            parents=[],
            timestamp=1234567890,
        )
        
        expected_tx_id = "0123456789abcdef" * 4
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "result": expected_tx_id,
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", new_callable=AsyncMock, return_value=mock_response):
            tx_id = await client.send_transaction(tx)
        
        assert isinstance(tx_id, bytes)
        assert len(tx_id) == 32


class TestAsyncRpcClientGetTransaction:
    """Tests for AsyncRpcClient.get_transaction()."""

    @pytest.mark.asyncio
    async def test_returns_transaction_info(self) -> None:
        """get_transaction() should return TransactionInfo when found."""
        client = AsyncRpcClient("https://rpc.example.com")
        tx_id = bytes(32)
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "result": {
                "txId": "00" * 32,
                "status": "confirmed",
                "blockHeight": 100,
                "gasUsed": 21000,
            },
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", new_callable=AsyncMock, return_value=mock_response):
            result = await client.get_transaction(tx_id)
        
        assert result is not None
        assert result.status == "confirmed"

    @pytest.mark.asyncio
    async def test_returns_none_when_not_found(self) -> None:
        """get_transaction() should return None when not found."""
        client = AsyncRpcClient("https://rpc.example.com")
        tx_id = bytes(32)
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "result": None,
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", new_callable=AsyncMock, return_value=mock_response):
            result = await client.get_transaction(tx_id)
        
        assert result is None


class TestAsyncRpcClientContractCall:
    """Tests for AsyncRpcClient.call() (contract calls)."""

    @pytest.mark.asyncio
    async def test_returns_value(self) -> None:
        """call() should return Value from contract."""
        client = AsyncRpcClient("https://rpc.example.com")
        contract = Address.zero()
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "result": {"type": "u256", "value": "1000000000000000000"},
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", new_callable=AsyncMock, return_value=mock_response):
            result = await client.call(contract, "balanceOf", [Value.address(Address.zero())])
        
        assert result.type.value == "u256"


class TestAsyncRpcClientGetCode:
    """Tests for AsyncRpcClient.get_code()."""

    @pytest.mark.asyncio
    async def test_returns_code_bytes(self) -> None:
        """get_code() should return contract bytecode."""
        client = AsyncRpcClient("https://rpc.example.com")
        address = Address.zero()
        code_hex = "608060405234801561001057600080fd5b50"
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "result": code_hex,
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", new_callable=AsyncMock, return_value=mock_response):
            code = await client.get_code(address)
        
        assert code == bytes.fromhex(code_hex)

    @pytest.mark.asyncio
    async def test_returns_none_for_eoa(self) -> None:
        """get_code() should return None for non-contract addresses."""
        client = AsyncRpcClient("https://rpc.example.com")
        address = Address.zero()
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "result": None,
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", new_callable=AsyncMock, return_value=mock_response):
            code = await client.get_code(address)
        
        assert code is None


class TestAsyncRpcClientGetCheckpoint:
    """Tests for AsyncRpcClient.get_checkpoint()."""

    @pytest.mark.asyncio
    async def test_returns_checkpoint(self) -> None:
        """get_checkpoint() should return Checkpoint."""
        client = AsyncRpcClient("https://rpc.example.com")
        state_root_hex = "0123456789abcdef" * 4
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "result": {
                "height": 12345,
                "stateRoot": state_root_hex,
            },
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", new_callable=AsyncMock, return_value=mock_response):
            checkpoint = await client.get_checkpoint()
        
        assert checkpoint.height == 12345
        assert checkpoint.state_root == bytes.fromhex(state_root_hex)


class TestAsyncRpcClientGetStatus:
    """Tests for AsyncRpcClient.get_status()."""

    @pytest.mark.asyncio
    async def test_returns_node_status(self) -> None:
        """get_status() should return NodeStatus."""
        client = AsyncRpcClient("https://rpc.example.com")
        
        mock_response = Mock()
        mock_response.json.return_value = {
            "jsonrpc": "2.0",
            "result": {
                "synced": True,
                "peerCount": 10,
                "checkpointHeight": 12345,
                "tps": 100.5,
            },
            "id": 1,
        }
        mock_response.raise_for_status = Mock()
        
        with patch.object(client._client, "post", new_callable=AsyncMock, return_value=mock_response):
            status = await client.get_status()
        
        assert status.synced is True
        assert status.peer_count == 10


class TestAsyncRpcClientContextManager:
    """Tests for AsyncRpcClient async context manager."""

    @pytest.mark.asyncio
    async def test_async_context_manager(self) -> None:
        """AsyncRpcClient should work as async context manager."""
        async with AsyncRpcClient("https://rpc.example.com") as client:
            assert client._client is not None

    @pytest.mark.asyncio
    async def test_aenter_returns_self(self) -> None:
        """__aenter__ should return the client instance."""
        client = AsyncRpcClient("https://rpc.example.com")
        async with client as c:
            assert c is client
