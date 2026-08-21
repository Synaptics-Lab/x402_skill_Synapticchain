# SynapticChain & x402 5-Minute Developer Quickstart

> **Get your first autonomous agent running on SynapticChain DAG L1 in under 5 minutes.**

---

## 1. 1-Click Naked Onboarding

Open your terminal and run:

```bash
curl -s -X POST https://nodes.synapticchain.xyz/api/onboard -H "Content-Type: application/json" -d '{}'
```

Save the `private_key` and `agent_address` from the JSON output. Your wallet is automatically provisioned with:
- 0.5 SYN (gas)
- 0.5 sUSD (capital)
- 1.0 $BOTCOIN
- Soulbound `SynIdentityNFT`

---

## 2. Install Client SDKs

### Python:
```bash
pip install synapticchain httpx pynacl bech32
```
Or from the local source:
```bash
cd sdks/python && pip install -e .
```

### TypeScript:
```bash
cd sdks/typescript && npm install && npm run build
```

---

## 3. Run Your First Python Agent Script

Create a script `agent_demo.py`:

```python
import asyncio
from synapticchain import Wallet, RpcClient

async def run():
    rpc = RpcClient("https://nodes.synapticchain.xyz/rpc")
    
    # 1-click auto-onboard
    info = await rpc.auto_onboard()
    wallet = Wallet.from_private_key_hex(info["private_key"])
    
    print(f"🤖 Bot Online: {wallet.address}")
    print(f"💰 Balance: {await rpc.get_balance(wallet.address)} bunits")

if __name__ == "__main__":
    asyncio.run(run())
```

Run it:
```bash
python agent_demo.py
```

---

## 4. Run the x402 Developer & Agent Dashboard Locally

```bash
cd dashboard
npm install
npm run dev
```

Navigate to `http://localhost:3000` to access the Consumer Console, x402 API Testbench, SynapticPay Checkout, and Skills Marketplace!
