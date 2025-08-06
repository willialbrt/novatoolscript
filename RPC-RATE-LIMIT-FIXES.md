# RPC Rate Limit Fixes

## The Problem

You were getting the error:
```
❌ ERROR: failed to get recent blockhash: Error: 429 Too Many Requests
```

This happens when RPC endpoints hit their rate limits, preventing you from getting fresh blockhashes needed for transactions.

## Root Causes

1. **Limited RPC Endpoints**: Only using 1-2 RPC endpoints
2. **No Rate Limit Detection**: Not detecting when RPCs get rate limited
3. **No Failover Logic**: Not switching to backup RPCs automatically
4. **No Cooldown Management**: Repeatedly hitting rate limited endpoints

## Solutions Implemented

### 1. **Multiple Free RPC Endpoints**
```javascript
const RPC_ENDPOINTS = [
    'https://api.mainnet-beta.solana.com',           // Official Solana
    'https://rpc.ankr.com/solana',                   // Ankr
    'https://solana-api.projectserum.com',           // Serum
    'https://public-api.solscan.io',                 // Solscan
    'https://solana.public-rpc.com',                 // Public RPC
    'https://rpc.helius.xyz/?api-key=demo',          // Helius Demo
    'https://mainnet.helius-rpc.com/?api-key=demo',  // Helius Alt
    'https://solana-mainnet.phantom.app/...',        // Phantom
    // + custom RPC if provided
];
```

### 2. **Rate Limit Detection & Management**
```javascript
// Detect rate limit errors
const isRateLimit = errorMsg.includes('429') || 
                   errorMsg.includes('rate limit') || 
                   errorMsg.includes('too many requests');

// Apply cooldown for rate limited RPCs
if (isRateLimit) {
    rpcStatus.set(rpcUrl, { 
        rateLimited: true, 
        lastAttempt: Date.now() 
    });
}
```

### 3. **Automatic RPC Switching**
```javascript
async function getReliableConnection(logFn) {
    // Filter out rate limited RPCs within cooldown period
    const availableRpcs = RPC_ENDPOINTS.filter(rpcUrl => {
        const status = rpcStatus.get(rpcUrl);
        if (status?.rateLimited && 
            Date.now() - status.lastAttempt < RATE_LIMIT_COOLDOWN) {
            return false;
        }
        return true;
    });
    
    // Try each available RPC
    for (const rpcUrl of availableRpcs) {
        try {
            const connection = new Connection(rpcUrl);
            await connection.getLatestBlockhash('confirmed');
            return connection; // Success!
        } catch (error) {
            continue; // Try next RPC
        }
    }
}
```

### 4. **Enhanced Blockhash Retry Logic**
```javascript
async function getBlockhashWithRetry(connection, logFn, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await connection.getLatestBlockhash('confirmed');
        } catch (error) {
            if (isRateLimit && attempt < maxRetries) {
                // Switch to different RPC and retry
                const newConnection = await getReliableConnection(logFn);
                return await newConnection.getLatestBlockhash('confirmed');
            }
            
            // Exponential backoff
            await new Promise(resolve => 
                setTimeout(resolve, attempt * 1000)
            );
        }
    }
}
```

### 5. **Cooldown Management**
- **1-minute cooldown** for rate limited RPCs
- **Status tracking** for each endpoint
- **Automatic reset** when all RPCs are rate limited

## How It Works Now

### Normal Flow
1. Try primary RPC → Success ✅
2. Get blockhash → Build transactions ✅

### Rate Limited Flow
1. Try primary RPC → Rate limited ⏸️
2. Mark RPC as rate limited (1min cooldown)
3. Try secondary RPC → Success ✅
4. Get blockhash → Build transactions ✅

### All RPCs Rate Limited
1. All RPCs hit rate limits ⏸️
2. Wait for cooldown period (1 minute)
3. Reset status and retry
4. Should work with fresh limits ✅

## Testing RPC Status

You can test which RPCs are working:
```bash
node test-rpc.js
```

This will show:
- ✅ Working RPCs with response times
- ⏸️ Rate limited RPCs  
- ❌ Failed RPCs with error messages

## Benefits

- **Resilient**: Automatically handles rate limits
- **Fast**: Uses fastest available RPC
- **Reliable**: Multiple backup endpoints
- **Smart**: Avoids rate limited RPCs temporarily

The server should now work even when some RPCs are rate limited, automatically switching to available alternatives!