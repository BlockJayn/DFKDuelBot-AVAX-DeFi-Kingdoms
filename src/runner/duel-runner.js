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
let provider, duelContract, wallet;
let receipt = { status: null }

// RPC - switch automatically between harmonyRpc & poktRpc
let rpc_auto_switch = true               // true: switch network on errors automatically | false: take standard settings from config
let start_rpc = config.rpc.harmonyRpc    // Start with Main-RPC
let current_rpc

// Hero & Game Data
const seedPassword = 'INSERTYOURPASSWORDHERE'             //  Password for encrypting your seedphrase
const type = 1                              //  Duel Game-Type = 1, 3 or 9
const heroid = [12345]                      //  Duel Hero ID(s), like [ '260714', '154849', '30932' ]
const jewelfee = '0x016345785d8a0000'       //  Duel Jewel-Fee in HEX = 100000000000000000
const background = 4                        //  Duel Background
const stat = 0                              //  Duel Stat

// Timer - in seconds
const waitTimeAfterSuccess = 120    // Wait till next try after Success
const waitTimeAfterError = 120      // Wait till next try after Error
const waitTimeAfterTXFail = 10      // Wait till next try after Error
const transaction_timeout = 70      // How long to wait, till Timeout

/*****************************************************************/
// TODO: - Check if enough ONE/JEWEL/GOLD Wallet
//       - Implement 3vs3 / 9vs9
//       - Fix node | pm2    w.json / path problem


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

        let standardNet = config.useBackupRpc ? config.rpc.poktRpc : config.rpc.harmonyRpc;
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


        // NOT WORKING CURRNTLY - FIX THIS

        wallet = await fs.existsSync(config.wallet.encryptedWalletPath)
            ? await getEncryptedWallet()
            : await createWallet();

        //wallet = await getEncryptedWallet();



        sendToDuel();   // Getting ready

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


// Function: Send Hero to Duel

async function sendToDuel() {

    // get Hero-Data (Name etc. from external API)
    const herodata = await getHeroMetaData(heroid[0]);   // console.log(herodata)


    try {
        console.log(`⚔️  Trying to start a Duel with ${herodata.firstname_string} ${herodata.lastname_string}...\n`);

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


// Function: Send Hero to Duel

async function tryTransaction(transaction) {

    // If Transaction takes too long, exit Script and Restart

    const timeout = setTimeout(() => {
        console.log("⌛ Transaction Timeout.");
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
            console.log("⚠️  Hero is already in Duel-Queue (or Network-Problem | no ONE/JEWEL/GOLD in Wallet)\n");

            /* Error Transaction - Start again after a while */
            consoleCountdown(waitTimeAfterError, "Let's try again", 'restart')
        }
        else {
            console.log("❌ Error broadcasting transaction.\n");

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
