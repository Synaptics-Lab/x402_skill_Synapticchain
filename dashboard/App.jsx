import React, { useState } from 'react';
import { x402fetch } from '../lib/src/index';

export default function App() {
  const [wallet, setWallet] = useState(null);

  const handleTestCall = async () => {
    // Mock wallet object
    const mockWallet = {
      address: 'syn1...consumer',
      signMessage: async (msg) => 'mock-signature-0x123'
    };
    
    alert("Initiating x402 fetch. Watch console.");
    try {
      const res = await x402fetch("http://localhost:8080/api/weather", {
        endpointId: 1,
        wallet: mockWallet
      });
      console.log(await res.text());
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen bg-black text-green-400 p-8 font-mono">
      <header className="flex justify-between items-center mb-10 border-b border-green-800 pb-4">
        <h1 className="text-3xl font-bold">x402 Consumer App (Bot Wallet)</h1>
        <button 
          className="bg-green-900 text-green-100 px-4 py-2 hover:bg-green-800 border border-green-500"
          onClick={() => setWallet('syn1...bot')}
        >
          {wallet ? 'Bot Online' : 'Connect Bot Wallet'}
        </button>
      </header>
      
      <main className="grid grid-cols-2 gap-8">
        <section className="border border-green-900 p-6">
          <h2 className="text-xl font-bold mb-4 border-b border-green-900 pb-2">Marketplace</h2>
          <div className="bg-gray-900 p-4 border border-green-800">
            <h3 className="font-bold text-white">Weather API</h3>
            <p className="text-sm text-gray-400 mb-4">Pay 0.05 sUSD per call</p>
            <div className="flex gap-4">
              <button onClick={handleTestCall} className="bg-green-600 text-black px-4 py-1 font-bold">Test x402 Call</button>
              <button className="border border-green-600 px-4 py-1">Trade $WTHR Token</button>
            </div>
          </div>
        </section>

        <section className="border border-green-900 p-6">
          <h2 className="text-xl font-bold mb-4 border-b border-green-900 pb-2">My Assets</h2>
          <p className="text-gray-400 mb-4">You are earning yield from 1 API.</p>
          <div className="flex justify-between items-center bg-gray-900 p-4 border border-green-800">
            <div>
              <p className="font-bold text-white">$WTHR API Token</p>
              <p className="text-sm text-green-500">+12.4 BOTCOIN earned</p>
            </div>
            <button className="bg-green-600 text-black px-4 py-2 font-bold">Claim Yield</button>
          </div>
        </section>
      </main>
    </div>
  );
}
