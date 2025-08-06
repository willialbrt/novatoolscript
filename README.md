# Pump Jito Bundler (Server + Frontend)

## Overview:
1. server.js - Node backend to sign transactions and perform bundle through PumpPortal API and JITO.
2. index.html - Simple HTML frontend for user input.

## Requirements:

1. Node.js - https://nodejs.org/en/download (BE SURE TO ADD TO PATH)
2. VSCode - https://code.visualstudio.com/download

## How to:

1. Place folder on desktop or wherever is easily accessible to you. Be sure to extract.
2. Open VSCode, select "File" -> "Open Folder" and select pumpbundle.
3. Select "Terminal" on the top navbar and select "New Terminal."
4. Type "npm install" in terminal.
5. Run the server with "node server.js". Make sure "Server listening on port 3000" is displayed in the terminal console.
6. Open browser of your choice and type "http://localhost:3000".
7. Enter details and bs58 private keys (same format as Phantom export).
8. Launch and bundle. Console will monitor for errors and post transaction links.

