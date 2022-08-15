# DFKDuelRunner

## Setup

0. Rename "SAMPLE-config.json" in Folder "src" to "config.json".
1. Open the file "src/config.json".
2. Enter your public key at "address".
3. Enter your seed password at "seedPassword", you can choose your own password here.
4. Edit your Game- and Hero-Data at "game", you can find the explainations for each value in the file "src/runner/duel-runner.js".
3. Run the script with "npm start" and generate your encrypted seed-file. Use your "seedPassword" from config.json.
   CAUTION! The Script will ask for your private seed phrase. USE AT YOUR OWN RISK!
   CAUTION! The Script will generate a "w.json" file which contains your encrypted seed phrase
   !!! NEVER SHARE ANY FILE OF THIS SCRIPT WITH ANYONE, ESPECIALLY "w.json" AND "config.json"

## Run the script

- Install pm2 via "npm install pm2 -g"
- pm2 restarts the script automatically in case of a script-crash due to certain circumstances

## Commands:	(executable while in folder ../src/runner/ )

- pm2 start duel-runner.js	To start for the first time, you can use "pm2 start 0" afterwards
- pm2 logs			To show the script running/doing it's job			
- Strg + C			To exit the logs
<<<<<<< HEAD
- pm2 stop 0		To stop the script
