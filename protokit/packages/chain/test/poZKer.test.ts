import { TestingAppChain } from "@proto-kit/sdk";
import { PrivateKey, Field, Poseidon, PublicKey } from "o1js";
import { PoZKerApp } from "../src/poZKer";
import { log } from "@proto-kit/common";
import { UInt64 } from "@proto-kit/library";

log.setLevel("ERROR");

describe("poZKer", () => {

  async function localDeploy() {
    const appChain = TestingAppChain.fromRuntime({
      PoZKerApp,
    });
    appChain.configurePartial({
      Runtime: {
        PoZKerApp: {},
        Balances: {
          totalSupply: UInt64.from(10000),
        },
      },
    });
    await appChain.start();
    return appChain;
  }

  async function setPlayer(appChain: any, pa: PoZKerApp, playerPrivKey: PrivateKey, playerPubKey: PublicKey) {
    // Join game with two players

    // First player joining
    appChain.setSigner(playerPrivKey);
    const tx1 = await appChain.transaction(playerPubKey, () => {
      pa.joinGame(playerPubKey)
    });
    await tx1.sign();
    await tx1.send();
    const block = await appChain.produceBlock();
  }


  it("allows players to join game (joinGame)", async () => {

    const appChain = await localDeploy();

    // Join game with two players
    const alicePrivateKey = PrivateKey.random();
    const alice = alicePrivateKey.toPublicKey();
    const aliceHash = Poseidon.hash(alice.toFields());
    const bobPrivateKey = PrivateKey.random();
    const bob = bobPrivateKey.toPublicKey();
    const bobHash = Poseidon.hash(bob.toFields());

    appChain.setSigner(alicePrivateKey);

    const pkr = appChain.runtime.resolve("PoZKerApp");

    // First player joining
    const tx1 = await appChain.transaction(alice, () => {
      pkr.joinGame(alice)
    });
    await tx1.sign();
    await tx1.send();
    const block = await appChain.produceBlock();

    const player1Hash = await appChain.query.runtime.PoZKerApp.player1Hash.get();
    const player2Hash = await appChain.query.runtime.PoZKerApp.player2Hash.get();
    expect(block?.transactions[0].status.toBoolean()).toBe(true);
    expect(player1Hash).toEqual(aliceHash);
    expect(player2Hash).toEqual(Field(0));


    // Second player joining
    appChain.setSigner(bobPrivateKey);
    const tx2 = await appChain.transaction(bob, () => {
      pkr.joinGame(bob)
    });
    await tx2.sign();
    await tx2.send();
    const block2 = await appChain.produceBlock();

    const player1HashB = await appChain.query.runtime.PoZKerApp.player1Hash.get();
    const player2HashB = await appChain.query.runtime.PoZKerApp.player2Hash.get();
    expect(block2?.transactions[0].status.toBoolean()).toBe(true);
    expect(player1HashB).toEqual(aliceHash);
    expect(player2HashB).toEqual(bobHash);

  }, 1_000_000);


  it("allows players to deposit (deposit())", async () => {
    const appChain = await localDeploy();
    const alicePrivateKey = PrivateKey.random();
    const bobPrivateKey = PrivateKey.random();
    const alice = alicePrivateKey.toPublicKey();
    const bob = bobPrivateKey.toPublicKey();
    appChain.setSigner(alicePrivateKey);
    const pkr = appChain.runtime.resolve("PoZKerApp");

    await setPlayer(appChain, pkr, alicePrivateKey, alice);
    await setPlayer(appChain, pkr, bobPrivateKey, bob);

    const depositAmount1: Field = Field(100);
    const depositAmount2: Field = Field(120);

    appChain.setSigner(alicePrivateKey);
    const tx1 = await appChain.transaction(alice, () => {
      pkr.deposit(depositAmount1)
    });
    await tx1.sign();
    await tx1.send();
    const block = await appChain.produceBlock();

    appChain.setSigner(bobPrivateKey);
    const tx2 = await appChain.transaction(bob, () => {
      pkr.deposit(depositAmount2)
    });
    await tx2.sign();
    await tx2.send();
    const block2 = await appChain.produceBlock();

    const stack1 = await appChain.query.runtime.PoZKerApp.stack1.get();
    const stack2 = await appChain.query.runtime.PoZKerApp.stack2.get();
    expect(block?.transactions[0].status.toBoolean()).toBe(true);
    expect(block2?.transactions[0].status.toBoolean()).toBe(true);
    // For actual stacks we'll have to subtract the blinds (1/2)
    expect(stack1).toEqual(depositAmount1.sub(Field(1)));
    expect(stack2).toEqual(depositAmount2.sub(Field(2)));

  }, 1_000_000);

});