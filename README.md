# NovelToolScripts

## Overview:
1. server.js - Node backend to sign transactions and perform bundle through PumpPortal API and JITO.
2. index.html - Simple HTML frontend for user input.

## Requirements:

1. Node.js - https://nodejs.org/en/download (BE SURE TO ADD TO PATH)
2. VSCode - https://code.visualstudio.com/download

## How to run:
a)
1. Git clone https://github.com/willialbrt/novatoolscript
2. cd novatoolsscript
3. type "npm install" 
4. npm run or node server-current-idl.js
5. Open browser of your choice and type "http://localhost:9089"

b)
1. Place folder on desktop or wherever is easily accessible to you. Be sure to extract.
2. Open VSCode, select "File">"Open Folder" and select Novatoolscripts.
3. Select "Terminal" on the top navbar and select "New Terminal."
4. Type "npm install" in terminal.
5. Run the server with "node server-current-idl.js". Make sure "Server listening on port 9089" is displayed in the terminal console.
6. Open browser of your choice and type "http://localhost:9089".
7. Enter details and bs58 private keys (same format as Phantom export).
8. Launch and bundle. Console will monitor for errors and post transaction links.





