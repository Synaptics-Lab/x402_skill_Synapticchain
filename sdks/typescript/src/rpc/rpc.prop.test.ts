/**
 * Property-based tests for RPC module
 *
 * Uses fast-check for property-based testing with minimum 100 iterations per property.
 *
 * Tests Property 25 from the design document.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { RpcClient, JsonRpcRequest } from './index.js';

// Minimum iterations per property as specified in design document
const NUM_RUNS = 100;

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ============================================================================
// Custom Generators
// ============================================================================

/**
 * Generator for valid RPC method names.
 * Method names are non-empty strings that follow JSON-RPC conventions.
 */
const methodNameArb = fc.oneof(
  // Standard SynapticChain RPC methods
  fc.constantFrom(
    'syn_getBalance',
    'syn_sendTransaction',
    'syn_getTransaction',
    'syn_call',
    'syn_getCode',
    'syn_getCheckpoint',
    'syn_getStatus'
  ),
  // Generic method names (non-empty alphanumeric with underscores)
  fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_0123456789'.split('')), {
    minLength: 1,
    maxLength: 50,
  })
);

/**
 * Generator for valid RPC parameter values.
 * Parameters can be strings, numbers, booleans, arrays, or objects.
 */
const paramValueArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.boolean(),
  fc.constant(null),
  // Hex strings (common in blockchain RPC)
  fc.hexaString({ minLength: 2, maxLength: 128 }).map((s) => '0x' + s),
  // Bech32-like addresses
  fc.hexaString({ minLength: 40, maxLength: 40 }).map((s) => 'syn1' + s.slice(0, 38))
);

/**
 * Generator for arrays of RPC parameters.
 */
const paramsArb = fc.array(paramValueArb, { minLength: 0, maxLength: 10 });

/**
 * Generator for valid RPC endpoint URLs.
 */
const urlArb = fc.constantFrom(
  'https://rpc.example.com',
  'https://rpc.synaptyx.xyz',
  'https://mainnet.synaptyx.xyz/rpc'
);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a mock successful JSON-RPC response.
 */
function createMockResponse<T>(result: T, id: number): Response {
  return {
    ok: true,
    json: async () => ({
      jsonrpc: '2.0',
      result,
      id,
    }),
  } as unknown as Response;
}

/**
 * Validates that a request object conforms to JSON-RPC 2.0 specification.
 */
function isValidJsonRpc2Request(request: unknown): request is JsonRpcRequest {
  if (typeof request !== 'object' || request === null) {
    return false;
  }

  const req = request as Record<string, unknown>;

  // jsonrpc field must be exactly "2.0"
  if (req.jsonrpc !== '2.0') {
    return false;
  }

  // method field must be a string
  if (typeof req.method !== 'string') {
    return false;
  }

  // params field must be an array
  if (!Array.isArray(req.params)) {
    return false;
  }

  // id field must be a number
  if (typeof req.id !== 'number') {
    return false;
  }

  return true;
}

// ============================================================================
// Property Tests
// ============================================================================

describe('RPC Property Tests', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Feature: synapticchain-sdks, Property 25: RPC Request Format
  // **Validates: Requirements 6.11**
  describe('Property 25: RPC Request Format', () => {
    it('for any RPC method call, the request SHALL be formatted as valid JSON-RPC 2.0 with fields: jsonrpc="2.0", method, params, and id', async () => {
      await fc.assert(
        fc.asyncProperty(urlArb, methodNameArb, paramsArb, async (url, method, params) => {
          // Reset mock for each iteration
          mockFetch.mockReset();
          const client = new RpcClient(url, { retries: 0 });

          // Set up mock to capture the request
          mockFetch.mockResolvedValueOnce(createMockResponse('ok', 1));

          try {
            await client.call(method, params);
          } catch {
            // Ignore errors - we're testing request format, not response handling
          }

          // Verify fetch was called
          expect(mockFetch).toHaveBeenCalledTimes(1);

          // Extract the request body
          const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
          const body = JSON.parse(options.body as string);

          // Validate JSON-RPC 2.0 format
          expect(isValidJsonRpc2Request(body)).toBe(true);

          // Verify specific field values
          expect(body.jsonrpc).toBe('2.0');
          expect(body.method).toBe(method);
          expect(body.params).toEqual(params);
          expect(typeof body.id).toBe('number');
          expect(body.id).toBeGreaterThan(0);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('buildRequest SHALL always produce a valid JSON-RPC 2.0 request object', () => {
      fc.assert(
        fc.property(urlArb, methodNameArb, paramsArb, (url, method, params) => {
          const client = new RpcClient(url);
          const request = client.buildRequest(method, params);

          // Validate JSON-RPC 2.0 format
          expect(isValidJsonRpc2Request(request)).toBe(true);

          // Verify specific field values
          expect(request.jsonrpc).toBe('2.0');
          expect(request.method).toBe(method);
          expect(request.params).toEqual(params);
          expect(typeof request.id).toBe('number');
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('jsonrpc field SHALL always be exactly "2.0"', () => {
      fc.assert(
        fc.property(urlArb, methodNameArb, paramsArb, (url, method, params) => {
          const client = new RpcClient(url);
          const request = client.buildRequest(method, params);

          expect(request.jsonrpc).toBe('2.0');
          expect(typeof request.jsonrpc).toBe('string');
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('method field SHALL be a string matching the input method name', () => {
      fc.assert(
        fc.property(urlArb, methodNameArb, paramsArb, (url, method, params) => {
          const client = new RpcClient(url);
          const request = client.buildRequest(method, params);

          expect(typeof request.method).toBe('string');
          expect(request.method).toBe(method);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('params field SHALL be an array matching the input params', () => {
      fc.assert(
        fc.property(urlArb, methodNameArb, paramsArb, (url, method, params) => {
          const client = new RpcClient(url);
          const request = client.buildRequest(method, params);

          expect(Array.isArray(request.params)).toBe(true);
          expect(request.params).toEqual(params);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('id field SHALL be a positive number', () => {
      fc.assert(
        fc.property(urlArb, methodNameArb, paramsArb, (url, method, params) => {
          const client = new RpcClient(url);
          const request = client.buildRequest(method, params);

          expect(typeof request.id).toBe('number');
          expect(Number.isInteger(request.id)).toBe(true);
          expect(request.id).toBeGreaterThan(0);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('id field SHALL increment for each request from the same client', () => {
      fc.assert(
        fc.property(
          urlArb,
          fc.array(fc.tuple(methodNameArb, paramsArb), { minLength: 2, maxLength: 10 }),
          (url, methodParamPairs) => {
            const client = new RpcClient(url);
            const requests = methodParamPairs.map(([method, params]) =>
              client.buildRequest(method, params)
            );

            // Verify IDs are strictly increasing
            for (let i = 1; i < requests.length; i++) {
              expect(requests[i]!.id).toBe(requests[i - 1]!.id + 1);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('request SHALL be sent with Content-Type application/json header', async () => {
      await fc.assert(
        fc.asyncProperty(urlArb, methodNameArb, paramsArb, async (url, method, params) => {
          // Reset mock for each iteration
          mockFetch.mockReset();
          const client = new RpcClient(url, { retries: 0 });

          mockFetch.mockResolvedValueOnce(createMockResponse('ok', 1));

          try {
            await client.call(method, params);
          } catch {
            // Ignore errors
          }

          expect(mockFetch).toHaveBeenCalledTimes(1);

          const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
          const headers = options.headers as Record<string, string>;

          expect(headers['Content-Type']).toBe('application/json');
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('request SHALL be sent using POST method', async () => {
      await fc.assert(
        fc.asyncProperty(urlArb, methodNameArb, paramsArb, async (url, method, params) => {
          // Reset mock for each iteration
          mockFetch.mockReset();
          const client = new RpcClient(url, { retries: 0 });

          mockFetch.mockResolvedValueOnce(createMockResponse('ok', 1));

          try {
            await client.call(method, params);
          } catch {
            // Ignore errors
          }

          expect(mockFetch).toHaveBeenCalledTimes(1);

          const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];

          expect(options.method).toBe('POST');
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('request body SHALL be valid JSON', async () => {
      await fc.assert(
        fc.asyncProperty(urlArb, methodNameArb, paramsArb, async (url, method, params) => {
          // Reset mock for each iteration
          mockFetch.mockReset();
          const client = new RpcClient(url, { retries: 0 });

          mockFetch.mockResolvedValueOnce(createMockResponse('ok', 1));

          try {
            await client.call(method, params);
          } catch {
            // Ignore errors
          }

          expect(mockFetch).toHaveBeenCalledTimes(1);

          const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
          const bodyString = options.body as string;

          // Should not throw when parsing
          expect(() => JSON.parse(bodyString)).not.toThrow();

          // Parsed body should be an object
          const body = JSON.parse(bodyString);
          expect(typeof body).toBe('object');
          expect(body).not.toBeNull();
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('custom headers SHALL be included in the request', async () => {
      const customHeadersArb = fc.dictionary(
        fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-'.split('')), {
          minLength: 1,
          maxLength: 20,
        }),
        fc.string({ minLength: 1, maxLength: 50 })
      );

      await fc.assert(
        fc.asyncProperty(
          urlArb,
          methodNameArb,
          paramsArb,
          customHeadersArb,
          async (url, method, params, customHeaders) => {
            // Reset mock for each iteration
            mockFetch.mockReset();
            const client = new RpcClient(url, { retries: 0, headers: customHeaders });

            mockFetch.mockResolvedValueOnce(createMockResponse('ok', 1));

            try {
              await client.call(method, params);
            } catch {
              // Ignore errors
            }

            expect(mockFetch).toHaveBeenCalledTimes(1);

            const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
            const headers = options.headers as Record<string, string>;

            // All custom headers should be present
            for (const [key, value] of Object.entries(customHeaders)) {
              expect(headers[key]).toBe(value);
            }
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('empty params array SHALL be valid', () => {
      fc.assert(
        fc.property(urlArb, methodNameArb, (url, method) => {
          const client = new RpcClient(url);
          const request = client.buildRequest(method, []);

          expect(isValidJsonRpc2Request(request)).toBe(true);
          expect(request.params).toEqual([]);
          expect(Array.isArray(request.params)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('complex nested params SHALL be preserved in the request', async () => {
      const complexParamsArb = fc.array(
        fc.oneof(
          fc.string(),
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.array(fc.string(), { minLength: 0, maxLength: 3 }),
          fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.string())
        ),
        { minLength: 0, maxLength: 5 }
      );

      await fc.assert(
        fc.asyncProperty(urlArb, methodNameArb, complexParamsArb, async (url, method, params) => {
          // Reset mock for each iteration
          mockFetch.mockReset();
          const client = new RpcClient(url, { retries: 0 });

          mockFetch.mockResolvedValueOnce(createMockResponse('ok', 1));

          try {
            await client.call(method, params);
          } catch {
            // Ignore errors
          }

          expect(mockFetch).toHaveBeenCalledTimes(1);

          const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
          const body = JSON.parse(options.body as string);

          // Params should be preserved exactly
          expect(body.params).toEqual(params);
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });
});
