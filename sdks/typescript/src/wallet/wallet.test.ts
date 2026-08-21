/**
 * Unit tests for Wallet class
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Wallet, TxOptions, DeployResult } from './index.js';
import { Keypair, verify } from '../crypto/index.js';
import { Address } from '../address/index.js';
import { RpcClient } from '../rpc/index.js';
import { TransactionBuilder, UnsignedTransaction, Value } from '../types/index.js';
import { getSigningBytes } from '../serialization/index.js';

// Mock RpcClient
vi.mock('../rpc/index.js', () => {
  return {
    RpcClient: vi.fn().mockImplementation((url: string) => ({
      url,
      getBalance: vi.fn().mockResolvedValue(1000000000000000000n),
      sendTransaction: vi.fn().mockResolvedValue(new Uint8Array(32).fill(0xab)),
      getTransaction: vi.fn().mockResolvedValue(null),
      callContract: vi.fn().mockResolvedValue({ type: 'unit' }),
      getCode: vi.fn().mockResolvedValue(null),
      getCheckpoint: vi.fn().mockResolvedValue({ height: 100n, stateRoot: new Uint8Array(32) }),
      getStatus: vi.fn().mockResolvedValue({ synced: true, peerCount: 10, checkpointHeight: 100n, tps: 1000 }),
    })),
  };
});

describe('Wallet', () => {
  let keypair: Keypair;
  let rpcClient: RpcClient;
  let wallet: Wallet;

  beforeEach(() => {
    vi.clearAllMocks();
    keypair = Keypair.generate();
    rpcClient = new RpcClient('https://rpc.test.synaptyx.xyz');
    wallet = new Wallet(keypair, rpcClient);
  });

  describe('constructor', () => {
    it('should create a wallet from keypair and rpcClient', () => {
      const w = new Wallet(keypair, rpcClient);
      expect(w).toBeInstanceOf(Wallet);
      expect(w.address()).toBeInstanceOf(Address);
    });

    it('should derive the correct address from keypair', () => {
      const w = new Wallet(keypair, rpcClient);
      const expectedAddress = new Address(keypair.addressBytes());
      expect(w.address().equals(expectedAddress)).toBe(true);
    });
  });

  describe('static generate', () => {
    it('should generate a new wallet with random keypair', () => {
      const w = Wallet.generate(rpcClient);
      expect(w).toBeInstanceOf(Wallet);
      expect(w.address()).toBeInstanceOf(Address);
    });

    it('should generate unique wallets each time', () => {
      const w1 = Wallet.generate(rpcClient);
      const w2 = Wallet.generate(rpcClient);
      expect(w1.address().equals(w2.address())).toBe(false);
    });
  });

  describe('static fromPrivateKey', () => {
    it('should create a wallet from a private key', () => {
      const privateKey = keypair.privateKey;
      const w = Wallet.fromPrivateKey(privateKey, rpcClient);
      expect(w).toBeInstanceOf(Wallet);
      expect(w.address().equals(wallet.address())).toBe(true);
    });

    it('should throw for invalid private key length', () => {
      const invalidKey = new Uint8Array(16); // Wrong length
      expect(() => Wallet.fromPrivateKey(invalidKey, rpcClient)).toThrow();
    });
  });

  describe('address', () => {
    it('should return the wallet address', () => {
      const address = wallet.address();
      expect(address).toBeInstanceOf(Address);
      expect(address.toBech32()).toMatch(/^syn1/);
    });

    it('should return the same address on multiple calls', () => {
      const addr1 = wallet.address();
      const addr2 = wallet.address();
      expect(addr1.equals(addr2)).toBe(true);
    });
  });

  describe('publicKey', () => {
    it('should return the 32-byte public key', () => {
      const pubKey = wallet.publicKey();
      expect(pubKey).toBeInstanceOf(Uint8Array);
      expect(pubKey.length).toBe(32);
    });

    it('should match the keypair public key', () => {
      const pubKey = wallet.publicKey();
      expect(pubKey).toEqual(keypair.publicKey);
    });
  });

  describe('getBalance', () => {
    it('should call rpcClient.getBalance with wallet address', async () => {
      const balance = await wallet.getBalance();
      expect(rpcClient.getBalance).toHaveBeenCalledWith(wallet.address());
      expect(balance).toBe(1000000000000000000n);
    });
  });

  describe('getNonce', () => {
    it('should return a nonce value', async () => {
      const nonce = await wallet.getNonce();
      expect(typeof nonce).toBe('bigint');
    });
  });

  describe('transfer', () => {
    it('should build and send a transfer transaction', async () => {
      const recipient = Address.zero();
      const amount = 1000n;

      const txId = await wallet.transfer(recipient, amount, { nonce: 0n });

      expect(rpcClient.sendTransaction).toHaveBeenCalled();
      expect(txId).toBeInstanceOf(Uint8Array);
      expect(txId.length).toBe(32);
    });

    it('should use provided options', async () => {
      const recipient = Address.zero();
      const amount = 1000n;
      const options: TxOptions = {
        gasLimit: 50000n,
        gasPrice: 2000000000n,
        nonce: 5n,
      };

      await wallet.transfer(recipient, amount, options);

      expect(rpcClient.sendTransaction).toHaveBeenCalled();
      const sentTx = (rpcClient.sendTransaction as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(sentTx.nonce).toBe(5n);
      expect(sentTx.gasLimit).toBe(50000n);
      expect(sentTx.gasPrice).toBe(2000000000n);
    });

    it('should create a valid transfer payload', async () => {
      const recipient = Address.zero();
      const amount = 1000n;

      await wallet.transfer(recipient, amount, { nonce: 0n });

      const sentTx = (rpcClient.sendTransaction as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(sentTx.payload.type).toBe('transfer');
      expect(sentTx.payload.to.equals(recipient)).toBe(true);
      expect(sentTx.payload.amount).toBe(amount);
    });
  });

  describe('deploy', () => {
    it('should build and send a deploy transaction', async () => {
      const code = new Uint8Array([0x00, 0x61, 0x73, 0x6d]); // WASM magic bytes

      const result = await wallet.deploy(code, [], { nonce: 0n });

      expect(rpcClient.sendTransaction).toHaveBeenCalled();
      expect(result.txId).toBeInstanceOf(Uint8Array);
      expect(result.txId.length).toBe(32);
      expect(result.contractAddress).toBeInstanceOf(Address);
    });

    it('should return predicted contract address', async () => {
      const code = new Uint8Array([0x00, 0x61, 0x73, 0x6d]);
      const nonce = 5n;

      const result = await wallet.deploy(code, [], { nonce });

      expect(result.contractAddress).toBeInstanceOf(Address);
      expect(result.contractAddress.toBech32()).toMatch(/^syn1/);
    });

    it('should include constructor arguments', async () => {
      const code = new Uint8Array([0x00, 0x61, 0x73, 0x6d]);
      const args: Value[] = [
        { type: 'string', value: 'MyToken' },
        { type: 'u256', value: 1000000n },
      ];

      await wallet.deploy(code, args, { nonce: 0n });

      const sentTx = (rpcClient.sendTransaction as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(sentTx.payload.type).toBe('deploy');
      expect(sentTx.payload.constructorArgs).toEqual(args);
    });
  });

  describe('call', () => {
    it('should build and send a call transaction', async () => {
      const contract = Address.zero();
      const functionName = 'transfer';
      const args: Value[] = [
        { type: 'address', value: Address.zero() },
        { type: 'u256', value: 1000n },
      ];

      const txId = await wallet.call(contract, functionName, args, { nonce: 0n });

      expect(rpcClient.sendTransaction).toHaveBeenCalled();
      expect(txId).toBeInstanceOf(Uint8Array);
      expect(txId.length).toBe(32);
    });

    it('should create a valid call payload', async () => {
      const contract = Address.zero();
      const functionName = 'balanceOf';

      await wallet.call(contract, functionName, [], { nonce: 0n });

      const sentTx = (rpcClient.sendTransaction as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(sentTx.payload.type).toBe('call');
      expect(sentTx.payload.contract.equals(contract)).toBe(true);
    });
  });

  describe('signTransaction', () => {
    it('should sign an unsigned transaction', () => {
      const unsignedTx: UnsignedTransaction = new TransactionBuilder()
        .from(wallet.address())
        .nonce(0n)
        .gasLimit(21000n)
        .gasPrice(1000000000n)
        .transfer(Address.zero(), 1000n)
        .build();

      const signedTx = wallet.signTransaction(unsignedTx);

      expect(signedTx.signature).toBeInstanceOf(Uint8Array);
      expect(signedTx.signature.length).toBe(64);
      expect(signedTx.nonce).toBe(unsignedTx.nonce);
      expect(signedTx.from.equals(unsignedTx.from)).toBe(true);
      expect(signedTx.payload).toEqual(unsignedTx.payload);
    });

    it('should produce a valid signature', () => {
      const unsignedTx: UnsignedTransaction = new TransactionBuilder()
        .from(wallet.address())
        .nonce(0n)
        .gasLimit(21000n)
        .gasPrice(1000000000n)
        .transfer(Address.zero(), 1000n)
        .build();

      const signedTx = wallet.signTransaction(unsignedTx);
      const signingBytes = getSigningBytes(unsignedTx);

      // Verify the signature
      const isValid = verify(signingBytes, signedTx.signature, wallet.publicKey());
      expect(isValid).toBe(true);
    });
  });

  describe('signMessage', () => {
    it('should sign an arbitrary message', () => {
      const message = new TextEncoder().encode('Hello, SynapticChain!');
      const signature = wallet.signMessage(message);

      expect(signature).toBeInstanceOf(Uint8Array);
      expect(signature.length).toBe(64);
    });

    it('should produce a valid signature', () => {
      const message = new TextEncoder().encode('Test message');
      const signature = wallet.signMessage(message);

      const isValid = verify(message, signature, wallet.publicKey());
      expect(isValid).toBe(true);
    });

    it('should produce different signatures for different messages', () => {
      const message1 = new TextEncoder().encode('Message 1');
      const message2 = new TextEncoder().encode('Message 2');

      const sig1 = wallet.signMessage(message1);
      const sig2 = wallet.signMessage(message2);

      expect(sig1).not.toEqual(sig2);
    });
  });

  describe('keypair getter', () => {
    it('should return the underlying keypair', () => {
      expect(wallet.keypair).toBe(keypair);
    });
  });

  describe('rpcClient getter', () => {
    it('should return the RPC client', () => {
      expect(wallet.rpcClient).toBe(rpcClient);
    });
  });
});

describe('Wallet integration scenarios', () => {
  let rpcClient: RpcClient;

  beforeEach(() => {
    vi.clearAllMocks();
    rpcClient = new RpcClient('https://rpc.test.synaptyx.xyz');
  });

  it('should support full wallet lifecycle', async () => {
    // Generate a new wallet
    const wallet = Wallet.generate(rpcClient);
    expect(wallet.address().toBech32()).toMatch(/^syn1/);

    // Check balance
    const balance = await wallet.getBalance();
    expect(balance).toBe(1000000000000000000n);

    // Transfer tokens
    const recipient = Address.zero();
    const txId = await wallet.transfer(recipient, 1000n, { nonce: 0n });
    expect(txId.length).toBe(32);
  });

  it('should support importing existing wallet', () => {
    // Generate a keypair
    const originalKeypair = Keypair.generate();
    const privateKey = originalKeypair.privateKey;

    // Import into a new wallet
    const importedWallet = Wallet.fromPrivateKey(privateKey, rpcClient);

    // Verify same address
    const originalAddress = new Address(originalKeypair.addressBytes());
    expect(importedWallet.address().equals(originalAddress)).toBe(true);
  });

  it('should sign transactions consistently', () => {
    const wallet = Wallet.generate(rpcClient);

    const unsignedTx: UnsignedTransaction = new TransactionBuilder()
      .from(wallet.address())
      .nonce(0n)
      .gasLimit(21000n)
      .gasPrice(1000000000n)
      .timestamp(1234567890n)
      .transfer(Address.zero(), 1000n)
      .build();

    // Sign the same transaction twice
    const signedTx1 = wallet.signTransaction(unsignedTx);
    const signedTx2 = wallet.signTransaction(unsignedTx);

    // Signatures should be identical for the same message
    expect(signedTx1.signature).toEqual(signedTx2.signature);
  });
});
