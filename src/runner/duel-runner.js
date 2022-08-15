/****************************************************************
 *      #   BACKGROUNDS      	        #  STATS
 *      0: "desert",				    0: "Strength",
 *      2: "forest",				    2: "Agility",
 *      4: "plains",				    4: "Intelligence",
 *      6: "island",				    6: "Wisdom",
 *      8: "swamp",				        8: "Luck",
 *      10: "mountains",			    10: "Vitality",
 *      12: "city",				        12: "Endurance",
 *      14: "arctic"				    14: "Dexterity"
*****************************************************************/

// Internal - Do not touch
const fs = require("fs");
const readline = require("readline");
const bluebird = require("bluebird");
const axios = require("axios");
const ethers = require("ethers");
const config = require("../config.json");
const abiduel = require("./abi-duel.json");
let provider, duelContract, wallet, current_rpc, pendingHeroInLobby, duelToComplete, currentBlockNr;
let receipt = { status: null }

// RPC - switch automatically between harmonyRpc & poktRpc
let rpc_auto_switch = config.rpc.rpc_auto_switch    // true: switch network on errors automatically | false: take standard settings from config
let start_rpc = config.rpc.harmonyRpc               // Start with Main-RPC

// Hero & Game Data
const seedPassword = config.wallet.seedPassword                             //  Password for encrypting your seedphrase
const type = config.game.gameType                                           //  Duel Game-Type = 1, 3 or 9
const heroid = config.game.heroid                                           //  Duel Hero ID(s), like [ '260714', '154849', '30932' ]
const jewelfee = config.game.jewelfee                                       //  Duel Jewel-Fee in HEX = 100000000000000000
const background = config.game.background                                   //  Duel Background
const stat = config.game.stat                                               //  Duel Stat
const activateAutoCompleteDuel = config.game.activateAutoCompleteDuel       //  Automatically Completes Duels

// Timer - in seconds
const waitTimeAfterSuccess = config.timers.waitTimeAfterSuccess                 // Wait till next try after Success
const waitTimeAfterError = config.timers.waitTimeAfterError                     // Wait till next try after Error
const waitTimeAfterTXFail = config.timers.waitTimeAfterTXFail                   // Wait till next try after Error
const transaction_timeout = config.timers.transaction_timeout                   // How long to wait, till Timeout
const waitTimeLobby = config.timers.waitTimeLobby                               // How long to wait to check again, if Hero is still in Lobby without a Match
const waitBlockTimeToAutocomplete = config.timers.waitBlockTimeToAutocomplete   // How many Blocks to wait till Duel gets Auto-Completed

/*****************************************************************/

// Function: getPlayerDuelEntries (Lobby)

async function getPlayerDuelEntries(walletaddress) {

    // Open Duels in Lobby without a match, shows also Lobby ID
    //   function getPlayerDuelEntries(address _profile) view returns (tuple(uint256 id, address player, uint256[] heroes, uint256 startBlock, uint256 score, uint256 scoreAfter, uint256 jewelFee, uint256 duelId, uint256 custom1, uint256 custom2, uint8 duelType, uint8 status)[]);
    const getPlayerDuelEntries = await duelContract.getPlayerDuelEntries(walletaddress)
    console.log('\n🔎 Checking Lobby for Address: ' + walletaddress + '...')
    // console.log(getPlayerDuelEntries)
    // console.log('getPlayerDuelEntries: ' + getPlayerDuelEntries)

    // if array not empty = no active duel
    if (getPlayerDuelEntries.length !== 0) {

        let playerDuelEntries = getPlayerDuelEntries[0]

        console.log(`
        🙋‍♂️‍ Found Hero in Lobby waiting for a Match:
            Lobby ID: ${playerDuelEntries[0]}
            Player Address: ${playerDuelEntries[1]}
            Hero IDs: ${playerDuelEntries[2]}
            StartBlock: ${playerDuelEntries[3]}
            Score: ${playerDuelEntries[4]}
            Score After: ${playerDuelEntries[5]}
            JewelFee: ${playerDuelEntries[6]}
            Duel ID: ${playerDuelEntries[7]}
            Background: ${playerDuelEntries[8]}
            Stat: ${playerDuelEntries[9]}
            Duel Type: ${playerDuelEntries[10]}
            Status: ${playerDuelEntries[11]}
            `)
        /*
        for (let index = 0; index < playerDuelEntries.length; index++) {
            console.log("index:" + index + ":")
            console.log(playerDuelEntries[index])
        */

        return playerDuelEntries[0]
    }
    else {
        console.log('❌ No Active Lobby-Entries (Currently no Hero in Lobby-Queue)\n')
    }

}


// Function: getActiveDuels (Matched in Lobby, but not completed)

async function getActiveDuels(walletaddress) {

    // Active Duels = Ready to fight - Array is empty when no active duels (waiting for a match)
    //   function getActiveDuels(address _address) view returns (tuple(uint256 id, address player1, address player2, uint256 player1DuelEntry, uint256 player2DuelEntry, address winner, uint256[] player1Heroes, uint256[] player2Heroes, uint256 startBlock, uint8 duelType, uint8 status)[]);
    const getActiveDuels = await duelContract.getActiveDuels(walletaddress)
    console.log('🔎 Checking Active Duels for Address: ' + walletaddress + '...')
    // console.log(getActiveDuels)
    // console.log('Active Duels: ' + getActiveDuels)

    // if array not empty = no active duel
    if (getActiveDuels.length !== 0) {

        let activeDuels = getActiveDuels[0]

        console.log(`
        🤼‍♂ Found Active Duel:
            Duel ID: ${activeDuels[0]}
            Player 1 Address: ${activeDuels[1]}
            Player 2 Address: ${activeDuels[2]}
            Player 1 Lobby ID: ${activeDuels[3]}
            Player 2 Lobby ID: ${activeDuels[4]}
            Winner Address: ${activeDuels[5]}
            Player 1 Heroes: ${activeDuels[6]}
            Player 2 Heroes: ${activeDuels[7]}
            StartBlock: ${activeDuels[8]}
            Duel Type: ${activeDuels[9]}
            Status: ${activeDuels[10]}
        `)
        /*
        for (let index = 0; index < activeDuels.length; index++) {
            console.log("index:" + index + ":")
            console.log(activeDuels[index])
        }
        */

        return {
            duelID: activeDuels[0],
            startBlock: activeDuels[8]
        }
    }
    else {
        console.log('❌ No Active Duels (No Duels Ready for Battle / No Matches)\n')
    }

}


// Function: RPC Network / Provider

function getRpc() {

    if (rpc_auto_switch) {  // ignore standard settings & switch on every failed attempt

        if (start_rpc) {

            current_rpc = start_rpc     // set current used RPC
            console.log('-----------------------------------------------------')
            console.log('🌐 Using Network: ' + current_rpc + '\n');

            start_rpc = false           // deactivate startRPC for next time, use opposite of current_RPC next time
            return current_rpc
        }
        else {

            if (current_rpc === config.rpc.harmonyRpc) {
                current_rpc = config.rpc.poktRpc;
                console.log('-----------------------------------------------------')
                console.log('🔀 Switching to Backup-Network: ' + config.rpc.poktRpc + '\n')
                return current_rpc
            }
            else {
                current_rpc = config.rpc.harmonyRpc;
                console.log('-----------------------------------------------------')
                console.log('🔀 Switching to Mainnet: ' + config.rpc.harmonyRpc + '\n')
                return current_rpc
            }
        }

    }
    else {  // use standard settings from config-file

        let standardNet = config.rpc.useBackupRpc ? config.rpc.poktRpc : config.rpc.harmonyRpc;
        console.log('-----------------------------------------------------')
        console.log('🌐 Using Network: ' + standardNet + '\n')

        return standardNet;
    }

}


// Function: Start Script

async function start() {

    /* Let's clean up first */
    if (typeof err === 'undefined') { } else { err = undefined }    // clean error for next run
    //console.clear()                 // clean the console


    /* Okay let's go */
    try {

        provider = new ethers.providers.JsonRpcProvider(getRpc());

        duelContract = new ethers.Contract(
            config.duelContract,
            abiduel,
            provider
        );

        wallet = await fs.existsSync(config.wallet.encryptedWalletPath)
            ? await getEncryptedWallet()
            : await createWallet();


        // If AutoCompleteDuel is activated, check for active Duel and Complete

        if (activateAutoCompleteDuel) {
            duelToComplete = await getActiveDuels(config.wallet.address)

            // If there is an active Duel
            if (duelToComplete != undefined) {

                currentBlockNr = await provider.getBlockNumber()
                blockNrTrigger = Number(duelToComplete.startBlock._hex) + waitBlockTimeToAutocomplete

                if (currentBlockNr > blockNrTrigger) {
                    await autoCompleteActiveDuel(duelToComplete.duelID)
                }
                else {
                    console.log(`⏱‍  Auto-Completing Duel ${duelToComplete.duelID} delayed to save some fees.\n`);
                }
            }
        }


        // Check the Lobby for pending Duels

        pendingHeroInLobby = await getPlayerDuelEntries(config.wallet.address)

        // If no Hero is in Lobby, send Hero to Lobby
        if (pendingHeroInLobby === undefined) {
            sendToDuel();   // Getting ready
        }
        else {  // Hero is already in Lobby, so we wait till Match is completed
            consoleCountdown(waitTimeLobby, "Hero is already in Lobby waiting for a Match, let's wait...", 'restart')
        }

    } catch (err) {

        console.error(`Network Error: Unable to run: ${err.message}`);

        /* Try again */
        consoleCountdown(waitTimeAfterError, "Let's try again", 'restart')

    }
}


// Function: get Encrypted Wallet

async function getEncryptedWallet() {
    let pw = seedPassword;

    try {
        let encryptedWallet = fs.readFileSync(
            config.wallet.encryptedWalletPath,
            "utf8"
        );
        let decryptedWallet = ethers.Wallet.fromEncryptedJsonSync(
            encryptedWallet,
            pw
        );
        return decryptedWallet.connect(provider);
    } catch (err) {
        throw new Error(
            'Unable to read your encrypted wallet. Try again, making sure you provide the correct password. If you have forgotten your password, delete the file "w.json" and run the application again.'
        );
    }
}


// Function: Create Wallet

async function createWallet() {
    console.log("Hi. You have not yet encrypted your private key.");
    let pw = await promptForInput(
        "🔑 Choose a password for encrypting your private key and enter it here: ",
        "password"
    );
    let pk = await promptForInput(
        "🔒 Now enter your private key: ",
        "private key"
    );

    try {
        let newWallet = new ethers.Wallet(pk, provider);
        let enc = await newWallet.encrypt(pw);
        fs.writeFileSync(config.wallet.encryptedWalletPath, enc);
        return newWallet;
    } catch (err) {
        throw new Error(
            "❌ Unable to create your wallet. Try again and make sure you provide a valid private key."
        );

    }
}


// Function: Create Wallet - Input

async function promptForInput(prompt, promptFor) {
    const read = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    try {
        let input = await new Promise((resolve) => {
            read.question(prompt, (answer) => resolve(answer));
        });
        if (!input)
            throw new Error(
                `No ${promptFor} provided. Start the application again and provide a ${promptFor}.`
            );
        return input;
    } finally {
        read.close();
    }
}


// Function: Console Countdown

async function consoleCountdown(timeToWait, message, action) {

    let count = 0;
    let waitingTime = timeToWait * 1000;
    waitingTime = ((Math.floor(Math.random() * (5 - 0 + 1)) + 0) * 1000) + waitingTime;

    console.log(`🕒 ${message} ▶️   ${(waitingTime - count) / 1000} seconds...`);

    while (count < waitingTime) {
        count += 1000;
        await bluebird.delay(1000);
        console.log(`\x1B[1A🕒 ${message} ▶️   ${(waitingTime - count) / 1000} seconds...`);
    }

    if (action === 'restart') { start() }
    if (action === 'exit') { process.exit() }

}



// Function: AutoComplete Active Duel

async function autoCompleteActiveDuel(duelId) {

    try {
        console.log(`🤼‍♂‍  Trying to complete Active Duel ${duelId}...\n`);

        await tryTransactionAutocompleteDuel(
            duelContract
                .connect(wallet)
                .completeDuel(duelId)
        )

    } catch (err) {

        console.warn('⚠️  Error completing duel');
        //console.log(err)

    }
}


// Function: Try Transaction for Autocompleting Duel

async function tryTransactionAutocompleteDuel(transaction) {

    // If Transaction takes too long, exit Script and Restart

    const timeout = setTimeout(() => {
        console.log("⌛ Transaction Timeout. (tryTransactionAutocompleteDuel)");
        //process.exit()
    }, transaction_timeout * 1000)


    try {

        let tx = await transaction;
        receipt = await tx.wait();

        if (receipt.status === 1) {
            console.log("✔️  Duel automatically completed!");
            console.log('🌐 Tx: ' + receipt.transactionHash + ', Block: ' + receipt.blockNumber + '\n')
        }
        if (receipt.status !== 1) {
            console.log("❌ Receipt threw an error.");
            throw new Error(`Receipt had a status of ${receipt.status}`);
        }

        clearTimeout(timeout);

    } catch (err) {

        clearTimeout(timeout);

        console.log("❌ Error broadcasting transaction for autocompleting Duel.\n");

    }
}


// Function: Send Hero to Duel

async function sendToDuel() {

    // get Hero-Data (Name etc. from external API)
    const herodata = await getHeroMetaData(heroid[0]);   // console.log(herodata)



    try {
        console.log(`⚔️  Sending ${herodata.firstname_string} ${herodata.lastname_string} to Duel-Lobby...\n`);

        await tryTransaction(
            duelContract
                .connect(wallet)
                .enterDuelLobby(
                    type,
                    heroid,
                    jewelfee,
                    background,
                    stat
                )
        )

    } catch (err) {

        console.warn('⚠️  Error starting duel - this will be retried next polling interval.');
        //console.log(err)

        /* Try again */
        consoleCountdown(waitTimeAfterError, "Let's try again", 'restart')

    }
}


// Function: Try Transaction for sending Hero to Duel

async function tryTransaction(transaction) {

    // If Transaction takes too long, exit Script and Restart

    const timeout = setTimeout(() => {
        console.log("⌛ Transaction Timeout. (tryTransaction)");
        process.exit()
    }, transaction_timeout * 1000)


    try {

        let tx = await transaction;
        receipt = await tx.wait();

        if (receipt.status === 1) {
            console.log("✔️  Hero successfully waiting for a Match!");
            console.log('🌐 Tx: ' + receipt.transactionHash + ', Block: ' + receipt.blockNumber + '\n')
        }
        if (receipt.status !== 1) {
            console.log("❌ Receipt threw an error.");
            throw new Error(`Receipt had a status of ${receipt.status}`);
        }

        clearTimeout(timeout);

        /* Successful Transaction - Start again after a while */
        consoleCountdown(waitTimeAfterSuccess, "That worked fine! Let's start this again!", 'restart')

    } catch (err) {

        clearTimeout(timeout);


        if (err.message.includes('UNPREDICTABLE_GAS_LIMIT')) {
            console.log("⚠️  There is a Network-Problem, or you don't have enough ONE/JEWEL/GOLD in your Wallet)\n");

            /* Error Transaction - Start again after a while */
            consoleCountdown(waitTimeAfterError, "Let's try again", 'restart')
        }
        else {
            console.log("❌ Error broadcasting transaction for sending Hero to Duel Lobby.\n");

            /* Error Transaction - Start again after a while */
            consoleCountdown(waitTimeAfterTXFail, "Let's try again", 'restart')
        }

    }
}


// Function: Fetch external Hero Data

async function getHeroMetaData(heroID) {

    try {

        const result = await axios.post("https://us-central1-defi-kingdoms-api.cloudfunctions.net/query_heroes", {
            "limit": 100, "params": [{ "field": "owner", "operator": "=", "value": config.wallet.address }], "offset": 0, "order": { "orderBy": "current_stamina", "orderDir": "desc" }
        });

        return result.data.find((hero) => hero.id == heroID)

    } catch (err) {

        console.log('⚠️ Could not fetch Hero-Metadata, but that is not a problem.')
        hero_dummydata = {
            firstname_string: 'No First Name',
            lastname_string: 'No Last Name'
        }

        return hero_dummydata

    }
}


// Run Script
start();
