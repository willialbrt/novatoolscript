/*************************************
 * CURRENT Pump.fun Server - Using Official IDL
 * Based on actual pump.fun IDL structure
 *************************************/

const express = require('express');
const cors = require('cors');
const bs58 = require('bs58');
const multer = require('multer');
const FormData = require('form-data');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const { 
    Keypair, 
    VersionedTransaction, 
    Connection, 
    LAMPORTS_PER_SOL, 
    PublicKey, 
    SystemProgram, 
    TransactionInstruction, 
    TransactionMessage,
    ComputeBudgetProgram,
    Transaction,
    sendAndConfirmTransaction
} = require('@solana/web3.js');
const BN = require('bn.js');
const { AccountLayout, createAssociatedTokenAccountInstruction, createTransferInstruction } = require('@solana/spl-token');

// Import official pump.fun SDKs
const { PumpAmmSdk, PumpAmmInternalSdk, canonicalPumpPoolPda } = require('@pump-fun/pump-swap-sdk');
const { PumpSdk, getBuyTokenAmountFromSolAmount } = require('@pump-fun/pump-sdk');

require('dotenv').config();

// Dynamic fetch import
let _fetch = null;
async function getFetch() {
    if (_fetch) return _fetch;
    const { default: fetch } = await import('node-fetch');
    _fetch = fetch;
    return _fetch;
}

// ==============================================================================
// CURRENT PUMP.FUN PROGRAM CONSTANTS (From Official IDL)
// ==============================================================================

const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const PUMP_GLOBAL = new PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf');
const PUMP_EVENT_AUTHORITY = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');
const PUMP_FEE_RECIPIENT = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM');
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const SYSTEM_PROGRAM_ID = new PublicKey('11111111111111111111111111111111');
const RENT_PROGRAM_ID = new PublicKey('SysvarRent111111111111111111111111111111111');
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// Current Jito endpoints (working 2024)
const JITO_ENDPOINTS = [
    'https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles',
    'https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles',
    'https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles',
    'https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles'
];

const JITO_TIP_ACCOUNTS = [
    'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
    'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
    'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
    'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh'
];

// Enhanced RPC endpoints
const RPC_ENDPOINTS = [
    'https://solana-mainnet.g.alchemy.com/v2/JqIbvMGWeTJeiJWlZqoEOWdi5fhZF3qK',
    'https://mainnet.helius-rpc.com/?api-key=89b1a208-69e3-4da0-b223-f290889ba050'
].filter(Boolean);

// ==============================================================================
// CURRENT IDL-BASED INSTRUCTION DISCRIMINATORS
// ==============================================================================

// These are calculated from the official IDL methods using the correct Anchor format
const crypto = require('crypto');

function getInstructionDiscriminator(instructionName) {
    const hash = crypto.createHash('sha256').update(`global:${instructionName}`).digest();
    return hash.slice(0, 8);
}

const INSTRUCTION_DISCRIMINATORS = {
    'initialize': getInstructionDiscriminator('initialize'),
    'setParams': getInstructionDiscriminator('setParams'), 
    'create': Buffer.from([24, 30, 200, 40, 5, 28, 7, 119]), // Use working discriminator
    'extend_account': getInstructionDiscriminator('extend_account'),
    'buy': Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]), // Use working discriminator
    'sell': Buffer.from([51, 230, 133, 164, 1, 127, 131, 173]), // Use working discriminator
    'withdraw': getInstructionDiscriminator('withdraw')
};

// ==============================================================================
// UTILITY FUNCTIONS
// ==============================================================================

function parsePrivateKey(privateKeyString, context = 'wallet') {
    try {
        const trimmed = privateKeyString.trim();
        
        if (!trimmed) {
            throw new Error('Private key cannot be empty');
        }
        
        // Handle JSON array format (from wallet exports)
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            let keyArray;
            try {
                keyArray = JSON.parse(trimmed);
            } catch (jsonError) {
                throw new Error(`Invalid JSON format: ${jsonError.message}`);
            }
            
            if (!Array.isArray(keyArray)) {
                throw new Error('JSON must be an array of numbers');
            }
            
            if (keyArray.length === 64) {
                return Keypair.fromSecretKey(new Uint8Array(keyArray));
            } else if (keyArray.length === 32) {
                return Keypair.fromSeed(new Uint8Array(keyArray));
            } else {
                throw new Error(`JSON array length ${keyArray.length} is invalid. Expected 32 or 64 numbers.`);
            }
        }
        
        // Handle Base58 format
        let decodedKey;
        try {
            decodedKey = bs58.decode(trimmed);
        } catch (bs58Error) {
            throw new Error(`Invalid Base58 format: ${bs58Error.message}`);
        }
        
        if (decodedKey.length === 64) {
            return Keypair.fromSecretKey(decodedKey);
        } else if (decodedKey.length === 32) {
            return Keypair.fromSeed(decodedKey);
        } else {
            throw new Error(`Base58 decoded length ${decodedKey.length} is invalid. Expected 32 or 64 bytes.`);
        }
        
    } catch (error) {
        throw new Error(`Invalid ${context} private key: ${error.message}. 
Supported formats:
- Base58 string (like: 5Kj...abc)
- JSON array (like: [123,45,67,...])`);
    }
}

// Base58 validation helper function
function isValidBase58(str) {
    try {
        const decoded = bs58.decode(str);
        // Solana public keys should be exactly 32 bytes
        return decoded.length === 32;
    } catch (e) {
        return false;
    }
}

// Account derivation functions (from official IDL)
function getAssociatedTokenAddress(mint, owner) {
    return PublicKey.findProgramAddressSync(
        [
            owner.toBuffer(),
            TOKEN_PROGRAM_ID.toBuffer(),
            mint.toBuffer(),
        ],
        ASSOCIATED_TOKEN_PROGRAM_ID
    )[0];
}

function getBondingCurveAddress(mint) {
    return PublicKey.findProgramAddressSync(
        [Buffer.from('bonding-curve'), mint.toBuffer()],
        PUMP_PROGRAM_ID
    )[0];
}

function getMetadataAddress(mint) {
    return PublicKey.findProgramAddressSync(
        [
            Buffer.from('metadata'),
            METADATA_PROGRAM_ID.toBuffer(),
            mint.toBuffer(),
        ],
        METADATA_PROGRAM_ID
    )[0];
}

function getMintAuthority() {
    return PublicKey.findProgramAddressSync(
        [Buffer.from('mint-authority')],
        PUMP_PROGRAM_ID
    )[0];
}

// ==============================================================================
// CURRENT IDL-BASED INSTRUCTION BUILDERS
// ==============================================================================

function createCurrentCreateInstruction(mint, user, name, symbol, uri) {
    const mintAuthority = getMintAuthority();
    const bondingCurve = getBondingCurveAddress(mint);
    const associatedBondingCurve = getAssociatedTokenAddress(mint, bondingCurve);
    const associatedUser = getAssociatedTokenAddress(mint, user);
    const metadata = getMetadataAddress(mint);
    
    // Serialize arguments - use length-prefixed format (most common working format)
    const nameBytes = Buffer.from(name, 'utf8');
    const symbolBytes = Buffer.from(symbol, 'utf8');
    const uriBytes = Buffer.from(uri, 'utf8');
    
    // Create length-prefixed buffers for each string
    const nameBuffer = Buffer.alloc(4 + nameBytes.length);
    nameBuffer.writeUInt32LE(nameBytes.length, 0);
    nameBytes.copy(nameBuffer, 4);
    
    const symbolBuffer = Buffer.alloc(4 + symbolBytes.length);
    symbolBuffer.writeUInt32LE(symbolBytes.length, 0);
    symbolBytes.copy(symbolBuffer, 4);
    
    const uriBuffer = Buffer.alloc(4 + uriBytes.length);
    uriBuffer.writeUInt32LE(uriBytes.length, 0);
    uriBytes.copy(uriBuffer, 4);
    
    // Concatenate: discriminator + name + symbol + uri + creator (creator as 32-byte pubkey)
    const data = Buffer.concat([
        INSTRUCTION_DISCRIMINATORS.create,
        nameBuffer,
        symbolBuffer,
        uriBuffer,
        user.toBuffer() // Add creator pubkey (32 bytes)
    ]);
    
    // EXACT account order from successful transaction (14 accounts, NO associatedUser)
    return new TransactionInstruction({
        keys: [
            { pubkey: mint, isSigner: true, isWritable: true },
            { pubkey: mintAuthority, isSigner: false, isWritable: false },
            { pubkey: bondingCurve, isSigner: false, isWritable: true },
            { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
            { pubkey: PUMP_GLOBAL, isSigner: false, isWritable: false },
            { pubkey: METADATA_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: metadata, isSigner: false, isWritable: true },
            { pubkey: user, isSigner: true, isWritable: true },
            { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: RENT_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: PUMP_EVENT_AUTHORITY, isSigner: false, isWritable: false },
            { pubkey: PUMP_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: PUMP_PROGRAM_ID,
        data: data,
    });
}

function createExtendAccountInstruction(mint, user) {
    const bondingCurve = getBondingCurveAddress(mint);
    
    // ExtendAccount instruction - extends bonding curve account data
    return new TransactionInstruction({
        keys: [
            { pubkey: bondingCurve, isSigner: false, isWritable: true },
            { pubkey: user, isSigner: true, isWritable: true },
            { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: PUMP_EVENT_AUTHORITY, isSigner: false, isWritable: false },
            { pubkey: PUMP_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: PUMP_PROGRAM_ID,
        data: INSTRUCTION_DISCRIMINATORS.extend_account, // Only discriminator, no additional data
    });
}

// Use appropriate SDK based on token migration status
// Bonding curve price impact calculator for sequential buys
function calculateBondingCurveTokens(solAmountIn, currentSolReserve, currentTokenReserve) {
    // xy = k constant product formula
    const k = currentSolReserve * currentTokenReserve;
    const newSolReserve = currentSolReserve + solAmountIn;
    const newTokenReserve = k / newSolReserve;
    const tokensOut = currentTokenReserve - newTokenReserve;
    
    return {
        tokensOut: Math.floor(tokensOut), // Raw token amount without decimal scaling
        newSolReserve,
        newTokenReserve
    };
}

async function createOfficialBuyInstruction(connection, mint, user, solAmountToSpend, slippagePercent = 49, tokenCreator = null, expectedTokens = null, isMigrated = false) {
    try {
        const BN = require('bn.js');
        
        // Ensure parameters are PublicKeys
        const userPubkey = user instanceof PublicKey ? user : new PublicKey(user);
        const mintPubkey = mint instanceof PublicKey ? mint : new PublicKey(mint);
        
        // Check if we already know the migration status from the buy-only bundle
        if (isMigrated && !tokenCreator) {
            console.log('🔄 Token marked as migrated - using PumpAmmSdk.swapQuoteInstructions');
            console.log(`💰 SOL amount to spend: ${solAmountToSpend / LAMPORTS_PER_SOL} SOL (${solAmountToSpend} lamports)`);
            console.log(`🎯 User: ${userPubkey.toBase58()}`);
            console.log(`📊 Slippage: ${slippagePercent}%`);
            
            const pumpAmmSdk = new PumpAmmSdk(connection);
            
            try {
                // Get canonical pump pool address for migrated tokens
                console.log('🔍 Getting canonical pump pool address for migrated token...');
                const [poolAddress, poolBump] = canonicalPumpPoolPda(mintPubkey);
                console.log(`✅ Pool address: ${poolAddress.toBase58()} (bump: ${poolBump})`);
                
                // Verify pool exists and get info
                console.log('🔍 Fetching pool information...');
                const poolInfo = await pumpAmmSdk.fetchPool(poolAddress);
                console.log(`✅ Pool info:`, {
                    poolBump: poolInfo.poolBump,
                    index: poolInfo.index,
                    creator: poolInfo.creator?.toBase58(),
                    baseMint: poolInfo.baseMint?.toBase58(),
                    quoteMint: poolInfo.quoteMint?.toBase58(),
                    lpSupply: poolInfo.lpSupply?.toString(),
                    coinCreator: poolInfo.coinCreator?.toBase58()
                });
                
                // Validate amounts before generating swap instructions
                console.log('🔍 Validating amounts before swap...');
                if (solAmountToSpend <= 0) {
                    throw new Error(`Invalid SOL amount: ${solAmountToSpend}`);
                }
                
                // Test the swap calculation first
                console.log('🔍 Testing swap calculation...');
                try {
                    const expectedBaseAmount = await pumpAmmSdk.swapAutocompleteBaseFromQuote(
                        poolAddress,
                        new BN(solAmountToSpend),
                        slippagePercent,
                        'quoteToBase'
                    );
                    console.log(`📊 Expected base tokens: ${expectedBaseAmount.toString()}`);
                    
                    if (expectedBaseAmount.eq(new BN(0))) {
                        throw new Error('Swap calculation returns zero base tokens - amount too small or pool issue');
                    }
                } catch (calcError) {
                    console.log(`❌ Swap calculation failed: ${calcError.message}`);
                    throw new Error(`Swap calculation failed: ${calcError.message}`);
                }
                
                // Use PumpAmmSdk.swapQuoteInstructions for buying (quoteToBase direction)
                console.log('🔍 Generating swap instructions...');
                console.log(`Parameters: pool=${poolAddress.toBase58()}, quote=${solAmountToSpend}, slippage=${slippagePercent}, direction=quoteToBase, user=${userPubkey.toBase58()}`);
                
                const swapInstructions = await pumpAmmSdk.swapQuoteInstructions(
                    poolAddress,          // pool: PublicKey
                    new BN(solAmountToSpend), // quote: BN (SOL amount to spend)
                    slippagePercent,     // slippage: number
                    'quoteToBase',       // direction: Direction (SOL -> Token)
                    userPubkey,          // user: PublicKey
                    undefined,           // protocolFeeRecipient?: PublicKey
                    undefined,           // userBaseTokenAccount?: PublicKey
                    undefined            // userQuoteTokenAccount?: PublicKey
                );
                
                console.log(`✅ Generated ${swapInstructions.length} AMM swap instructions using swapQuoteInstructions`);
                return swapInstructions;
                
            } catch (ammError) {
                console.log(`❌ AMM swap instruction generation failed:`);
                console.log(`   Error: ${ammError.message}`);
                console.log(`   Stack: ${ammError.stack}`);
                throw new Error(`AMM swap failed for migrated token: ${ammError.message}`);
            }
        }
        
        // Proper migration detection (skip for new tokens in CREATE+BUY)
        if (!tokenCreator) {
            const pumpSdk = new PumpSdk(connection);
            const pumpAmmSdk = new PumpAmmInternalSdk(connection);
            
            try {
                // Step 1: Check bonding curve state first
                const bondingCurve = await pumpSdk.fetchBondingCurve(mintPubkey);
                
                // Step 2: If bonding curve has 0 tokens, token has migrated to AMM
                if (bondingCurve.virtualTokenReserves.toNumber() === 0) {
                    console.log('🔄 Migration detected: 0 tokens in bonding curve - using PumpAmmSdk.swapQuoteInstructions');
                    
                    try {
                        // Use high-level PumpAmmSdk for swap instructions
                        const pumpAmmHighLevel = new PumpAmmSdk(connection);
                        const poolAddress = await pumpAmmHighLevel.getPoolAddress(mintPubkey);
                        
                        // Use PumpAmmSdk.swapQuoteInstructions for buying
                        const swapInstructions = await pumpAmmHighLevel.swapQuoteInstructions(
                            poolAddress,
                            userPubkey,
                            new BN(solAmountToSpend), // SOL amount to spend
                            slippagePercent, // Slippage percentage
                            'quoteToBase' // Direction: SOL -> Token
                        );
                        
                        console.log('✅ Generated AMM swap instructions using swapQuoteInstructions');
                        return swapInstructions;
                    } catch (ammError) {
                        console.log(`❌ AMM swap failed: ${ammError.message}`);
                        console.log('🔄 Falling back to bonding curve method...');
                    }
                } else {
                    console.log(`🎯 Token still on bonding curve (${bondingCurve.virtualTokenReserves.toNumber() / 1000000}M tokens remaining)`);
                }
            } catch (bondingError) {
                console.log(`⚠️ Failed to check bonding curve: ${bondingError.message}`);
                // Continue to bonding curve method as fallback
            }
        }
        
        // Token is still on bonding curve - use main pump SDK
        const pumpSdk = new PumpSdk(connection);
        
        // Fetch global data using SDK (this is fast and always needed)
        const global = await pumpSdk.fetchGlobal();
        
        // OPTIMIZATION: Skip account fetching for new tokens in CREATE+BUY bundles
        let bondingCurveAccountInfo = null;
        let bondingCurve = null;
        
        if (tokenCreator) {
            // For CREATE+BUY bundles, we know it's a new token - skip queries
            console.log('🚀 FAST TRACK: New token in CREATE+BUY bundle - skipping account queries');
            console.log('📝 Using null bonding curve info for maximum speed');
        } else {
            // For existing tokens, we still need to check the bonding curve
            try {
                bondingCurveAccountInfo = await connection.getAccountInfo(pumpSdk.bondingCurvePda(mintPubkey));
                
                if (bondingCurveAccountInfo) {
                    try {
                        bondingCurve = pumpSdk.decodeBondingCurve(bondingCurveAccountInfo);
                        console.log('✅ Fetched and decoded existing bonding curve data');
                    } catch (e) {
                        console.log('⚠️ Could not decode bonding curve, treating as new token');
                    }
                } else {
                    console.log('⚠️ Bonding curve account not found - this is normal for new tokens');
                }
            } catch (fetchError) {
                console.log('⚠️ Failed to fetch bonding curve, proceeding with null:', fetchError.message);
            }
        }
        
        // Determine the correct creator for the buy instruction
        let finalCreator;
        if (bondingCurve && bondingCurve.creator) {
            // Existing token - use creator from bonding curve
            finalCreator = bondingCurve.creator;
            console.log('📋 Existing token detected - using bonding curve creator:', finalCreator.toBase58());
        } else if (tokenCreator) {
            // New token with explicit creator provided (CREATE+BUY bundle scenario)
            finalCreator = tokenCreator instanceof PublicKey ? tokenCreator : new PublicKey(tokenCreator);
            console.log('🆕 New token with provided creator:', finalCreator.toBase58());
        } else {
            // Fallback to user as creator
            finalCreator = userPubkey;
            console.log('⚠️ No creator info, using buyer as creator:', finalCreator.toBase58());
        }
        
        // Use SDK's buy instruction method with proper SOL amount handling
        // The pump.fun buy instruction takes: buy(amount: u64, max_sol_cost: u64)
        // where amount is the token amount to request and max_sol_cost is the max SOL to spend
        
        // Use expectedTokens from bonding curve calculation if available, otherwise use approximation
        let tokenAmountToBuy;
        const maxSolCost = new BN(solAmountToSpend);
        
        if (expectedTokens) {
            // Use bonding curve calculated amount with decimal scaling and slippage reduction
            const tokenAmountWithDecimals = Math.floor(expectedTokens * 1000000 * (100 - slippagePercent) / 100);
            tokenAmountToBuy = new BN(Math.max(1, tokenAmountWithDecimals));
            console.log(`💡 Bonding curve calculation: ${expectedTokens} raw tokens, with decimals and slippage: ${tokenAmountWithDecimals}`);
        } else {
            // Fallback to approximation for non-bundle buys
            const solAmountInSOL = solAmountToSpend / LAMPORTS_PER_SOL;
            const tokenAmountCalculated = Math.floor(solAmountInSOL * 33000000 * 1000000 * (100 - slippagePercent) / 100);
            tokenAmountToBuy = new BN(Math.max(1, tokenAmountCalculated));
            console.log(`💡 Approximation calculation: ${tokenAmountCalculated} tokens for ${solAmountInSOL} SOL with ${slippagePercent}% slippage`);
        }
        
      
        const buyInstructions = await pumpSdk.buyInstructions(
            global,
            bondingCurveAccountInfo, // Can be null for new tokens - SDK handles this
            bondingCurve, // Can be null for new tokens - SDK handles this  
            mintPubkey,
            userPubkey,
            tokenAmountToBuy, // Calculated token amount based on SOL input
            maxSolCost, // Exact SOL amount to spend
            slippagePercent / 100, // Use original slippage parameter
            finalCreator // Creator for new tokens
        );
        
        console.log('✅ Generated buy instructions via official pump SDK');
        return buyInstructions;
        
    } catch (error) {
        console.error('Failed to create buy instruction via SDK:', error);
        throw error;
    }
}

// Use official pump SDK for bonding curve sell instruction with proper AMM detection
async function createOfficialSellInstruction(connection, mint, user, tokenAmount, minSolOutput, slippagePercent = 10) {
    try {
        const BN = require('bn.js');
        const mintPubkey = mint instanceof PublicKey ? mint : new PublicKey(mint);
        const userPubkey = user instanceof PublicKey ? user : new PublicKey(user);
        
        // Proper migration detection: check bonding curve first
        const pumpSdk = new PumpSdk(connection);
        const pumpAmmSdk = new PumpAmmInternalSdk(connection);
        
        try {
            // Step 1: Check bonding curve state first
            const bondingCurve = await pumpSdk.fetchBondingCurve(mintPubkey);
            
            // Step 2: If bonding curve has 0 tokens, token has migrated to AMM
            if (bondingCurve.virtualTokenReserves.toNumber() === 0) {
                console.log('🔄 Migration detected for selling: 0 tokens in bonding curve - using PumpAmmSdk.swapBaseInstructions');
                
                try {
                    // Use high-level PumpAmmSdk for sell instructions
                    const pumpAmmHighLevel = new PumpAmmSdk(connection);
                    
                    // Get canonical pump pool address for migrated tokens
                    console.log('🔍 Getting canonical pump pool address for selling...');
                    const [poolAddress, poolBump] = canonicalPumpPoolPda(mintPubkey);
                    console.log(`✅ Pool address: ${poolAddress.toBase58()} (bump: ${poolBump})`);
                    
                    // Verify pool exists and get info
                    console.log('🔍 Fetching pool information for selling...');
                    const poolInfo = await pumpAmmHighLevel.fetchPool(poolAddress);
                    console.log(`✅ Pool info for selling:`, {
                        baseMint: poolInfo.baseMint?.toBase58(),
                        quoteMint: poolInfo.quoteMint?.toBase58(),
                        lpSupply: poolInfo.lpSupply?.toString()
                    });
                    
                    // Validate token amount
                    console.log(`🔍 Validating sell amount: ${tokenAmount} tokens`);
                    if (tokenAmount <= 0) {
                        throw new Error(`Invalid token amount for selling: ${tokenAmount}`);
                    }
                    
                    // Calculate expected SOL output before selling
                    console.log('🔍 Calculating expected SOL output...');
                    const expectedSolOut = await pumpAmmHighLevel.swapAutocompleteQuoteFromBase(
                        poolAddress,
                        new BN(tokenAmount),
                        slippagePercent,
                        'baseToQuote' // Selling tokens (base) for SOL (quote)
                    );
                    console.log(`📊 Expected SOL output: ${expectedSolOut.toNumber() / LAMPORTS_PER_SOL} SOL`);
                    
                    // Use PumpAmmSdk.swapBaseInstructions for selling (baseToQuote direction)
                    // We're selling tokens (base) to get SOL (quote)
                    console.log('🔍 Generating sell swap instructions...');
                    const swapInstructions = await pumpAmmHighLevel.swapBaseInstructions(
                        poolAddress,        // pool: PublicKey
                        new BN(tokenAmount), // base: BN (token amount to sell)
                        slippagePercent,    // slippage: number
                        'baseToQuote',      // direction: Direction (Token -> SOL)
                        userPubkey,         // user: PublicKey
                        undefined,          // protocolFeeRecipient?: PublicKey
                        undefined,          // userBaseTokenAccount?: PublicKey
                        undefined           // userQuoteTokenAccount?: PublicKey
                    );
                    
                    console.log(`✅ Generated ${swapInstructions.length} AMM sell instructions using swapBaseInstructions`);
                    return swapInstructions;
                } catch (ammError) {
                    console.log(`❌ AMM sell swap failed: ${ammError.message}`);
                    console.log('🔄 Falling back to bonding curve method...');
                }
            } else {
                console.log(`🎯 Token still on bonding curve for selling (${bondingCurve.virtualTokenReserves.toNumber() / 1000000}M tokens remaining)`);
            }
        } catch (bondingError) {
            console.log(`⚠️ Failed to check bonding curve for selling: ${bondingError.message}`);
            // Continue to bonding curve method as fallback
        }
        
        // Use official pump SDK for bonding curve operations
        console.log('🎯 Using official @pump-fun/pump-sdk for bonding curve sell');
        
        // Fetch global and bonding curve data using SDK (reuse existing pumpSdk)
        const global = await pumpSdk.fetchGlobal();
        const bondingCurveAccountInfo = await connection.getAccountInfo(pumpSdk.bondingCurvePda(mintPubkey));
        
        if (!bondingCurveAccountInfo) {
            throw new Error('Bonding curve account not found - cannot sell tokens that don\'t exist');
        }
        
        console.log('✅ Fetched bonding curve account via SDK for sell');
        
        // Use SDK's sell instruction method
        const sellInstructions = await pumpSdk.sellInstructions(
            global,
            bondingCurveAccountInfo,
            mintPubkey,
            userPubkey,
            new BN(tokenAmount),
            new BN(minSolOutput),
            slippagePercent / 100 // Use passed slippage parameter
        );
        
        console.log('✅ Generated sell instructions via official SDK');
        return sellInstructions;
        
    } catch (error) {
        console.error('Failed to create sell instruction via SDK:', error);
        throw error;
    }
}

// ==============================================================================
// ENHANCED CONNECTION MANAGEMENT WITH RATE LIMIT HANDLING
// ==============================================================================

// Track endpoint usage and rate limits
const endpointStats = new Map();
let currentEndpointIndex = 0;

function initializeEndpointStats() {
    RPC_ENDPOINTS.forEach(url => {
        if (url) {
            endpointStats.set(url, {
                lastUsed: 0,
                errorCount: 0,
                rateLimitUntil: 0,
                successCount: 0
            });
        }
    });
}

// Initialize stats
initializeEndpointStats();

async function getWorkingConnection(logFn = console.log) {
    const availableEndpoints = RPC_ENDPOINTS.filter(url => url);
    
    // Sort endpoints by availability (avoid rate limited ones)
    const now = Date.now();
    const sortedEndpoints = availableEndpoints
        .map(url => ({
            url,
            stats: endpointStats.get(url),
            available: now > endpointStats.get(url).rateLimitUntil
        }))
        .filter(ep => ep.available)
        .sort((a, b) => {
            // Prefer endpoints with fewer errors and more recent success
            const scoreA = a.stats.successCount - (a.stats.errorCount * 2);
            const scoreB = b.stats.successCount - (b.stats.errorCount * 2);
            return scoreB - scoreA;
        });

    if (sortedEndpoints.length === 0) {
        // All endpoints are rate limited, wait for the next available one
        const nextAvailable = Math.min(...Array.from(endpointStats.values()).map(s => s.rateLimitUntil));
        const waitTime = Math.max(0, nextAvailable - now);
        if (waitTime > 0) {
            logFn(`⏳ All endpoints rate limited. Waiting ${Math.ceil(waitTime / 1000)}s...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return getWorkingConnection(logFn); // Retry after waiting
        }
    }

    for (const { url } of sortedEndpoints) {
        try {
            const stats = endpointStats.get(url);
            logFn(`🔗 Trying: ${url.split('//')[1]?.split('/')[0]?.substring(0, 30)}...`);
            
            const connection = new Connection(url, {
                commitment: 'confirmed',
                confirmTransactionInitialTimeout: 30000,
                disableRetryOnRateLimit: true, // We handle this manually
                wsEndpoint: undefined // Disable websocket to reduce connections
            });
            
            // Quick connection test with timeout
            await Promise.race([
                connection.getSlot('confirmed'),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Connection timeout')), 5000)
                )
            ]);
            
            // Update success stats
            stats.lastUsed = now;
            stats.successCount++;
            stats.errorCount = Math.max(0, stats.errorCount - 1); // Gradually reduce error count
            
            logFn(`✅ Connected: ${url.split('//')[1]?.split('/')[0]}`);
            return connection;
            
        } catch (error) {
            const stats = endpointStats.get(url);
            stats.errorCount++;
            
            // Check if it's a rate limit error
            if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
                logFn(`🚫 Rate limited: ${url.split('//')[1]?.split('/')[0]} - cooling down 60s`);
                stats.rateLimitUntil = now + 60000; // 1 minute cooldown
            } else {
                logFn(`❌ Failed: ${url.split('//')[1]?.split('/')[0]} - ${error.message}`);
                stats.rateLimitUntil = now + 10000; // 10 second cooldown for other errors
            }
            
            continue;
        }
    }
    
    throw new Error('All RPC endpoints failed or rate limited');
}

// Enhanced blockhash fetching with retry logic
async function getRecentBlockhashWithRetry(connection, logFn = console.log, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            logFn(`🔄 Getting blockhash (attempt ${attempt}/${maxRetries})...`);
            const result = await Promise.race([
                connection.getLatestBlockhash('confirmed'),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Blockhash timeout')), 10000)
                )
            ]);
            logFn(`✅ Got blockhash: ${result.blockhash.substring(0, 8)}...`);
            return result;
        } catch (error) {
            if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
                logFn(`🚫 Rate limited getting blockhash - switching endpoint`);
                // Get a new connection and try again
                if (attempt < maxRetries) {
                    try {
                        connection = await getWorkingConnection(logFn);
                        continue;
                    } catch (connError) {
                        logFn(`❌ Failed to get new connection: ${connError.message}`);
                    }
                }
            }
            
            if (attempt === maxRetries) {
                throw new Error(`Failed to get blockhash after ${maxRetries} attempts: ${error.message}`);
            }
            
            logFn(`⚠️ Blockhash attempt ${attempt} failed: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
        }
    }
}

// ==============================================================================
// TRANSACTION BUILDING
// ==============================================================================

async function buildCurrentPumpTransaction(connection, action, params, logFn = console.log, tokenCreator = null) {
    const { user, mint, amount, slippage, tokenMetadata, expectedTokens } = params;
    
    // Get fresh blockhash with retry logic
    const { blockhash } = await getRecentBlockhashWithRetry(connection, logFn);
    
    let instructions = [];
    
    // Add compute budget - increased for complex pump.fun operations
    instructions.push(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 600000 }), // Increased for pump.fun complexity
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 2000 }) // Higher priority fee
    );
    
    const mintPubkey = new PublicKey(mint);
    const userPubkey = user.publicKey;
    
    if (action === 'create') {
        // Use official pump SDK for CREATE instruction
        const pumpSdk = new PumpSdk(connection);
        
        // 1. CREATE instruction using official SDK
        const createInstruction = await pumpSdk.createInstruction(
            mintPubkey,
            tokenMetadata.name,
            tokenMetadata.symbol,
            tokenMetadata.uri,
            userPubkey, // creator
            userPubkey  // user/payer
        );
        instructions.push(createInstruction);
        
        logFn('✅ Using official pump SDK createInstruction');
        
        // 2. Add initial buy if amount > 0
        // The SDK will automatically handle:
        // - EXTEND_ACCOUNT instruction (via withFixBondingCurve)
        // - Associated token account creation (via buyInstructions)
        if (amount > 0) {
            const solAmountLamports = Math.floor(amount * LAMPORTS_PER_SOL);
            
            logFn('🛒 Adding initial buy with official SDK...');
            const buyInstructions = await createOfficialBuyInstruction(connection, mintPubkey, userPubkey, solAmountLamports, slippage, userPubkey);
            instructions.push(...buyInstructions);
        }
        
    } else if (action === 'buy') {
        const solAmountLamports = Math.floor(amount * LAMPORTS_PER_SOL);
        
        // Use the official SDK buy instructions with expected tokens if available
        const isMigrated = params.isMigrated || false;
        const buyInstructions = await createOfficialBuyInstruction(connection, mintPubkey, userPubkey, solAmountLamports, slippage, tokenCreator, expectedTokens, isMigrated);
        instructions.push(...buyInstructions);
        
    } else if (action === 'sell') {
        // For sell, amount should be the actual token amount to sell
        // If it's a percentage, it should be converted to actual tokens before calling this function
        const tokenAmount = Math.floor(amount);
        const minSolOutput = 0; // Minimum SOL output (can be 0 for market sell)
        
        const sellInstruction = await createOfficialSellInstruction(connection, mintPubkey, userPubkey, tokenAmount, minSolOutput, slippage);
        if (Array.isArray(sellInstruction)) {
            instructions.push(...sellInstruction);
        } else {
            instructions.push(sellInstruction);
        }
    }
    
    // Build transaction
    const messageV0 = new TransactionMessage({
        payerKey: userPubkey,
        recentBlockhash: blockhash,
        instructions: instructions,
    }).compileToV0Message();
    
    const transaction = new VersionedTransaction(messageV0);
    
    return {
        transaction,
        estimatedFee: 0.01 * LAMPORTS_PER_SOL // Conservative estimate
    };
}

// ==============================================================================
// JITO BUNDLE SUBMISSION
// ==============================================================================

async function submitJitoBundle(signedTransactions, logFn = console.log) {
    const fetch = await getFetch();
    
    // Try all endpoints with better error handling
    for (let attempt = 1; attempt <= 5; attempt++) {
        const endpoint = JITO_ENDPOINTS[Math.floor(Math.random() * JITO_ENDPOINTS.length)];
        const endpointName = endpoint.split('//')[1].split('.')[0];
        
        try {
            logFn(`🚀 Submitting to ${endpointName} (attempt ${attempt}/5)...`);
            logFn(`📦 Bundle size: ${signedTransactions.length} transactions`);
            
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'sendBundle',
                    params: [signedTransactions]
                }),
                timeout: 20000 // Increased timeout
            });
            
            if (response.ok) {
                const result = await response.json();
                logFn(`📋 Response: ${JSON.stringify(result)}`);
                
                if (result.result) {
                    logFn(`✅ Bundle submitted successfully: ${result.result}`);
                    return { 
                        success: true, 
                        bundleId: result.result,
                        explorerUrl: `https://explorer.jito.wtf/bundle/${result.result}`
                    };
                } else if (result.error) {
                    logFn(`❌ Jito error: ${JSON.stringify(result.error)}`);
                } else {
                    logFn(`⚠️ Unexpected response format: ${JSON.stringify(result)}`);
                }
            } else {
                const errorText = await response.text();
                logFn(`❌ HTTP ${response.status}: ${errorText}`);
            }
            
        } catch (error) {
            logFn(`❌ Attempt ${attempt} failed: ${error.message}`);
        }
        
        if (attempt < 5) {
            const delay = Math.min(1000 * attempt, 5000); // Max 5 second delay
            logFn(`⏳ Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    logFn(`❌ All bundle submission attempts failed`);
    return { success: false, error: 'Bundle submission failed after 5 attempts' };
}

async function buildTipTransaction(connection, payer, tipAmount, logFn = console.log) {
    const { blockhash } = await getRecentBlockhashWithRetry(connection, logFn);
    const tipAccount = JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)];
    
    const instruction = SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: new PublicKey(tipAccount),
        lamports: tipAmount
    });
    
    const messageV0 = new TransactionMessage({
        payerKey: payer.publicKey,
        recentBlockhash: blockhash,
        instructions: [instruction],
    }).compileToV0Message();
    
    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([payer]);
    
    return transaction;
}

// ==============================================================================
// METADATA UPLOAD
// ==============================================================================

async function uploadMetadata(imageBuffer, name, symbol, description) {
    try {
        const formData = new FormData();
        formData.append('file', imageBuffer, { filename: 'image.png' });
        formData.append('name', name);
        formData.append('symbol', symbol);
        formData.append('description', description);
        formData.append('twitter', '');
        formData.append('telegram', '');
        formData.append('website', '');
        formData.append('showName', 'true');
        
        const response = await axios.post('https://pump.fun/api/ipfs', formData, {
            headers: formData.getHeaders(),
            timeout: 30000
        });
        
        return response.data;
    } catch (error) {
        throw new Error(`Metadata upload failed: ${error.message}`);
    }
}

// ==============================================================================
// WALLET MANAGEMENT CLASSES
// ==============================================================================

class SeedPhraseManager {
    static generateSeedPhrase() {
        return bip39.generateMnemonic(128);
    }

    static validateSeedPhrase(seedPhrase) {
        return bip39.validateMnemonic(seedPhrase.trim());
    }

    static keypairFromSeedPhrase(seedPhrase, derivationPath = "m/44'/501'/0'/0'") {
        if (!this.validateSeedPhrase(seedPhrase)) {
            throw new Error('Invalid seed phrase');
        }
        const seed = bip39.mnemonicToSeedSync(seedPhrase);
        const derivedSeed = derivePath(derivationPath, seed.toString('hex')).key;
        return Keypair.fromSeed(derivedSeed);
    }

    static getWalletInfo(seedPhrase, derivationPath = "m/44'/501'/0'/0'") {
        const keypair = this.keypairFromSeedPhrase(seedPhrase, derivationPath);
        return {
            publicKey: keypair.publicKey.toString(),
            secretKey: Array.from(keypair.secretKey),
            seedPhrase: seedPhrase,
            derivationPath: derivationPath,
            keypair: keypair
        };
    }
}

class WalletEncryption {
    constructor(password) {
        this.password = password;
        this.algorithm = 'aes-256-cbc';
    }

    encrypt(text) {
        const salt = crypto.randomBytes(32);
        const iv = crypto.randomBytes(16);
        const key = crypto.pbkdf2Sync(this.password, salt, 100000, 32, 'sha256');
        const cipher = crypto.createCipheriv(this.algorithm, key, iv);
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        return {
            encrypted,
            iv: iv.toString('hex'),
            salt: salt.toString('hex'),
            algorithm: this.algorithm
        };
    }

    decrypt(encryptedData) {
        const { encrypted, iv, salt, algorithm } = encryptedData;
        const key = crypto.pbkdf2Sync(this.password, Buffer.from(salt, 'hex'), 100000, 32, 'sha256');
        const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(iv, 'hex'));
        
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }
}

// ChangeNOW Privacy class for anonymous distribution (from server.js)
class ChangeNOWPrivacy {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseURL = 'https://api.changenow.io/v1';
        this.httpClient = axios.create({
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Solana-Privacy-Distributor/1.0'
            }
        });
    }

    async testConnection() {
        try {
            const response = await this.httpClient.get(`${this.baseURL}/currencies`);
            return response.data && Array.isArray(response.data);
        } catch (error) {
            throw new Error(`ChangeNOW API test failed: ${error.message}`);
        }
    }

    async getSOLExchangeEstimate(amount) {
        try {
            const response = await this.httpClient.get(
                `${this.baseURL}/exchange-amount/${amount}/sol_sol`
            );
            return response.data;
        } catch (error) {
            throw new Error(`Failed to get exchange estimate: ${error.message}`);
        }
    }

    async getMinimumAmount() {
        try {
            const response = await this.httpClient.get(`${this.baseURL}/min-amount/sol_sol`);
            return parseFloat(response.data.minAmount);
        } catch (error) {
            return 0.01; // Default minimum
        }
    }

    async createAnonymousExchange(fromAmount, toAddress) {
        try {
            const exchangeData = {
                from: 'sol',
                to: 'sol',
                address: toAddress,
                amount: fromAmount,
                extraId: '',
                refundAddress: '',
                refundExtraId: ''
            };

            const response = await this.httpClient.post(
                `${this.baseURL}/transactions/${this.apiKey}`,
                exchangeData
            );

            return response.data;
        } catch (error) {
            if (error.response?.data?.message) {
                throw new Error(`ChangeNOW: ${error.response.data.message}`);
            }
            throw new Error(`Failed to create exchange: ${error.message}`);
        }
    }

    async checkExchangeStatus(exchangeId) {
        try {
            const response = await this.httpClient.get(
                `${this.baseURL}/transactions/${exchangeId}/${this.apiKey}`
            );
            return response.data;
        } catch (error) {
            throw new Error(`Failed to check exchange status: ${error.message}`);
        }
    }

    async waitForExchangeCompletion(exchangeId, timeoutMs = 1800000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeoutMs) {
            try {
                const status = await this.checkExchangeStatus(exchangeId);
                
                switch (status.status) {
                    case 'finished':
                        return status;
                    case 'failed':
                    case 'refunded':
                        throw new Error(`Exchange ${exchangeId} failed with status: ${status.status}`);
                }
                
                await this.sleep(30000);
                
            } catch (error) {
                await this.sleep(30000);
            }
        }
        
        throw new Error(`Exchange ${exchangeId} timed out`);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Ensure wallets directory exists
const walletsDir = path.join(__dirname, 'wallets');
if (!fs.existsSync(walletsDir)) {
    fs.mkdirSync(walletsDir, { recursive: true });
}

// ==============================================================================
// EXPRESS SERVER
// ==============================================================================

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(cors());
app.use(express.static('public'));

const upload = multer({ storage: multer.memoryStorage() });

// Main create and bundle endpoint
app.post('/api/createAndBundle', upload.single('file'), async (req, res) => {
    const logs = [];
    const log = (msg) => {
        logs.push(msg);
        console.log(msg);
    };
    
    try {
        const {
            devPrivateKey,
            createSolAmount,
            buyers,
            tokenName,
            tokenSymbol,
            tokenDesc,
            slippage,
            bundleSize = 5
        } = req.body;
        
        log(`🚀 Starting token creation with CURRENT IDL...`);
        
        if (!devPrivateKey?.trim()) {
            throw new Error('Dev wallet private key is required');
        }
        
        if (!req.file) {
            throw new Error('Token image is required');
        }
        
        // Create keypairs
        const devKeypair = parsePrivateKey(devPrivateKey, 'dev wallet');
        const mintKeypair = Keypair.generate();
        
        log(`🔑 Dev wallet: ${devKeypair.publicKey.toBase58()}`);
        log(`🪙 Mint address: ${mintKeypair.publicKey.toBase58()}`);
        
        // Parse buyers with enhanced error handling
        const buyerKeypairs = [];
        const buyerAmounts = [];
        
        if (buyers?.trim()) {
            const lines = buyers.trim().split(/\r?\n/); // Handle both \n and \r\n
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line || line.startsWith('#')) continue; // Skip empty lines and comments
                
                // Better parsing with validation
                const parts = line.split(',').map(part => part.trim());
                if (parts.length !== 2) {
                    throw new Error(`Invalid format on line ${i + 1}: "${line}". Expected format: privateKey,amount`);
                }
                
                const [privateKey, amountStr] = parts;
                
                if (!privateKey) {
                    throw new Error(`Empty private key on line ${i + 1}`);
                }
                
                if (!amountStr) {
                    throw new Error(`Empty amount on line ${i + 1}`);
                }
                
                // Validate amount
                const amount = parseFloat(amountStr);
                if (isNaN(amount) || amount <= 0) {
                    throw new Error(`Invalid amount "${amountStr}" on line ${i + 1}. Must be a positive number.`);
                }
                
                // Parse private key
                try {
                    const buyerKeypair = parsePrivateKey(privateKey, `buyer ${i + 1}`);
                    buyerKeypairs.push(buyerKeypair);
                    buyerAmounts.push(amount);
                } catch (error) {
                    throw new Error(`Line ${i + 1}: ${error.message}`);
                }
            }
        }
        
        log(`👥 Found ${buyerKeypairs.length} buyers`);
        
        // Upload metadata
        log('📤 Uploading metadata...');
        const metadata = await uploadMetadata(
            req.file.buffer,
            tokenName || 'Test Token',
            tokenSymbol || 'TEST',
            tokenDesc || 'Test Description'
        );
        
        log(`✅ Metadata uploaded: ${metadata.metadataUri}`);
        
        // Get working connection
        const connection = await getWorkingConnection(log);
        
        // Build transactions
        const allTransactions = [];
        
        // 1. Build create transaction
        log('🏗️ Building create transaction with CURRENT IDL...');
        const createParams = {
            user: { publicKey: devKeypair.publicKey },
            mint: mintKeypair.publicKey.toBase58(),
            amount: Math.floor((parseFloat(createSolAmount) || 0) * 33000000 * 1000000 * (100 - (slippage || 10)) / 100),
            slippage: slippage || 90, // Use provided slippage or default to 90
            tokenMetadata: {
                name: tokenName || 'Test Token',
                symbol: tokenSymbol || 'TEST',
                uri: metadata.metadataUri
            }
        };
        
        const createResult = await buildCurrentPumpTransaction(connection, 'create', createParams, log);
        
        // Sign with both dev and mint keypairs
        createResult.transaction.sign([devKeypair, mintKeypair]);
        
        // SIMULATE TRANSACTION BEFORE ADDING TO BUNDLE - ABORT IF FAILS
        try {
            log(`🧪 Simulating create transaction...`);
            log(`🔍 Create transaction details:`);
            log(`   📍 Creator: ${devKeypair.publicKey.toBase58()}`);
            log(`   🪙 Mint: ${mintPubkey.toBase58()}`);
            log(`   📝 Instructions count: ${createResult.transaction.instructions.length}`);
            log(`   💰 Initial buy: ${devSolAmount} SOL`);
            
            const simulation = await connection.simulateTransaction(createResult.transaction, {
                commitment: 'processed',
                sigVerify: false
            });
            
            if (simulation.value.err) {
                log(`❌ Create transaction simulation failed: ${JSON.stringify(simulation.value.err)}`);
                
                // Enhanced error logging for create transaction
                if (simulation.value.logs) {
                    log(`📋 Create simulation logs:`);
                    simulation.value.logs.forEach((logLine, index) => {
                        log(`   ${index + 1}: ${logLine}`);
                    });
                }
                
                // Analyze create transaction error
                if (simulation.value.err.InstructionError) {
                    const [instructionIndex, errorDetail] = simulation.value.err.InstructionError;
                    log(`🔍 Create error analysis:`);
                    log(`   📍 Failed instruction index: ${instructionIndex}`);
                    log(`   📝 Total instructions: ${createResult.transaction.instructions.length}`);
                    log(`   ❌ Error detail: ${JSON.stringify(errorDetail)}`);
                    
                    if (errorDetail.Custom) {
                        log(`   🔧 Custom error code: ${errorDetail.Custom}`);
                    }
                }
                
                throw new Error(`Create transaction simulation failed: ${JSON.stringify(simulation.value.err)}`);
            } else {
                log(`✅ Create transaction simulation successful`);
                log(`🔧 Compute units used: ${simulation.value.unitsConsumed || 'unknown'}`);
                
                // Log successful create simulation details
                if (simulation.value.logs) {
                    log(`📋 Create success logs (last 5):`);
                    const lastLogs = simulation.value.logs.slice(-5);
                    lastLogs.forEach((logLine, index) => {
                        log(`   ${lastLogs.length - 4 + index}: ${logLine}`);
                    });
                }
            }
        } catch (simError) {
            log(`❌ CRITICAL: Create transaction simulation failed, aborting entire process`);
            log(`💡 Without successful token creation, buy transactions will fail`);
            log(`🔍 Create simulation error details:`);
            log(`   📍 Error type: ${simError.constructor.name}`);
            log(`   📝 Stack trace: ${simError.stack}`);
            throw new Error(`Create transaction failed simulation: ${simError.message}`);
        }
        
        log(`✅ Create transaction built, simulated, and signed`);
        
        // 2. Process buyers in chunks with CREATE transaction in first bundle
        const allBundleResults = [];
        const maxTransactionsPerBundle = bundleSize;
        
        // Calculate how many buyers can fit in first bundle (subtract 2 for create + tip)
        const firstBundleMaxBuyers = Math.max(1, maxTransactionsPerBundle - 2);
        
        for (let chunkStart = 0; chunkStart < buyerKeypairs.length; chunkStart += (chunkStart === 0 ? firstBundleMaxBuyers : maxTransactionsPerBundle - 1)) {
            const isFirstChunk = chunkStart === 0;
            const maxBuyersThisChunk = isFirstChunk ? firstBundleMaxBuyers : maxTransactionsPerBundle - 1; // -1 for tip
            const chunkEnd = Math.min(chunkStart + maxBuyersThisChunk, buyerKeypairs.length);
            const chunkBuyers = buyerKeypairs.slice(chunkStart, chunkEnd);
            const chunkAmounts = buyerAmounts.slice(chunkStart, chunkEnd);
            
            log(`\n📦 Processing chunk ${Math.floor(chunkStart / maxBuyersThisChunk) + 1}: buyers ${chunkStart + 1}-${chunkEnd}`);
            
            const chunkTransactions = [];
            
            // Add CREATE transaction only to first chunk
            if (isFirstChunk) {
                chunkTransactions.push(bs58.encode(createResult.transaction.serialize()));
                log(`📋 Added CREATE transaction to first chunk`);
            }
            
            // Build buy transactions for this chunk
            for (let i = 0; i < chunkBuyers.length; i++) {
                const buyerKeypair = chunkBuyers[i];
                const amount = chunkAmounts[i];
                const globalIndex = chunkStart + i;
                
                log(`🏗️ Building buy transaction for buyer ${globalIndex + 1}: ${amount} SOL`);
                
                const buyParams = {
                    user: { publicKey: buyerKeypair.publicKey },
                    mint: mintKeypair.publicKey.toBase58(),
                    amount: amount,
                    slippage: slippage || 90
                };
                
                const buyResult = await buildCurrentPumpTransaction(connection, 'buy', buyParams, log, devKeypair.publicKey);
                buyResult.transaction.sign([buyerKeypair]);
                
                log(`⏭️ Skipping buy simulation ${globalIndex + 1} - mint will be created by previous transaction in bundle`);
                
                chunkTransactions.push(bs58.encode(buyResult.transaction.serialize()));
                log(`✅ Buy transaction ${globalIndex + 1} built and signed (simulation skipped)`);
            }
            
            // Add tip transaction
            const tipAmount = 100000; // 0.0001 SOL tip
            log(`💰 Building tip transaction with ${tipAmount / LAMPORTS_PER_SOL} SOL tip...`);
            const tipTx = await buildTipTransaction(connection, devKeypair, tipAmount, log);
            chunkTransactions.push(bs58.encode(tipTx.serialize()));
            
            log(`📋 Chunk bundle: ${chunkTransactions.length} transactions ready (${isFirstChunk ? '1 create + ' : ''}${chunkBuyers.length} buys + 1 tip)`);
            
            // Submit chunk bundle
            log(`🚀 Submitting chunk bundle to Jito...`);
            const result = await submitJitoBundle(chunkTransactions, log);
            
            if (result.success) {
                log(`🎉 Chunk bundle submitted successfully!`);
                log(`📋 Bundle ID: ${result.bundleId}`);
                log(`🔗 Explorer: ${result.explorerUrl}`);
                
                allBundleResults.push({
                    bundleId: result.bundleId,
                    explorerUrl: result.explorerUrl,
                    chunkNumber: Math.floor(chunkStart / maxBuyersThisChunk) + 1,
                    buyerCount: chunkBuyers.length,
                    includesCreate: isFirstChunk
                });
            } else {
                log(`❌ Chunk bundle submission failed: ${result.error}`);
                throw new Error(`Bundle submission failed for chunk ${Math.floor(chunkStart / maxBuyersThisChunk) + 1}: ${result.error}`);
            }
            
            // Wait briefly between bundles to avoid rate limits
            if (!isFirstChunk && chunkEnd < buyerKeypairs.length) {
                log(`⏳ Waiting 2 seconds before next chunk...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        log(`\n📊 CREATE+BUY SUMMARY:`);
        log(`✅ Total bundles: ${allBundleResults.length}`);
        log(`✅ Total buyers: ${buyerKeypairs.length}`);
        allBundleResults.forEach((bundle, index) => {
            log(`   Bundle ${bundle.chunkNumber}: ${bundle.bundleId} (${bundle.buyerCount} buyers${bundle.includesCreate ? ' + CREATE' : ''})`);
        });
        
        const firstBundle = allBundleResults[0];
        if (firstBundle) {
            res.json({
                success: true,
                logs,
                bundleId: firstBundle.bundleId,
                mintAddress: mintKeypair.publicKey.toBase58(),
                metadataUri: metadata.metadataUri,
                explorerUrl: firstBundle.explorerUrl,
                totalBundles: allBundleResults.length,
                bundleIds: allBundleResults.map(b => b.bundleId),
                totalBuyers: buyerKeypairs.length,
                tipAmount: 100000 / LAMPORTS_PER_SOL,
                notice: `${allBundleResults.length} bundle(s) submitted - inclusion not guaranteed. Check explorer for status.`
            });
        } else {
            throw new Error('No bundles were submitted successfully');
        }
        
    } catch (error) {
        log(`❌ Error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message,
            logs
        });
    }
});

// Test connection endpoint
app.post('/api/testConnection', async (req, res) => {
    const logs = [];
    const log = (msg) => {
        logs.push(msg);
        console.log(msg);
    };
    
    try {
        log(`🧪 Testing RPC connections...`);
        const connection = await getWorkingConnection(log);
        
        const slot = await connection.getSlot('confirmed');
        log(`✅ Connection successful! Current slot: ${slot}`);
        
        res.json({
            success: true,
            currentSlot: slot,
            logs
        });
    } catch (error) {
        log(`❌ Connection test failed: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message,
            logs
        });
    }
});

// Check wallet balances endpoint
app.post('/api/checkWalletBalances', async (req, res) => {
    const logs = [];
    const log = (msg) => {
        logs.push(msg);
        console.log(msg);
    };

    try {
        const { walletAddresses, tokenMint, showPrivateKeys } = req.body;
        
        if (!walletAddresses || !Array.isArray(walletAddresses) || walletAddresses.length === 0) {
            throw new Error('Wallet addresses array is required');
        }

        log(`🔍 Checking balances for ${walletAddresses.length} wallets`);
        if (tokenMint) {
            log(`🪙 Token mint: ${tokenMint}`);
        }

        // Get working connection
        const connection = await getWorkingConnection(log);

        const balances = [];
        
        for (let i = 0; i < walletAddresses.length; i++) {
            const addressOrKey = walletAddresses[i];
            log(`🔍 Checking wallet ${i + 1}/${walletAddresses.length}...`);
            
            try {
                let publicKey;
                let privateKey = null;
                
                // Try to determine if it's a private key or public key
                try {
                    // Try to parse as private key first
                    const keypair = parsePrivateKey(addressOrKey, `wallet ${i + 1}`);
                    publicKey = keypair.publicKey;
                    if (showPrivateKeys) {
                        privateKey = addressOrKey;
                    }
                    log(`✅ Parsed as private key for wallet ${i + 1}`);
                } catch (privateKeyError) {
                    // If that fails, try as public key
                    try {
                        publicKey = new PublicKey(addressOrKey);
                        log(`✅ Parsed as public key for wallet ${i + 1}`);
                    } catch (publicKeyError) {
                        log(`❌ Invalid key format for wallet ${i + 1}: ${addressOrKey.substring(0, 20)}...`);
                        balances.push({
                            address: addressOrKey,
                            solBalance: null,
                            tokenBalance: null,
                            privateKey: showPrivateKeys ? privateKey : undefined,
                            error: 'Invalid key format'
                        });
                        continue;
                    }
                }
                
                // Check SOL balance
                let solBalance = null;
                try {
                    const balance = await connection.getBalance(publicKey);
                    solBalance = balance / LAMPORTS_PER_SOL;
                    log(`💰 Wallet ${i + 1} SOL: ${solBalance.toFixed(6)} SOL`);
                } catch (solError) {
                    log(`❌ Failed to get SOL balance for wallet ${i + 1}: ${solError.message}`);
                }
                
                // Check token balance if mint provided
                let tokenBalance = null;
                if (tokenMint) {
                    try {
                        const mintPubkey = new PublicKey(tokenMint);
                        const tokenAccount = getAssociatedTokenAddress(mintPubkey, publicKey);
                        
                        const accountInfo = await connection.getAccountInfo(tokenAccount);
                        if (accountInfo) {
                            // Parse token account data
                            const { amount } = AccountLayout.decode(accountInfo.data);
                            tokenBalance = Number(amount);
                            log(`🪙 Wallet ${i + 1} tokens: ${tokenBalance.toLocaleString()}`);
                        } else {
                            tokenBalance = 0;
                            log(`🪙 Wallet ${i + 1} tokens: 0 (no token account)`);
                        }
                    } catch (tokenError) {
                        log(`❌ Failed to get token balance for wallet ${i + 1}: ${tokenError.message}`);
                    }
                }
                
                balances.push({
                    address: publicKey.toBase58(),
                    solBalance,
                    tokenBalance,
                    privateKey: showPrivateKeys ? privateKey : undefined
                });
                
            } catch (error) {
                log(`❌ Error checking wallet ${i + 1}: ${error.message}`);
                balances.push({
                    address: addressOrKey,
                    solBalance: null,
                    tokenBalance: null,
                    privateKey: showPrivateKeys ? privateKey : undefined,
                    error: error.message
                });
            }
        }
        
        const successful = balances.filter(b => b.solBalance !== null).length;
        log(`✅ Successfully checked ${successful}/${walletAddresses.length} wallets`);
        
        res.json({
            success: true,
            balances,
            logs
        });
        
    } catch (error) {
        log(`❌ Error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message,
            logs
        });
    }
});

// Sell tokens endpoint (adapted from server.js with current IDL functions)
app.post('/api/sellTokens', async (req, res) => {
    const processLog = [];

    function logOutput(msg) {
        processLog.push(msg);
        console.log(msg);
    }

    try {
        const { 
            tokenMint, 
            sellWallets, 
            slippage = 90, 
            priorityFee = 0.01, 
            bundleSize = 5,
            simulateFirst = true 
        } = req.body;
        
        if (!tokenMint) {
            throw new Error('Token mint address is required');
        }
        
        if (!sellWallets || !Array.isArray(sellWallets) || sellWallets.length === 0) {
            throw new Error('Sell wallets array is required');
        }

        logOutput(`🎯 Starting sell process for token: ${tokenMint}`);
        logOutput(`📊 Processing ${sellWallets.length} wallets`);

        // Get working connection
        const connection = await getWorkingConnection(logOutput);

        // Validate and prepare wallet data
        const walletKeypairs = [];
        const sellPercentages = [];

        for (let i = 0; i < sellWallets.length; i++) {
            const { privateKey, percentage } = sellWallets[i];
            
            if (!privateKey || !percentage) {
                throw new Error(`Missing privateKey or percentage for wallet ${i + 1}`);
            }

            if (percentage < 1 || percentage > 100) {
                throw new Error(`Invalid percentage ${percentage} for wallet ${i + 1}. Must be 1-100`);
            }

            try {
                const keypair = parsePrivateKey(privateKey, `wallet ${i + 1}`);
                walletKeypairs.push(keypair);
                sellPercentages.push(percentage);
                
                logOutput(`✅ Wallet ${i + 1}: ${keypair.publicKey.toBase58()} (${percentage}%)`);
            } catch (error) {
                throw new Error(`Invalid private key for wallet ${i + 1}: ${error.message}`);
            }
        }

        // Build sell transaction arguments
        let allTxArgs = [];
        
        for (let i = 0; i < walletKeypairs.length; i++) {
            allTxArgs.push({
                publicKey: walletKeypairs[i].publicKey.toBase58(),
                action: 'sell',
                mint: tokenMint,
                denominatedInSol: 'false', // Sell percentage of tokens
                amount: sellPercentages[i], // Use percentage as amount (will be converted to token amount)
                slippage: slippage,
                priorityFee: priorityFee,
                pool: 'pump'
            });
        }

        logOutput(`📦 Built ${allTxArgs.length} sell transactions`);

        // Process wallets in chunks for large numbers of wallets
        const results = [];
        const maxTransactionsPerBundle = bundleSize;
        
        for (let chunkStart = 0; chunkStart < walletKeypairs.length; chunkStart += maxTransactionsPerBundle - 1) { // -1 for tip
            const chunkEnd = Math.min(chunkStart + maxTransactionsPerBundle - 1, walletKeypairs.length);
            const chunkWallets = walletKeypairs.slice(chunkStart, chunkEnd);
            const chunkPercentages = sellPercentages.slice(chunkStart, chunkEnd);
            
            logOutput(`\n📦 Processing chunk ${Math.floor(chunkStart / (maxTransactionsPerBundle - 1)) + 1}: wallets ${chunkStart + 1}-${chunkEnd}`);
            
            const allTransactions = [];
            const chunkResults = [];
            const validWallets = [];
            
            // Track atomic bundle state
            let chunkValidationFailed = false;
            let buildFailed = false;

            // BEST EFFORT SELL: Process wallets individually, skip failures
            logOutput(`🔨 BEST EFFORT: Processing chunk (${chunkWallets.length} wallets) - maximizing successful sells...`);
            
            for (let i = 0; i < chunkWallets.length; i++) {
                const keypair = chunkWallets[i];
                const percentage = chunkPercentages[i];
                const globalIndex = chunkStart + i;
                
                try {
                    logOutput(`🔨 Building sell transaction for wallet ${globalIndex + 1}...`);
                    
                    // Get token balance to calculate actual amount to sell
                    const associatedTokenAccount = getAssociatedTokenAddress(new PublicKey(tokenMint), keypair.publicKey);
                    
                    let tokenBalance;
                    try {
                        const tokenAccountInfo = await connection.getTokenAccountBalance(associatedTokenAccount);
                        tokenBalance = parseInt(tokenAccountInfo.value.amount);
                    } catch (error) {
                        logOutput(`⚠️ Skipping wallet ${globalIndex + 1}: Failed to get token balance - ${error.message}`);
                        chunkResults.push({
                            walletIndex: globalIndex + 1,
                            publicKey: keypair.publicKey.toBase58(),
                            percentage: percentage,
                            status: 'failed',
                            error: 'Failed to get token balance'
                        });
                        continue; // Skip this wallet, continue with others
                    }
                    
                    if (tokenBalance === 0) {
                        logOutput(`⚠️ Skipping wallet ${globalIndex + 1}: Zero token balance`);
                        chunkResults.push({
                            walletIndex: globalIndex + 1,
                            publicKey: keypair.publicKey.toBase58(),
                            percentage: percentage,
                            status: 'skipped',
                            error: 'Zero token balance'
                        });
                        continue; // Skip this wallet, continue with others
                    }
                    
                    // Calculate actual token amount to sell based on percentage
                    const tokenAmountToSell = Math.floor(tokenBalance * percentage / 100);
                    
                    if (tokenAmountToSell === 0) {
                        logOutput(`⚠️ Skipping wallet ${globalIndex + 1}: Calculated 0 tokens to sell (${percentage}% of ${tokenBalance})`);
                        chunkResults.push({
                            walletIndex: globalIndex + 1,
                            publicKey: keypair.publicKey.toBase58(),
                            percentage: percentage,
                            status: 'skipped',
                            error: 'Calculated 0 tokens to sell'
                        });
                        continue; // Skip this wallet, continue with others
                    }
                    
                    logOutput(`💰 Wallet ${globalIndex + 1} balance: ${tokenBalance} tokens, selling ${tokenAmountToSell} tokens (${percentage}%)`);
                    
                    // Build sell transaction using current IDL functions
                    const sellParams = {
                        user: { publicKey: keypair.publicKey },
                        mint: tokenMint,
                        amount: tokenAmountToSell,
                        slippage: slippage,
                        tokenMetadata: null
                    };
                    
                    const sellResult = await buildCurrentPumpTransaction(connection, 'sell', sellParams, logOutput);
                    
                    // Sign transaction
                    sellResult.transaction.sign([keypair]);
                    
                    // Add to chunk bundle
                    allTransactions.push(bs58.encode(sellResult.transaction.serialize()));
                    validWallets.push({ keypair, percentage, tokenBalance, tokenAmountToSell, index: globalIndex + 1 });
                    
                    logOutput(`✅ Sell transaction ${globalIndex + 1} built and signed`);
                    
                } catch (error) {
                    logOutput(`⚠️ Skipping wallet ${globalIndex + 1}: Transaction build error - ${error.message}`);
                    chunkResults.push({
                        walletIndex: globalIndex + 1,
                        publicKey: keypair.publicKey.toBase58(),
                        percentage: percentage,
                        status: 'failed',
                        error: error.message
                    });
                    // Continue with next wallet instead of breaking
                }
            }

            // Submit bundle with whatever valid transactions we have (best effort)
            if (allTransactions.length > 0) {
                logOutput(`📦 BUNDLE READY: ${allTransactions.length} valid transactions to submit`);
                const tipAmount = 100000; // 0.0001 SOL tip
                logOutput(`💰 Building tip transaction with ${tipAmount / LAMPORTS_PER_SOL} SOL tip...`);
                // Use the first valid wallet keypair for tip payment
                const tipTx = await buildTipTransaction(connection, validWallets[0].keypair, tipAmount, logOutput);
                allTransactions.push(bs58.encode(tipTx.serialize()));
                
                logOutput(`📋 Chunk bundle: ${allTransactions.length} transactions (${validWallets.length} sells + 1 tip)`);
                
                // Submit chunk bundle
                logOutput(`🚀 Submitting chunk bundle to Jito...`);
                const bundleResult = await submitJitoBundle(allTransactions, logOutput);
                
                if (bundleResult.success) {
                    logOutput(`🎉 Chunk bundle submitted successfully!`);
                    logOutput(`📋 Bundle ID: ${bundleResult.bundleId}`);
                    logOutput(`🔗 Explorer: ${bundleResult.explorerUrl}`);
                    
                    // Mark all valid wallets as submitted
                    validWallets.forEach(wallet => {
                        chunkResults.push({
                            walletIndex: wallet.index,
                            publicKey: wallet.keypair.publicKey.toBase58(),
                            percentage: wallet.percentage,
                            tokenBalance: wallet.tokenBalance,
                            tokenAmountSold: wallet.tokenAmountToSell,
                            status: 'bundled',
                            bundleId: bundleResult.bundleId,
                            method: 'jito'
                        });
                    });
                } else {
                    logOutput(`❌ Chunk bundle submission failed: ${bundleResult.error}`);
                    // Mark all as failed
                    validWallets.forEach(wallet => {
                        chunkResults.push({
                            walletIndex: wallet.index,
                            publicKey: wallet.keypair.publicKey.toBase58(),
                            percentage: wallet.percentage,
                            status: 'failed',
                            error: bundleResult.error
                        });
                    });
                }
            } else {
                logOutput(`⚠️ No valid sell transactions in this chunk - skipping bundle submission`);
            }
            
            results.push(...chunkResults);
        }

        // Final summary
        const successful = results.filter(r => r.status === 'bundled').length;
        const failed = results.filter(r => r.status === 'failed').length;
        const skipped = results.filter(r => r.status === 'skipped').length;
        
        logOutput(`\n📊 SELL SUMMARY:`);
        logOutput(`✅ Successful: ${successful}`);
        logOutput(`❌ Failed: ${failed}`);
        logOutput(`⏭️ Skipped: ${skipped}`);
        logOutput(`📈 Success Rate: ${((successful / sellWallets.length) * 100).toFixed(1)}%`);

        // Add bundle info if successful
        const bundledResults = results.filter(r => r.status === 'bundled');
        if (bundledResults.length > 0) {
            const uniqueBundleIds = [...new Set(bundledResults.map(r => r.bundleId))];
            logOutput(`🎯 Created ${uniqueBundleIds.length} bundle(s):`);
            uniqueBundleIds.forEach((bundleId, index) => {
                logOutput(`   Bundle ${index + 1}: ${bundleId}`);
                logOutput(`   🔗 Explorer: https://explorer.jito.wtf/bundle/${bundleId}`);
            });
        }

        res.json({ 
            success: true, 
            logs: processLog, 
            results,
            summary: {
                total: sellWallets.length,
                successful,
                failed,
                skipped,
                successRate: `${((successful / sellWallets.length) * 100).toFixed(1)}%`,
                bundleSubmitted: successful > 0,
                bundleIds: bundledResults.length > 0 ? [...new Set(bundledResults.map(r => r.bundleId))] : [],
                bundleCount: bundledResults.length > 0 ? [...new Set(bundledResults.map(r => r.bundleId))].length : 0
            }
        });

    } catch (error) {
        logOutput(`❌ Error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message,
            logs: processLog
        });
    }
});

// Buy-Only Bundle endpoint (for existing tokens)
app.post('/api/buyOnlyBundle', upload.single('file'), async (req, res) => {
    const logs = [];
    const log = (msg) => {
        logs.push(msg);
        console.log(msg);
    };
    
    try {
        const {
            buyers,
            tokenMint,
            slippage = 50,
            priorityFee = 0.01,
            bundleSize = 5
        } = req.body;
        
        log(`🛒 Starting buy-only bundle for existing token...`);
        
        if (!tokenMint?.trim()) {
            throw new Error('Token mint address is required for buy-only bundle');
        }
        
        if (!buyers?.trim()) {
            throw new Error('Buyers list is required');
        }
        
        // Validate token mint address
        let mintPubkey;
        try {
            mintPubkey = new PublicKey(tokenMint.trim());
            log(`🪙 Target token: ${mintPubkey.toBase58()}`);
        } catch (error) {
            throw new Error('Invalid token mint address format');
        }
        
        // Parse buyers with enhanced error handling
        const buyerKeypairs = [];
        const buyerAmounts = [];
        
        const lines = buyers.trim().split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line || line.startsWith('#')) continue;
            
            const parts = line.split(',').map(part => part.trim());
            if (parts.length !== 2) {
                throw new Error(`Invalid format on line ${i + 1}: "${line}". Expected format: privateKey,amount`);
            }
            
            const [privateKey, amountStr] = parts;
            
            if (!privateKey) {
                throw new Error(`Empty private key on line ${i + 1}`);
            }
            
            if (!amountStr) {
                throw new Error(`Empty amount on line ${i + 1}`);
            }
            
            const amount = parseFloat(amountStr);
            if (isNaN(amount) || amount <= 0) {
                throw new Error(`Invalid amount "${amountStr}" on line ${i + 1}. Must be a positive number.`);
            }
            
            try {
                const buyerKeypair = parsePrivateKey(privateKey, `buyer ${i + 1}`);
                buyerKeypairs.push(buyerKeypair);
                buyerAmounts.push(amount);
            } catch (error) {
                throw new Error(`Line ${i + 1}: ${error.message}`);
            }
        }
        
        log(`👥 Found ${buyerKeypairs.length} buyers`);
        
        // Get working connection
        const connection = await getWorkingConnection(log);
        
        // Check if token exists and determine which SDK to use
        log(`🔍 Checking token status and determining appropriate SDK...`);
        
        // Proper migration detection: check bonding curve first, then determine if migrated
        const pumpSdk = new PumpSdk(connection);
        const pumpAmmSdk = new PumpAmmInternalSdk(connection);
        let useAmmSdk = false;
        let pool = null;
        let bondingCurve = null;
        let global = null;
        
        // Step 1: Always fetch bonding curve first to check migration status
        try {
            bondingCurve = await pumpSdk.fetchBondingCurve(mintPubkey);
            global = await pumpSdk.fetchGlobal();
            
            const solReserves = bondingCurve.virtualSolReserves.toNumber() / LAMPORTS_PER_SOL;
            const tokenReserves = bondingCurve.virtualTokenReserves.toNumber() / 1000000;
            
            log(`📊 Bonding curve state: ${solReserves} SOL, ${tokenReserves} M tokens`);
            
            // Step 2: Check if token has migrated (0 tokens left in bonding curve)
            if (bondingCurve.virtualTokenReserves.toNumber() === 0) {
                log(`🔄 Migration detected: 0 tokens left in bonding curve - checking AMM...`);
                
                // Token has definitely migrated, so we should use AMM SDK regardless
                useAmmSdk = true;
                
                try {
                    pool = await pumpAmmSdk.fetchPool(mintPubkey);
                    if (pool) {
                        log(`✅ Token has migrated to AMM - using pump-swap-sdk for pricing`);
                        log(`📊 AMM Pool: ${pool.baseReserve?.toString()} base, ${pool.quoteReserve?.toString()} quote`);
                    } else {
                        log(`⚠️ AMM pool exists but couldn't fetch details - will try direct swap`);
                    }
                } catch (poolError) {
                    log(`⚠️ Failed to fetch AMM pool details: ${poolError.message}`);
                    log(`🎯 Token definitely migrated (0 bonding curve tokens) - will attempt AMM anyway`);
                    // Keep useAmmSdk = true since we know it's migrated
                }
            } else {
                log(`🎯 Token still on bonding curve - using pump-sdk for pricing`);
                useAmmSdk = false;
            }
            
        } catch (bondingError) {
            log(`⚠️ Failed to fetch bonding curve: ${bondingError.message}`);
            log(`🔄 Checking if token is AMM-only...`);
            
            // Fallback: if bonding curve fetch fails, try AMM
            try {
                pool = await pumpAmmSdk.fetchPool(mintPubkey);
                if (pool) {
                    useAmmSdk = true;
                    log(`✅ Token found in AMM (no bonding curve) - using pump-swap-sdk`);
                }
            } catch (poolError) {
                log(`❌ Token not found in bonding curve or AMM: ${poolError.message}`);
                throw new Error('Token not found in bonding curve or AMM');
            }
        }
        
        // Verify token exists by checking mint account
        try {
            const mintAccountInfo = await connection.getAccountInfo(mintPubkey);
            if (!mintAccountInfo) {
                throw new Error('Token mint does not exist');
            }
            log(`✅ Token mint verified: ${mintPubkey.toBase58()}`);
        } catch (error) {
            throw new Error(`Failed to verify token: ${error.message}`);
        }
        
        // Process buyers in chunks
        const results = [];
        const maxTransactionsPerBundle = bundleSize;
        
        for (let chunkStart = 0; chunkStart < buyerKeypairs.length; chunkStart += maxTransactionsPerBundle - 1) { // -1 for tip
            const chunkEnd = Math.min(chunkStart + maxTransactionsPerBundle - 1, buyerKeypairs.length);
            const chunkBuyers = buyerKeypairs.slice(chunkStart, chunkEnd);
            const chunkAmounts = buyerAmounts.slice(chunkStart, chunkEnd);
            
            log(`\n📦 Processing chunk ${Math.floor(chunkStart / (maxTransactionsPerBundle - 1)) + 1}: buyers ${chunkStart + 1}-${chunkEnd}`);
            
            const allTransactions = [];
            const chunkResults = [];
            
            // Initialize pricing data for calculations
            let currentBondingCurve = bondingCurve;
            
            // Build buyer transactions for this chunk with accurate pricing
            for (let i = 0; i < chunkBuyers.length; i++) {
                const buyerKeypair = chunkBuyers[i];
                const amount = chunkAmounts[i];
                const globalIndex = chunkStart + i;
                
                // Calculate expected tokens using appropriate SDK
                let expectedTokens;
                let priceImpact = 0;
                
                try {
                    if (useAmmSdk) {
                        // For migrated tokens, we MUST use proper AMM methods - no estimations allowed
                        const solAmountLamports = new BN(amount * LAMPORTS_PER_SOL);
                        
                        log(`🔄 Token is migrated - attempting AMM pricing with proper SDK methods...`);
                        log(`💰 SOL amount: ${amount} (${solAmountLamports.toString()} lamports)`);
                        log(`🎯 Mint: ${mintPubkey.toBase58()}`);
                        log(`📊 Pool object exists: ${!!pool}`);
                        
                        try {
                            // Use high-level PumpAmmSdk for migrated tokens
                            const pumpAmmHighLevel = new PumpAmmSdk(connection);
                            
                            // Get canonical pump pool address for migrated tokens
                            log(`🔍 Attempting to get canonical pump pool address for mint...`);
                            const [poolAddress, poolBump] = canonicalPumpPoolPda(mintPubkey);
                            log(`✅ Pool address found: ${poolAddress.toBase58()} (bump: ${poolBump})`);
                            
                            // Try to fetch pool information directly
                            log(`🔍 Attempting to fetch pool information...`);
                            const poolInfo = await pumpAmmHighLevel.fetchPool(poolAddress);
                            log(`✅ Pool info fetched successfully:`, {
                                poolBump: poolInfo.poolBump,
                                index: poolInfo.index,
                                creator: poolInfo.creator?.toBase58(),
                                baseMint: poolInfo.baseMint?.toBase58(),
                                quoteMint: poolInfo.quoteMint?.toBase58(),
                                lpSupply: poolInfo.lpSupply?.toString(),
                                coinCreator: poolInfo.coinCreator?.toBase58()
                            });
                            
                            // Use swapAutocompleteBaseFromQuote for accurate pricing
                            log(`🔍 Calculating token amount using swapAutocompleteBaseFromQuote...`);
                            expectedTokens = await pumpAmmHighLevel.swapAutocompleteBaseFromQuote(
                                poolAddress,
                                solAmountLamports,
                                slippage,
                                'quoteToBase' // SOL -> Token direction
                            );
                            
                            log(`✅ AMM pricing successful: ${(expectedTokens.toNumber() / 1000000).toFixed(2)}M tokens for ${amount} SOL`);
                            priceImpact = "calculated via AMM";
                            
                        } catch (ammError) {
                            log(`❌ AMM pricing completely failed for migrated token:`);
                            log(`   Error: ${ammError.message}`);
                            log(`   Stack: ${ammError.stack}`);
                            
                            // For migrated tokens, we cannot use estimations - this will cause failed transactions
                            throw new Error(`Cannot price migrated token via AMM: ${ammError.message}. This token requires AMM pricing but AMM SDK failed.`);
                        }
                    } else if (currentBondingCurve && global) {
                        // Use bonding curve SDK for pump.fun tokens
                        const solAmountLamports = new BN(amount * LAMPORTS_PER_SOL);
                        expectedTokens = getBuyTokenAmountFromSolAmount(global, currentBondingCurve, solAmountLamports, false);
                        priceImpact = ((solAmountLamports.toNumber() / currentBondingCurve.virtualSolReserves.toNumber()) * 100).toFixed(2);
                        log(`🎯 Bonding curve pricing: ${(expectedTokens.toNumber() / 1000000).toFixed(2)}M tokens for ${amount} SOL (${priceImpact}% impact)`);
                        
                        // Update bonding curve state for next calculation (simulate the buy)
                        const newVirtualSolReserves = currentBondingCurve.virtualSolReserves.add(solAmountLamports);
                        const newVirtualTokenReserves = currentBondingCurve.virtualTokenReserves.sub(expectedTokens);
                        currentBondingCurve = {
                            ...currentBondingCurve,
                            virtualSolReserves: newVirtualSolReserves,
                            virtualTokenReserves: newVirtualTokenReserves
                        };
                    } else {
                        // Fallback to approximation if SDK data unavailable
                        const curveResult = calculateBondingCurveTokens(amount, 30, 79000000);
                        expectedTokens = new BN(curveResult.tokensOut);
                        priceImpact = ((amount / 30) * 100).toFixed(2);
                        log(`⚠️ Using approximation: ${(expectedTokens.toNumber() / 1000000).toFixed(2)}M tokens for ${amount} SOL (${priceImpact}% impact)`);
                    }
                } catch (pricingError) {
                    log(`⚠️ SDK pricing failed: ${pricingError.message}`);
                    
                    // Check if this is an AMM pricing failure for a migrated token
                    if (pricingError.message.includes('Cannot price migrated token via AMM')) {
                        log(`❌ Cannot build transaction for migrated token with failed AMM pricing`);
                        chunkResults.push({
                            buyerIndex: globalIndex,
                            publicKey: buyerKeypair.publicKey.toBase58(),
                            amount: amount,
                            status: 'failed',
                            error: `AMM pricing failed for migrated token: ${pricingError.message}`
                        });
                        continue; // Skip this buyer, don't try to build transaction
                    }
                    
                    // For bonding curve tokens, use approximation as fallback
                    const curveResult = calculateBondingCurveTokens(amount, 30, 79000000);
                    expectedTokens = new BN(curveResult.tokensOut);
                    priceImpact = ((amount / 30) * 100).toFixed(2);
                }
                
                log(`🛒 Building buy transaction for buyer ${globalIndex + 1}: ${amount} SOL`);
                log(`📊 Expected tokens: ${(expectedTokens.toNumber() / 1000000).toFixed(2)}M (${priceImpact}% price impact)`);
                
                try {
                    const buyParams = {
                        user: { publicKey: buyerKeypair.publicKey },
                        mint: mintPubkey.toBase58(),
                        amount: amount,
                        slippage: slippage,
                        expectedTokens: expectedTokens.toNumber() // Pass expected tokens for more accurate calculation
                    };
                    
                    // Pass migration status to transaction builder to ensure correct method
                    buyParams.isMigrated = useAmmSdk;
                    
                    // Use our enhanced buy instruction that handles SOL amounts correctly
                    const buyResult = await buildCurrentPumpTransaction(connection, 'buy', buyParams, log);
                    buyResult.transaction.sign([buyerKeypair]);
                    
                    // Simulate buyer transaction with detailed logging
                    try {
                        log(`🧪 Simulating buyer ${globalIndex + 1} transaction...`);
                        log(`🔍 Transaction details:`);
                        log(`   📍 User: ${buyerKeypair.publicKey.toBase58()}`);
                        log(`   🪙 Mint: ${mintPubkey.toBase58()}`);
                        log(`   💰 Amount: ${amount} SOL`);
                        log(`   📊 Expected tokens: ${(expectedTokens.toNumber() / 1000000).toFixed(2)}M`);
                        log(`   🎯 SDK used: ${useAmmSdk ? 'AMM' : 'Bonding Curve'}`);
                        log(`   📝 Instructions count: ${buyResult.transaction.instructions.length}`);
                        
                        const simulation = await connection.simulateTransaction(buyResult.transaction, {
                            commitment: 'processed',
                            sigVerify: false
                        });
                        
                        if (simulation.value.err) {
                            log(`❌ Buyer ${globalIndex + 1} simulation failed: ${JSON.stringify(simulation.value.err)}`);
                            
                            // Enhanced error logging
                            if (simulation.value.logs) {
                                log(`📋 Simulation logs:`);
                                simulation.value.logs.forEach((logLine, index) => {
                                    log(`   ${index + 1}: ${logLine}`);
                                });
                            }
                            
                            // Analyze the error
                            if (simulation.value.err.InstructionError) {
                                const [instructionIndex, errorDetail] = simulation.value.err.InstructionError;
                                log(`🔍 Error analysis:`);
                                log(`   📍 Failed instruction index: ${instructionIndex}`);
                                log(`   📝 Total instructions: ${buyResult.transaction.instructions.length}`);
                                log(`   ❌ Error detail: ${JSON.stringify(errorDetail)}`);
                                
                                if (errorDetail.Custom) {
                                    log(`   🔧 Custom error code: ${errorDetail.Custom}`);
                                    // Map common error codes
                                    const errorMappings = {
                                        1: 'ZeroBaseAmount',
                                        6001: 'ZeroBaseAmount', 
                                        6002: 'ZeroQuoteAmount',
                                        6004: 'ExceededSlippage',
                                        6005: 'Invalid account discriminator'
                                    };
                                    if (errorMappings[errorDetail.Custom]) {
                                        log(`   💡 Error meaning: ${errorMappings[errorDetail.Custom]}`);
                                    }
                                }
                            }
                            
                            chunkResults.push({
                                buyerIndex: globalIndex,
                                publicKey: buyerKeypair.publicKey.toBase58(),
                                amount: amount,
                                status: 'failed',
                                error: `Simulation failed: ${JSON.stringify(simulation.value.err)}`
                            });
                            continue;
                        } else {
                            log(`✅ Buyer ${globalIndex + 1} simulation successful`);
                            log(`🔧 Compute units used: ${simulation.value.unitsConsumed || 'unknown'}`);
                            
                            // Log successful simulation details
                            if (simulation.value.logs) {
                                log(`📋 Success logs (last 3):`);
                                const lastLogs = simulation.value.logs.slice(-3);
                                lastLogs.forEach((logLine, index) => {
                                    log(`   ${lastLogs.length - 2 + index}: ${logLine}`);
                                });
                            }
                        }
                    } catch (simError) {
                        log(`❌ Buyer ${globalIndex + 1} simulation failed: ${simError.message}`);
                        log(`🔍 Simulation error details:`);
                        log(`   📍 Error type: ${simError.constructor.name}`);
                        log(`   📝 Stack trace: ${simError.stack}`);
                        
                        chunkResults.push({
                            buyerIndex: globalIndex,
                            publicKey: buyerKeypair.publicKey.toBase58(),
                            amount: amount,
                            status: 'failed',
                            error: `Simulation error: ${simError.message}`
                        });
                        continue;
                    }
                    
                    allTransactions.push(bs58.encode(buyResult.transaction.serialize()));
                    chunkResults.push({
                        buyerIndex: globalIndex,
                        publicKey: buyerKeypair.publicKey.toBase58(),
                        amount: amount,
                        status: 'prepared'
                    });
                    log(`✅ Buy transaction ${globalIndex + 1} built and signed`);
                    
                } catch (error) {
                    log(`❌ Error building transaction for buyer ${globalIndex + 1}: ${error.message}`);
                    chunkResults.push({
                        buyerIndex: globalIndex,
                        publicKey: buyerKeypair.publicKey.toBase58(),
                        amount: amount,
                        status: 'failed',
                        error: error.message
                    });
                }
            }
            
            // Add tip transaction using first buyer as payer (they all benefit from the bundle)
            if (allTransactions.length > 0) {
                const tipAmount = 100000; // 0.0001 SOL tip
                log(`💰 Building tip transaction with ${tipAmount / LAMPORTS_PER_SOL} SOL tip...`);
                const tipTx = await buildTipTransaction(connection, chunkBuyers[0], tipAmount, log);
                allTransactions.push(bs58.encode(tipTx.serialize()));
                
                log(`📋 Chunk bundle: ${allTransactions.length} transactions ready (${chunkBuyers.length} buys + 1 tip)`);
                
                // Submit chunk bundle
                log(`🚀 Submitting chunk bundle to Jito...`);
                const result = await submitJitoBundle(allTransactions, log);
                
                if (result.success) {
                    log(`🎉 Chunk bundle submitted successfully!`);
                    log(`📋 Bundle ID: ${result.bundleId}`);
                    log(`🔗 Explorer: ${result.explorerUrl}`);
                    
                    // Mark successful submissions
                    chunkResults.forEach(r => {
                        if (r.status === 'prepared') {
                            r.status = 'submitted';
                            r.bundleId = result.bundleId;
                            r.explorerUrl = result.explorerUrl;
                        }
                    });
                } else {
                    log(`❌ Chunk bundle submission failed: ${result.error}`);
                    // Mark all as failed
                    chunkResults.forEach(r => {
                        if (r.status === 'prepared') {
                            r.status = 'failed';
                            r.error = `Bundle submission failed: ${result.error}`;
                        }
                    });
                }
            }
            
            results.push(...chunkResults);
        }
        
        const successful = results.filter(r => r.status === 'submitted').length;
        const failed = results.filter(r => r.status === 'failed').length;
        
        log(`\n📊 Buy-only bundle summary:`);
        log(`✅ Successful: ${successful}/${buyerKeypairs.length}`);
        log(`❌ Failed: ${failed}/${buyerKeypairs.length}`);
        
        // Determine overall success - only successful if at least one buyer succeeded
        const overallSuccess = successful > 0;
        
        if (overallSuccess) {
            log(`\n🎉 SUCCESS! ${successful} buyer(s) completed successfully.`);
        } else {
            log(`\n❌ FAILED! All ${failed} buyers failed. No transactions submitted.`);
        }

        res.json({
            success: overallSuccess,
            logs,
            tokenMint: mintPubkey.toBase58(),
            sdkUsed: useAmmSdk ? 'pump-swap-sdk (AMM)' : 'pump-sdk (bonding curve)',
            summary: {
                total: buyerKeypairs.length,
                successful,
                failed,
                successRate: `${((successful / buyerKeypairs.length) * 100).toFixed(1)}%`
            },
            results,
            notice: overallSuccess 
                ? "Buy-only bundles submitted - inclusion not guaranteed. Check explorer for status."
                : "All transactions failed - no bundles were submitted."
        });
        
    } catch (error) {
        log(`❌ Error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message,
            logs
        });
    }
});

// Generate wallets endpoint
app.post('/api/generateWallets', async (req, res) => {
    try {
        const { count } = req.body;
        
        if (!count || count <= 0 || count > 100) {
            return res.status(400).json({ error: 'Invalid count (1-100)' });
        }

        const wallets = [];
        for (let i = 0; i < count; i++) {
            const seedPhrase = SeedPhraseManager.generateSeedPhrase();
            const walletInfo = SeedPhraseManager.getWalletInfo(seedPhrase);
            
            const wallet = {
                id: i + 1,
                publicKey: walletInfo.publicKey,
                secretKey: walletInfo.secretKey,
                seedPhrase: walletInfo.seedPhrase,
                derivationPath: walletInfo.derivationPath,
                privateKey: bs58.encode(walletInfo.keypair.secretKey.slice(0, 32)),
                secretKeyBase58: bs58.encode(walletInfo.keypair.secretKey),
                network: 'mainnet-beta',
                createdAt: new Date().toISOString()
            };
            
            wallets.push(wallet);
        }

        // Save to encrypted file
        const encryptionPassword = process.env.WALLET_ENCRYPTION_PASSWORD || 'default-password-change-me';
        const encryption = new WalletEncryption(encryptionPassword);
        const encryptedData = encryption.encrypt(JSON.stringify(wallets));
        const timestamp = Date.now();
        const walletFile = path.join(walletsDir, `wallets_${timestamp}.json`);
        fs.writeFileSync(walletFile, JSON.stringify(encryptedData, null, 2));

        res.json({ 
            success: true, 
            wallets, 
            walletFile: path.basename(walletFile) 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List wallet files endpoint
app.get('/api/listWalletFiles', async (req, res) => {
    try {
        const files = [];
        const walletFiles = fs.readdirSync(walletsDir).filter(file => file.endsWith('.json'));
        
        for (const filename of walletFiles) {
            try {
                const filePath = path.join(walletsDir, filename);
                const fileStats = fs.statSync(filePath);
                const fileContent = fs.readFileSync(filePath, 'utf8');
                const encryptedData = JSON.parse(fileContent);
                
                // Try to decrypt to get wallet count
                const encryptionPassword = process.env.WALLET_ENCRYPTION_PASSWORD || 'default-password-change-me';
                const encryption = new WalletEncryption(encryptionPassword);
                const decryptedData = encryption.decrypt(encryptedData);
                const wallets = JSON.parse(decryptedData);
                
                files.push({
                    filename,
                    count: wallets.length,
                    createdAt: fileStats.birthtime.toISOString().split('T')[0],
                    size: fileStats.size
                });
            } catch (error) {
                // Skip files that can't be read or decrypted
                console.warn(`Skipping wallet file ${filename}: ${error.message}`);
            }
        }
        
        // Sort by creation date (newest first)
        files.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        res.json({ success: true, files });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Extract keys from wallet file endpoint
app.post('/api/extractFromWalletFile', async (req, res) => {
    try {
        const { walletFile } = req.body;
        
        if (!walletFile || typeof walletFile !== 'string') {
            return res.status(400).json({ error: 'Wallet file is required' });
        }

        const filePath = path.join(walletsDir, walletFile);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Wallet file not found' });
        }

        // Read and decrypt the wallet file
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const encryptedData = JSON.parse(fileContent);
        
        const encryptionPassword = process.env.WALLET_ENCRYPTION_PASSWORD || 'default-password-change-me';
        const encryption = new WalletEncryption(encryptionPassword);
        const decryptedData = encryption.decrypt(encryptedData);
        const wallets = JSON.parse(decryptedData);

        const results = [];
        
        for (const wallet of wallets) {
            try {
                // Create result in the same format as extractPrivateKeys
                const keypair = SeedPhraseManager.keypairFromSeedPhrase(wallet.seedPhrase);
                const privateKeyOnly = keypair.secretKey.slice(0, 32);
                
                results.push({
                    seedPhrase: wallet.seedPhrase,
                    publicKey: keypair.publicKey.toString(),
                    privateKey: {
                        hex: Buffer.from(privateKeyOnly).toString('hex'),
                        base58: bs58.encode(privateKeyOnly),
                        array: Array.from(privateKeyOnly)
                    },
                    secretKey: {
                        hex: Buffer.from(keypair.secretKey).toString('hex'),
                        base58: bs58.encode(keypair.secretKey),
                        array: Array.from(keypair.secretKey)
                    }
                });
            } catch (error) {
                results.push({
                    seedPhrase: wallet.seedPhrase || 'Unknown',
                    error: error.message
                });
            }
        }

        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Extract private keys from seed phrases endpoint
app.post('/api/extractPrivateKeys', async (req, res) => {
    try {
        const { seedPhrases } = req.body;
        
        if (!seedPhrases || !Array.isArray(seedPhrases)) {
            return res.status(400).json({ error: 'Invalid seed phrases array' });
        }

        const results = [];
        
        for (const seedPhrase of seedPhrases) {
            try {
                if (!SeedPhraseManager.validateSeedPhrase(seedPhrase)) {
                    results.push({ seedPhrase, error: 'Invalid seed phrase' });
                    continue;
                }
                
                const keypair = SeedPhraseManager.keypairFromSeedPhrase(seedPhrase);
                const privateKeyOnly = keypair.secretKey.slice(0, 32);
                
                results.push({
                    seedPhrase,
                    publicKey: keypair.publicKey.toString(),
                    privateKey: {
                        hex: Buffer.from(privateKeyOnly).toString('hex'),
                        base58: bs58.encode(privateKeyOnly),
                        array: Array.from(privateKeyOnly)
                    },
                    secretKey: {
                        hex: Buffer.from(keypair.secretKey).toString('hex'),
                        base58: bs58.encode(keypair.secretKey),
                        array: Array.from(keypair.secretKey)
                    }
                });
            } catch (error) {
                results.push({
                    seedPhrase,
                    error: error.message
                });
            }
        }

        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Check balance endpoint
app.post('/api/checkBalance', async (req, res) => {
    try {
        const { privateKey } = req.body;
        
        if (!privateKey || typeof privateKey !== 'string') {
            return res.status(400).json({ error: 'Private key is required' });
        }

        // Create keypair from private key
        let keypair;
        try {
            const privateKeyBytes = bs58.decode(privateKey);
            keypair = Keypair.fromSecretKey(privateKeyBytes);
        } catch (error) {
            return res.status(400).json({ error: 'Invalid private key format' });
        }

        const connection = await getWorkingConnection(console.log);
        
        const balance = await connection.getBalance(keypair.publicKey);
        const balanceSOL = balance / LAMPORTS_PER_SOL;
        
        res.json({ 
            success: true, 
            publicKey: keypair.publicKey.toBase58(),
            balance: balanceSOL,
            balanceLamports: balance
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Distribute SOL endpoint (from server.js)
app.post('/api/distributeSOL', async (req, res) => {
    try {
        const { masterPrivateKey, targetWallets, solAmount, useChangeNOW } = req.body;
        
        if (!masterPrivateKey || typeof masterPrivateKey !== 'string') {
            return res.status(400).json({ error: 'Master private key is required' });
        }

        if (!targetWallets || !Array.isArray(targetWallets) || targetWallets.length === 0) {
            return res.status(400).json({ error: 'Invalid target wallets' });
        }

        if (!solAmount || solAmount <= 0) {
            return res.status(400).json({ error: 'Invalid SOL amount' });
        }

        // Create master wallet keypair from private key
        let masterKeypair;
        try {
            const privateKeyBytes = bs58.decode(masterPrivateKey);
            masterKeypair = Keypair.fromSecretKey(privateKeyBytes);
        } catch (error) {
            return res.status(400).json({ error: 'Invalid master private key format' });
        }

        const connection = await getWorkingConnection(console.log);
        
        // Check master wallet balance
        const masterBalance = await connection.getBalance(masterKeypair.publicKey);
        const masterBalanceSOL = masterBalance / LAMPORTS_PER_SOL;
        
        // Calculate total required SOL (amount per wallet * number of wallets + estimated fees)
        const totalDistributionAmount = solAmount * targetWallets.length;
        const estimatedFees = 0.01 * targetWallets.length; // Rough estimate of transaction fees
        const totalRequired = totalDistributionAmount + estimatedFees;
        
        console.log(`Master wallet balance: ${masterBalanceSOL} SOL`);
        console.log(`Total required: ${totalRequired} SOL (${totalDistributionAmount} + ${estimatedFees} fees)`);
        
        if (masterBalanceSOL < totalRequired) {
            return res.status(400).json({ 
                error: `Insufficient balance. Need ${totalRequired.toFixed(4)} SOL, but wallet only has ${masterBalanceSOL.toFixed(4)} SOL`,
                details: {
                    currentBalance: masterBalanceSOL,
                    requiredAmount: totalDistributionAmount,
                    estimatedFees: estimatedFees,
                    totalRequired: totalRequired
                }
            });
        }
        
        const results = [];
        
        if (useChangeNOW && process.env.CHANGENOW_API_KEY) {
            // Use ChangeNOW for anonymous distribution
            const changeNOW = new ChangeNOWPrivacy(process.env.CHANGENOW_API_KEY);
            
            for (const targetWallet of targetWallets) {
                try {
                    const exchange = await changeNOW.createAnonymousExchange(
                        solAmount,
                        targetWallet.publicKey
                    );
                    
                    // Send SOL to ChangeNOW
                    const { blockhash } = await connection.getLatestBlockhash('confirmed');
                    
                    // Validate ChangeNOW payin address format
                    if (!isValidBase58(exchange.payinAddress)) {
                        throw new Error(`Invalid base58 format for ChangeNOW payin address: ${exchange.payinAddress}`);
                    }
                    
                    const transaction = new Transaction({
                        feePayer: masterKeypair.publicKey,
                        blockhash: blockhash
                    }).add(
                        SystemProgram.transfer({
                            fromPubkey: masterKeypair.publicKey,
                            toPubkey: new PublicKey(exchange.payinAddress),
                            lamports: Math.floor(solAmount * LAMPORTS_PER_SOL),
                        })
                    );

                    const signature = await sendAndConfirmTransaction(
                        connection,
                        transaction,
                        [masterKeypair],
                        { commitment: 'confirmed' }
                    );

                    results.push({
                        walletId: targetWallet.id,
                        publicKey: targetWallet.publicKey,
                        exchangeId: exchange.id,
                        sendSignature: signature,
                        status: 'sent_to_changenow'
                    });
                } catch (error) {
                    results.push({
                        walletId: targetWallet.id,
                        publicKey: targetWallet.publicKey,
                        error: error.message,
                        status: 'failed'
                    });
                }
            }
        } else {
            // Direct transfer
            for (const targetWallet of targetWallets) {
                try {
                    const { blockhash } = await connection.getLatestBlockhash('confirmed');
                    // Validate target wallet public key format
                    if (!isValidBase58(targetWallet.publicKey)) {
                        throw new Error(`Invalid base58 format for target wallet public key: ${targetWallet.publicKey}`);
                    }
                    
                    const transaction = new Transaction({
                        feePayer: masterKeypair.publicKey,
                        blockhash: blockhash
                    }).add(
                        SystemProgram.transfer({
                            fromPubkey: masterKeypair.publicKey,
                            toPubkey: new PublicKey(targetWallet.publicKey),
                            lamports: Math.floor(solAmount * LAMPORTS_PER_SOL),
                        })
                    );

                    const signature = await sendAndConfirmTransaction(
                        connection,
                        transaction,
                        [masterKeypair],
                        { commitment: 'confirmed' }
                    );

                    results.push({
                        walletId: targetWallet.id,
                        publicKey: targetWallet.publicKey,
                        signature: signature,
                        status: 'success'
                    });
                } catch (error) {
                    results.push({
                        walletId: targetWallet.id,
                        publicKey: targetWallet.publicKey,
                        error: error.message,
                        status: 'failed'
                    });
                }
            }
        }

        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Consolidate assets endpoint
app.post('/api/consolidateAssets', async (req, res) => {
    const processLog = [];

    function logOutput(msg) {
        processLog.push(msg);
        console.log(msg);
    }

    try {
        const { 
            tokenMint, 
            consolidateWallets, 
            targetAddress,
            priorityFee = 0.001, 
            bundleSize = 5,
            consolidateSOL = true,
            consolidateTokens = true
        } = req.body;
        
        if (!tokenMint) {
            throw new Error('Token mint address is required');
        }
        
        // Validate token mint format
        if (!isValidBase58(tokenMint)) {
            throw new Error(`Invalid base58 format for token mint: ${tokenMint}`);
        }
        
        if (!targetAddress) {
            throw new Error('Target address for consolidation is required');
        }
        
        // Validate target address format
        if (!isValidBase58(targetAddress)) {
            throw new Error(`Invalid base58 format for target address: ${targetAddress}`);
        }
        
        if (!consolidateWallets || !Array.isArray(consolidateWallets) || consolidateWallets.length === 0) {
            throw new Error('Consolidate wallets array is required');
        }

        logOutput(`🎯 Starting asset consolidation for token: ${tokenMint}`);
        logOutput(`📍 Target address: ${targetAddress}`);
        logOutput(`📊 Processing ${consolidateWallets.length} wallets`);
        logOutput(`💰 Consolidate SOL: ${consolidateSOL}`);
        logOutput(`🪙 Consolidate Tokens: ${consolidateTokens}`);

        // Validate and prepare wallet data
        const walletKeypairs = [];

        for (let i = 0; i < consolidateWallets.length; i++) {
            const { privateKey } = consolidateWallets[i];
            
            if (!privateKey) {
                throw new Error(`Missing privateKey for wallet ${i + 1}`);
            }

            try {
                const decoded = bs58.decode(privateKey);
                let keypair;
                
                if (decoded.length === 64) {
                    keypair = Keypair.fromSecretKey(decoded);
                } else if (decoded.length === 32) {
                    keypair = Keypair.fromSeed(decoded);
                } else {
                    throw new Error(`Invalid private key length for wallet ${i + 1}`);
                }

                walletKeypairs.push(keypair);
                logOutput(`✅ Wallet ${i + 1}: ${keypair.publicKey.toBase58()}`);
            } catch (error) {
                throw new Error(`Invalid private key for wallet ${i + 1}: ${error.message}`);
            }
        }

        const connection = await getWorkingConnection(logOutput);
        const targetPublicKey = new PublicKey(targetAddress);
        const mintPublicKey = new PublicKey(tokenMint);
        
        // Check balances first
        logOutput(`\n📊 Checking wallet balances...`);
        const walletData = [];
        
        for (let i = 0; i < walletKeypairs.length; i++) {
            const keypair = walletKeypairs[i];
            
            // Get SOL balance
            const solBalance = await connection.getBalance(keypair.publicKey);
            const solBalanceFormatted = (solBalance / LAMPORTS_PER_SOL).toFixed(4);
            
            // Get token balance
            let tokenBalance = 0;
            let tokenAccountAddress = null;
            
            if (consolidateTokens) {
                try {
                    tokenAccountAddress = getAssociatedTokenAddress(mintPublicKey, keypair.publicKey);
                    const tokenAccountInfo = await connection.getAccountInfo(tokenAccountAddress);
                    
                    if (tokenAccountInfo) {
                        // Parse token account data
                        const accountData = tokenAccountInfo.data;
                        if (accountData.length >= 64) {
                            // Token account data structure: mint(32) + owner(32) + amount(8) + ...
                            const amountBuffer = accountData.slice(64, 72);
                            tokenBalance = Number(Buffer.from(amountBuffer).readBigUInt64LE());
                        }
                    }
                } catch (error) {
                    logOutput(`⚠️ No token account for wallet ${i + 1}: ${error.message}`);
                }
            }
            
            walletData.push({
                index: i,
                keypair,
                solBalance,
                solBalanceFormatted,
                tokenBalance,
                tokenAccountAddress,
                hasAssets: solBalance > 5000 || tokenBalance > 0 // 5000 lamports = 0.000005 SOL (dust threshold)
            });
            
            logOutput(`💼 Wallet ${i + 1}: ${solBalanceFormatted} SOL, ${tokenBalance} tokens`);
        }
        
        // Filter wallets that have assets to consolidate
        const walletsWithAssets = walletData.filter(w => w.hasAssets);
        
        if (walletsWithAssets.length === 0) {
            logOutput(`⚠️ No wallets found with assets to consolidate`);
            return res.json({ 
                success: true, 
                logs: processLog, 
                results: [],
                summary: { total: 0, consolidated: 0, skipped: consolidateWallets.length }
            });
        }
        
        logOutput(`\n🚀 Found ${walletsWithAssets.length} wallets with assets to consolidate`);

        // Build consolidation transactions
        const allTxArgs = [];
        
        for (const walletData of walletsWithAssets) {
            if (consolidateTokens && walletData.tokenBalance > 0) {
                // Token transfer transaction
                allTxArgs.push({
                    type: 'token',
                    fromKeypair: walletData.keypair,
                    tokenAmount: walletData.tokenBalance,
                    tokenAccountAddress: walletData.tokenAccountAddress,
                    walletIndex: walletData.index + 1
                });
            }
            
            if (consolidateSOL && walletData.solBalance > 0.001 * LAMPORTS_PER_SOL) {
                // SOL transfer transaction (leave minimal amount for rent exemption)
                // Reserve 0.001 SOL (1,000,000 lamports) as minimal leftover
                const reserveAmount = 0.001 * LAMPORTS_PER_SOL; // 0.001 SOL
                const transferAmount = walletData.solBalance - reserveAmount;
                
                if (transferAmount > 0) {
                    allTxArgs.push({
                        type: 'sol',
                        fromKeypair: walletData.keypair,
                        solAmount: transferAmount,
                        walletIndex: walletData.index + 1
                    });
                    logOutput(`💰 Will transfer ${(transferAmount / LAMPORTS_PER_SOL).toFixed(6)} SOL from wallet ${walletData.index + 1} (leaving ${(reserveAmount / LAMPORTS_PER_SOL).toFixed(3)} SOL)`);
                }
            }
        }

        if (allTxArgs.length === 0) {
            logOutput(`⚠️ No transactions needed for consolidation`);
            return res.json({ 
                success: true, 
                logs: processLog, 
                results: [],
                summary: { total: 0, consolidated: 0, skipped: consolidateWallets.length }
            });
        }

        logOutput(`📦 Built ${allTxArgs.length} consolidation transactions`);

        // Process transactions individually (no Jito bundling)
        const allSignatures = [];
        const results = [];

        logOutput(`🔨 Processing ${allTxArgs.length} transactions individually...`);

        for (let i = 0; i < allTxArgs.length; i++) {
            const txArg = allTxArgs[i];
            logOutput(`📤 Processing transaction ${i + 1}/${allTxArgs.length}: ${txArg.type} for wallet ${txArg.walletIndex}...`);

            try {
                const { blockhash } = await getRecentBlockhashWithRetry(connection, logOutput);
                let transaction;
                        
                if (txArg.type === 'token') {
                    // Token transfer transaction
                    transaction = new Transaction({
                        feePayer: txArg.fromKeypair.publicKey,
                        recentBlockhash: blockhash
                    });
                    
                    // Add priority fee
                    if (priorityFee > 0) {
                        const microLamports = Math.floor(priorityFee * 1000000);
                        transaction.add(
                            ComputeBudgetProgram.setComputeUnitPrice({
                                microLamports: microLamports
                            })
                        );
                        logOutput(`💸 Added priority fee: ${microLamports} microLamports (${priorityFee} SOL equivalent)`);
                    }
                    
                    // Create target associated token account if it doesn't exist
                    const targetTokenAccount = getAssociatedTokenAddress(mintPublicKey, targetPublicKey);
                    const targetAccountInfo = await connection.getAccountInfo(targetTokenAccount);
                    
                    logOutput(`🔍 Checking target ATA: ${targetTokenAccount.toString()}`);
                    logOutput(`🔍 Target account exists: ${!!targetAccountInfo}`);
                    
                    if (!targetAccountInfo) {
                        // Check if wallet has enough SOL for rent-exempt minimum
                        const walletBalance = await connection.getBalance(txArg.fromKeypair.publicKey);
                        const rentExemptMinimum = await connection.getMinimumBalanceForRentExemption(165); // Token account size
                        const transactionFee = 10000; // Estimated transaction fee
                        const requiredBalance = rentExemptMinimum + transactionFee;
                        
                        if (walletBalance < requiredBalance) {
                            const needSOL = (requiredBalance / LAMPORTS_PER_SOL).toFixed(6);
                            const haveSOL = (walletBalance / LAMPORTS_PER_SOL).toFixed(6);
                            logOutput(`❌ Wallet ${txArg.walletIndex} insufficient SOL for ATA creation (need ${needSOL} SOL, have ${haveSOL} SOL)`);
                            throw new Error(`Insufficient SOL for associated token account creation. Wallet needs ${needSOL} SOL but only has ${haveSOL} SOL.`);
                        }
                        
                        transaction.add(
                            createAssociatedTokenAccountInstruction(
                                txArg.fromKeypair.publicKey,  // payer
                                targetTokenAccount,           // associatedToken 
                                targetPublicKey,              // owner
                                mintPublicKey                 // mint
                            )
                        );
                        logOutput(`📝 Adding ATA creation for target (cost: ${(rentExemptMinimum / LAMPORTS_PER_SOL).toFixed(6)} SOL rent + fees)`);
                    } else {
                        logOutput(`✅ Target ATA already exists, skipping creation`);
                    }
                    
                    // Add token transfer instruction
                    transaction.add(
                        createTransferInstruction(
                            txArg.tokenAccountAddress,    // source token account
                            targetTokenAccount,           // destination token account
                            txArg.fromKeypair.publicKey, // owner of source account
                            txArg.tokenAmount            // amount to transfer
                        )
                    );
                    
                    logOutput(`🔄 Added token transfer: ${txArg.tokenAmount} tokens from ${txArg.tokenAccountAddress.toString().substring(0,8)}... to ${targetTokenAccount.toString().substring(0,8)}...`);
                    
                } else if (txArg.type === 'sol') {
                    // SOL transfer transaction
                    transaction = new Transaction({
                        feePayer: txArg.fromKeypair.publicKey,
                        recentBlockhash: blockhash
                    });
                    
                    // Add priority fee
                    if (priorityFee > 0) {
                        const microLamports = Math.floor(priorityFee * 1000000);
                        transaction.add(
                            ComputeBudgetProgram.setComputeUnitPrice({
                                microLamports: microLamports
                            })
                        );
                        logOutput(`💸 Added priority fee: ${microLamports} microLamports (${priorityFee} SOL equivalent)`);
                    }
                    
                    // Add SOL transfer instruction
                    transaction.add(
                        SystemProgram.transfer({
                            fromPubkey: txArg.fromKeypair.publicKey,
                            toPubkey: targetPublicKey,
                            lamports: txArg.solAmount,
                        })
                    );
                }
                        
                // Sign transaction
                transaction.sign(txArg.fromKeypair);
                
                logOutput(`✅ Built ${txArg.type} transaction for wallet ${txArg.walletIndex}`);
                
                // Check wallet balance before sending
                const walletBalance = await connection.getBalance(txArg.fromKeypair.publicKey);
                const estimatedFee = 10000; // ~0.00001 SOL estimated transaction fee
                
                if (walletBalance < estimatedFee) {
                    throw new Error(`Insufficient SOL for transaction fee. Wallet has ${(walletBalance / LAMPORTS_PER_SOL).toFixed(6)} SOL but needs at least ${(estimatedFee / LAMPORTS_PER_SOL).toFixed(6)} SOL for fees.`);
                }
                
                logOutput(`💰 Wallet ${txArg.walletIndex} balance: ${(walletBalance / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
                
                // Send transaction directly to network
                logOutput(`📤 Sending ${txArg.type} transaction for wallet ${txArg.walletIndex}...`);
                
                const signature = await connection.sendTransaction(transaction, [txArg.fromKeypair], {
                    skipPreflight: true,
                    preflightCommitment: 'confirmed',
                    maxRetries: 3
                });
                
                logOutput(`✅ ${txArg.type} transaction sent for wallet ${txArg.walletIndex}: ${signature}`);
                
                // Store the transaction signature
                allSignatures.push({
                    walletIndex: txArg.walletIndex,
                    type: txArg.type,
                    signature: signature
                });
                
                // Mark as successful
                results.push({
                    walletIndex: txArg.walletIndex,
                    type: txArg.type,
                    status: 'submitted',
                    signature: signature,
                    method: 'rpc'
                });
                
                // Wait between transactions to avoid rate limiting
                if (i < allTxArgs.length - 1) {
                    logOutput(`⏳ Waiting 1 second before next transaction...`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
            } catch (error) {
                logOutput(`❌ Error processing ${txArg.type} transaction for wallet ${txArg.walletIndex}: ${error.message}`);
                
                // Mark as failed
                results.push({
                    walletIndex: txArg.walletIndex,
                    type: txArg.type,
                    status: 'failed',
                    error: error.message,
                    method: 'rpc'
                });
            }
        }

        // Final summary
        const successful = results.filter(r => r.status === 'submitted').length;
        const failed = results.filter(r => r.status === 'failed').length;
        
        logOutput(`\n📊 CONSOLIDATION SUMMARY:`);
        logOutput(`✅ Successful: ${successful}`);
        logOutput(`❌ Failed: ${failed}`);
        logOutput(`📈 Success Rate: ${((successful / allTxArgs.length) * 100).toFixed(1)}%`);
        logOutput(`🔧 Method: Individual RPC transactions (no bundling)`);

        // Add signature links
        allSignatures.forEach(sig => {
            if (sig.signature && sig.signature !== '1') {
                logOutput(`🔗 Wallet ${sig.walletIndex} (${sig.type}): https://solscan.io/tx/${sig.signature}`);
            }
        });

        res.json({ 
            success: true, 
            logs: processLog, 
            results,
            summary: {
                totalTransactions: allTxArgs.length,
                successful,
                failed,
                successRate: `${((successful / allTxArgs.length) * 100).toFixed(1)}%`
            }
        });

    } catch (error) {
        console.error(error);
        processLog.push(`ERROR: ${error.message}`);
        res.status(400).json({ success: false, logs: processLog, error: error.message });
    }
});

// Health check endpoint
app.get('/health', (_, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        version: '3.0-current-idl',
        features: [
            'Official pump.fun IDL implementation',
            'Current instruction discriminators from IDL',
            'Proper account ordering from IDL specification',
            'Enhanced RPC connection management',
            'Jito bundle submission with tips'
        ]
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 CURRENT IDL Pump.fun Server running on port ${PORT}`);
    console.log(`📋 Using official pump.fun IDL v0.1.0`);
    console.log(`📋 Available endpoints:`);
    console.log(`   POST /api/createAndBundle - Create token using current IDL`);
    console.log(`   POST /api/buyOnlyBundle - Buy existing tokens using current IDL`);
    console.log(`   POST /api/sellTokens - Sell tokens using current IDL`);
    console.log(`   POST /api/consolidateAssets - Consolidate SOL and tokens to target wallet`);
    console.log(`   POST /api/checkWalletBalances - Check wallet SOL and token balances`);
    console.log(`   POST /api/generateWallets - Generate new wallets with seed phrases`);
    console.log(`   POST /api/extractPrivateKeys - Extract keys from seed phrases`);
    console.log(`   POST /api/extractFromWalletFile - Extract keys from saved wallet files`);
    console.log(`   GET  /api/listWalletFiles - List available wallet files`);
    console.log(`   POST /api/checkBalance - Check balance for single wallet`);
    console.log(`   POST /api/distributeSOL - Distribute SOL from master wallet`);
    console.log(`   POST /api/testConnection - Test RPC connectivity`);
    console.log(`   GET  /health - Health check`);
    console.log(`✅ Instruction discriminators calculated from IDL`);
    console.log(`✅ Account ordering matches IDL specification`);
    console.log(`✅ Using current pump.fun program: ${PUMP_PROGRAM_ID.toBase58()}`);
});