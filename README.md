# DFKDuelRunner

## Setup

0. Rename "SAMPLE-config.json" in the src-Folder to config.json
1. Get into the src/config.json and enter your public key at "address"
2. Get into the src/runner/duel-runner.js edit
	// Hero & Game Data
	- set a password for encrypting your private seed phrase
	- configure your game data like Hero-ID and so on
3. run the script with "npm start" and generate your encrypted seed-file.
   CAUTION! The Script will ask for your private seed phrase. Also set the password you used one step before.
   CAUTION! The Script will generate a w.json file which contains your encrypted seed phrase
   !!! NEVER SHARE THIS FILE OR YOUR duel-runner.js with your password in it! !!!



## Run the script

- Install pm2 via "npm install pm2 -g"
- pm2 restarts the script automatically in case of a script-crash due to certain circumstances


## Commands:	(executable while in folder ../src/runner/ )

- pm2 start duel-runner.js	To start for the first time, you can use "pm2 start 0" afterwards
- pm2 logs			To show the script running/doing it's job			
- Strg + C			To exit the logs
- pm2 stop 0			To stop the script
