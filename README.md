If you're finding DFKDuelRunner valuable, give this repository a "Star" on github. Thx!

# DFKDuelRunner

## What can this Bot do?

This is a Duel-Bot for the Harmony / DeFi-Kingdoms game.
The Bot automatically enters the game-lobby to fight other players in DeFi-Kingdoms, a DeFi game built on the Harmony-blockchain.
The bot sends repetitive transactions in a loop to the duel-smart-contract and has the following functions:

1. Join the game-lobby with a hero automatically
2. Autocomplete the game automatically if there is a duel-match
3. Avoids blacklisted players that are too strong. (via blacklisted Hero-Ids in config - only in 1vs1 game-type currently)
4. Switches the RPC-network automatically to counteract network-outages
5. The Bot also has several options to set your own customized preferences
   If you're finding this script valuable, give this repository a "Star" on github. Thx!

## Setup

0. Rename "SAMPLE-config.json" in Folder "src" to "config.json".
1. Open the file "src/config.json".
2. Enter your public key at "address".
3. Enter your seed password at "seedPassword", you can choose your own password here.
4. Edit your Game- and Hero-Data at "game", you can find the explainations for each value in the file "src/runner/duel-runner.js".
5. Run the script with "npm start" and generate your encrypted seed-file. Use your "seedPassword" from config.json.
   CAUTION! The Script will ask for your private seed phrase. USE AT YOUR OWN RISK!
   CAUTION! The Script will generate a "w.json" file which contains your encrypted seed phrase
   !!! NEVER SHARE ANY FILE OF THIS SCRIPT WITH ANYONE, ESPECIALLY "w.json" AND "config.json"

## Run the script

I strongly recommend to run the script via "pm2" instead of "npm" (after setup via "npm"), as there can be some reasons why the script crashes or needs to be restarted from scratch automatically. "pm2" does exactly this, restarting the script automatically if necessary. (which is also considered in this script-code)

- Install pm2 via "npm install pm2 -g"
- pm2 restarts the script automatically in case of a script-crash due to certain circumstances

## Commands: (executable while in folder ../src/runner/ )

- pm2 start duel-runner.js - To start for the first time, you can use "pm2 start 0" afterwards
- pm2 logs - To show the script running/doing it's job
- Strg + C - To exit the logs
- pm2 stop 0 - To stop the script
