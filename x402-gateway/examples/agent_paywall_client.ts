/**
 * Synapse x402 Automated Client Example (TypeScript)
 */

import { SynapticWallet, SynapticRpcClient } from '../../sdks/typescript/src';

const GATEWAY_URL = 'https://api.synapticchain.xyz/x402/vectors';
const RPC_URL = 'https://nodes.synapticchain.xyz/rpc';

async function main() {
  const rpc = new SynapticRpcClient(RPC_URL);

  // 1. Generate or load an agent wallet
  const wallet = SynapticWallet.generate();
  console.log(`1. Agent Online: ${wallet.address}`);

  // 2. Query the paywall
  console.log(`2. Querying paywalled endpoint: ${GATEWAY_URL}`);
  const challengeRes = await fetch(GATEWAY_URL);

  if (challengeRes.status === 402) {
    const invoiceId = challengeRes.headers.get('x-402-invoice') || '';
    const invoice = await challengeRes.json();
    console.log(`3. HTTP 402 Received. Pay ${invoice.amount} ${invoice.asset} to ${invoice.payTo}`);

    // 4. Settle on Layer-1 DAG (Sub-500ms finality)
    console.log('4. Settling transaction on L1 DAG...');
    const receipt = await rpc.sendTransaction({
      from: wallet,
      to: invoice.payTo,
      amount: invoice.amount,
      lane: 0,
    });
    console.log(`   Transaction Confirmed: ${receipt.txHash}`);

    // 5. Retrieve paid data
    console.log('5. Retrieving resource data with receipt...');
    const paidRes = await fetch(GATEWAY_URL, {
      headers: {
        'x-402-invoice': invoiceId,
        'x-402-receipt': receipt.txHash,
        'accept': 'application/json',
      },
    });

    const data = await paidRes.json();
    console.log('   Resource Delivered:', data);
  }
}

main().catch(console.error);
