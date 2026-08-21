/**
 * Example: Parallel Transaction Execution with S=0
 *
 * This example demonstrates how to use lane-based nonce management (S=0)
 * to submit multiple transactions from the same account in parallel.
 *
 * S=0 (zero sequential fraction) enables true parallel execution by allowing
 * each (address, nonceKey) pair to maintain an independent nonce sequence.
 */

import { Keypair, Address, TransactionBuilder, RpcClient, Wallet } from '../src/index.js';

async function main() {
  // Connect to a SynapticChain node
  const rpc = new RpcClient('https://rpc.synaptyx.xyz');
  
  // Create or load a wallet
  const keypair = Keypair.generate();
  const wallet = new Wallet(keypair, rpc);
  
  console.log('Wallet address:', wallet.address().toBech32());
  
  // Example recipient addresses
  const recipient1 = Address.fromBech32('syn1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq5qw4xk');
  const recipient2 = Address.fromBech32('syn1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq5qw4xk');
  const recipient3 = Address.fromBech32('syn1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq5qw4xk');
  
  // Get the current nonce
  const nonce = await wallet.getNonce();
  
  console.log('\n=== Sequential Execution (Traditional) ===');
  console.log('Submitting 3 transactions sequentially...');
  
  const startSeq = Date.now();
  
  // Traditional sequential execution - each transaction waits for the previous
  const tx1 = await wallet.transfer(recipient1, 1000n, { nonce: nonce });
  const tx2 = await wallet.transfer(recipient2, 2000n, { nonce: nonce + 1n });
  const tx3 = await wallet.transfer(recipient3, 3000n, { nonce: nonce + 2n });
  
  const endSeq = Date.now();
  console.log(`Sequential execution time: ${endSeq - startSeq}ms`);
  console.log('Transaction IDs:', [tx1, tx2, tx3].map(id => Buffer.from(id).toString('hex').slice(0, 16) + '...'));
  
  console.log('\n=== Parallel Execution with S=0 ===');
  console.log('Submitting 3 transactions in parallel using different lanes...');
  
  const startPar = Date.now();
  
  // S=0 parallel execution - transactions use different nonce keys (lanes)
  // Each lane maintains an independent nonce sequence
  const [txA, txB, txC] = await Promise.all([
    wallet.transfer(recipient1, 1000n, { nonce: 0n, nonceKey: 0n }), // Lane 0
    wallet.transfer(recipient2, 2000n, { nonce: 0n, nonceKey: 1n }), // Lane 1
    wallet.transfer(recipient3, 3000n, { nonce: 0n, nonceKey: 2n }), // Lane 2
  ]);
  
  const endPar = Date.now();
  console.log(`Parallel execution time: ${endPar - startPar}ms`);
  console.log('Transaction IDs:', [txA, txB, txC].map(id => Buffer.from(id).toString('hex').slice(0, 16) + '...'));
  
  const speedup = (endSeq - startSeq) / (endPar - startPar);
  console.log(`\nSpeedup: ${speedup.toFixed(2)}x faster with S=0!`);
  
  console.log('\n=== Advanced: Mixed Lane Usage ===');
  console.log('You can mix sequential and parallel execution:');
  
  // Lane 0: Sequential transactions
  const lane0_tx1 = new TransactionBuilder()
    .from(wallet.address())
    .nonce(0n)
    .nonceKey(0n)  // Main lane
    .gasLimit(21000n)
    .gasPrice(1000000000n)
    .transfer(recipient1, 1000n)
    .sign(keypair);
  
  const lane0_tx2 = new TransactionBuilder()
    .from(wallet.address())
    .nonce(1n)
    .nonceKey(0n)  // Main lane
    .gasLimit(21000n)
    .gasPrice(1000000000n)
    .transfer(recipient2, 2000n)
    .sign(keypair);
  
  // Lane 1: Independent parallel transactions
  const lane1_tx1 = new TransactionBuilder()
    .from(wallet.address())
    .nonce(0n)
    .nonceKey(1n)  // Parallel lane
    .gasLimit(21000n)
    .gasPrice(1000000000n)
    .transfer(recipient3, 3000n)
    .sign(keypair);
  
  console.log('Lane 0 (sequential): nonce=0, nonce=1');
  console.log('Lane 1 (parallel):  nonce=0');
  console.log('All three can be submitted simultaneously!');
  
  // Submit all at once
  const results = await Promise.all([
    rpc.sendTransaction(lane0_tx1),
    rpc.sendTransaction(lane0_tx2),
    rpc.sendTransaction(lane1_tx1),
  ]);
  
  console.log('\nAll transactions submitted successfully!');
  console.log('Transaction IDs:', results.map(id => Buffer.from(id).toString('hex').slice(0, 16) + '...'));
  
  console.log('\n=== Key Benefits of S=0 ===');
  console.log('✅ 10x throughput improvement');
  console.log('✅ No sequential bottlenecks');
  console.log('✅ True parallel execution');
  console.log('✅ Backward compatible (nonceKey defaults to 0)');
  console.log('✅ Flexible lane management');
}

// Run the example
main().catch(console.error);
