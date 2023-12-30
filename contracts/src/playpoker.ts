// Modified from Hello World tutorial at https://docs.minaprotocol.com/zkapps/tutorials/hello-world
import { PoZKerApp, actionMapping, cardMapping52 } from './PoZKer.js';
//import { readline } from 'readline';
//const readline = require('readline');
import readline from 'readline';
import fs from 'fs';
import { promisify } from 'util';
import { Cipher, ElGamalFF } from 'o1js-elgamal';
import {
    isReady,
    shutdown,
    Bool,
    Field,
    Mina,
    PrivateKey,
    AccountUpdate,
    UInt64,
    Poseidon,
    MerkleMap,
    MerkleMapWitness,
} from 'o1js';
import { getHoleFromOracle, getFlopFromOracle, getRiverFromOracle, getTakeFromOracle } from "./oracleLib.js";
import { MerkleMapSerializable, deserialize } from './merkle_map_serializable.js';
import { Card, getMerkleMapWitness, parseCardInt, getShowdownData } from './gameutils.js';

await isReady;

// import { evaluate_7_cards } from './evaluator7.js';
//ReadLine.
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const useProof = false;
console.log("Welcome to PoZKer!");
console.log("Funds will be auto-deposited and gameplay will start automatically...");
const Local = Mina.LocalBlockchain({ proofsEnabled: useProof });
Mina.setActiveInstance(Local);
const { privateKey: deployerKey, publicKey: deployerAccount } = Local.testAccounts[0];
const { privateKey: fundedPrivKey1, publicKey: fundedPubKey1 } = Local.testAccounts[1];
//const { privateKey: playerPrivKey2, publicKey: playerPubKey2 } = Local.testAccounts[2];

const playerPrivKey1: PrivateKey = PrivateKey.fromBase58("EKE3TZ7PYTyf4XSyEcqCUuyFZAtiW5w9Enm5PUjruTLFUHangY3k");;
const playerPubKey1 = playerPrivKey1.toPublicKey();
const playerPrivKey2: PrivateKey = PrivateKey.fromBase58("EKErvBujci5uiqL5nBv5kBP5d2MMz2zE8E5EtdZZPSF6p7AhzSK5");;
const playerPubKey2 = playerPrivKey2.toPublicKey();


// Load merkle maps for our hand lookups
const merkleMapBasicFn = "merkleMapBasic.json"
const merkleMapFlushFn = "merkleMapFlush.json"

const jsonDataBasic = fs.readFileSync(merkleMapBasicFn, 'utf8');
const merkleMapBasic: MerkleMapSerializable = deserialize(jsonDataBasic);

const jsonDataFlush = fs.readFileSync(merkleMapFlushFn, 'utf8');
const merkleMapFlush: MerkleMapSerializable = deserialize(jsonDataFlush);

// These have to be stored in PoZKer class!
console.log(merkleMapBasic.getRoot())
console.log(merkleMapFlush.getRoot())



//txnFund = await Mina.transaction(fundedPubKey1, () => {
//  AccountUpdate.fundNewAccount(playerPubKey1);
//
//    send({ to: player, amount: sendAmount });
//  //zkAppInstance.deploy();
//});
//await txnFund.sign([feePayer1.privateKey, zkAppPrivateKey]).send();

//const p1Hash = Poseidon.hash(playerPrivKey1.toFields());
//const p2Hash = Poseidon.hash(playerPrivKey2.toFields());
//console.log("HASHes", p1Hash.toString())
//console.log("HASHes", p2Hash.toString())


// Keys for elgamal encryption/decryption
let keys1 = ElGamalFF.generateKeys();
let keys2 = ElGamalFF.generateKeys();


function getRandomInt(min: number, max: number) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

const SLEEP_TIME_SHORT = 0; // 1000;
const SLEEP_TIME_LONG = 0; //3000;
const GAME_ID = getRandomInt(1, 9999999999)
console.log(" GENERATING GAME WITH ID ", GAME_ID);

//console.log("ACCOUNTS", playerPubKey1.toBase58(), playerPubKey2.toBase58());

function question(theQuestion: string) {
    return new Promise(resolve => rl.question(theQuestion, answ => resolve(answ)))
}

function clear() {
    readline.cursorTo(process.stdout, 0, 0);
    readline.clearLine(process.stdout, 0);
    readline.clearScreenDown(process.stdout);
}

const sleep = promisify(setTimeout);

// ----------------------------------------------------
// Create a public/private key pair. The public key is your address and where you deploy the zkApp to
const zkAppPrivateKey = PrivateKey.random();
const zkAppAddress = zkAppPrivateKey.toPublicKey();
const zkAppInstance = new PoZKerApp(zkAppAddress);
const deployTxn = await Mina.transaction(deployerAccount, () => {
    AccountUpdate.fundNewAccount(deployerAccount);
    zkAppInstance.deploy();
});
await deployTxn.sign([deployerKey, zkAppPrivateKey]).send();
// ----------------------------------------------------

//const txn1 = await Mina.transaction(playerPubKey1, () => {
//    zkAppInstance.initState(playerPubKey1, playerPubKey2)
//});
//await txn1.prove();
//await txn1.sign([playerPrivKey1]).send();

let txSend1 = await Mina.transaction(fundedPubKey1, () => {
    AccountUpdate.fundNewAccount(fundedPubKey1).send({
        to: playerPubKey1,
        amount: 100,
    });
});
await txSend1.prove();
await txSend1.sign([fundedPrivKey1]).send();

let txSend2 = await Mina.transaction(fundedPubKey1, () => {
    AccountUpdate.fundNewAccount(fundedPubKey1).send({
        to: playerPubKey2,
        amount: 100,
    });
});
await txSend2.prove();
await txSend2.sign([fundedPrivKey1]).send();


/////////////// Stage 0 - Set players
const txn = await Mina.transaction(fundedPubKey1, () => {
    zkAppInstance.initState(playerPubKey1, playerPubKey2)
});
await txn.prove();
await txn.sign([fundedPrivKey1]).send();
console.log("Initialized players...");


/////////////// Stage 1 - Deposit
console.log("Auto depositing for player 1...");
const txn2 = await Mina.transaction(playerPubKey1, () => {
    zkAppInstance.deposit(playerPrivKey1)
});
await txn2.prove();
await txn2.sign([playerPrivKey1]).send();
const bal1 = zkAppInstance.stack1.get();
console.log("Player 1 Stack:", bal1.toString());

console.log("Auto depositing for player 2...");
const txn3 = await Mina.transaction(playerPubKey2, () => {
    zkAppInstance.deposit(playerPrivKey2)
});
await txn3.prove();
await txn3.sign([playerPrivKey2]).send();
const bal2 = zkAppInstance.stack2.get();
console.log("Player 2 Stack:", bal2.toString());

await sleep(SLEEP_TIME_LONG);

console.log("Dealing cards to player 1, look away player 2!");
await sleep(SLEEP_TIME_SHORT);
let card1 = -1
let card2 = -1;

const retVal = await getHoleFromOracle(GAME_ID.toString());
const retValHand = retVal.hand
card1 = retValHand[0];
card2 = retValHand[1];

// For showdown we'll need the prime52 of the cards
const card1prime52 = cardMapping52[parseCardInt(card1)];
const card2prime52 = cardMapping52[parseCardInt(card2)];


// Player 1 will encrypt their cards - we'll pretend that we've done 
// shuffles and encryptions, and player 2 has decrypted their half of the
// key and that is what player2 is committing to the blockchain...
let c0 = ElGamalFF.encrypt(Field(card1), keys1.pk);
let c1 = ElGamalFF.encrypt(Field(card2), keys1.pk);

const txnC1 = await Mina.transaction(playerPubKey2, () => {
    // Have to put it in slots 1 and 2
    const slotI = Field(1);
    zkAppInstance.commitCard(slotI, c0.c1)
});
await txnC1.prove();
await txnC1.sign([playerPrivKey2]).send();

const txnC2 = await Mina.transaction(playerPubKey2, () => {
    // Have to put it in slots 1 and 2
    const slotI = Field(2);
    zkAppInstance.commitCard(slotI, c1.c1)
});
await txnC2.prove();
await txnC2.sign([playerPrivKey2]).send();

// Now player 1 can call to store a hashed version of card onchain
const txnC3 = await Mina.transaction(playerPubKey1, () => {
    // Have to put it in slots 1 and 2
    const slotI = Field(0);
    const c2a = c0.c2;
    const c2b = c1.c2;
    const cipherKeys = keys1.sk;
    const playerSecKey = playerPrivKey1;
    zkAppInstance.storeCardHash(slotI, c2a, c2b, cipherKeys, playerSecKey)
});
await txnC3.prove();
await txnC3.sign([playerPrivKey1]).send();


//const txn90 = await Mina.transaction(playerPubKey1, async () => {
//    console.log("RETVAL", retVal);
//});
//await txn90.prove();
//await txn90.sign([playerPrivKey1]).send();
console.log("player 1 hole cards:", parseCardInt(parseInt(card1.toString())), parseCardInt(parseInt(card2.toString())));
console.log("Screen will be cleared after 3 seconds...")

await sleep(SLEEP_TIME_LONG);
clear();


console.log("Dealing cards to player 2, look away player 1!");
await sleep(SLEEP_TIME_SHORT);
let card3 = -1
let card4 = -1;

const retVal2 = await getHoleFromOracle(GAME_ID.toString());
const retValHand2 = retVal2.hand
card3 = retValHand2[0];
card4 = retValHand2[1];

const card3prime52 = cardMapping52[parseCardInt(card3)];
const card4prime52 = cardMapping52[parseCardInt(card4)];

console.log("player 2 hole cards:", parseCardInt(parseInt(card3.toString())), parseCardInt(parseInt(card4.toString())));
console.log("Screen will be cleared after 3 seconds...")

// Exact same logic as for player 1
let c3 = ElGamalFF.encrypt(Field(card3), keys2.pk);
let c4 = ElGamalFF.encrypt(Field(card4), keys2.pk);

const txnC4 = await Mina.transaction(playerPubKey1, () => {
    // Have to put it in slots 1 and 2
    const slotI = Field(1);
    zkAppInstance.commitCard(slotI, c3.c1)
});
await txnC4.prove();
await txnC4.sign([playerPrivKey1]).send();

const txnC5 = await Mina.transaction(playerPubKey1, () => {
    // Have to put it in slots 1 and 2
    const slotI = Field(2);
    zkAppInstance.commitCard(slotI, c4.c1)
});
await txnC5.prove();
await txnC5.sign([playerPrivKey1]).send();

// Now player 1 can call to store a hashed version of card onchain
const txnC6 = await Mina.transaction(playerPubKey2, () => {
    // Have to put it in slots 1 and 2
    const slotI = Field(1);
    const c2a = c3.c2;
    const c2b = c4.c2;
    const cipherKeys = keys2.sk;
    const playerSecKey = playerPrivKey2;
    zkAppInstance.storeCardHash(slotI, c2a, c2b, cipherKeys, playerSecKey)
});
await txnC6.prove();
await txnC6.sign([playerPrivKey2]).send();

await sleep(SLEEP_TIME_LONG);
clear();



// now start game loop...
console.log("ACTIONS LIST:")
console.log("Bet: 1")
console.log("Call: 2")
console.log("Fold: 3")
console.log("Raise: 4")
console.log("Check: 5")

// Map actions to their prime values to keep game simple for users
// Bet 23
// Call 29
// Fold 31
// Raise 37
// Check 41
const actionMap: { [key: number]: number } = {
    1: actionMapping["Bet"],
    2: actionMapping["Call"],
    3: actionMapping["Fold"],
    4: actionMapping["Raise"],
    5: actionMapping["Check"],
};

const actionList = ["", "Bets", "Calls", "Folds", "Raises", "Checks"]



function get_street(gamestate: number) {
    if (gamestate % 5 == 0) {
        return "Preflop";
    }
    else if (gamestate % 7 == 0) {
        return "Flop";
    }
    else if (gamestate % 11 == 0) {
        return "Turn";
    }
    else if (gamestate % 13 == 0) {
        return "River";
    }
    else if (gamestate % 17 == 0) {
        return "Showdown";
    }
    throw "Invalid street!";
}

function get_player(gamestate: number) {
    if (gamestate % 2 == 0) {
        return "p1";
    }
    else if (gamestate % 3 == 0) {
        return "p2";
    }
    throw "Invalid player!";
}

// let gamestate = parseInt(zkAppInstance.gamestate.get().toString());
let currStreet = "Preflop";

const boardStrs: Card[] = []
const boardPrimes: UInt64[] = []


function buildJSMap(fnLoad: string) {
    const map = new MerkleMap();
    const dataArray = JSON.parse(fs.readFileSync(fnLoad, 'utf-8'));
    //const dataArray = JSON.parse(fs.readFileSync('./lookup_table_basic.json', 'utf-8'))
    console.log("DATA ARRAY", dataArray.length);
    let counter = 0;
    for (var key in dataArray) {
        if (dataArray.hasOwnProperty(key)) {
            console.log(counter, key + " -> " + dataArray[key]);

            // map.set(Field(0), Field(100));
            map.set(Field(key), Field(dataArray[key]));
            counter += 1;
            // Break early for testing...
            if (counter > 5) {
                break;
            }
        }
    }
    return map;
}






// Main game loop - keep accepting actions until hand ends
while (true) {
    let gamestate = parseInt(zkAppInstance.gamestate.get().toString());

    // let player: string = lastAction < LastActions.Bet_P1 ? "0" : "1";
    let player: string = get_player(gamestate);

    if (player === "p1") {
        const action = await question("Player 1 - Choose your action\n") as number;
        // If it's a bet/call/raise - need to include amount
        let amount: number = 0;
        if (action == 1 || action == 4) {
            amount = await question("Player 1 - Choose amount\n") as number;
        }
        const actionField = UInt64.from(actionMap[action]);
        const betSize = UInt64.from(amount);
        const txn = await Mina.transaction(playerPubKey1, () => {
            zkAppInstance.takeAction(playerPrivKey1, actionField, betSize)
        });
        await txn.prove();
        await txn.sign([playerPrivKey1]).send();
        const actionStr = actionList[action];
        console.log("Player 1", actionStr)
    }
    else if (player === "p2") {

        const action = await question("Player 2 - Choose your action\n") as number;
        // If it's a bet/call/raise - need to include amount
        let amount: number = 0;
        if (action == 1 || action == 4) {
            amount = await question("Player 2 - Choose amount\n") as number;
        }
        const actionField = UInt64.from(actionMap[action]);
        const betSize = UInt64.from(amount);
        const txn = await Mina.transaction(playerPubKey2, () => {
            zkAppInstance.takeAction(playerPrivKey2, actionField, betSize);
        });
        await txn.prove();
        await txn.sign([playerPrivKey2]).send();
        const actionStr = actionList[action];
        console.log("Player 2", actionStr)
    }
    else {
        // This condition would mean game is over...
        break
    }

    gamestate = parseInt(zkAppInstance.gamestate.get().toString());
    let street = get_street(gamestate);
    // const street = zkAppInstance.street.get().toString()
    if (street == "Showdown") {
        // BOTH players must show cards before we can do showdown...

        const allCardsP1: [UInt64, UInt64, UInt64, UInt64, UInt64, UInt64, UInt64] = [UInt64.from(card1prime52), UInt64.from(card2prime52), boardPrimes[0], boardPrimes[1], boardPrimes[2], boardPrimes[3], boardPrimes[4]]
        const [useCardsP1, isFlushP1, merkleMapKeyP1, merkleMapValP1] = getShowdownData(allCardsP1);
        const pathP1: MerkleMapWitness = getMerkleMapWitness(merkleMapBasic, merkleMapFlush, isFlushP1.toBoolean(), merkleMapKeyP1)

        const allCardsP2: [UInt64, UInt64, UInt64, UInt64, UInt64, UInt64, UInt64] = [UInt64.from(card3prime52), UInt64.from(card4prime52), boardPrimes[0], boardPrimes[1], boardPrimes[2], boardPrimes[3], boardPrimes[4]]
        const [useCardsP2, isFlushP2, merkleMapKeyP2, merkleMapValP2] = getShowdownData(allCardsP2);
        const pathP2: MerkleMapWitness = getMerkleMapWitness(merkleMapBasic, merkleMapFlush, isFlushP2.toBoolean(), merkleMapKeyP2)

        const txnA = await Mina.transaction(playerPubKey1, () => {
            zkAppInstance.showCards(allCardsP1[0],
                allCardsP1[1],
                allCardsP1[2],
                allCardsP1[3],
                allCardsP1[4],
                allCardsP1[5],
                allCardsP1[6],
                useCardsP1[0],
                useCardsP1[1],
                useCardsP1[2],
                useCardsP1[3],
                useCardsP1[4],
                useCardsP1[5],
                useCardsP1[6],
                isFlushP1,
                playerPrivKey1,
                merkleMapKeyP1,
                merkleMapValP1,
                pathP1)
        });
        await txnA.prove();
        await txnA.sign([playerPrivKey1]).send();

        const txnB = await Mina.transaction(playerPubKey2, () => {
            zkAppInstance.showCards(allCardsP2[0],
                allCardsP2[1],
                allCardsP2[2],
                allCardsP2[3],
                allCardsP2[4],
                allCardsP2[5],
                allCardsP2[6],
                useCardsP2[0],
                useCardsP2[1],
                useCardsP2[2],
                useCardsP2[3],
                useCardsP2[4],
                useCardsP2[5],
                useCardsP2[6],
                isFlushP2,
                playerPrivKey2,
                merkleMapKeyP2,
                merkleMapValP2,
                pathP2)
        });
        await txnB.prove();
        await txnB.sign([playerPrivKey2]).send();

        // Showdown means no more actions, need to handle card logic though
        // showdown(v1: Field, v2: Field)
        const txn = await Mina.transaction(playerPubKey2, () => {
            zkAppInstance.showdown()
        });
        await txn.prove();
        await txn.sign([playerPrivKey2]).send();

        break
    }
    // If it was a street transition, need to get board cards
    else if (currStreet != street) {
        if (street == "Flop") {
            console.log("DEALING FLOP...")
            let flop = await getFlopFromOracle(GAME_ID.toString());
            let flopHand: [Card, Card, Card] = flop.hand
            boardStrs.push(parseCardInt(parseInt(flopHand[0])));
            boardStrs.push(parseCardInt(parseInt(flopHand[1])));
            boardStrs.push(parseCardInt(parseInt(flopHand[2])));
            console.log("BOARD IS", boardStrs);

            // We have to keep track of the board cards...
            const cardPrime1 = cardMapping52[flopHand[0]];
            const cardPrime2 = cardMapping52[flopHand[1]];
            const cardPrime3 = cardMapping52[flopHand[2]];
            boardPrimes.push(UInt64.from(cardPrime1));
            boardPrimes.push(UInt64.from(cardPrime2));
            boardPrimes.push(UInt64.from(cardPrime3));

            // have to keep our own tally of primes...
            const txnA = await Mina.transaction(playerPubKey2, () => {
                zkAppInstance.tallyBoardCards(Field(cardPrime1))
            });
            await txnA.prove();
            await txnA.sign([playerPrivKey2]).send();

            const txnB = await Mina.transaction(playerPubKey2, () => {
                zkAppInstance.tallyBoardCards(Field(cardPrime2))
            });
            await txnB.prove();
            await txnB.sign([playerPrivKey2]).send();


            const txnC = await Mina.transaction(playerPubKey2, () => {
                zkAppInstance.tallyBoardCards(Field(cardPrime3))
            });
            await txnC.prove();
            await txnC.sign([playerPrivKey2]).send();

        }
        else if (street == "Turn") {
            console.log("DEALING TURN...")
            let turn = await getTakeFromOracle(GAME_ID.toString());
            let turnHand: Card = turn.hand[0]
            boardStrs.push(parseCardInt(parseInt(turnHand)));
            console.log("BOARD IS", boardStrs);

            //const cardPrime1 = (takeHand[0] % 13);
            const cardPrime1 = cardMapping52[turnHand];
            boardPrimes.push(UInt64.from(cardPrime1));
            const txnA = await Mina.transaction(playerPubKey2, () => {
                zkAppInstance.tallyBoardCards(Field(cardPrime1))
            });
            await txnA.prove();
            await txnA.sign([playerPrivKey2]).send();

        }
        else if (street == "River") {
            console.log("DEALING RIVER...")
            let river = await getRiverFromOracle(GAME_ID.toString());
            let riverHand: Card = river.hand[0]
            boardStrs.push(parseCardInt(parseInt(riverHand)));
            console.log("BOARD IS", boardStrs);

            //const cardPrime1 = riverHand[0] % 13;
            const cardPrime1 = cardMapping52[riverHand];
            boardPrimes.push(UInt64.from(cardPrime1));
            const txnA = await Mina.transaction(playerPubKey2, () => {
                zkAppInstance.tallyBoardCards(Field(cardPrime1))
            });
            await txnA.prove();
            await txnA.sign([playerPrivKey2]).send();
        }
        currStreet = street;
    }
}


const bal3 = zkAppInstance.stack1.get().toString();
const bal4 = zkAppInstance.stack2.get().toString();
console.log("Hand Complete!")
console.log("End Balances", bal3, bal4);
if (bal3 == bal4) {
    console.log("Hand was a tie!")
}
else {
    const p1winner = bal3 > bal4;
    if (p1winner) {
        console.log("Player 1 wins!")
    }
    else {
        console.log("Player 2 wins!")
    }
}

console.log("Withdrawing balances...")

const txn11 = await Mina.transaction(playerPubKey2, () => {
    zkAppInstance.withdraw(playerPrivKey2)
});
await txn11.prove();
await txn11.sign([playerPrivKey2]).send();


const txn12 = await Mina.transaction(playerPubKey1, () => {
    zkAppInstance.withdraw(playerPrivKey1)
});
await txn12.prove();
await txn12.sign([playerPrivKey1]).send();


// ----------------------------------------------------
await shutdown();
rl.close();