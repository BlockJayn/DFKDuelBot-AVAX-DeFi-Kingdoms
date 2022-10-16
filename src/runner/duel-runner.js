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
const abicrystal = require("./abi-token-crystal.json");
const abigold = require("./abi-token-gold.json");
const abiraffletickets = require("./abi-raffle-tickets.json");

let provider,
    duelContract,
    crystalContract,
    goldContract,
    raffleticketsContract,
    wallet,
    current_rpc,
    pendingHeroInLobby,
    duelToComplete,
    currentBlockNr,
    jewelBalance,
    crystalBalance,
    goldBalance,
    raffleticketsBalance;
let receipt = { status: null };

// DFK Develper-API
const GraphQLClient = require("graphql-request").GraphQLClient;
const gql = require("graphql-request").gql;
const url =
    "https://defi-kingdoms-community-api-gateway-co06z8vi.uc.gateway.dev/graphql";

// RPC - switch automatically between avaxRpc & avaxRpcBackup
let rpc_auto_switch = config.rpc.rpc_auto_switch; // true: switch network on errors automatically | false: take standard settings from config
let start_rpc = config.rpc.avaxRpc; // Start with Main-RPC

// Hero & Game Data
const seedPassword = config.wallet.seedPassword; //  Password for encrypting your seedphrase
const gameType = config.game.gameType; //  Duel Game-Type = 1, 3 or 9
const heroid = config.game.heroid; //  Duel Hero ID(s), like [ '260714', '154849', '30932' ]
const fallbackHeroid = config.game.fallbackHeroid; //  Duel Hero ID(s), like [ '260714', '154849', '30932' ]
const jewelfee = config.game.jewelfee; //  Duel Jewel-Fee in HEX:  0.1 = 0x016345785d8a0000 || 0.3 = 0x429D069189E0000
const background = config.game.background; //  Duel Background
const stat = config.game.stat; //  Duel Stat
const fallbackBackground = config.game.fallbackBackground; //  Duel Background
const fallbackStat = config.game.fallbackStat; //  Duel Stat
const useFallbackHero = config.game.useFallbackHero; //
const activateAutoCompleteDuel = config.game.activateAutoCompleteDuel; //  Automatically Completes Duels
const activateBlacklistedHeroIds = config.blacklist.blacklistActive; //  Don't join Lobby when blacklisted Hero is in Lobby or Active Game, only works for Game-Type "1", Blacklist gets ignored in other game-types
const blacklistedHeroIds = config.blacklist.heroBlacklistIds; //  Array with blacklisted Hero IDs
const blacklistLobbyOnly = config.blacklist.blacklistLobbyOnly; //  Blacklisted Heroes can be in Lobby or actively in a Duel. Set "true" to ignore active Duels (Only Scan Lobby for blacklisted Heroes)
let checkOpponent = false; //  Just a default value that gets overwritten during code-processing if blacklist is set to true in config

// Timer - in seconds
const waitTimeAfterSuccess = config.timers.waitTimeAfterSuccess; // Wait till next try after Success
const waitTimeAfterError = config.timers.waitTimeAfterError; // Wait till next try after Error
const waitTimeAfterTXFail = config.timers.waitTimeAfterTXFail; // Wait till next try after Error
const transaction_timeout = config.timers.transaction_timeout; // How long to wait, till Timeout
const waitTimeLobby = config.timers.waitTimeLobby; // How long to wait to check again, if Hero is still in Lobby without a Match
const waitBlockTimeToAutocomplete = config.timers.waitBlockTimeToAutocomplete; // How many Blocks to wait till Duel gets Auto-Completed
const waitTimeBlacklist = config.timers.waitTimeBlacklist; // Wait till next try after Blacklisted Hero found
const waitTimeOutOfToken = config.timers.waitTimeOutOfToken; // Wait/Stop Script because you dont have enough token to play
/*****************************************************************/

// Notes for Blacklist - ToDo:
// Blacklisted heroes are sometimes active in a duel for a long time, not completing, not joining the lobby again. that blocks us from playing.
// Could be a Problem

// Function: getAddressWithHeroID via DFK-API

async function getAddressWithHeroID(blacklistedHeroIdsArray) {
    const blacklistedWallets = [];

    // Loop through blacklisted HeroIds and get the Wallet Address, then save them to an Array

    for (const blacklistedHeroId of blacklistedHeroIdsArray) {
        const query = gql`
      query getHero($heroId: ID!) {
        hero(id: $heroId) {
          id
          mainClass
          owner {
            id
            name
          }
        }
      }
    `;

        const variables = { heroId: blacklistedHeroId };
        const client = new GraphQLClient(url);
        const data = await client.request(query, variables);

        // Save Wallet-Address to Array
        blacklistedWallets.push(data.hero.owner.id);

        //console.log("DATA: ", data)
        //console.log("ADDRESS: ", data.hero.owner.id)
    }

    return blacklistedWallets;
}

// Function: getPlayerDuelEntries (Lobby)

async function getPlayerDuelEntries(walletaddress) {
    // Open Duels in Lobby without a match, shows also Lobby ID
    //   function getPlayerDuelEntries(address _profile) view returns (tuple(uint256 id, address player, uint256[] heroes, uint256 startBlock, uint256 score, uint256 scoreAfter, uint256 jewelFee, uint256 duelId, uint256 custom1, uint256 custom2, uint8 duelType, uint8 status)[]);
    const getPlayerDuelEntries = await duelContract.getPlayerDuelEntries(
        walletaddress
    );
    console.log(
        "\n🔎 Checking if your Hero is already waiting in the Lobby... " +
        walletaddress
    );

    // console.log(getPlayerDuelEntries)
    // console.log('getPlayerDuelEntries: ' + getPlayerDuelEntries)

    // if array not empty = no active duel
    if (getPlayerDuelEntries.length !== 0) {
        let playerDuelEntries = getPlayerDuelEntries[0];

        console.log(`
        🙋‍♂️‍ \x1b[33mFound your Hero in Lobby waiting for a Match:\x1b[0m
            Lobby ID: ${playerDuelEntries.id} | Duel Type: ${playerDuelEntries.duelType}
            Hero IDs: ${playerDuelEntries.heroes} | Score: ${playerDuelEntries.score}
            Background: ${playerDuelEntries.custom1} | Stat: ${playerDuelEntries.custom2}
            `);
        /*
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
                */
        /*
                for (let index = 0; index < playerDuelEntries.length; index++) {
                    console.log("index:" + index + ":")
                    console.log(playerDuelEntries[index])
                */

        return playerDuelEntries[0];
    } else {
        console.log("😴 Your Hero is not in the Lobby\n");
    }
}

// Function: getActiveDuels (Matched in Lobby, but not completed)

async function getActiveDuels(walletaddress) {
    // Active Duels = Ready to fight - Array is empty when no active duels (waiting for a match)
    //   function getActiveDuels(address _address) view returns (tuple(uint256 id, address player1, address player2, uint256 player1DuelEntry, uint256 player2DuelEntry, address winner, uint256[] player1Heroes, uint256[] player2Heroes, uint256 startBlock, uint8 duelType, uint8 status)[]);
    const getActiveDuels = await duelContract.getActiveDuels(walletaddress);
    console.log("🔎 Checking your Wallet for Active Duels... " + walletaddress);
    // console.log(getActiveDuels)
    // console.log('Active Duels: ' + getActiveDuels)

    // if array not empty = no active duel
    if (getActiveDuels.length !== 0) {
        let activeDuels = getActiveDuels[0];

        console.log(`
        🤼‍♂ \x1b[33mFound Active Duel:\x1b[0m
            Duel ID: ${activeDuels[0]} | Duel Type: ${activeDuels[9]}
            Player 1 Address: ${activeDuels[1]} | Player 2 Address: ${activeDuels[2]}
            Player 1 Heroes: ${activeDuels[6]} | Player 2 Heroes: ${activeDuels[7]}
            `);
        /*
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
                */
        /*
                for (let index = 0; index < activeDuels.length; index++) {
                    console.log("index:" + index + ":")
                    console.log(activeDuels[index])
                }
                */

        return {
            duelID: activeDuels[0],
            startBlock: activeDuels[8],
        };
    } else {
        console.log(
            "😴 Your Hero is not in an Active Duel (No Duels Ready for Battle / No Matches)\n"
        );
    }
}

// Function: FOR OPPONENTS: getActiveDuels (Matched in Lobby, but not completed)

async function checkOpponentActivity(heroBlacklistIds) {
    // If this takes too long, exit Script and Restart

    const timeout = setTimeout(() => {
        console.log("⌛ Transaction Timeout. (checkOpponentActivity)");
        process.exit();
    }, transaction_timeout * 1000);

    try {
        console.log(
            "\n🏹 Checking if Blacklisted Heroes are playing our Game-Type (" +
            gameType +
            "vs" +
            gameType +
            ")"
        );

        let activeOpponentHeroes = [];

        const blacklistedOpponentWalletAddresses = await getAddressWithHeroID(
            heroBlacklistIds
        ); // Returns Array with Wallet-Addresses of blacklisted Hero-IDs
        //console.log("blacklistedOpponentWalletAddresses: " + blacklistedOpponentWalletAddresses)

        for (const blacklistedOpponentWalletAddress of blacklistedOpponentWalletAddresses) {
            console.log(
                "⚫ Checking if Blacklisted Hero is playing: " +
                blacklistedOpponentWalletAddress
            );

            // Check for Opponents Active Duels
            const getActiveDuels = await duelContract.getActiveDuels(
                blacklistedOpponentWalletAddress
            );
            //console.log('🔎 Checking Active Duels of Opponent: ' + blacklistedOpponentWalletAddress)

            // Check for Opponent in Lobby
            const getPlayerDuelEntries = await duelContract.getPlayerDuelEntries(
                blacklistedOpponentWalletAddress
            );
            //console.log('\n🔎 Checking Lobby for Opponent-Address: ' + blacklistedOpponentWalletAddress)

            if (getPlayerDuelEntries.length > 1) {
                // if array greater than 1 = player has more than 1 active duels
                console.log(
                    "⚠️⚠️⚠️⚠️ Opponent has more than ONE Active Lobby at the same time ⚠️⚠️⚠️⚠️" +
                    blacklistedOpponentWalletAddress
                );
                console.log(
                    "⚠️⚠️⚠️⚠️ This Script cannot guarantee considering this Blacklisted Hero-ID correctly - not implemented yet ⚠️⚠️⚠️⚠️"
                );
            }

            if (getPlayerDuelEntries.length !== 0) {
                // if array not empty = no active duel

                let playerDuelEntries = getPlayerDuelEntries[0];
                /*
                                console.log(`
                                        🚨 Found Opponent waiting in the Lobby:
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
                                */

                // Add active Heroes to Array, if they play the same Game-Type as in our config.json

                if (playerDuelEntries[10] === gameType) {
                    heroBlacklistIds.forEach((blacklistedID) => {
                        let playerDuelEntries2 = [Number(playerDuelEntries[2])];

                        playerDuelEntries2.forEach((player1ID) => {
                            if (blacklistedID === player1ID) {
                                activeOpponentHeroes.push(player1ID);
                                console.log(
                                    "  ⚡ Blacklisted Hero is active in a Duel. ID " + player1ID
                                );
                            } else {
                                //console.log('  ✔️  Opponent is the Lobby but not playing with a Blacklisted Hero-ID.')
                            }
                        });
                    });
                }
            } else {
                //console.log('  ✔️  Blacklisted Hero is not in the Lobby')
            }

            if (!blacklistLobbyOnly) {
                // If blacklistLobbyOnly is activated (true)

                if (getActiveDuels.length > 1) {
                    // if array greater than 1 = player has more than 1 active lobby
                    console.log(
                        "⚠️⚠️⚠️⚠️ Opponent has more than ONE Active Duel at the same time ⚠️⚠️⚠️⚠️" +
                        blacklistedOpponentWalletAddress
                    );
                    console.log(
                        "⚠️⚠️⚠️⚠️ This Script cannot guarantee considering this Blacklisted Hero-ID correctly - not implemented yet ⚠️⚠️⚠️⚠️"
                    );
                }

                if (getActiveDuels.length !== 0) {
                    // if array not empty = no active duel

                    let activeDuels = getActiveDuels[0];
                    /*
                                        console.log(`
                                        🚨 Found Opponent having an Active Duel:
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
                                        */

                    // Add active Heroes to Array, if they play the same Game-Type as in our config.json

                    if (activeDuels[9] === gameType) {
                        heroBlacklistIds.forEach((blacklistedID) => {
                            let activeDuels6 = [Number(activeDuels[6])];
                            let activeDuels7 = [Number(activeDuels[7])];

                            activeDuels6.forEach((player1ID) => {
                                if (blacklistedID === player1ID) {
                                    activeOpponentHeroes.push(player1ID);
                                    console.log(
                                        "  ⚡ Hero is active in a Duel... Hero-ID: " + blacklistedID
                                    );
                                } else {
                                    //console.log('  ✔️  Opponent is Active in a Duel but not playing with a Blacklisted Hero-ID.')
                                }
                            });

                            activeDuels7.forEach((player2ID) => {
                                if (blacklistedID === player2ID) {
                                    activeOpponentHeroes.push(player2ID);
                                    console.log(
                                        "  ⚡ Hero is active in a Duel. ID " + blacklistedID
                                    );
                                } else {
                                    //console.log('  ✔️  Opponent is Active in a Duel but not playing with a Blacklisted Hero-ID.')
                                }
                            });
                        });
                    }
                } else {
                    //console.log('  ✔️  Blacklisted Hero has no Active Duel.')
                }
            }
        }

        clearTimeout(timeout);

        if (activeOpponentHeroes.length !== 0) {
            console.log(
                "\n🚨 Active Blacklisted Heroes: " + activeOpponentHeroes + "\n"
            );

            return {
                foundOpponentActive: true,
                activeHeroes: activeOpponentHeroes,
                gameType: gameType,
            };
        } else {
            return {
                foundOpponentActive: false,
                activeHeroes: activeOpponentHeroes,
                gameType: gameType,
            };
        }
    } catch (error) {
        clearTimeout(timeout);

        console.log("❌ Error checking Blacklisted Heroes.\n");
        consoleCountdown(waitTimeAfterError, "Let's try again", "restart");
    }
}

// Function: GetTokenBalance (Jewel, Crystal, Gold)

async function getTokenBalance(walletaddress) {
    try {
        // JEWEL
        jewelBalance = await provider.getBalance(walletaddress);
        jewelBalance = ethers.utils.formatEther(jewelBalance);
        jewelBalance = Math.round(jewelBalance * 100) / 100;
        //console.log('jewelBalance', jewelBalance)

        // CRYSTAL
        crystalBalance = await crystalContract.balanceOf(walletaddress);
        crystalBalance = ethers.utils.formatEther(crystalBalance);
        crystalBalance = Math.round(crystalBalance * 100) / 100;
        //console.log("crystalBalance", crystalBalance)

        // GOLD
        goldBalance = await goldContract.balanceOf(walletaddress);
        goldBalance = ethers.utils.formatUnits(goldBalance, 3);
        goldBalance = Math.round(goldBalance * 100) / 100;
        //console.log("goldBalance", goldBalance)

        // Raffle Tickets
        raffleticketsBalance = await raffleticketsContract.balanceOf(walletaddress);
        raffleticketsBalance = Number(raffleticketsBalance);
        //console.log("raffleticketsBalance", raffleticketsBalance)

        return {
            jewel: jewelBalance,
            crystal: crystalBalance,
            gold: goldBalance,
            raffletickets: raffleticketsBalance,
        };
    } catch (err) {
        console.log("❌ \x1b[31mError checking balance.\x1b[0m\n");

        /* Try again */
        consoleCountdown(waitTimeAfterError, "Let's try again", "restart");
    }
}

// Function: RPC Network / Provider

function getRpc() {
    if (rpc_auto_switch) {
        // ignore standard settings & switch on every failed attempt

        if (start_rpc) {
            current_rpc = start_rpc; // set current used RPC
            console.log("-----------------------------------------------------\n");
            console.log("🌐 Using Network: " + current_rpc + "\n");

            start_rpc = false; // deactivate startRPC for next time, use opposite of current_RPC next time
            return current_rpc;
        } else {
            if (current_rpc === config.rpc.avaxRpc) {
                current_rpc = config.rpc.avaxRpcBackup;
                console.log("-----------------------------------------------------\n");
                console.log(
                    "🔀 Switching to Backup-Network: " + config.rpc.avaxRpcBackup + "\n"
                );
                return current_rpc;
            } else {
                current_rpc = config.rpc.avaxRpc;
                console.log("-----------------------------------------------------\n");
                console.log("🔀 Switching to Mainnet: " + config.rpc.avaxRpc + "\n");
                return current_rpc;
            }
        }
    } else {
        // use standard settings from config-file

        let standardNet = config.rpc.useBackupRpc
            ? config.rpc.avaxRpcBackup
            : config.rpc.avaxRpc;
        console.log("-----------------------------------------------------");
        console.log("🌐 Using Network: " + standardNet + "\n");

        return standardNet;
    }
}

// Function: Start Script

async function start() {
    /* Let's clean up first */
    if (typeof err === "undefined") {
    } else {
        err = undefined;
    } // clean error for next run
    //console.clear()                 // clean the console

    /* Okay let's go */
    try {
        provider = new ethers.providers.JsonRpcProvider(getRpc());

        duelContract = new ethers.Contract(config.duelContract, abiduel, provider);
        crystalContract = new ethers.Contract(
            config.crystalContract,
            abicrystal,
            provider
        );

        goldContract = new ethers.Contract(config.goldContract, abigold, provider);

        raffleticketsContract = new ethers.Contract(
            config.raffleTicketsContract,
            abiraffletickets,
            provider
        );

        wallet = (await fs.existsSync(config.wallet.encryptedWalletPath))
            ? await getEncryptedWallet()
            : await createWallet();

        // Check Token Balance of Player (Jewel, Crystal, Gold)
        const tokenBalance = await getTokenBalance(config.wallet.address);

        console.log("🏦\x1b[35m Your Balance:\n\x1b[0m");
        console.log(
            `     \x1b[96m💎 ${tokenBalance.crystal} CRYSTAL\x1b[0m    \x1b[93m💰 ${tokenBalance.gold} GOLD\x1b[0m    \x1b[92m🟢 ${tokenBalance.jewel} JEWEL\x1b[0m    \x1b[97m📃 ${tokenBalance.raffletickets} Raffle Tickets\x1b[0m\n\n`
        );

        if (tokenBalance.crystal < config.minimumTokenBalanceToPlay.crystal) {
            console.log(
                "🏆\x1b[91m You don't have enough 💎 CRYSTAL to play!\x1b[0m"
            );
            await consoleCountdown(
                waitTimeOutOfToken,
                "The Script has been stopped. Please get more 💎 CRYSTAL and restart the script.",
                "restart"
            );
            process.exit();
        }
        if (tokenBalance.gold < config.minimumTokenBalanceToPlay.gold) {
            console.log("🏆\x1b[91m You don't have enough 💰 GOLD to play!\x1b[0m");
            await consoleCountdown(
                waitTimeOutOfToken,
                "The Script has been stopped. Please get more 💰 GOLD and restart the script.",
                "restart"
            );
            process.exit();
        }
        if (tokenBalance.jewel < config.minimumTokenBalanceToPlay.jewel) {
            console.log("🏆\x1b[91m You don't have enough 🟢 JEWEL to play!\x1b[0m");
            await consoleCountdown(
                waitTimeOutOfToken,
                "The Script has been stopped. Please get more 🟢 JEWEL and restart the script.",
                "restart"
            );
            process.exit();
        }

        // If AutoCompleteDuel is activated, check for active Duel and Complete

        if (activateAutoCompleteDuel) {
            duelToComplete = await getActiveDuels(config.wallet.address);

            // If there is an active Duel
            if (duelToComplete != undefined) {
                currentBlockNr = await provider.getBlockNumber();
                blockNrTrigger =
                    Number(duelToComplete.startBlock._hex) + waitBlockTimeToAutocomplete;

                if (currentBlockNr > blockNrTrigger) {
                    await autoCompleteActiveDuel(duelToComplete.duelID);

                    // Check if game has been won/lost
                    let getDuel = await duelContract.getDuel(duelToComplete.duelID);

                    if (getDuel.winner === config.wallet.address) {
                        console.log("🏆\x1b[32m You WON the match!\n\x1b[0m");
                    } else {
                        console.log("💀\x1b[31m You LOST the match!\n\x1b[0m");
                    }
                } else {
                    console.log(
                        `⏱‍  Auto-Completing Duel ${duelToComplete.duelID} delayed to save some fees.\n`
                    );
                }
            }
        }

        // If Hero-Blacklist is activated, check for blacklisted Heroes and only play, if no Opponent is active
        // Only works for GameType "1"

        if (activateBlacklistedHeroIds && gameType === 1) {
            // Check for Opponents in our GameType in config.json
            checkOpponent = await checkOpponentActivity(blacklistedHeroIds);
            //console.log("checkOpponent", checkOpponent)

            if (checkOpponent === undefined) {
                console.log("❌ Couldn't check for Blacklisted Heroes.");
            }

            if (checkOpponent.foundOpponentActive) {
                if (useFallbackHero) {
                    console.log(
                        "\n🟢 Blacklisted Hero found, let's go on with your Fallback-Hero!\n"
                    );

                    // Check the Lobby for pending Duels
                    pendingHeroInLobby = await getPlayerDuelEntries(
                        config.wallet.address
                    );

                    // If our Hero is not in Lobby, send Hero to Lobby
                    if (pendingHeroInLobby === undefined) {
                        sendToDuel(); // Getting ready
                    } else {
                        // Hero is already in Lobby, so we wait till Match is completed
                        consoleCountdown(
                            waitTimeLobby,
                            "Hero is already in Lobby waiting for a Match, let's wait...",
                            "restart"
                        );
                    }
                } else {
                    consoleCountdown(
                        waitTimeBlacklist,
                        "Blacklisted Hero is currently playing... let's wait and try again...",
                        "restart"
                    );
                }
            } else {
                console.log("\n🟢 No Blacklisted Hero found, let's go on!\n");

                // Check the Lobby for pending Duels
                pendingHeroInLobby = await getPlayerDuelEntries(config.wallet.address);

                // If our Hero is not in Lobby, send Hero to Lobby
                if (pendingHeroInLobby === undefined) {
                    sendToDuel(); // Getting ready
                } else {
                    // Hero is already in Lobby, so we wait till Match is completed
                    consoleCountdown(
                        waitTimeLobby,
                        "Hero is already in Lobby waiting for a Match, let's wait...",
                        "restart"
                    );
                }
            }
        } else {
            // Check the Lobby for pending Duels
            pendingHeroInLobby = await getPlayerDuelEntries(config.wallet.address);

            // If our Hero is not in Lobby, send Hero to Lobby
            if (pendingHeroInLobby === undefined) {
                sendToDuel(); // Getting ready
            } else {
                // Hero is already in Lobby, so we wait till Match is completed
                consoleCountdown(
                    waitTimeLobby,
                    "Hero is already in Lobby waiting for a Match, let's wait...",
                    "restart"
                );
            }
        }
    } catch (err) {
        console.error(
            `❌ \x1b[31mNetwork Error: Unable to run:\x1b[0m ${err.message}`
        );

        /* Try again */
        consoleCountdown(waitTimeAfterError, "Let's try again", "restart");
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
    waitingTime =
        (Math.floor(Math.random() * (5 - 0 + 1)) + 0) * 1000 + waitingTime;

    console.log(`🕒 ${message} ▶️   ${(waitingTime - count) / 1000} seconds...`);

    while (count < waitingTime) {
        count += 1000;
        await bluebird.delay(1000);
        console.log(
            `\x1B[1A🕒 ${message} ▶️   ${(waitingTime - count) / 1000} seconds...`
        );
    }

    if (action === "restart") {
        start();
    }
    if (action === "exit") {
        process.exit();
    }
}

// Function: AutoComplete Active Duel

async function autoCompleteActiveDuel(duelId) {
    try {
        console.log(
            `🤼‍♂‍  \x1b[96mTrying to complete Active Duel ${duelId}...\x1b[0m\n`
        );

        await tryTransactionAutocompleteDuel(
            duelContract.connect(wallet).completeDuel(duelId)
        );
    } catch (err) {
        console.warn("⚠️  \x1b[31mError completing duel\x1b[0m");

        //console.log(err)
    }
}

// Function: Try Transaction for Autocompleting Duel

async function tryTransactionAutocompleteDuel(transaction) {
    // If Transaction takes too long, exit Script and Restart

    const timeout = setTimeout(() => {
        console.log("⌛ Transaction Timeout. (tryTransactionAutocompleteDuel)");
        process.exit();
    }, transaction_timeout * 1000);

    try {
        let tx = await transaction;
        receipt = await tx.wait();

        if (receipt.status === 1) {
            console.log("✔️  \x1b[96mDuel automatically completed!\x1b[0m");
            console.log(
                "🌐 Tx: " +
                receipt.transactionHash +
                ", Block: " +
                receipt.blockNumber +
                "\n"
            );
        }
        if (receipt.status !== 1) {
            console.log("❌ Receipt threw an error.");
            throw new Error(`Receipt had a status of ${receipt.status}`);
        }

        clearTimeout(timeout);
    } catch (err) {
        clearTimeout(timeout);

        console.log(
            "❌ \x1b[31mError broadcasting transaction for autocompleting Duel.\x1b[0m\n"
        );
    }
}

// Function: Send Hero to Duel

async function sendToDuel() {
    // get Hero-Data (Name etc. from external API)
    const herodata = await getHeroMetaData(heroid[0]); // console.log(herodata)

    try {
        if (checkOpponent.foundOpponentActive) {
            if (gameType === 1) {
                console.log(
                    `⚔️  \x1b[96mSending Fallback-Hero ${herodata.name} to Duel-Lobby...\x1b[0m\n`
                );
            } else {
                console.log(
                    `⚔️  \x1b[96mSending Fallback-Hero ${herodata.name} and others to Duel-Lobby...\x1b[0m\n`
                );
            }

            await tryTransaction(
                duelContract
                    .connect(wallet)
                    .enterDuelLobby(
                        gameType,
                        fallbackHeroid,
                        jewelfee,
                        fallbackBackground,
                        fallbackStat
                    )
            );
        } else {
            if (gameType === 1) {
                console.log(
                    `⚔️  \x1b[96mSending ${herodata.name} to Duel-Lobby...\x1b[0m\n`
                );
            } else {
                console.log(
                    `⚔️  \x1b[96mSending ${herodata.name} and others to Duel-Lobby...\x1b[0m\n`
                );
            }

            await tryTransaction(
                duelContract
                    .connect(wallet)
                    .enterDuelLobby(gameType, heroid, jewelfee, background, stat)
            );
        }
    } catch (err) {
        console.warn(
            "⚠️  Error starting duel - this will be retried next polling interval."
        );
        //console.log(err)

        /* Try again */
        consoleCountdown(waitTimeAfterError, "Let's try again", "restart");
    }
}

// Function: Try Transaction for sending Hero to Duel

async function tryTransaction(transaction) {
    // If Transaction takes too long, exit Script and Restart

    const timeout = setTimeout(() => {
        console.log("⌛ Transaction Timeout. (tryTransaction)");
        process.exit();
    }, transaction_timeout * 1000);

    try {
        let tx = await transaction;
        receipt = await tx.wait();

        if (receipt.status === 1) {
            console.log(
                "✔️  \x1b[32mHero successfully sent to Lobby, waiting for a Match now!\x1b[0m"
            );
            console.log(
                "🌐 Tx: " +
                receipt.transactionHash +
                ", Block: " +
                receipt.blockNumber +
                "\n"
            );
        }
        if (receipt.status !== 1) {
            console.log("❌ Receipt threw an error.");
            throw new Error(`Receipt had a status of ${receipt.status}`);
        }

        clearTimeout(timeout);

        /* Successful Transaction - Start again after a while */
        consoleCountdown(
            waitTimeAfterSuccess,
            "That worked fine! Let's start this again!",
            "restart"
        );
    } catch (err) {
        clearTimeout(timeout);

        if (err.message.includes("UNPREDICTABLE_GAS_LIMIT")) {
            console.log(
                "⚠️  There is a Network-Problem, or you don't have enough ONE/JEWEL/GOLD in your Wallet)\n"
            );

            /* Error Transaction - Start again after a while */
            consoleCountdown(waitTimeAfterError, "Let's try again", "restart");
        } else {
            console.log(
                "❌ \x1b[31mError broadcasting transaction for sending Hero to Duel Lobby.\x1b[0m\n"
            );

            /* Error Transaction - Start again after a while */
            consoleCountdown(waitTimeAfterTXFail, "Let's try again", "restart");
        }
    }
}

// Function: Fetch external Hero Data

async function getHeroMetaData(heroID) {
    const config = {
        method: "get",
        url: `https://heroes.defikingdoms.com/token/${heroID}`,
    };

    let result = await axios(config);

    return result.data;
}

// Run Script
start();
