// All your JavaScript code exactly as it was in the original file
// Including all functions and event listeners
console.log('🔧 JavaScript loading...');
let generatedWallets = [];
let extractedKeys = [];

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM fully loaded, initializing forms...');
  
  // Grab the forms
  const mainForm = document.getElementById('mainForm');
  const walletsForm = document.getElementById('walletsForm');
  const distributeForm = document.getElementById('distributeForm');
  const extractForm = document.getElementById('extractForm');
  const sellForm = document.getElementById('sellForm');
  const consolidateForm = document.getElementById('consolidateForm');
  const balancesForm = document.getElementById('balancesForm');
  
  console.log('Form elements found:', {
    mainForm: !!mainForm,
    walletsForm: !!walletsForm,
    distributeForm: !!distributeForm,
    extractForm: !!extractForm,
    sellForm: !!sellForm,
    consolidateForm: !!consolidateForm,
    balancesForm: !!balancesForm
  });
  
  const outputEl = document.getElementById('output');
  const walletsOutputEl = document.getElementById('walletsOutput');
  const distributeOutputEl = document.getElementById('distributeOutput');
  const extractOutputEl = document.getElementById('extractOutput');
  const sellOutputEl = document.getElementById('sellOutput');
  const consolidateOutputEl = document.getElementById('consolidateOutput');
  const balancesOutputEl = document.getElementById('balancesOutput');

  // Main form (Create & Bundle)
  mainForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    outputEl.textContent = "Submitting...\n";

    try {
      const formData = new FormData(mainForm);
      const bundleStrategy = formData.get('bundleStrategy') || 'standard';
      
      let endpoint;
      if (bundleStrategy === 'separated') {
        endpoint = '/api/createAndBundleSeparated';
      } else if (bundleStrategy === 'buyonly') {
        endpoint = '/api/buyOnlyBundle';
      } else {
        endpoint = '/api/createAndBundle';
      }
      
      const resp = await fetch(endpoint, {
        method: 'POST',
        body: formData
      });

      const json = await resp.json();
      if (json.success) {
        json.logs.forEach(line => {
          outputEl.textContent += line + "\n";
        });
      } else {
        outputEl.textContent += "ERROR:\n" + (json.error || 'Unknown Error') + "\n\n";
        if (json.logs) {
          json.logs.forEach(line => {
            outputEl.textContent += line + "\n";
          });
        }
      }
    } catch (err) {
      outputEl.textContent += "Exception: " + err.message + "\n";
    }
  });

  // Generate Wallets form
  if (walletsForm) {
    console.log('Attaching wallet form event listener...');
    walletsForm.addEventListener('submit', async (e) => {
      console.log('Wallet form submitted!');
      e.preventDefault();
      walletsOutputEl.textContent = "Generating wallets...\n";

    try {
      const formData = new FormData(walletsForm);
      const count = parseInt(formData.get('count'));
      
      const resp = await fetch('/api/generateWallets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count })
      });

      const json = await resp.json();
      if (json.success) {
        generatedWallets = json.wallets;
        
        walletsOutputEl.innerHTML = `
          <p><strong>Generated ${json.wallets.length} wallets</strong></p>
          <p>Saved to: ${json.walletFile}</p>
          <table class="table table-sm">
            <thead>
              <tr><th>#</th><th>Public Key</th><th>Seed Phrase</th><th>Actions</th></tr>
            </thead>
            <tbody>
              ${json.wallets.map(w => `
                <tr>
                  <td>${w.id}</td>
                  <td><small>${w.publicKey}</small></td>
                  <td><small>${w.seedPhrase}</small></td>
                  <td>
                    <button class="btn btn-xs btn-outline-primary" onclick="copyToClipboard('${w.publicKey}')">Copy Address</button>
                    <button class="btn btn-xs btn-outline-secondary" onclick="copyToClipboard('${w.seedPhrase}')">Copy Seed</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      } else {
        walletsOutputEl.textContent = "ERROR: " + (json.error || 'Unknown Error');
      }
    } catch (err) {
      console.error('Wallet generation error:', err);
      walletsOutputEl.textContent = "Exception: " + err.message;
    }
  });
  } else {
    console.error('walletsForm element not found!');
  }

  // Distribute SOL form
  distributeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    distributeOutputEl.textContent = "Starting distribution...\n";

    try {
      const formData = new FormData(distributeForm);
      const masterPrivateKey = formData.get('masterPrivateKey');
      const solAmount = parseFloat(formData.get('solAmount'));
      const useChangeNOW = formData.get('useChangeNOW') === 'on';
      const targetWalletsJson = formData.get('targetWallets');
      
      let targetWallets;
      try {
        targetWallets = JSON.parse(targetWalletsJson);
      } catch (e) {
        throw new Error('Invalid JSON in target wallets');
      }
      
      const resp = await fetch('/api/distributeSOL', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          masterPrivateKey,
          targetWallets,
          solAmount,
          useChangeNOW
        })
      });

      const json = await resp.json();
      if (json.success) {
        const successful = json.results.filter(r => r.status === 'success' || r.status === 'sent_to_changenow').length;
        const failed = json.results.filter(r => r.status === 'failed').length;
        
        distributeOutputEl.innerHTML = `
          <p><strong>Distribution Summary:</strong></p>
          <p>Successful: ${successful}</p>
          <p>Failed: ${failed}</p>
          <table class="table table-sm">
            <thead>
              <tr><th>Wallet</th><th>Status</th><th>Signature/Exchange</th><th>Error</th></tr>
            </thead>
            <tbody>
              ${json.results.map(r => `
                <tr>
                  <td>${r.walletId}</td>
                  <td><span class="badge ${r.status === 'success' || r.status === 'sent_to_changenow' ? 'bg-success' : 'bg-danger'}">${r.status}</span></td>
                  <td><small>${r.signature || r.exchangeId || r.sendSignature || '-'}</small></td>
                  <td><small class="text-danger">${r.error || '-'}</small></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      } else {
        distributeOutputEl.textContent = "ERROR: " + (json.error || 'Unknown Error');
      }
    } catch (err) {
      distributeOutputEl.textContent = "Exception: " + err.message;
    }
  });

  // Extract Keys form
  extractForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    extractOutputEl.textContent = "Extracting private keys...\n";

    try {
      const formData = new FormData(extractForm);
      const extractMethod = document.getElementById('extractMethod').value;
      let requestData;
      let endpoint;

      if (extractMethod === 'seedPhrases') {
        const seedPhrasesText = formData.get('seedPhrases');
        const seedPhrases = seedPhrasesText.split('\n').map(s => s.trim()).filter(s => s.length > 0);
        if (seedPhrases.length === 0) {
          extractOutputEl.textContent = "ERROR: Please enter at least one seed phrase";
          return;
        }
        requestData = { seedPhrases };
        endpoint = '/api/extractPrivateKeys';
      } else {
        const walletFile = formData.get('walletFile');
        if (!walletFile) {
          extractOutputEl.textContent = "ERROR: Please select a wallet file";
          return;
        }
        requestData = { walletFile };
        endpoint = '/api/extractFromWalletFile';
      }
      
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const json = await resp.json();
      if (json.success) {
        // Store extracted keys for later use
        extractedKeys = json.results.filter(r => !r.error);
        
        extractOutputEl.innerHTML = `
          <p><strong>Extracted ${json.results.length} wallets:</strong></p>
          ${json.results.map(r => {
            if (r.error) {
              return `<div class="alert alert-danger">Error for "${r.seedPhrase ? r.seedPhrase.substring(0, 20) + '...' : 'wallet'}": ${r.error}</div>`;
            }
            return `
              <div class="card mb-3">
                <div class="card-body">
                  <h6>Public Key: <small>${r.publicKey}</small></h6>
                  <p><strong>Seed:</strong> <small>${r.seedPhrase}</small></p>
                  <p><strong>Private Key (Base58):</strong> <small>${r.privateKey.base58}</small></p>
                  <p><strong>Secret Key (Base58):</strong> <small>${r.secretKey.base58}</small></p>
                  <button class="btn btn-sm btn-outline-primary" onclick="copyToClipboard('${r.privateKey.base58}')">Copy Private Key</button>
                  <button class="btn btn-sm btn-outline-secondary" onclick="copyToClipboard('${r.secretKey.base58}')">Copy Secret Key</button>
                </div>
              </div>
            `;
          }).join('')}
        `;
      } else {
        extractOutputEl.textContent = "ERROR: " + (json.error || 'Unknown Error');
      }
    } catch (err) {
      extractOutputEl.textContent = "Exception: " + err.message;
    }
  });

  // Sell Tokens form
  if (sellForm) {
    sellForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      // Allow parallel sell transactions - button remains enabled
      
      const timestamp = new Date().toLocaleTimeString();
      sellOutputEl.textContent = `[${timestamp}] Starting sell process...\n`;

    try {
      const formData = new FormData(sellForm);
      const tokenMint = formData.get('tokenMint');
      const sellWalletsText = formData.get('sellWallets');
      const slippage = parseInt(formData.get('slippage'));
      const priorityFee = parseFloat(formData.get('priorityFee'));
      const bundleSize = parseInt(formData.get('bundleSize'));
      const simulateFirst = formData.get('simulateFirst') === 'on';
      
      // Parse sell wallets
      let sellWallets;
      try {
        const lines = sellWalletsText.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
        sellWallets = lines.map(line => {
          const parts = line.split(',');
          if (parts.length !== 2) {
            throw new Error(`Invalid format in line: ${line}`);
          }
          return {
            privateKey: parts[0].trim(),
            percentage: parseFloat(parts[1].trim())
          };
        });
      } catch (e) {
        throw new Error('Invalid sell wallets format: ' + e.message);
      }
      
      if (sellWallets.length === 0) {
        throw new Error('No valid sell wallets found');
      }
      
      const resp = await fetch('/api/sellTokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenMint,
          sellWallets,
          slippage,
          priorityFee,
          bundleSize,
          simulateFirst
        })
      });

      const json = await resp.json();
      if (json.success) {
        sellOutputEl.innerHTML += `
          <div class=\"alert alert-success\">
            <h5>[${timestamp}] Sell Process Completed!</h5>
            <p><strong>Success Rate:</strong> ${json.summary.successRate}</p>
            <p><strong>Successful:</strong> ${json.summary.successful}</p>
            <p><strong>Failed:</strong> ${json.summary.failed}</p>
          </div>
          <div class=\"mt-3\">
            <h6>Transaction Results:</h6>
            <table class=\"table table-sm\">
              <thead>
                <tr><th>Wallet</th><th>Address</th><th>%</th><th>Status</th><th>Signature</th></tr>
              </thead>
              <tbody>
                ${json.results.map(r => `
                  <tr>
                    <td>${r.walletIndex}</td>
                    <td><small>${r.publicKey.substring(0, 10)}...</small></td>
                    <td>${r.percentage}%</td>
                    <td><span class=\"badge ${r.status === 'submitted' ? 'bg-success' : 'bg-danger'}\">${r.status}</span></td>
                    <td>
                      ${r.signature ? 
                        `<a href=\"https://solscan.io/tx/${r.signature}\" target=\"_blank\" class=\"btn btn-xs btn-outline-primary\">View</a>` : 
                        '-'}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div class=\"mt-3\">
            <h6>Process Log:</h6>
            <pre class=\"bg-light p-2\" style=\"max-height:200px; overflow:auto; font-size:12px;\">${json.logs.join('\n')}</pre>
          </div>
        `;
      } else {
        sellOutputEl.innerHTML += `
          <div class=\"alert alert-danger\">
            <strong>[${timestamp}] Error:</strong> ${json.error || 'Unknown Error'}
          </div>
          ${json.logs ? `<pre class=\"bg-light p-2 mt-2\">${json.logs.join('\n')}</pre>` : ''}
        `;
      }
    } catch (err) {
      console.error('Sell form error:', err);
      sellOutputEl.innerHTML += `
        <div class=\"alert alert-danger\">
          <strong>[${timestamp}] Exception:</strong> ${err.message}
        </div>
      `;
    } finally {
      // Button remains enabled for parallel transactions
    }
  });
  } else {
    console.error('❌ sellForm element not found!');
  }

  // Consolidate Assets form
  if (consolidateForm) {
    consolidateForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      // Add submit button state management
      const submitBtn = consolidateForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing...';
      }
      
      consolidateOutputEl.textContent = "Starting consolidation process...\n";

    try {
      const formData = new FormData(consolidateForm);
      const tokenMint = formData.get('tokenMint');
      const targetAddress = formData.get('targetAddress');
      const consolidateWalletsText = formData.get('consolidateWallets');
      const priorityFee = parseFloat(formData.get('priorityFee'));
      const bundleSize = parseInt(formData.get('bundleSize'));
      const consolidateSOL = formData.get('consolidateSOL') === 'on';
      const consolidateTokens = formData.get('consolidateTokens') === 'on';
      
      // Parse consolidate wallets
      let consolidateWallets;
      try {
        const lines = consolidateWalletsText.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
        consolidateWallets = lines.map(line => {
          const privateKey = line.trim();
          if (!privateKey) {
            throw new Error(`Empty private key line`);
          }
          return { privateKey };
        });
      } catch (e) {
        throw new Error('Invalid consolidate wallets format: ' + e.message);
      }
      
      if (consolidateWallets.length === 0) {
        throw new Error('No valid consolidate wallets found');
      }
      
      const resp = await fetch('/api/consolidateAssets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenMint,
          targetAddress,
          consolidateWallets,
          priorityFee,
          bundleSize,
          consolidateSOL,
          consolidateTokens
        })
      });

      const json = await resp.json();
      if (json.success) {
        consolidateOutputEl.innerHTML = `
          <div class="alert alert-success">
            <h5>Consolidation Process Completed!</h5>
            <p><strong>Success Rate:</strong> ${json.summary.successRate}</p>
            <p><strong>Successful:</strong> ${json.summary.successful}</p>
            <p><strong>Failed:</strong> ${json.summary.failed}</p>
          </div>
          <div class="mt-3">
            <h6>Transaction Results:</h6>
            <table class="table table-sm">
              <thead>
                <tr><th>Wallet</th><th>Type</th><th>Status</th><th>Signature</th></tr>
              </thead>
              <tbody>
                ${json.results.map(r => `
                  <tr>
                    <td>Wallet ${r.walletIndex}</td>
                    <td><span class="badge bg-secondary">${r.type}</span></td>
                    <td><span class="badge ${r.status === 'submitted' ? 'bg-success' : 'bg-danger'}">${r.status}</span></td>
                    <td>
                      ${r.signature ? 
                        `<a href="https://solscan.io/tx/${r.signature}" target="_blank" class="btn btn-xs btn-outline-primary">View</a>` : 
                        '-'}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div class="mt-3">
            <h6>Process Log:</h6>
            <pre class=\"bg-light p-2\" style=\"max-height:200px; overflow:auto; font-size:12px;\">${json.logs.join('\n')}</pre>
          </div>
        `;
      } else {
        consolidateOutputEl.innerHTML = `
          <div class="alert alert-danger">
            <strong>Error:</strong> ${json.error || 'Unknown Error'}
          </div>
          ${json.logs ? `<pre class=\"bg-light p-2 mt-2\">${json.logs.join('\n')}</pre>` : ''}
        `;
      }
    } catch (err) {
      console.error('Consolidate form error:', err);
      consolidateOutputEl.innerHTML = `
        <div class="alert alert-danger">
          <strong>Exception:</strong> ${err.message}
        </div>
      `;
    } finally {
      // Restore submit button
      const submitBtn = consolidateForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = ' Consolidate Assets';
      }
    }
  });
  } else {
    console.error('consolidateForm element not found!');
  }

  // Check Balances form
  if (balancesForm) {
    balancesForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      // Add submit button state management
      const submitBtn = balancesForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Checking...';
      }
      
      balancesOutputEl.textContent = "Checking wallet balances...\n";

    try {
      const formData = new FormData(balancesForm);
      const tokenMint = formData.get('tokenMint')?.trim() || null;
      const walletAddressesText = formData.get('walletAddresses');
      const showPrivateKeys = formData.get('showPrivateKeys') === 'on';
      
      // Parse wallet addresses/keys
      let walletAddresses;
      try {
        const lines = walletAddressesText.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
        walletAddresses = lines.map(line => line.trim());
      } catch (e) {
        throw new Error('Invalid wallet addresses format: ' + e.message);
      }
      
      if (walletAddresses.length === 0) {
        throw new Error('No valid wallet addresses found');
      }
      
      const resp = await fetch('/api/checkWalletBalances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddresses,
          tokenMint,
          showPrivateKeys
        })
      });

      const json = await resp.json();
      if (json.success) {
        let totalSOL = 0;
        let totalTokens = 0;
        
        // Calculate totals
        json.balances.forEach(balance => {
          if (balance.solBalance !== null) totalSOL += balance.solBalance;
          if (balance.tokenBalance !== null) totalTokens += balance.tokenBalance;
        });
        
        balancesOutputEl.innerHTML = `
          <div class="alert alert-success">
            <h5>Balance Check Completed!</h5>
            <p><strong>Wallets Checked:</strong> ${json.balances.length}</p>
            <p><strong>Total SOL:</strong> ${totalSOL.toFixed(6)} SOL</p>
            ${tokenMint ? `<p><strong>Total Tokens:</strong> ${totalTokens.toLocaleString()} tokens</p>` : ''}
          </div>
          <div class="mt-3">
            <h6>Individual Balances:</h6>
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Address</th>
                  <th>SOL Balance</th>
                  ${tokenMint ? '<th>Token Balance</th>' : ''}
                  ${showPrivateKeys ? '<th>Private Key</th>' : ''}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${json.balances.map((balance, index) => `
                  <tr>
                    <td>${index + 1}</td>
                    <td><small>${balance.address}</small></td>
                    <td><strong>${balance.solBalance !== null ? balance.solBalance.toFixed(6) + ' SOL' : 'Error'}</strong></td>
                    ${tokenMint ? `<td>${balance.tokenBalance !== null ? balance.tokenBalance.toLocaleString() + ' tokens' : 'Error'}</td>` : ''}
                    ${showPrivateKeys ? `<td><small>${balance.privateKey || 'N/A'}</small></td>` : ''}
                    <td>
                      <button class="btn btn-xs btn-outline-primary" onclick="copyToClipboard('${balance.address}')">Copy Address</button>
                      ${balance.privateKey ? `<button class="btn btn-xs btn-outline-secondary" onclick="copyToClipboard('${balance.privateKey}')">Copy Key</button>` : ''}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      } else {
        balancesOutputEl.innerHTML = `
          <div class="alert alert-danger">
            <strong>Error:</strong> ${json.error || 'Unknown Error'}
          </div>
        `;
      }
    } catch (err) {
      console.error('Balances form error:', err);
      balancesOutputEl.innerHTML = `
        <div class="alert alert-danger">
          <strong>Exception:</strong> ${err.message}
        </div>
      `;
    } finally {
      // Restore submit button
      const submitBtn = balancesForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Check Balances';
      }
    }
  });
  } else {
    console.error('balancesForm element not found!');
  }

    // Initialize form on page load
    if (typeof toggleStrategyFields === 'function') {
      toggleStrategyFields(); // Set initial form state
    }

}); // End of DOMContentLoaded event

// Create+Buy+Sell Function - Executes create+bundle then automatically sells 100%
async function createBuyAndSell() {
  const timestamp = new Date().toLocaleTimeString();
  const outputEl = document.getElementById('output');
  
  try {
    // Disable the button during processing
    const createBuySellBtn = document.getElementById('createBuySellButton');
    createBuySellBtn.disabled = true;
    createBuySellBtn.textContent = 'Processing...';
    
    outputEl.textContent = `[${timestamp}] Starting Create+Buy+Sell workflow...\n`;
    
    // Step 1: Execute the create+bundle process
    outputEl.textContent += `[${timestamp}] Step 1: Creating token and bundling buys...\n`;
    
    const mainForm = document.getElementById('mainForm');
    const formData = new FormData(mainForm);
    
    // Determine endpoint based on bundle strategy
    const bundleStrategy = formData.get('bundleStrategy');
    let endpoint;
    
    if (bundleStrategy === 'separated') {
      endpoint = '/api/createAndBundleSeparated';
    } else if (bundleStrategy === 'buyonly') {
      endpoint = '/api/buyOnlyBundle';
    } else {
      endpoint = '/api/createAndBundle';
    }
    
    outputEl.textContent += `[${timestamp}] Submitting to ${endpoint}...\n`;
    
    // Submit create+bundle form
    const createResponse = await fetch(endpoint, {
      method: 'POST',
      body: formData
    });
    
    const createResult = await createResponse.json();
    
    if (!createResult.success) {
      throw new Error(`Create+Bundle failed: ${createResult.error || 'Unknown error'}`);
    }
    
    // Determine token mint address based on bundle strategy
    let tokenMintAddress;
    
    if (bundleStrategy === 'buyonly') {
      // For buy-only bundles, use the existing token mint from the form
      tokenMintAddress = formData.get('tokenMint');
      outputEl.textContent += `[${timestamp}] Step 1 Complete: Buy-only bundle executed!\n`;
      outputEl.textContent += `[${timestamp}] Using existing token mint: ${tokenMintAddress}\n`;
    } else {
      // For create+bundle strategies, use the newly created token mint
      tokenMintAddress = createResult.mintAddress;
      outputEl.textContent += `[${timestamp}] Step 1 Complete: Token created successfully!\n`;
      outputEl.textContent += `[${timestamp}] New token mint: ${tokenMintAddress}\n`;
    }
    
    if (!tokenMintAddress) {
      throw new Error(`No token mint address available. ${bundleStrategy === 'buyonly' ? 'Please ensure token mint is specified in the form.' : 'Token creation may have failed.'}`);
    }
    
    // Step 2: Extract buyer wallets and convert to sell format
    outputEl.textContent += `[${timestamp}] Step 2: Preparing 100% sell for all buyers...\n`;
    
    const buyersText = formData.get('buyers');
    if (!buyersText || buyersText.trim() === '') {
      throw new Error('No buyers found to convert to sellers');
    }
    
    // Convert buyer format (privateKey, solAmount) to sell format (privateKey, 100%)
    const buyerLines = buyersText.trim().split('\n');
    const sellWalletsArray = [];
    
    for (const line of buyerLines) {
      if (line.trim()) {
        const parts = line.split(',');
        if (parts.length >= 1) {
          const privateKey = parts[0].trim();
          sellWalletsArray.push({
            privateKey: privateKey,
            percentage: 100 // 100% sell
          });
        }
      }
    }
    
    if (sellWalletsArray.length === 0) {
      throw new Error('No valid buyer wallets found to convert to sellers');
    }
    
    outputEl.textContent += `[${timestamp}] 👥 Converted ${sellWalletsArray.length} buyers to 100% sellers\n`;
    
    // Step 3: Execute automatic sell with aggressive retry logic
    outputEl.textContent += `[${timestamp}] Step 3: Executing 100% sell with retry logic (target: 1-5 blocks after buy)...\n`;
    
    // Get priority fee from the form
    const formPriorityFee = parseFloat(formData.get('priorityFee')) || 0.001;
    const sellPriorityFee = Math.max(formPriorityFee, 0.005); // Use form value or minimum 0.005 for fast sells
    
    const sellPayload = {
      tokenMint: tokenMintAddress,
      sellWallets: sellWalletsArray, // Send as array of objects
      slippage: 99, // Maximum slippage for fast execution
      priorityFee: sellPriorityFee, // Use form priority fee (with minimum for sells)
      bundleSize: 5, // Default bundle size
      simulateFirst: false // No simulation for automatic sell
    };
    
    outputEl.textContent += `[${timestamp}] Using priority fee: ${sellPriorityFee} SOL (form: ${formPriorityFee}, min for sells: 0.005)\n`;
    
    // Aggressive retry logic - keep trying until successful
    let sellAttempt = 0;
    let sellResult = null;
    const maxSellAttempts = 20; // Maximum attempts (should succeed within 1-5 blocks)
    const retryDelayMs = 500; // 0.5 second between attempts
    
    outputEl.textContent += `[${timestamp}] Starting aggressive sell retry logic...\n`;
    
    while (sellAttempt < maxSellAttempts) {
      sellAttempt++;
      const attemptTimestamp = new Date().toLocaleTimeString();
      
      try {
        outputEl.textContent += `[${attemptTimestamp}] Sell attempt ${sellAttempt}/${maxSellAttempts}...\n`;
        
        const sellResponse = await fetch('/api/sellTokens', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sellPayload)
        });
        
        sellResult = await sellResponse.json();
        
        if (sellResult.success) {
          outputEl.textContent += `[${attemptTimestamp}] SELL SUCCESSFUL on attempt ${sellAttempt}!\n`;
          break; // Success! Exit retry loop
        } else {
          outputEl.textContent += `[${attemptTimestamp}] Sell attempt ${sellAttempt} failed: ${sellResult.error || 'Unknown error'}\n`;
          
          // If this is not the last attempt, wait and retry
          if (sellAttempt < maxSellAttempts) {
            outputEl.textContent += `[${attemptTimestamp}] ⏳ Waiting ${retryDelayMs}ms before retry...\n`;
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
          }
        }
        
      } catch (fetchError) {
        outputEl.textContent += `[${attemptTimestamp}] Sell attempt ${sellAttempt} network error: ${fetchError.message}\n`;
        
        // If this is not the last attempt, wait and retry
        if (sellAttempt < maxSellAttempts) {
          outputEl.textContent += `[${attemptTimestamp}] ⏳ Waiting ${retryDelayMs}ms before retry...\n`;
          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        }
      }
    }
    
    // Check final result
    if (!sellResult || !sellResult.success) {
      throw new Error(`All ${maxSellAttempts} sell attempts failed. Last error: ${sellResult?.error || 'Network error'}`);
    }
    
    // Display final results
    outputEl.textContent += `[${timestamp}] CREATE+BUY+SELL WORKFLOW COMPLETED!\n`;
    outputEl.textContent += `[${timestamp}] SELL SUMMARY:\n`;
    outputEl.textContent += `[${timestamp}] Successful: ${sellResult.summary.successful}\n`;
    outputEl.textContent += `[${timestamp}] Failed: ${sellResult.summary.failed}\n`;
    outputEl.textContent += `[${timestamp}] Success Rate: ${sellResult.summary.successRate}\n`;
    outputEl.textContent += `[${timestamp}] Check Solscan for transaction details\n`;
    
    // Auto-populate token info in the UI
    if (tokenMintAddress) {
      const createdTokenMintEl = document.getElementById('createdTokenMint');
      const mainTokenMintEl = document.getElementById('mainTokenMint');
      const quickBuyTokenMintEl = document.getElementById('quickBuyTokenMint');
      
      if (createdTokenMintEl) createdTokenMintEl.value = tokenMintAddress;
      if (mainTokenMintEl) mainTokenMintEl.value = tokenMintAddress;
      if (quickBuyTokenMintEl) quickBuyTokenMintEl.value = tokenMintAddress;
      
      // Show the token info section only for newly created tokens
      if (bundleStrategy !== 'buyonly') {
        const tokenInfoEl = document.getElementById('createdTokenInfo');
        if (tokenInfoEl) tokenInfoEl.style.display = 'block';
      }
    }
    
  } catch (error) {
    console.error('Create+Buy+Sell error:', error);
    outputEl.textContent += `[${timestamp}] ERROR: ${error.message}\n`;
    alert(`Create+Buy+Sell failed: ${error.message}`);
  } finally {
    // Re-enable the button
    const createBuySellBtn = document.getElementById('createBuySellButton');
    createBuySellBtn.disabled = false;
    createBuySellBtn.textContent = ' Create+Buy+Sell';
  }
}

// Helper functions
function copyToClipboard(elementIdOrText) {
  let textToCopy;
  if (typeof elementIdOrText === 'string' && document.getElementById(elementIdOrText)) {
    // It's an element ID
    textToCopy = document.getElementById(elementIdOrText).value;
  } else {
    // It's direct text
    textToCopy = elementIdOrText;
  }
  
  navigator.clipboard.writeText(textToCopy).then(() => {
    // Could show a toast notification here
    console.log('Copied to clipboard:', textToCopy);
  });
}

// Buyers field population functions
function populateBuyersFromGenerated() {
  if (generatedWallets.length === 0) {
    alert('No generated wallets available. Generate wallets first in the "Generate Wallets" tab.');
    return;
  }
  
  // Get the SOL amount from distribute form (default to 0.01 if not set)
  const distributeAmountInput = document.querySelector('input[name="solAmount"]');
  const defaultAmount = distributeAmountInput ? distributeAmountInput.value || '0.01' : '0.01';
  
  // Ask user for the amount to use for each wallet
  const amount = prompt(`Enter SOL amount per wallet (default: ${defaultAmount}):`, defaultAmount);
  if (amount === null) return; // User cancelled
  
  const solAmount = parseFloat(amount);
  if (isNaN(solAmount) || solAmount <= 0) {
    alert('Invalid SOL amount');
    return;
  }
  
  // Format: privateKey, amount per line
  const buyersData = generatedWallets.map(wallet => 
    `${wallet.privateKey}, ${solAmount}`
  ).join('\n');
  
  document.getElementById('buyersTextarea').value = buyersData;
  
  alert(`Populated buyers field with ${generatedWallets.length} wallets at ${solAmount} SOL each`);
}

function populateBuyersFromDistribute() {
  const distributeForm = document.getElementById('distributeForm');
  const targetWalletsTextarea = distributeForm.querySelector('textarea[name="targetWallets"]');
  const solAmountInput = distributeForm.querySelector('input[name="solAmount"]');
  
  if (!targetWalletsTextarea.value.trim()) {
    alert('No target wallets found in Distribute tab. Please set up wallets there first.');
    return;
  }
  
  if (!solAmountInput.value) {
    alert('No SOL amount set in Distribute tab. Please set the amount there first.');
    return;
  }
  
  try {
    const targetWallets = JSON.parse(targetWalletsTextarea.value);
    const solAmount = parseFloat(solAmountInput.value);
    
    if (!Array.isArray(targetWallets) || targetWallets.length === 0) {
      alert('Invalid target wallets format in Distribute tab');
      return;
    }
    
    // We need to get the private keys for these wallets
    // Check if we have them in generatedWallets
    const buyersData = [];
    let missingKeys = 0;
    
    for (const wallet of targetWallets) {
      const generatedWallet = generatedWallets.find(gw => gw.publicKey === wallet.publicKey);
      if (generatedWallet) {
        buyersData.push(`${generatedWallet.privateKey}, ${solAmount}`);
      } else {
        // If we don't have the private key, we'll need to ask user or skip
        buyersData.push(`# Missing private key for ${wallet.publicKey}, ${solAmount}`);
        missingKeys++;
      }
    }
    
    document.getElementById('buyersTextarea').value = buyersData.join('\n');
    
    let message = `Populated buyers field with ${targetWallets.length} wallets at ${solAmount} SOL each`;
    if (missingKeys > 0) {
      message += `\n\nWarning: ${missingKeys} wallets are missing private keys (marked with #). `;
      message += 'You may need to extract private keys from seed phrases or regenerate these wallets.';
    }
    
    alert(message);
    
  } catch (error) {
    alert('Error parsing distribute settings: ' + error.message);
  }
}

function populateBuyersFromExtracted() {
  if (extractedKeys.length === 0) {
    alert('No extracted keys available. Extract private keys first in the "Extract Keys" tab.');
    return;
  }
  
  // Get the SOL amount from distribute form (default to 0.01 if not set)
  const distributeAmountInput = document.querySelector('input[name="solAmount"]');
  const defaultAmount = distributeAmountInput ? distributeAmountInput.value || '0.01' : '0.01';
  
  // Ask user for the amount to use for each wallet
  const amount = prompt(`Enter SOL amount per wallet (default: ${defaultAmount}):`, defaultAmount);
  if (amount === null) return; // User cancelled
  
  const solAmount = parseFloat(amount);
  if (isNaN(solAmount) || solAmount <= 0) {
    alert('Invalid SOL amount');
    return;
  }
  
  // Format: privateKey, amount per line
  const buyersData = extractedKeys.map(keyData => 
    `${keyData.privateKey.base58}, ${solAmount}`
  ).join('\n');
  
  document.getElementById('buyersTextarea').value = buyersData;
  
  alert(`Populated buyers field with ${extractedKeys.length} extracted wallets at ${solAmount} SOL each`);
}

function clearBuyers() {
  if (confirm('Clear all buyers data?')) {
    document.getElementById('buyersTextarea').value = '';
  }
}

async function populateBuyersFromWalletFile() {
  try {
    // Load available wallet files
    const response = await fetch('/api/listWalletFiles');
    const data = await response.json();
    
    if (!data.success || data.files.length === 0) {
      alert('No wallet files found. Generate wallets first in the "Generate Wallets" tab.');
      return;
    }
    
    // Create selection dialog
    let fileOptions = 'Select a wallet file to load:\n\n';
    data.files.forEach((file, index) => {
      fileOptions += `${index + 1}. ${file.filename} (${file.count} wallets, ${file.createdAt})\n`;
    });
    
    // Ask for SOL amount per wallet
    const distributeAmountInput = document.querySelector('input[name="solAmount"]');
    const defaultAmount = distributeAmountInput ? distributeAmountInput.value || '0.01' : '0.01';
    
    const amountInput = prompt(`Enter SOL amount per wallet (default: ${defaultAmount}):`, defaultAmount);
    if (!amountInput) return;
    
    const solAmount = parseFloat(amountInput);
    if (isNaN(solAmount) || solAmount <= 0) {
      alert('Invalid SOL amount. Please enter a positive number.');
      return;
    }
    
    const selection = prompt(fileOptions + '\nEnter the number of the file to load:');
    if (!selection) return;
    
    const fileIndex = parseInt(selection) - 1;
    if (fileIndex < 0 || fileIndex >= data.files.length) {
      alert('Invalid selection. Please enter a valid file number.');
      return;
    }
    
    const selectedFile = data.files[fileIndex];
    
    // Extract keys from the selected wallet file
    const extractResponse = await fetch('/api/extractFromWalletFile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletFile: selectedFile.filename })
    });
    
    const extractData = await extractResponse.json();
    
    if (!extractData.success) {
      alert('Error loading wallet file: ' + (extractData.error || 'Unknown error'));
      return;
    }
    
    // Extract private keys and format for buyers (with SOL amount)
    const buyersData = extractData.results
      .filter(r => !r.error)
      .map(r => `${r.privateKey.base58}, ${solAmount}`);
    
    if (buyersData.length === 0) {
      alert('No valid wallets found in the selected file.');
      return;
    }
    
    document.getElementById('buyersTextarea').value = buyersData.join('\n');
    alert(`Successfully loaded ${buyersData.length} wallets from ${selectedFile.filename} with ${solAmount} SOL each`);
    
  } catch (error) {
    console.error('Error loading wallet file:', error);
    alert('Error loading wallet file: ' + error.message);
  }
}

// Sell wallets population functions
function populateSellWalletsFromGenerated() {
  if (generatedWallets.length === 0) {
    alert('No generated wallets available. Generate wallets first in the \"Generate Wallets\" tab.');
    return;
  }
  
  const sellForm = document.getElementById('sellForm');
  const defaultPercentage = sellForm.querySelector('input[name=\"defaultSellPercentage\"]').value || '100';
  
  const percentage = prompt(`Enter sell percentage for all wallets (default: ${defaultPercentage}%):`, defaultPercentage);
  if (percentage === null) return;
  
  const sellPercentage = parseFloat(percentage);
  if (isNaN(sellPercentage) || sellPercentage < 1 || sellPercentage > 100) {
    alert('Invalid percentage. Must be 1-100');
    return;
  }
  
  const sellWalletsData = generatedWallets.map(wallet => 
    `${wallet.privateKey}, ${sellPercentage}`
  ).join('\n');
  
  document.getElementById('sellWalletsTextarea').value = sellWalletsData;
  alert(`Populated sell wallets with ${generatedWallets.length} wallets at ${sellPercentage}% each`);
}

function populateSellWalletsFromBuyers() {
  const buyersTextarea = document.getElementById('buyersTextarea');
  if (!buyersTextarea.value.trim()) {
    alert('No buyers data found. Please populate the buyers field first in the \"Create Token & Bundle\" tab.');
    return;
  }
  
  const sellForm = document.getElementById('sellForm');
  const defaultPercentage = sellForm.querySelector('input[name=\"defaultSellPercentage\"]').value || '100';
  
  const percentage = prompt(`Enter sell percentage for all wallets (default: ${defaultPercentage}%):`, defaultPercentage);
  if (percentage === null) return;
  
  const sellPercentage = parseFloat(percentage);
  if (isNaN(sellPercentage) || sellPercentage < 1 || sellPercentage > 100) {
    alert('Invalid percentage. Must be 1-100');
    return;
  }
  
  // Auto-populate token mint if available from create+bundle result
  const createdTokenMint = document.getElementById('createdTokenMint');
  const tokenMintField = sellForm.querySelector('input[name="tokenMint"]');
  if (createdTokenMint && createdTokenMint.value && tokenMintField) {
    tokenMintField.value = createdTokenMint.value;
  }
  
  try {
    const buyersLines = buyersTextarea.value.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
    const sellWalletsData = buyersLines.map(line => {
      const parts = line.split(',');
      if (parts.length >= 1) {
        const privateKey = parts[0].trim();
        return `${privateKey}, ${sellPercentage}`;
      }
      return null;
    }).filter(line => line !== null).join('\n');
    
    document.getElementById('sellWalletsTextarea').value = sellWalletsData;
    
    let message = `Populated sell wallets from buyers (${buyersLines.length} wallets at ${sellPercentage}% each)`;
    if (createdTokenMint && createdTokenMint.value && tokenMintField) {
      message += `\nAlso populated token mint: ${createdTokenMint.value}`;
    }
    alert(message);
  } catch (error) {
    alert('Error parsing buyers data: ' + error.message);
  }
}

function populateSellWalletsFromExtracted() {
  if (extractedKeys.length === 0) {
    alert('No extracted keys available. Extract private keys first in the \"Extract Keys\" tab.');
    return;
  }
  
  const sellForm = document.getElementById('sellForm');
  const defaultPercentage = sellForm.querySelector('input[name=\"defaultSellPercentage\"]').value || '100';
  
  const percentage = prompt(`Enter sell percentage for all wallets (default: ${defaultPercentage}%):`, defaultPercentage);
  if (percentage === null) return;
  
  const sellPercentage = parseFloat(percentage);
  if (isNaN(sellPercentage) || sellPercentage < 1 || sellPercentage > 100) {
    alert('Invalid percentage. Must be 1-100');
    return;
  }
  
  const sellWalletsData = extractedKeys.map(keyData => 
    `${keyData.privateKey.base58}, ${sellPercentage}`
  ).join('\n');
  
  document.getElementById('sellWalletsTextarea').value = sellWalletsData;
  alert(`Populated sell wallets with ${extractedKeys.length} extracted wallets at ${sellPercentage}% each`);
}

function clearSellWallets() {
  if (confirm('Clear all sell wallets data?')) {
    document.getElementById('sellWalletsTextarea').value = '';
  }
}

async function populateSellWalletsFromWalletFile() {
  try {
    // Load available wallet files
    const response = await fetch('/api/listWalletFiles');
    const data = await response.json();
    
    if (!data.success || data.files.length === 0) {
      alert('No wallet files found. Generate wallets first in the "Generate Wallets" tab.');
      return;
    }
    
    // Create selection dialog
    let fileOptions = 'Select a wallet file to load:\n\n';
    data.files.forEach((file, index) => {
      fileOptions += `${index + 1}. ${file.filename} (${file.count} wallets, ${file.createdAt})\n`;
    });
    
    // Ask for sell percentage
    const percentageInput = prompt('Enter the sell percentage (1-100) to apply to all wallets:', '100');
    if (!percentageInput) return;
    
    const percentage = parseInt(percentageInput);
    if (isNaN(percentage) || percentage < 1 || percentage > 100) {
      alert('Invalid percentage. Please enter a number between 1 and 100.');
      return;
    }
    
    const selection = prompt(fileOptions + '\nEnter the number of the file to load:');
    if (!selection) return;
    
    const fileIndex = parseInt(selection) - 1;
    if (fileIndex < 0 || fileIndex >= data.files.length) {
      alert('Invalid selection. Please enter a valid file number.');
      return;
    }
    
    const selectedFile = data.files[fileIndex];
    
    // Extract keys from the selected wallet file
    const extractResponse = await fetch('/api/extractFromWalletFile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletFile: selectedFile.filename })
    });
    
    const extractData = await extractResponse.json();
    
    if (!extractData.success) {
      alert('Error loading wallet file: ' + (extractData.error || 'Unknown error'));
      return;
    }
    
    // Extract private keys and format for sell (with percentage)
    const sellWallets = extractData.results
      .filter(r => !r.error)
      .map(r => `${r.privateKey.base58}, ${percentage}`);
    
    if (sellWallets.length === 0) {
      alert('No valid wallets found in the selected file.');
      return;
    }
    
    document.getElementById('sellWalletsTextarea').value = sellWallets.join('\n');
    alert(`Successfully loaded ${sellWallets.length} wallets from ${selectedFile.filename} with ${percentage}% sell percentage`);
    
  } catch (error) {
    console.error('Error loading wallet file:', error);
    alert('Error loading wallet file: ' + error.message);
  }
}

function loadFromGenerated() {
  if (generatedWallets.length === 0) {
    alert('No generated wallets available. Generate wallets first.');
    return;
  }
  
  const walletData = generatedWallets.map(w => ({
    id: w.id,
    publicKey: w.publicKey
  }));
  
  document.querySelector('textarea[name="targetWallets"]').value = JSON.stringify(walletData, null, 2);
}

async function loadWalletFile() {
  try {
    // Load available wallet files using the correct endpoint
    const response = await fetch('/api/listWalletFiles');
    const data = await response.json();
    
    if (!data.success || data.files.length === 0) {
      alert('No wallet files found. Generate wallets first in the "Generate Wallets" tab.');
      return;
    }
    
    // Create selection dialog
    let fileOptions = 'Select a wallet file to load:\n\n';
    data.files.forEach((file, index) => {
      fileOptions += `${index + 1}. ${file.filename} (${file.count} wallets, ${file.createdAt})\n`;
    });
    
    const selection = prompt(fileOptions + '\nEnter the number of the file to load:');
    if (!selection) return;
    
    const fileIndex = parseInt(selection) - 1;
    if (fileIndex < 0 || fileIndex >= data.files.length) {
      alert('Invalid selection. Please enter a valid file number.');
      return;
    }
    
    const selectedFile = data.files[fileIndex];
    
    // Extract keys from the selected wallet file
    const extractResponse = await fetch('/api/extractFromWalletFile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletFile: selectedFile.filename })
    });
    
    const extractData = await extractResponse.json();
    
    if (!extractData.success) {
      alert('Error loading wallet file: ' + (extractData.error || 'Unknown error'));
      return;
    }
    
    // Convert to the format needed for distribution (id, publicKey)
    const walletData = extractData.results
      .filter(r => !r.error)
      .map((r, index) => ({
        id: index + 1,
        publicKey: r.publicKey
      }));
    
    if (walletData.length === 0) {
      alert('No valid wallets found in the selected file.');
      return;
    }
    
    document.querySelector('textarea[name="targetWallets"]').value = JSON.stringify(walletData, null, 2);
    alert(`Successfully loaded ${walletData.length} wallets from ${selectedFile.filename}`);
    
  } catch (error) {
    console.error('Error loading wallet file:', error);
    alert('Error loading wallet file: ' + error.message);
  }
}

// Consolidate wallets population functions
function populateConsolidateWalletsFromGenerated() {
  if (generatedWallets.length === 0) {
    alert('No generated wallets available. Generate wallets first in the "Generate Wallets" tab.');
    return;
  }
  
  const consolidateData = generatedWallets.map(wallet => wallet.privateKey).join('\n');
  document.getElementById('consolidateWalletsTextarea').value = consolidateData;
  alert(`Populated consolidate wallets with ${generatedWallets.length} wallets`);
}

function populateConsolidateWalletsFromBuyers() {
  const buyersTextarea = document.getElementById('buyersTextarea');
  if (!buyersTextarea.value.trim()) {
    alert('No buyers data found. Please populate the buyers field first in the "Create Token & Bundle" tab.');
    return;
  }
  
  // Auto-populate token mint if available from create+bundle result
  const createdTokenMint = document.getElementById('createdTokenMint');
  const consolidateForm = document.getElementById('consolidateForm');
  const tokenMintField = consolidateForm.querySelector('input[name="tokenMint"]');
  if (createdTokenMint && createdTokenMint.value && tokenMintField) {
    tokenMintField.value = createdTokenMint.value;
  }
  
  try {
    const buyersLines = buyersTextarea.value.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
    const consolidateData = buyersLines.map(line => {
      const parts = line.split(',');
      if (parts.length >= 1) {
        return parts[0].trim();
      }
      return null;
    }).filter(line => line !== null).join('\n');
    
    document.getElementById('consolidateWalletsTextarea').value = consolidateData;
    
    let message = `Populated consolidate wallets from buyers (${buyersLines.length} wallets)`;
    if (createdTokenMint && createdTokenMint.value && tokenMintField) {
      message += `\nAlso populated token mint: ${createdTokenMint.value}`;
    }
    alert(message);
  } catch (error) {
    alert('Error parsing buyers data: ' + error.message);
  }
}

function populateConsolidateWalletsFromSell() {
  const sellWalletsTextarea = document.getElementById('sellWalletsTextarea');
  if (!sellWalletsTextarea.value.trim()) {
    alert('No sell wallets data found. Please populate the sell wallets field first in the "Sell Tokens" tab.');
    return;
  }
  
  try {
    const sellLines = sellWalletsTextarea.value.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
    const consolidateData = sellLines.map(line => {
      const parts = line.split(',');
      if (parts.length >= 1) {
        return parts[0].trim();
      }
      return null;
    }).filter(line => line !== null).join('\n');
    
    document.getElementById('consolidateWalletsTextarea').value = consolidateData;
    alert(`Populated consolidate wallets from sell wallets (${sellLines.length} wallets)`);
  } catch (error) {
    alert('Error parsing sell wallets data: ' + error.message);
  }
}

function clearConsolidateWallets() {
  if (confirm('Clear all consolidate wallets data?')) {
    document.getElementById('consolidateWalletsTextarea').value = '';
  }
}

async function populateConsolidateWalletsFromWalletFile() {
  try {
    // Load available wallet files
    const response = await fetch('/api/listWalletFiles');
    const data = await response.json();
    
    if (!data.success || data.files.length === 0) {
      alert('No wallet files found. Generate wallets first in the "Generate Wallets" tab.');
      return;
    }
    
    // Create selection dialog
    let fileOptions = 'Select a wallet file to load:\n\n';
    data.files.forEach((file, index) => {
      fileOptions += `${index + 1}. ${file.filename} (${file.count} wallets, ${file.createdAt})\n`;
    });
    
    const selection = prompt(fileOptions + '\nEnter the number of the file to load:');
    if (!selection) return;
    
    const fileIndex = parseInt(selection) - 1;
    if (fileIndex < 0 || fileIndex >= data.files.length) {
      alert('Invalid selection. Please enter a valid file number.');
      return;
    }
    
    const selectedFile = data.files[fileIndex];
    
    // Extract keys from the selected wallet file
    const extractResponse = await fetch('/api/extractFromWalletFile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletFile: selectedFile.filename })
    });
    
    const extractData = await extractResponse.json();
    
    if (!extractData.success) {
      alert('Error loading wallet file: ' + (extractData.error || 'Unknown error'));
      return;
    }
    
    // Extract private keys and populate the consolidate wallets textarea
    const privateKeys = extractData.results
      .filter(r => !r.error)
      .map(r => r.privateKey.base58);
    
    if (privateKeys.length === 0) {
      alert('No valid wallets found in the selected file.');
      return;
    }
    
    document.getElementById('consolidateWalletsTextarea').value = privateKeys.join('\n');
    alert(`Successfully loaded ${privateKeys.length} wallets from ${selectedFile.filename}`);
    
  } catch (error) {
    console.error('Error loading wallet file:', error);
    alert('Error loading wallet file: ' + error.message);
  }
}

// Balance wallets population functions
function populateBalanceWalletsFromGenerated() {
  if (generatedWallets.length === 0) {
    alert('No generated wallets available. Generate wallets first in the "Generate Wallets" tab.');
    return;
  }
  
  const includePrivate = confirm('Include private keys in the list? (Click OK for private keys, Cancel for public keys only)');
  let balanceData;
  
  if (includePrivate) {
    balanceData = generatedWallets.map(wallet => wallet.privateKey).join('\n');
  } else {
    balanceData = generatedWallets.map(wallet => wallet.publicKey).join('\n');
  }
  
  document.getElementById('balanceWalletsTextarea').value = balanceData;
  alert(`Populated balance wallets with ${generatedWallets.length} ${includePrivate ? 'private keys' : 'public keys'}`);
}

function populateBalanceWalletsFromBuyers() {
  const buyersTextarea = document.getElementById('buyersTextarea');
  if (!buyersTextarea.value.trim()) {
    alert('No buyers data found. Please populate the buyers field first in the "Create Token & Bundle" tab.');
    return;
  }
  
  try {
    const buyersLines = buyersTextarea.value.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
    const balanceData = buyersLines.map(line => {
      const parts = line.split(',');
      if (parts.length >= 1) {
        return parts[0].trim(); // Private key
      }
      return null;
    }).filter(line => line !== null).join('\n');
    
    document.getElementById('balanceWalletsTextarea').value = balanceData;
    alert(`Populated balance wallets from buyers (${buyersLines.length} private keys)`);
  } catch (error) {
    alert('Error parsing buyers data: ' + error.message);
  }
}

function populateBalanceWalletsFromExtracted() {
  if (extractedKeys.length === 0) {
    alert('No extracted keys available. Extract private keys first in the "Extract Keys" tab.');
    return;
  }
  
  const includePrivate = confirm('Include private keys in the list? (Click OK for private keys, Cancel for public keys only)');
  let balanceData;
  
  if (includePrivate) {
    balanceData = extractedKeys.map(keyData => keyData.privateKey.base58).join('\n');
  } else {
    balanceData = extractedKeys.map(keyData => keyData.publicKey).join('\n');
  }
  
  document.getElementById('balanceWalletsTextarea').value = balanceData;
  alert(`Populated balance wallets with ${extractedKeys.length} ${includePrivate ? 'private keys' : 'public keys'}`);
}

function populateBalanceWalletsFromSell() {
  const sellWalletsTextarea = document.getElementById('sellWalletsTextarea');
  if (!sellWalletsTextarea.value.trim()) {
    alert('No sell wallets data found. Please populate the sell wallets field first in the "Sell Tokens" tab.');
    return;
  }
  
  try {
    const sellLines = sellWalletsTextarea.value.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
    const balanceData = sellLines.map(line => {
      const parts = line.split(',');
      if (parts.length >= 1) {
        return parts[0].trim(); // Private key
      }
      return null;
    }).filter(line => line !== null).join('\n');
    
    document.getElementById('balanceWalletsTextarea').value = balanceData;
    alert(`Populated balance wallets from sell wallets (${sellLines.length} private keys)`);
  } catch (error) {
    alert('Error parsing sell wallets data: ' + error.message);
  }
}

function generateBalanceWallets() {
  const form = document.getElementById('balancesForm');
  const generateCount = parseInt(form.querySelector('input[name="generateCount"]').value);
  
  if (isNaN(generateCount) || generateCount < 1 || generateCount > 50) {
    alert('Invalid count. Must be 1-50');
    return;
  }
  
  // Generate new wallets for balance checking
  const newWallets = [];
  for (let i = 0; i < generateCount; i++) {
    // We'll call the generate wallets API for this
    // For now, add placeholder
    newWallets.push(`Wallet${i + 1}_PublicKey_Placeholder`);
  }
  
  // For now, show placeholder message and suggest using the Generate Wallets tab
  alert(`To generate ${generateCount} new wallets, please use the "Generate Wallets" tab first, then use "From Generated" button here.`);
}

function clearBalanceWallets() {
  if (confirm('Clear all balance wallets data?')) {
    document.getElementById('balanceWalletsTextarea').value = '';
  }
}

async function checkMasterBalance() {
  const privateKey = document.querySelector('input[name="masterPrivateKey"]').value.trim();
  const balanceDisplay = document.getElementById('balanceDisplay');
  
  if (!privateKey) {
    balanceDisplay.innerHTML = '<span class="text-warning">⚠ Enter private key first</span>';
    return;
  }
  
  balanceDisplay.innerHTML = '<span class="text-info">⏳ Checking balance...</span>';
  
  try {
    const resp = await fetch('/api/checkBalance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ privateKey })
    });
    
    const json = await resp.json();
    if (json.success) {
      const balance = json.balance.toFixed(4);
      balanceDisplay.innerHTML = `<span class="text-success"> ${balance} SOL</span>`;
      
      // Calculate distribution estimate
      const solAmountInput = document.querySelector('input[name="solAmount"]');
      const targetWalletsTextarea = document.querySelector('textarea[name="targetWallets"]');
      
      if (solAmountInput.value && targetWalletsTextarea.value.trim()) {
        try {
          const targetWallets = JSON.parse(targetWalletsTextarea.value);
          const solAmount = parseFloat(solAmountInput.value);
          const totalRequired = (solAmount * targetWallets.length) + (0.01 * targetWallets.length);
          
          if (json.balance < totalRequired) {
            balanceDisplay.innerHTML += `<br><span class="text-danger">⚠ Need ${totalRequired.toFixed(4)} SOL (insufficient)</span>`;
          } else {
            balanceDisplay.innerHTML += `<br><span class="text-success">Sufficient for ${targetWallets.length} wallets</span>`;
          }
        } catch (e) {
          // Ignore JSON parse errors for target wallets
        }
      }
    } else {
      balanceDisplay.innerHTML = `<span class="text-danger">${json.error}</span>`;
    }
  } catch (err) {
    balanceDisplay.innerHTML = `<span class="text-danger">Error: ${err.message}</span>`;
  }
}

function toggleStrategyFields() {
  const bundleStrategy = document.getElementById('bundleStrategy').value;
  const devWalletDiv = document.getElementById('devWalletDiv');
  const devWalletBuyDiv = document.getElementById('devWalletBuyDiv');
  const createSolAmountInput = document.querySelector('input[name="createSolAmount"]');
  const devWalletBuyHelp = document.getElementById('devWalletBuyHelp');
  const tokenMintDiv = document.getElementById('tokenMintDiv');
  const tokenMetadataSection = document.getElementById('tokenMetadataSection');
  const submitButton = document.getElementById('submitButton');
  const fileInput = document.querySelector('input[name="file"]');
  const devPrivateKeyInput = document.querySelector('input[name="devPrivateKey"]');
  
  if (bundleStrategy === 'separated') {
    // Separated strategy: allow dev wallet buy, show token metadata
    devWalletDiv.style.display = 'block';
    devPrivateKeyInput.required = true;
    createSolAmountInput.readOnly = false;
    createSolAmountInput.style.backgroundColor = '';
    devWalletBuyHelp.textContent = 'Dev wallet buy amount in SOL (e.g., 0.1) - will purchase after token creation';
    devWalletBuyHelp.style.color = '';
    devWalletBuyDiv.style.display = 'block';
    tokenMintDiv.style.display = 'none';
    tokenMetadataSection.style.display = 'block';
    submitButton.textContent = 'Create & Bundle (Separated)';
    fileInput.required = true;
  } else if (bundleStrategy === 'buyonly') {
    // Buy-only strategy: hide dev wallet, hide token metadata, show mint input
    devWalletDiv.style.display = 'none';
    devPrivateKeyInput.required = false;
    devWalletBuyDiv.style.display = 'none';
    tokenMintDiv.style.display = 'block';
    tokenMetadataSection.style.display = 'none';
    submitButton.textContent = 'Buy Bundle';
    fileInput.required = false;
  } else {
    // Standard strategy: normal behavior
    devWalletDiv.style.display = 'block';
    devPrivateKeyInput.required = true;
    createSolAmountInput.value = '0.25';
    createSolAmountInput.readOnly = false;
    createSolAmountInput.style.backgroundColor = '';
    devWalletBuyHelp.textContent = 'Amount of SOL for dev wallet to buy during token creation';
    devWalletBuyHelp.style.color = '';
    devWalletBuyDiv.style.display = 'block';
    tokenMintDiv.style.display = 'none';
    tokenMetadataSection.style.display = 'block';
    submitButton.textContent = 'Create & Bundle';
    fileInput.required = true;
  }
}

function toggleExtractionMethod() {
  const extractMethod = document.getElementById('extractMethod').value;
  const seedPhrasesDiv = document.getElementById('seedPhrasesDiv');
  const walletFileDiv = document.getElementById('walletFileDiv');
  const seedPhrasesTextarea = document.querySelector('textarea[name="seedPhrases"]');
  
  if (extractMethod === 'seedPhrases') {
    seedPhrasesDiv.style.display = 'block';
    walletFileDiv.style.display = 'none';
    seedPhrasesTextarea.required = true;
    document.querySelector('select[name="walletFile"]').required = false;
  } else {
    seedPhrasesDiv.style.display = 'none';
    walletFileDiv.style.display = 'block';
    seedPhrasesTextarea.required = false;
    document.querySelector('select[name="walletFile"]').required = true;
    loadWalletFiles();
  }
}

async function loadWalletFiles() {
  try {
    const response = await fetch('/api/listWalletFiles');
    const data = await response.json();
    
    const walletFileSelect = document.querySelector('select[name="walletFile"]');
    walletFileSelect.innerHTML = '<option value="">Select wallet file...</option>';
    
    if (data.success && data.files.length > 0) {
      data.files.forEach(file => {
        const option = document.createElement('option');
        option.value = file.filename;
        option.textContent = `${file.filename} (${file.count} wallets, ${file.createdAt})`;
        walletFileSelect.appendChild(option);
      });
    } else {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No wallet files found';
      option.disabled = true;
      walletFileSelect.appendChild(option);
    }
  } catch (error) {
    console.error('Error loading wallet files:', error);
  }
}

// ===== MAIN FORM SUBMISSION HANDLER =====
const mainForm = document.getElementById('mainForm');
const submitButton = document.getElementById('submitButton');
const outputDiv = document.getElementById('output');

mainForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  // Disable submit button and show loading state
  submitButton.disabled = true;
  submitButton.textContent = 'Processing...';
  outputDiv.textContent = 'Starting bundle creation...\n';
  
  try {
    // Get form data
    const formData = new FormData(mainForm);
    const bundleStrategy = formData.get('bundleStrategy');
    
    // Determine endpoint based on strategy
    let endpoint;
    if (bundleStrategy === 'separated') {
      endpoint = '/api/createAndBundleSeparated';
    } else if (bundleStrategy === 'buyonly') {
      endpoint = '/api/buyOnlyBundle';
    } else {
      endpoint = '/api/createAndBundle';
    }

    // Submit form
    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (result.success) {
      outputDiv.innerHTML = result.logs.join('\n') + '\n\n✅ SUCCESS!\n';
      if (result.bundleId) {
        outputDiv.innerHTML += `Bundle ID: ${result.bundleId}\n`;
      }
      if (result.mintAddress) {
        outputDiv.innerHTML += `Mint Address: ${result.mintAddress}\n`;
        // Show the created token info section and populate the mint address
        const createdTokenInfo = document.getElementById('createdTokenInfo');
        const createdTokenMint = document.getElementById('createdTokenMint');
        createdTokenMint.value = result.mintAddress;
        createdTokenInfo.style.display = 'block';
        
        // Also populate the main token mint section and quick buy section
        const mainTokenMint = document.getElementById('mainTokenMint');
        const quickBuyTokenMint = document.getElementById('quickBuyTokenMint');
        
        mainTokenMint.value = result.mintAddress;
        quickBuyTokenMint.value = result.mintAddress;
      }
      if (result.metadataUri) {
        outputDiv.innerHTML += `Metadata URI: ${result.metadataUri}\n`;
      }
      if (result.explorerUrl) {
        outputDiv.innerHTML += `Explorer: ${result.explorerUrl}\n`;
      }
    } else {
      outputDiv.innerHTML = (result.logs || []).join('\n') + '\n\n❌ ERROR: ' + result.error + '\n';
    }

  } catch (error) {
    outputDiv.innerHTML += '\n❌ NETWORK ERROR: ' + error.message + '\n';
    console.error('Form submission error:', error);
  } finally {
    // Re-enable submit button
    submitButton.disabled = false;
    const bundleStrategy = document.getElementById('bundleStrategy').value;
    if (bundleStrategy === 'separated') {
      submitButton.textContent = 'Create & Bundle (Separated)';
    } else if (bundleStrategy === 'buyonly') {
      submitButton.textContent = 'Buy Bundle';
    } else {
      submitButton.textContent = 'Create & Bundle';
    }
  }
});

// Quick Buy Functions
function populateQuickBuyFromGenerated() {
  if (generatedWallets.length === 0) {
    alert('No generated wallets available. Generate wallets first in the "Generate Wallets" tab.');
    return;
  }
  
  // Get the SOL amount from distribute form (default to 0.01 if not set)
  const distributeAmountInput = document.querySelector('input[name="solAmount"]');
  const defaultAmount = distributeAmountInput ? distributeAmountInput.value || '0.01' : '0.01';
  
  // Ask user for the amount to use for each wallet
  const amount = prompt(`Enter SOL amount for each wallet (default: ${defaultAmount}):`, defaultAmount);
  if (amount === null) return;
  
  const solAmount = parseFloat(amount);
  if (isNaN(solAmount) || solAmount <= 0) {
    alert('Invalid amount. Please enter a positive number.');
    return;
  }
  
  const buyersData = generatedWallets.map(wallet => `${wallet.privateKey}, ${solAmount}`).join('\\n');
  document.getElementById('quickBuyersTextarea').value = buyersData;
  alert(`Populated quick buy with ${generatedWallets.length} wallets at ${solAmount} SOL each`);
}

function populateQuickBuyFromDistribute() {
  const distributeTextarea = document.querySelector('textarea[name="targetWallets"]');
  if (!distributeTextarea || !distributeTextarea.value.trim()) {
    alert('No distribute data found. Please populate the target wallets in the "Distribute SOL" tab first.');
    return;
  }
  
  try {
    const distributeData = JSON.parse(distributeTextarea.value);
    if (!Array.isArray(distributeData)) {
      throw new Error('Target wallets must be an array');
    }
    
    // Get the SOL amount from distribute form
    const distributeAmountInput = document.querySelector('input[name="solAmount"]');
    const defaultAmount = distributeAmountInput ? distributeAmountInput.value || '0.01' : '0.01';
    
    const amount = prompt(`Enter SOL amount for each wallet (default: ${defaultAmount}):`, defaultAmount);
    if (amount === null) return;
    
    const solAmount = parseFloat(amount);
    if (isNaN(solAmount) || solAmount <= 0) {
      alert('Invalid amount. Please enter a positive number.');
      return;
    }
    
    // For distribute data, we only have public keys, so we can't populate private keys
    alert('Cannot populate from distribute data - only public keys available. Use "From Generated" or "From Extracted" instead.');
  } catch (error) {
    alert('Error parsing distribute data: ' + error.message);
  }
}

function populateQuickBuyFromExtracted() {
  if (extractedKeys.length === 0) {
    alert('No extracted keys available. Extract private keys first in the "Extract Keys" tab.');
    return;
  }
  
  // Get the SOL amount from distribute form (default to 0.01 if not set)
  const distributeAmountInput = document.querySelector('input[name="solAmount"]');
  const defaultAmount = distributeAmountInput ? distributeAmountInput.value || '0.01' : '0.01';
  
  const amount = prompt(`Enter SOL amount for each wallet (default: ${defaultAmount}):`, defaultAmount);
  if (amount === null) return;
  
  const solAmount = parseFloat(amount);
  if (isNaN(solAmount) || solAmount <= 0) {
    alert('Invalid amount. Please enter a positive number.');
    return;
  }
  
  const buyersData = extractedKeys.map(key => `${key}, ${solAmount}`).join('\\n');
  document.getElementById('quickBuyersTextarea').value = buyersData;
  alert(`Populated quick buy with ${extractedKeys.length} wallets at ${solAmount} SOL each`);
}

function clearQuickBuy() {
  if (confirm('Clear all quick buy data?')) {
    document.getElementById('quickBuyersTextarea').value = '';
  }
}

async function populateQuickBuyFromWalletFile() {
  try {
    // Load available wallet files
    const response = await fetch('/api/listWalletFiles');
    const data = await response.json();
    
    if (!data.success || data.files.length === 0) {
      alert('No wallet files found. Generate wallets first in the "Generate Wallets" tab.');
      return;
    }
    
    // Create selection dialog
    let fileOptions = 'Select a wallet file to load:\n\n';
    data.files.forEach((file, index) => {
      fileOptions += `${index + 1}. ${file.filename} (${file.count} wallets, ${file.createdAt})\n`;
    });
    
    // Ask for SOL amount per wallet
    const distributeAmountInput = document.querySelector('input[name="solAmount"]');
    const defaultAmount = distributeAmountInput ? distributeAmountInput.value || '0.01' : '0.01';
    
    const amountInput = prompt(`Enter SOL amount per wallet (default: ${defaultAmount}):`, defaultAmount);
    if (!amountInput) return;
    
    const solAmount = parseFloat(amountInput);
    if (isNaN(solAmount) || solAmount <= 0) {
      alert('Invalid SOL amount. Please enter a positive number.');
      return;
    }
    
    const selection = prompt(fileOptions + '\nEnter the number of the file to load:');
    if (!selection) return;
    
    const fileIndex = parseInt(selection) - 1;
    if (fileIndex < 0 || fileIndex >= data.files.length) {
      alert('Invalid selection. Please enter a valid file number.');
      return;
    }
    
    const selectedFile = data.files[fileIndex];
    
    // Extract keys from the selected wallet file
    const extractResponse = await fetch('/api/extractFromWalletFile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletFile: selectedFile.filename })
    });
    
    const extractData = await extractResponse.json();
    
    if (!extractData.success) {
      alert('Error loading wallet file: ' + (extractData.error || 'Unknown error'));
      return;
    }
    
    // Extract private keys and format for quick buy (with SOL amount)
    const buyersData = extractData.results
      .filter(r => !r.error)
      .map(r => `${r.privateKey.base58}, ${solAmount}`);
    
    if (buyersData.length === 0) {
      alert('No valid wallets found in the selected file.');
      return;
    }
    
    document.getElementById('quickBuyersTextarea').value = buyersData.join('\n');
    alert(`Successfully loaded ${buyersData.length} wallets from ${selectedFile.filename} with ${solAmount} SOL each`);
    
  } catch (error) {
    console.error('Error loading wallet file:', error);
    alert('Error loading wallet file: ' + error.message);
  }
}

function clearQuickBuyMint() {
  document.getElementById('quickBuyTokenMint').value = '';
}

// Quick Buy Form Handler
const quickBuyForm = document.getElementById('quickBuyForm');
const quickBuyOutputDiv = document.getElementById('quickBuyOutput');

if (quickBuyForm) {
  quickBuyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Disable submit button
    const submitBtn = quickBuyForm.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Processing...';
    }
    
    quickBuyOutputDiv.textContent = 'Starting quick buy...\n';
    
    try {
      // Get form data
      const formData = new FormData(quickBuyForm);
      
      // Submit to buy-only endpoint
      const response = await fetch('/api/buyOnlyBundle', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        quickBuyOutputDiv.innerHTML = result.logs.join('\\n') + '\\n\\n✅ QUICK BUY SUCCESS!\\n';
        if (result.summary && result.summary.bundleIds) {
          result.summary.bundleIds.forEach((bundleId, index) => {
            quickBuyOutputDiv.innerHTML += `Bundle ${index + 1}: ${bundleId}\\n`;
          });
        }
      } else {
        quickBuyOutputDiv.innerHTML = (result.logs || []).join('\\n') + '\\n\\n❌ QUICK BUY ERROR: ' + result.error + '\\n';
      }

    } catch (error) {
      quickBuyOutputDiv.innerHTML += '\\n❌ NETWORK ERROR: ' + error.message + '\\n';
      console.error('Quick buy error:', error);
    } finally {
      // Re-enable submit button
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '🛒 Buy More Tokens';
      }
    }
  });
}

// Individual Sell Wallets Functions
function populateIndividualSellWallets() {
  const sellWallets = document.getElementById('sellWalletsTextarea').value.trim();
  const devPrivateKey = document.querySelector('input[name="devPrivateKey"]').value.trim();
  const individualContainer = document.getElementById('individualSellWallets');
  
  console.log('Sell wallets textarea content:', sellWallets);
  console.log('Dev private key:', devPrivateKey ? 'Found' : 'Not found');
  
  if (!sellWallets && !devPrivateKey) {
    alert('Please fill the sell wallets textarea first or ensure dev wallet is filled.');
    return;
  }
  
  let walletRows = [];
  
  // Parse wallets from textarea
  if (sellWallets) {
    const lines = sellWallets.split('\n');
    console.log('Lines found:', lines.length);
    let walletIndex = 1;
    lines.forEach((line, lineIndex) => {
      const trimmedLine = line.trim();
      console.log(`Line ${lineIndex + 1}: "${trimmedLine}"`);
      if (trimmedLine) {
        const parts = trimmedLine.split(',');
        if (parts.length >= 1) {
          const privateKey = parts[0].trim();
          const percentage = parts.length > 1 ? parts[1].trim() : '100';
          console.log(`Adding wallet ${walletIndex}: ${privateKey.substring(0, 8)}...`);
          walletRows.push({
            index: walletIndex,
            privateKey: privateKey,
            percentage: percentage,
            isDev: false
          });
          walletIndex++;
        }
      }
    });
    console.log('Total wallets parsed:', walletRows.length);
  }
  
  // Add dev wallet at the bottom
  if (devPrivateKey) {
    console.log('Adding dev wallet');
    walletRows.push({
      index: walletRows.length + 1,
      privateKey: devPrivateKey,
      percentage: '100',
      isDev: true
    });
  }
  
  console.log('Total wallets before limit:', walletRows.length);
  // Limit to 20 rows
  walletRows = walletRows.slice(0, 20);
  console.log('Total wallets after limit:', walletRows.length);
  
  // Generate HTML for wallet rows
  let html = '';
  walletRows.forEach(wallet => {
    const walletDisplay = wallet.privateKey.substring(0, 8) + '...' + wallet.privateKey.substring(wallet.privateKey.length - 4);
    const rowClass = wallet.isDev ? 'border-danger bg-danger bg-opacity-10' : '';
    const labelColor = wallet.isDev ? 'text-danger fw-bold' : '';
    
    html += `
      <div class="row mb-2 p-2 border rounded ${rowClass}" style="font-size: 0.875rem;">
        <div class="col-6">
          <span class="${labelColor}">${wallet.isDev ? '🔑 DEV:' : `#${wallet.index}:`} ${walletDisplay}</span>
        </div>
        <div class="col-3">
          <input type="number" class="form-control form-control-sm" 
                 value="${wallet.percentage}" min="1" max="100" 
                 id="percent_${wallet.index}" placeholder="%">
        </div>
        <div class="col-3">
          <button type="button" class="btn btn-danger btn-sm w-100" 
                  onclick="sellIndividualWallet('${wallet.privateKey}', ${wallet.index})">
             Sell
          </button>
        </div>
      </div>
    `;
  });
  
  if (html === '') {
    html = '<div class="text-muted text-center">No wallets found</div>';
  }
  
  individualContainer.innerHTML = html;
}

function clearIndividualSellWallets() {
  document.getElementById('individualSellWallets').innerHTML = '<div class="text-muted text-center">Load wallets to see individual sell controls</div>';
}

async function sellIndividualWallet(privateKey, walletIndex) {
  const tokenMint = document.querySelector('input[name="tokenMint"]').value.trim();
  const percentageInput = document.getElementById(`percent_${walletIndex}`);
  const percentage = percentageInput ? percentageInput.value : '100';
  
  if (!tokenMint) {
    alert('Please enter the token mint address first.');
    return;
  }
  
  if (!percentage || percentage < 1 || percentage > 100) {
    alert('Please enter a valid percentage (1-100).');
    return;
  }
  
  // Get the button that was clicked
  const button = event.target;
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Selling...';
  
  try {
    // Create form data for individual sell
    const formData = new FormData();
    formData.append('tokenMint', tokenMint);
    formData.append('sellWallets', `${privateKey}, ${percentage}`);
    formData.append('defaultSellPercentage', percentage);
    formData.append('slippage', '10');
    formData.append('priorityFee', '0.001');
    formData.append('bundleSize', '1');
    
    const response = await fetch('/api/sellTokens', {
      method: 'POST',
      body: formData
    });
    
    const result = await response.json();
    
    if (result.success) {
      button.className = 'btn btn-success btn-sm w-100';
      button.textContent = 'Sold';
      
      // Show success in sell output
      const sellOutput = document.getElementById('sellOutput');
      sellOutput.innerHTML += `\\n Individual Sell Success (Wallet #${walletIndex}, ${percentage}%): ${result.summary?.bundleIds?.[0] || 'Success'}\\n`;
    } else {
      button.className = 'btn btn-warning btn-sm w-100';
      button.textContent = '❌ Failed';
      
      // Show error in sell output
      const sellOutput = document.getElementById('sellOutput');
      sellOutput.innerHTML += `\\n Individual Sell Failed (Wallet #${walletIndex}): ${result.error}\\n`;
    }
  } catch (err) {
    button.className = 'btn btn-warning btn-sm w-100';
    button.textContent = ' Error';
    
    const sellOutput = document.getElementById('sellOutput');
    sellOutput.innerHTML += `\\n Individual Sell Error (Wallet #${walletIndex}): ${err.message}\\n`;
  }
  
  // Re-enable button after 3 seconds
  setTimeout(() => {
    button.disabled = false;
    if (button.textContent === 'Selling...') {
      button.textContent = originalText;
      button.className = 'btn btn-danger btn-sm w-100';
    }
  }, 3000);
}