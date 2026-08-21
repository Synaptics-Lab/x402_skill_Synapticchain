/**
 * Unit tests for RpcClient
 *
 * Tests the JSON-RPC client implementation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RpcClient, JsonRpcRequest, JsonRpcResponse, Checkpoint, NodeStatus } from './index.js';
import { RpcError, RpcErrorCode } from '../errors/index.js';
import { Address } from '../address/index.js';
import { Transaction, TransactionInfo, Value, FunctionSelector } from '../types/index.js';
import { Keypair } from '../crypto/index.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('RpcClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create client with default options', () => {
      const client = new RpcClient('https://rpc.example.com');

      expect(client.url).toBe('https://rpc.example.com');
      expect(client.timeout).toBe(30000);
      expect(client.retries).toBe(3);
      expect(client.headers).toEqual({});
    });

    it('should create client with custom options', () => {
      const client = new RpcClient('https://rpc.example.com', {
        timeout: 10000,
        retries: 5,
        headers: { 'X-API-Key': 'test-key' },
      });

      expect(client.url).toBe('https://rpc.example.com');
      expect(client.timeout).toBe(10000);
      expect(client.retries).toBe(5);
      expect(client.headers).toEqual({ 'X-API-Key': 'test-key' });
    });

    it('should handle partial options', () => {
      const client = new RpcClient('https://rpc.example.com', {
        timeout: 5000,
      });

      expect(client.timeout).toBe(5000);
      expect(client.retries).toBe(3); // default
      expect(client.headers).toEqual({}); // default
    });
  });

  describe('buildRequest', () => {
    it('should build valid JSON-RPC 2.0 request', () => {
      const client = new RpcClient('https://rpc.example.com');
      const request = client.buildRequest('syn_getBalance', ['syn1abc123']);

      expect(request.jsonrpc).toBe('2.0');
      expect(request.method).toBe('syn_getBalance');
      expect(request.params).toEqual(['syn1abc123']);
      expect(typeof request.id).toBe('number');
      expect(request.id).toBeGreaterThan(0);
    });

    it('should increment request ID for each request', () => {
      const client = new RpcClient('https://rpc.example.com');

      const request1 = client.buildRequest('method1', []);
      const request2 = client.buildRequest('method2', []);
      const request3 = client.buildRequest('method3', []);

      expect(request2.id).toBe(request1.id + 1);
      expect(request3.id).toBe(request2.id + 1);
    });

    it('should handle empty params', () => {
      const client = new RpcClient('https://rpc.example.com');
      const request = client.buildRequest('syn_getStatus', []);

      expect(request.params).toEqual([]);
    });

    it('should handle complex params', () => {
      const client = new RpcClient('https://rpc.example.com');
      const params = [
        'syn1abc123',
        { nested: { value: 123 } },
        ['array', 'items'],
      ];
      const request = client.buildRequest('syn_call', params);

      expect(request.params).toEqual(params);
    });
  });

  describe('call', () => {
    it('should make successful RPC call', async () => {
      const client = new RpcClient('https://rpc.example.com');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: '1000000000000000000',
          id: 1,
        }),
      });

      const result = await client.call<string>('syn_getBalance', ['syn1abc123']);

      expect(result).toBe('1000000000000000000');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Verify request format
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://rpc.example.com');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(options.body);
      expect(body.jsonrpc).toBe('2.0');
      expect(body.method).toBe('syn_getBalance');
      expect(body.params).toEqual(['syn1abc123']);
    });

    it('should include custom headers in request', async () => {
      const client = new RpcClient('https://rpc.example.com', {
        headers: { 'X-API-Key': 'test-key', Authorization: 'Bearer token' },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: 'ok',
          id: 1,
        }),
      });

      await client.call('syn_getStatus');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['X-API-Key']).toBe('test-key');
      expect(options.headers['Authorization']).toBe('Bearer token');
    });

    it('should handle null result', async () => {
      const client = new RpcClient('https://rpc.example.com');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: null,
          id: 1,
        }),
      });

      const result = await client.call<null>('syn_getTransaction', ['0x123']);

      expect(result).toBeNull();
    });

    it('should handle object result', async () => {
      const client = new RpcClient('https://rpc.example.com');

      const expectedResult = {
        synced: true,
        peerCount: 10,
        checkpointHeight: '12345',
        tps: 100,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: expectedResult,
          id: 1,
        }),
      });

      const result = await client.call<typeof expectedResult>('syn_getStatus');

      expect(result).toEqual(expectedResult);
    });

    it('should throw RpcError on JSON-RPC error response', async () => {
      const client = new RpcClient('https://rpc.example.com', { retries: 0 });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: 'Method not found',
          },
          id: 1,
        }),
      });

      await expect(client.call('invalid_method')).rejects.toThrow(RpcError);

      try {
        await client.call('invalid_method');
      } catch (error) {
        // Reset mock for second call
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            jsonrpc: '2.0',
            error: {
              code: -32601,
              message: 'Method not found',
            },
            id: 2,
          }),
        });
      }
    });

    it('should throw RpcError with METHOD_NOT_FOUND code for -32601', async () => {
      const client = new RpcClient('https://rpc.example.com', { retries: 0 });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: 'Method not found',
          },
          id: 1,
        }),
      });

      try {
        await client.call('invalid_method');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RpcError);
        expect((error as RpcError).code).toBe(RpcErrorCode.METHOD_NOT_FOUND);
        expect((error as RpcError).rpcCode).toBe(-32601);
      }
    });

    it('should throw RpcError on HTTP error', async () => {
      const client = new RpcClient('https://rpc.example.com', { retries: 0 });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      try {
        await client.call('syn_getStatus');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RpcError);
        expect((error as RpcError).code).toBe(RpcErrorCode.CONNECTION_FAILED);
        expect((error as RpcError).message).toContain('500');
      }
    });

    it('should throw RpcError on invalid JSON-RPC response', async () => {
      const client = new RpcClient('https://rpc.example.com', { retries: 0 });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          // Missing jsonrpc field
          result: 'test',
          id: 1,
        }),
      });

      try {
        await client.call('syn_getStatus');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RpcError);
        expect((error as RpcError).code).toBe(RpcErrorCode.INVALID_RESPONSE);
      }
    });

    it('should throw RpcError on network failure', async () => {
      const client = new RpcClient('https://rpc.example.com', { retries: 0 });

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      try {
        await client.call('syn_getStatus');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RpcError);
        expect((error as RpcError).code).toBe(RpcErrorCode.CONNECTION_FAILED);
        expect((error as RpcError).message).toContain('Network error');
      }
    });

    it('should throw RpcError on timeout', async () => {
      const client = new RpcClient('https://rpc.example.com', {
        timeout: 100,
        retries: 0,
      });

      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      try {
        await client.call('syn_getStatus');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RpcError);
        expect((error as RpcError).code).toBe(RpcErrorCode.TIMEOUT);
      }
    });

    it('should retry on transient failures', async () => {
      const client = new RpcClient('https://rpc.example.com', {
        retries: 2,
      });

      // First two calls fail, third succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            jsonrpc: '2.0',
            result: 'success',
            id: 1,
          }),
        });

      const result = await client.call<string>('syn_getStatus');

      expect(result).toBe('success');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should not retry on METHOD_NOT_FOUND error', async () => {
      const client = new RpcClient('https://rpc.example.com', {
        retries: 3,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: 'Method not found',
          },
          id: 1,
        }),
      });

      try {
        await client.call('invalid_method');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RpcError);
      }

      // Should only be called once (no retries)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should exhaust retries and throw last error', async () => {
      const client = new RpcClient('https://rpc.example.com', {
        retries: 2,
      });

      mockFetch
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockRejectedValueOnce(new Error('Error 3'));

      try {
        await client.call('syn_getStatus');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RpcError);
        expect((error as RpcError).message).toContain('Error 3');
      }

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('JSON-RPC 2.0 format validation', () => {
    it('should format request with all required fields', async () => {
      const client = new RpcClient('https://rpc.example.com');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: 'ok',
          id: 1,
        }),
      });

      await client.call('test_method', ['param1', 'param2']);

      const [, options] = mockFetch.mock.calls[0];
      const body: JsonRpcRequest = JSON.parse(options.body);

      // Validate JSON-RPC 2.0 format (Property 25)
      expect(body.jsonrpc).toBe('2.0');
      expect(body.method).toBe('test_method');
      expect(body.params).toEqual(['param1', 'param2']);
      expect(typeof body.id).toBe('number');
    });

    it('should handle response with error data field', async () => {
      const client = new RpcClient('https://rpc.example.com', { retries: 0 });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Custom error',
            data: { field: 'value', details: 'more info' },
          },
          id: 1,
        }),
      });

      try {
        await client.call('syn_getStatus');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RpcError);
        expect((error as RpcError).details?.data).toEqual({
          field: 'value',
          details: 'more info',
        });
      }
    });
  });

  describe('headers immutability', () => {
    it('should return a copy of headers', () => {
      const client = new RpcClient('https://rpc.example.com', {
        headers: { 'X-API-Key': 'test' },
      });

      const headers1 = client.headers;
      const headers2 = client.headers;

      // Should be equal but not the same object
      expect(headers1).toEqual(headers2);
      expect(headers1).not.toBe(headers2);

      // Modifying returned headers should not affect client
      headers1['New-Header'] = 'value';
      expect(client.headers['New-Header']).toBeUndefined();
    });
  });
});


describe('RpcClient High-Level Methods', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getBalance', () => {
    it('should return balance as bigint', async () => {
      const client = new RpcClient('https://rpc.example.com');
      const address = Address.zero();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: '1000000000000000000',
          id: 1,
        }),
      });

      const balance = await client.getBalance(address);

      expect(balance).toBe(1000000000000000000n);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.method).toBe('syn_getBalance');
      expect(body.params).toEqual([address.toBech32()]);
    });

    it('should handle zero balance', async () => {
      const client = new RpcClient('https://rpc.example.com');
      const address = Address.zero();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: '0',
          id: 1,
        }),
      });

      const balance = await client.getBalance(address);

      expect(balance).toBe(0n);
    });

    it('should handle large balance (U256)', async () => {
      const client = new RpcClient('https://rpc.example.com');
      const address = Address.zero();
      const largeBalance = '115792089237316195423570985008687907853269984665640564039457584007913129639935';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: largeBalance,
          id: 1,
        }),
      });

      const balance = await client.getBalance(address);

      expect(balance).toBe(BigInt(largeBalance));
    });
  });

  describe('sendTransaction', () => {
    it('should send transaction and return txId', async () => {
      const client = new RpcClient('https://rpc.example.com');
      const keypair = Keypair.generate();
      const recipient = Address.zero();
      const fromAddress = new Address(keypair.addressBytes());

      // Create a signed transaction
      const tx: Transaction = {
        nonce: 0n,
        from: fromAddress,
        signature: keypair.sign(new Uint8Array(32)),
        payload: {
          type: 'transfer',
          to: recipient,
          amount: 1000n,
        },
        gasLimit: 21000n,
        gasPrice: 1000000000n,
        parents: [],
        timestamp: BigInt(Date.now()),
      };

      const expectedTxId = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: expectedTxId,
          id: 1,
        }),
      });

      const txId = await client.sendTransaction(tx);

      expect(txId).toBeInstanceOf(Uint8Array);
      expect(txId.length).toBe(32);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.method).toBe('syn_sendTransaction');
      // params[0] should be hex-encoded Borsh serialized transaction
      expect(typeof body.params[0]).toBe('string');
    });
  });

  describe('getTransaction', () => {
    it('should return transaction info when found', async () => {
      const client = new RpcClient('https://rpc.example.com');
      const txIdHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const txId = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        txId[i] = parseInt(txIdHex.slice(i * 2, i * 2 + 2), 16);
      }

      const fromAddress = Address.zero();
      const toAddress = Address.zero();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: {
            txId: txIdHex,
            transaction: {
              nonce: '0',
              from: fromAddress.toBech32(),
              signature: '00'.repeat(64),
              payload: {
                type: 'transfer',
                to: toAddress.toBech32(),
                amount: '1000',
              },
              gasLimit: '21000',
              gasPrice: '1000000000',
              parents: [],
              timestamp: '1234567890',
            },
            confirmed: true,
            height: '100',
          },
          id: 1,
        }),
      });

      const result = await client.getTransaction(txId);

      expect(result).not.toBeNull();
      expect(result!.confirmed).toBe(true);
      expect(result!.height).toBe(100n);
      expect(result!.transaction.nonce).toBe(0n);
      expect(result!.transaction.gasLimit).toBe(21000n);
      expect(result!.transaction.payload.type).toBe('transfer');
    });

    it('should return null when transaction not found', async () => {
      const client = new RpcClient('https://rpc.example.com');
      const txId = new Uint8Array(32);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: null,
          id: 1,
        }),
      });

      const result = await client.getTransaction(txId);

      expect(result).toBeNull();
    });

    it('should handle transaction without height (unconfirmed)', async () => {
      const client = new RpcClient('https://rpc.example.com');
      const txId = new Uint8Array(32);
      const fromAddress = Address.zero();
      const toAddress = Address.zero();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: {
            txId: '00'.repeat(32),
            transaction: {
              nonce: '0',
              from: fromAddress.toBech32(),
              signature: '00'.repeat(64),
              payload: {
                type: 'transfer',
                to: toAddress.toBech32(),
                amount: '1000',
              },
              gasLimit: '21000',
              gasPrice: '1000000000',
              parents: [],
              timestamp: '1234567890',
            },
            confirmed: false,
            // No height field
          },
          id: 1,
        }),
      });

      const result = await client.getTransaction(txId);

      expect(result).not.toBeNull();
      expect(result!.confirmed).toBe(false);
      expect(result!.height).toBeUndefined();
    });
  });

  describe('callContract', () => {
    it('should make read-only contract call and return value', async () => {
      const client = new RpcClient('https://rpc.example.com');
      const contract = Address.zero();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: { type: 'u256', value: '1000000000000000000' },
          id: 1,
        }),
      });

      const result = await client.callContract(contract, 'balanceOf', [
        { type: 'address', value: Address.zero() },
      ]);

      expect(result.type).toBe('u256');
      expect((result as { type: 'u256'; value: bigint }).value).toBe(1000000000000000000n);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.method).toBe('syn_call');
      expect(body.params[0]).toBe(contract.toBech32());
      // Function selector should be hex
      expect(typeof body.params[1]).toBe('string');
    });

    it('should handle call with no arguments', async () => {
      const client = new RpcClient('https://rpc.example.com');
      const contract = Address.zero();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: { type: 'string', value: 'MyToken' },
          id: 1,
        }),
      });

      const result = await client.callContract(contract, 'name');

      expect(result.type).toBe('string');
      expect((result as { type: 'string'; value: string }).value).toBe('MyToken');
    });

    it('should handle complex return values', async () => {
      const client = new RpcClient('https://rpc.example.com');
      const contract = Address.zero();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: {
            type: 'array',
            value: [
              { type: 'u64', value: '100' },
              { type: 'bool', value: true },
              { type: 'string', value: 'test' },
            ],
          },
          id: 1,
        }),
      });

      const result = await client.callContract(contract, 'getData');

      expect(result.type).toBe('array');
      const arr = (result as { type: 'array'; value: Value[] }).value;
      expect(arr.length).toBe(3);
      expect(arr[0].type).toBe('u64');
      expect((arr[0] as { type: 'u64'; value: bigint }).value).toBe(100n);
    });
  });

  describe('getCode', () => {
    it('should return contract bytecode', async () => {
      const client = new RpcClient('https://rpc.example.com');
      const address = Address.zero();
      const codeHex = '608060405234801561001057600080fd5b50';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: codeHex,
          id: 1,
        }),
      });

      const code = await client.getCode(address);

      expect(code).not.toBeNull();
      expect(code).toBeInstanceOf(Uint8Array);
      expect(code!.length).toBe(codeHex.length / 2);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.method).toBe('syn_getCode');
      expect(body.params).toEqual([address.toBech32()]);
    });

    it('should return null for non-contract address', async () => {
      const client = new RpcClient('https://rpc.example.com');
      const address = Address.zero();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: null,
          id: 1,
        }),
      });

      const code = await client.getCode(address);

      expect(code).toBeNull();
    });
  });

  describe('getCheckpoint', () => {
    it('should return checkpoint info', async () => {
      const client = new RpcClient('https://rpc.example.com');
      const stateRootHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: {
            height: '12345',
            stateRoot: stateRootHex,
          },
          id: 1,
        }),
      });

      const checkpoint = await client.getCheckpoint();

      expect(checkpoint.height).toBe(12345n);
      expect(checkpoint.stateRoot).toBeInstanceOf(Uint8Array);
      expect(checkpoint.stateRoot.length).toBe(32);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.method).toBe('syn_getCheckpoint');
      expect(body.params).toEqual([]);
    });
  });

  describe('getStatus', () => {
    it('should return node status', async () => {
      const client = new RpcClient('https://rpc.example.com');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: {
            synced: true,
            peerCount: 10,
            checkpointHeight: '12345',
            tps: 100,
          },
          id: 1,
        }),
      });

      const status = await client.getStatus();

      expect(status.synced).toBe(true);
      expect(status.peerCount).toBe(10);
      expect(status.checkpointHeight).toBe(12345n);
      expect(status.tps).toBe(100);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.method).toBe('syn_getStatus');
      expect(body.params).toEqual([]);
    });

    it('should handle unsynced node', async () => {
      const client = new RpcClient('https://rpc.example.com');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: {
            synced: false,
            peerCount: 2,
            checkpointHeight: '100',
            tps: 0,
          },
          id: 1,
        }),
      });

      const status = await client.getStatus();

      expect(status.synced).toBe(false);
      expect(status.peerCount).toBe(2);
      expect(status.checkpointHeight).toBe(100n);
      expect(status.tps).toBe(0);
    });
  });

  describe('Transaction payload parsing', () => {
    it('should parse deploy payload correctly', async () => {
      const client = new RpcClient('https://rpc.example.com');
      const txId = new Uint8Array(32);
      const fromAddress = Address.zero();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: {
            txId: '00'.repeat(32),
            transaction: {
              nonce: '1',
              from: fromAddress.toBech32(),
              signature: '00'.repeat(64),
              payload: {
                type: 'deploy',
                code: 'deadbeef',
                constructorArgs: [
                  { type: 'string', value: 'MyToken' },
                  { type: 'u256', value: '1000000' },
                ],
              },
              gasLimit: '1000000',
              gasPrice: '1000000000',
              parents: [],
              timestamp: '1234567890',
            },
            confirmed: true,
            height: '50',
          },
          id: 1,
        }),
      });

      const result = await client.getTransaction(txId);

      expect(result).not.toBeNull();
      expect(result!.transaction.payload.type).toBe('deploy');
      const payload = result!.transaction.payload as {
        type: 'deploy';
        code: Uint8Array;
        constructorArgs: Value[];
      };
      expect(payload.code).toBeInstanceOf(Uint8Array);
      expect(payload.constructorArgs.length).toBe(2);
      expect(payload.constructorArgs[0].type).toBe('string');
    });

    it('should parse call payload correctly', async () => {
      const client = new RpcClient('https://rpc.example.com');
      const txId = new Uint8Array(32);
      const fromAddress = Address.zero();
      const contractAddress = Address.zero();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: {
            txId: '00'.repeat(32),
            transaction: {
              nonce: '2',
              from: fromAddress.toBech32(),
              signature: '00'.repeat(64),
              payload: {
                type: 'call',
                contract: contractAddress.toBech32(),
                function: 'a9059cbb', // transfer selector
                args: [
                  { type: 'address', value: Address.zero().toBech32() },
                  { type: 'u256', value: '1000' },
                ],
              },
              gasLimit: '100000',
              gasPrice: '1000000000',
              parents: [],
              timestamp: '1234567890',
            },
            confirmed: true,
            height: '75',
          },
          id: 1,
        }),
      });

      const result = await client.getTransaction(txId);

      expect(result).not.toBeNull();
      expect(result!.transaction.payload.type).toBe('call');
      const payload = result!.transaction.payload as {
        type: 'call';
        contract: Address;
        function: FunctionSelector;
        args: Value[];
      };
      expect(payload.contract).toBeInstanceOf(Address);
      expect(payload.function).toBeInstanceOf(FunctionSelector);
      expect(payload.args.length).toBe(2);
    });
  });
});
