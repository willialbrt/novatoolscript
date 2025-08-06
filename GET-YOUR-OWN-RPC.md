# How to Get Your Own RPC Endpoint

## The Problem

Most public Solana RPC endpoints now require API keys or have severe rate limits. The free public RPC (`https://api.mainnet-beta.solana.com`) gets rate limited quickly when building multiple transactions.

## Free RPC Providers

### 1. **Helius (Recommended)**
- **Free tier**: 100,000 requests/day
- **Sign up**: https://helius.xyz
- **Setup**:
  1. Create account
  2. Get your RPC URL: `https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY`
  3. Set environment variable: `HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY`

### 2. **Alchemy**
- **Free tier**: 300 million compute units/month
- **Sign up**: https://alchemy.com
- **Setup**:
  1. Create account and Solana app
  2. Get your RPC URL: `https://solana-mainnet.g.alchemy.com/v2/YOUR_API_KEY`
  3. Set environment variable: `ALCHEMY_RPC_URL=https://solana-mainnet.g.alchemy.com/v2/YOUR_API_KEY`

### 3. **QuickNode**
- **Free tier**: 10 million credits/month
- **Sign up**: https://quicknode.com
- **Setup**:
  1. Create account and Solana endpoint
  2. Get your RPC URL: `https://your-endpoint.solana-mainnet.quiknode.pro/YOUR_TOKEN/`
  3. Set environment variable: `QUICKNODE_RPC_URL=https://your-endpoint.solana-mainnet.quiknode.pro/YOUR_TOKEN/`

### 4. **Ankr**
- **Free tier**: 500 requests/second
- **Sign up**: https://ankr.com
- **Setup**:
  1. Create account
  2. Get your RPC URL: `https://rpc.ankr.com/solana/YOUR_API_KEY`
  3. Set environment variable: `ANKR_RPC_URL=https://rpc.ankr.com/solana/YOUR_API_KEY`

## How to Use Your Custom RPC

### Method 1: Environment Variables
Create a `.env` file in your project directory:

```bash
# .env file
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=your_api_key_here
ALCHEMY_RPC_URL=https://solana-mainnet.g.alchemy.com/v2/your_api_key_here
QUICKNODE_RPC_URL=https://your-endpoint.solana-mainnet.quiknode.pro/your_token/
MAINNET_RPC_URL=https://your-preferred-rpc-here
```

### Method 2: Export Environment Variables
```bash
export HELIUS_RPC_URL="https://mainnet.helius-rpc.com/?api-key=your_api_key_here"
export ALCHEMY_RPC_URL="https://solana-mainnet.g.alchemy.com/v2/your_api_key_here"
node server-robust.js
```

### Method 3: Direct Code Modification
Edit `server-robust.js` and add your RPC URLs directly:

```javascript
const RPC_ENDPOINTS = [
    'https://api.mainnet-beta.solana.com',
    'https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY_HERE', // Add your Helius RPC
    'https://solana-mainnet.g.alchemy.com/v2/YOUR_API_KEY_HERE', // Add your Alchemy RPC
    'https://your-endpoint.solana-mainnet.quiknode.pro/YOUR_TOKEN/', // Add your QuickNode RPC
    // Add more RPCs here
];
```

## Testing Your RPC

Test if your RPC works:

```bash
# Test your RPC URLs
HELIUS_RPC_URL="your_url_here" node test-rpc.js
```

Or test manually:
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
  https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY
```

## Why You Need Your Own RPC

### Rate Limits Comparison
| Provider | Free Tier | Rate Limit |
|----------|-----------|------------|
| Public Solana | Free | ~10 req/min |
| Helius | Free | 100k req/day |
| Alchemy | Free | 300M CU/month |
| QuickNode | Free | 10M credits/month |

### Bundle Success Rates
- **Public RPC**: ~20% success rate (frequent rate limits)
- **Custom RPC**: ~90%+ success rate (dedicated limits)

## Recommended Setup

For best results, set up multiple RPC providers:

```bash
# .env file - Multiple providers for redundancy
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=your_helius_key
ALCHEMY_RPC_URL=https://solana-mainnet.g.alchemy.com/v2/your_alchemy_key
QUICKNODE_RPC_URL=https://your-endpoint.solana-mainnet.quiknode.pro/your_token/
```

This way, if one provider has issues, the system automatically fails over to the next one.

## Cost-Benefit Analysis

### Free Public RPC Issues:
- ❌ Frequent rate limiting
- ❌ Bundle submission failures  
- ❌ Unreliable service
- ❌ Lost opportunities

### Custom RPC Benefits:
- ✅ Reliable bundle submissions
- ✅ Higher success rates
- ✅ Dedicated rate limits
- ✅ Better performance
- ✅ Still free for most use cases

## Getting Started

1. **Choose a provider** (Helius recommended)
2. **Sign up** for free account
3. **Get your RPC URL** 
4. **Add to .env file**
5. **Test with** `node test-rpc.js`
6. **Start bundling** with `node server-robust.js`

The investment of 5 minutes to set up your own RPC will save hours of debugging rate limit issues!