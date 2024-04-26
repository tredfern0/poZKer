import { RuntimeModule, runtimeModule, state, runtimeMethod } from "@proto-kit/module";
import { State, assert, StateMap, Option } from "@proto-kit/protocol";
import { UInt32 } from "@proto-kit/library";
import { PublicKey, PrivateKey, Poseidon, Field, Bool, Provable, MerkleMapWitness, Scalar } from "o1js";
import { Card, addPlayerToCardMask, mask, partialUnmaskProvable, createNewCard, cardPrimeToPublicKey } from './mentalpoker.js';

// Want a mapping for cards, each represented as a prime so we can multiply
// them together and get a unique value
export const cardMapping13 = {
  "2": 2,
  "3": 3,
  "4": 5,
  "5": 7,
  "6": 11,
  "7": 13,
  "8": 17,
  "9": 19,
  "T": 23,
  "J": 29,
  "Q": 31,
  "K": 37,
  "A": 41,
}

// Need mapping of full cards to properly track board cards - 
// We need to store suit and rank
// Issue with only tracking board card rank is at end of hand we
// will need the suit to prevent players from cheating by keeping
// same board rank but changing suit
// Important to use same suit ordering as 'cards' in playpoker.ts
export const cardMapping52 = {
  "2h": 2,
  "3h": 3,
  "4h": 5,
  "5h": 7,
  "6h": 11,
  "7h": 13,
  "8h": 17,
  "9h": 19,
  "Th": 23,
  "Jh": 29,
  "Qh": 31,
  "Kh": 37,
  "Ah": 41,
  "2d": 43,
  "3d": 47,
  "4d": 53,
  "5d": 59,
  "6d": 61,
  "7d": 67,
  "8d": 71,
  "9d": 73,
  "Td": 79,
  "Jd": 83,
  "Qd": 89,
  "Kd": 97,
  "Ad": 101,
  "2c": 103,
  "3c": 107,
  "4c": 109,
  "5c": 113,
  "6c": 127,
  "7c": 131,
  "8c": 137,
  "9c": 139,
  "Tc": 149,
  "Jc": 151,
  "Qc": 157,
  "Kc": 163,
  "Ac": 167,
  "2s": 173,
  "3s": 179,
  "4s": 181,
  "5s": 191,
  "6s": 193,
  "7s": 197,
  "8s": 199,
  "9s": 211,
  "Ts": 223,
  "Js": 227,
  "Qs": 229,
  "Ks": 233,
  "As": 239,
  "": 241,
}

@runtimeModule()
export class PoZKerApp extends RuntimeModule<unknown> {

  // we need P0Turn*P1Turn*ShowdownPending = ShowdownComplete
  P0Turn = Field(2);
  P1Turn = Field(3);

  // ShowdownPending = Field(1);
  // ShowdownComplete = Field(6);
  // Preflop = Field(2);
  // Flop = Field(3);
  // Turn = Field(4);
  // River = Field(5);

  // Actions
  Null = Field(0);
  Bet = Field(1);
  Call = Field(2);
  Fold = Field(3);
  Raise = Field(4);
  Check = Field(5);
  PreflopCall = Field(6);
  PostSB = Field(7);
  PostBB = Field(8);

  // HandStage values
  SBPost = Field(0);
  BBPost = Field(1);
  DealHolecardsA = Field(2);
  DealHolecardsB = Field(3);
  PreflopBetting = Field(4);
  FlopDeal = Field(5);
  FlopBetting = Field(6);
  TurnDeal = Field(7);
  TurnBetting = Field(8);
  RiverDeal = Field(9);
  RiverBetting = Field(10);
  ShowdownA = Field(11);
  ShowdownB = Field(12);
  Settle = Field(13);

  NullBoardcard = Field(cardMapping52[""]);

  // This are generated via the genmap script
  MerkleMapRootBasic = Field("27699641125309939543225716816460043210743676221173039607853127025430840122106");
  MerkleMapRootFlush = Field("12839577190240250171319696533609974348200540625786415982151412596597428662991");
  // Hardcode 100 as game size
  // Say game is 1/2, players can buy in from 20 to 200
  MinBuyin = Field(20);
  MaxBuyin = Field(200);
  SmallBlind = Field(1);
  BigBlind = Field(2);

  @state() public player0Key = State.from<PublicKey>(PublicKey);
  @state() public player1Key = State.from<PublicKey>(PublicKey);

  // We'll store the lookup values for each player here
  // And if one player folds, we'll set them so they still correspond to winning player
  @state() public showdownValueP0 = State.from<Field>(Field);
  @state() public showdownValueP1 = State.from<Field>(Field);

  // Directly store all cards...
  @state() public p0Hc0 = State.from<Card>(Card);
  @state() public p0Hc1 = State.from<Card>(Card);
  @state() public p1Hc0 = State.from<Card>(Card);
  @state() public p1Hc1 = State.from<Card>(Card);
  @state() public flop0 = State.from<Card>(Card);
  @state() public flop1 = State.from<Card>(Card);
  @state() public flop2 = State.from<Card>(Card);
  @state() public turn0 = State.from<Card>(Card);
  @state() public river0 = State.from<Card>(Card);

  // Coded game state, contains packed data:
  // stack0, stack1, playerTurn, street, lastAction, handOver
  // Store gamestate as a FIELD instead, to address challenges calling .get from frontend
  // @state(Gamestate) gamestate = State<Gamestate>();
  @state() public stack0 = State.from<Field>(Field);
  @state() public stack1 = State.from<Field>(Field);
  @state() public playerTurn = State.from<Field>(Field);
  // @state() public street = State.from<Field>(Field);
  @state() public lastAction = State.from<Field>(Field);
  @state() public lastBetSize = State.from<Field>(Field);
  // @state() public handOver = State.from<Bool>(Bool);
  @state() public pot = State.from<Field>(Field);

  @state() public handStage = State.from<Field>(Field);
  @state() public button = State.from<Field>(Field);

  @state() public handId = State.from<Field>(Field);

  init() {
    // super.init();
    // Starting gamestate is always P2's turn preflop, with P1 having posted small blind
    this.stack0.set(Field(0));
    this.stack1.set(Field(0));
    this.playerTurn.set(this.P0Turn);
    // this.street.set(this.Preflop);
    this.handStage.set(this.SBPost);
    this.lastAction.set(this.Bet);
    // this.handOver.set(Bool(false));
    this.pot.set(Field(0));
    this.lastBetSize.set(Field(0));

    // Initialize with 0s so we can tell when two players have joined
    this.player0Key.set(PublicKey.empty());
    this.player1Key.set(PublicKey.empty());

    // Temp - just want to use this to experiment with pulling data
    // this.slot4.set(Field(42));
    // Temp - hardcode cards for each player
    // this.storeHardcodedCards();
    // Temp - hardcoding board cards
    // "Kc": 163,
    // "Ac": 167,
    // "Qs": 229,
    // "8s": 199,
    // "6s": 193,
    // 163*167*229*199*193 = 239414220863
    // this.slot2.set(Field(239414220863))
  }

  @runtimeMethod()
  public resetHandState(): void {
    // Should call this on init too, but want to let players reset the game state
    // this.street.set(this.Preflop);
    // this.handOver.set(Bool(false));
    this.handStage.set(this.SBPost);
    this.lastAction.set(this.Null);
    this.handStage.set(this.SBPost);

    this.showdownValueP0.set(Field(0));
    this.showdownValueP1.set(Field(0));

    // this.playerTurn.set(this.P0Turn);
    // this.button.set(Field(0));
  }

  @runtimeMethod()
  public resetTableState(): void {
    // Have a separate resetHandState for when we want to keep players but reset hand?
    this.player0Key.set(PublicKey.empty());
    this.player1Key.set(PublicKey.empty());


    // Todo - want better logic for setting this
    this.handId.set(Field(1000));
  }

  @runtimeMethod()
  public joinTable(seatI: Field, depositAmount: Field): void {
    // seatI is index of seat they're joining - now should be 0 or 1...
    const player: PublicKey = this.transaction.sender.value;
    const seatOk: Bool = seatI.equals(Field(0)).or(seatI.equals(Field(1)));
    assert(seatOk, "Not a valid seat!");

    const player0Key = this.player0Key.get().value;
    const player1Key = this.player1Key.get().value;

    // If seat is free, should be the empty key
    const seatFree: Bool = Provable.if(seatI.equals(Field(0)),
      player0Key.equals(PublicKey.empty()),
      player1Key.equals(PublicKey.empty()),
    )
    assert(seatFree, "Seat is not available!");

    const p1KeyWrite: PublicKey = Provable.if(seatI.equals(Field(0)),
      player,
      player0Key
    )
    const p2KeyWrite: PublicKey = Provable.if(seatI.equals(Field(1)),
      player,
      player1Key
    )
    this.player0Key.set(p1KeyWrite);
    this.player1Key.set(p2KeyWrite);

    this.deposit(seatI, depositAmount);
  }

  private deposit(seatI: Field, depositAmount: Field): void {
    // Method is only called when joining table
    // When this is called we will already have verified that seat is free
    const stack0: Field = this.stack0.get().value;
    const stack1: Field = this.stack1.get().value;
    const stack0New = Provable.if(
      seatI.equals(Field(0)),
      depositAmount,
      stack0
    );
    const stack1New = Provable.if(
      seatI.equals(Field(1)),
      depositAmount,
      stack1
    );
    this.stack0.set(stack0New);
    this.stack1.set(stack1New);

    // From https://github.com/o1-labs/o1js/blob/5ca43684e98af3e4f348f7b035a0ad7320d88f3d/src/examples/zkapps/escrow/escrow.ts
    // const payerUpdate = AccountUpdate.createSigned(player);

    // TEMP - disabling this so we can test game without needing to send funds
    // payerUpdate.send({ to: this.address, amount: gameBuyin64 });
  }

  @runtimeMethod()
  public leaveTable(): void {
    // Can only leave if we're at the blinds posting stage...
    const handStage = this.handStage.get().value;
    assert(handStage.equals(this.SBPost), "Cannot leave table now!");

    const player: PublicKey = this.transaction.sender.value;
    assert(this.inGame(player), "Player not in game!")

    const player0Key = this.player0Key.get().value;
    const seatI = Provable.if(player.equals(player0Key), Field(0), Field(1));

    this.withdraw(player, seatI);
  }


  private withdraw(player: PublicKey, seatI: Field): void {
    // Can ONLY withdraw when the hand is over!
    const stack0: Field = this.stack0.get().value;
    const stack1: Field = this.stack1.get().value;
    const stack = Provable.if(seatI.equals(Field(0)), stack0, stack1);

    const player0Key = this.player0Key.get().value;
    const player1Key = this.player1Key.get().value;

    // TODO - reenable sending funds to player
    // this.send({ to: player, amount: sendAmount.toUInt64() });

    // We have to update the stacks so they cannot withdraw multiple times!
    const stack0New = Provable.if(
      player.equals(player0Key),
      Field(0),
      stack0
    );

    const stack1New = Provable.if(
      player.equals(player1Key),
      Field(0),
      stack1
    );

    // We want to reset the gamestate once both players have withdrawn,
    // so we can use the contract for another hand
    const player0KeyNew = Provable.if(
      player.equals(player0Key),
      PublicKey.empty(),
      player0Key
    );
    const player1KeyNew = Provable.if(
      player.equals(player1Key),
      PublicKey.empty(),
      player1Key
    );
    this.player0Key.set(player0KeyNew);
    this.player1Key.set(player1KeyNew);

    this.stack0.set(stack0New);
    this.stack1.set(stack1New);
  }


  @runtimeMethod()
  public takeAction(action: Field, betSize: Field): void {

    // add handling for these...
    // PostSB = Field(7);
    // PostBB = Field(8);


    // Need to check that it's the current player's turn, 
    // and the action is valid
    const stack0: Field = this.stack0.get().value;
    const stack1: Field = this.stack1.get().value;
    // const handOver = this.handOver.get().value;
    const playerTurn = this.playerTurn.get().value;
    const handStage = this.handStage.get().value;
    const lastAction = this.lastAction.get().value;
    const pot = this.pot.get().value;

    // handOver.assertFalse('Game has already finished!');
    // assert(handOver.not(), 'Game has already finished!');

    // Want these as bools to simplify checks
    const p1turn: Bool = playerTurn.equals(this.P0Turn);
    const p2turn: Bool = playerTurn.equals(this.P1Turn);
    // p1turn.or(p2turn).assertTrue('Invalid game state player');
    assert(p1turn.or(p2turn), 'Invalid game state player');

    const player: PublicKey = this.transaction.sender.value;

    // Logic modified from https://github.com/betterclever/zk-chess/blob/main/src/Chess.ts
    const player0Key = this.player0Key.get().value;
    const player1Key = this.player1Key.get().value;
    const playerOk: Bool = player
      .equals(player0Key)
      .and(p1turn)
      .or(player.equals(player1Key).and(p2turn))
    assert(playerOk, 'Player is not allowed to make a move')
    //.assertTrue('Player is not allowed to make a move');

    const isBlinds = handStage.equals(this.SBPost).or(handStage.equals(this.BBPost));
    const isPreflop = handStage.equals(this.PreflopBetting);
    const isFlop = handStage.equals(this.FlopBetting)
    const isTurn = handStage.equals(this.TurnBetting)
    const isRiver = handStage.equals(this.RiverBetting)
    //isPreflop.or(isFlop).or(isTurn).or(isRiver).assertTrue('Invalid game state street');
    assert(isBlinds.or(isPreflop).or(isFlop).or(isTurn).or(isRiver), 'Invalid game state street');

    const facingSB = lastAction.equals(this.PostSB);
    const facingBB = lastAction.equals(this.PostBB);
    const facingNull = lastAction.equals(this.Null);
    const facingBet = lastAction.equals(this.Bet);
    const facingCall = lastAction.equals(this.Call);
    const facingRaise = lastAction.equals(this.Raise);
    const facingCheck = lastAction.equals(this.Check);
    const facingPreflopCall = lastAction.equals(this.PreflopCall);
    // facingFold is impossible - we'd be in showdown state
    //facingNull.or(facingBet).or(facingCall).or(facingRaise).or(facingCheck).or(facingPreflopCall).assertTrue('Invalid game state action');
    assert(facingSB.or(facingBB).or(facingNull).or(facingBet).or(facingCall).or(facingRaise).or(facingCheck).or(facingPreflopCall), 'Invalid game state action');

    // Confirm actions is valid, must be some combination below:
    // actions:
    // Bet - valid when facing [Null, Check]
    // Call - valid when facing [Bet, Raise, PostBB]
    // Fold - valid when facing [Bet, Raise]
    // Raise - valid when facing [Bet, Raise, PreflopCall, PostBB]
    // Check - valid when facing [Null, Check, PreflopCall]
    // PostSB - valid when facing [Null] and street==preflop
    // PostBB - valid when facing [PostSB] and street==preflop
    const act1 = action.equals(this.Bet).and(facingNull.or(facingCheck));
    const act2 = action.equals(this.Call).and(facingBet.or(facingRaise).or(facingBB));
    const act3 = action.equals(this.Fold).and(facingBet.or(facingRaise));
    const act4 = action.equals(this.Raise).and(facingBet.or(facingRaise).or(facingPreflopCall).or(facingBB));
    const act5 = action.equals(this.Check).and(facingNull.or(facingCheck).or(facingPreflopCall));
    // Blinds...
    const act6 = action.equals(this.PostSB).and(facingNull).and(handStage.equals(this.SBPost));
    const act7 = action.equals(this.PostBB).and(facingSB);
    const act8 = action.equals(this.PreflopCall).and(facingBB);

    //act1.or(act2).or(act3).or(act4).or(act5).assertTrue('Invalid bet!');
    assert(act1.or(act2).or(act3).or(act4).or(act5).or(act6).or(act7).or(act8), 'Invalid bet!');

    // Amount checks/logic:
    // For calls - we are not passing in amount, so we need to figure it out
    // For raises - raise needs to be to a valid size

    // If stack0 99 and stack1 90, returns 9
    //const stackDiff = this.uint_subtraction(p1turn, stack0, stack1, stack1, stack0);
    const stackDiff = Provable.if(p1turn,
      stack0.sub(stack1),
      stack1.sub(stack0));

    // We get an error on underflows so this is always true
    // stackDiff.assertGreaterThanOrEqual(Field(0), "");

    // Betsize constraints:
    // Fold/Check - betsize should be 0
    // Bet - betsize should be gt 1 (or whatever minsize is)
    // Call - betsize should make stacks equal
    // Raise - betsize should be at least equal to diff*2, or all-in

    const foldCheckAmountBool = Provable.if(action.equals(this.Check).or(action.equals(this.Fold)),
      betSize.equals(Field(0)),
      Bool(true)
    )
    //foldCheckAmountBool.assertTrue("Bad betsize for check or fold!");
    assert(foldCheckAmountBool, "Bad betsize for check or fold!");

    // Bet - betsize should be gt 1 (or whatever minsize is)
    const actionF: Field = Provable.if(action.equals(this.Bet),
      betSize,
      Field(1),
    )  // .assertGreaterThanOrEqual(Field(1), "Invalid bet size!")
    assert(actionF.greaterThanOrEqual(Field(1)), "Invalid bet size!");

    // Hardcode sizes for preflop betsize...
    // TODO - improve this logic, better to not force them to pass it in
    const preflopBetA = Provable.if(action.equals(this.PostSB),
      betSize.equals(Field(1)),
      Bool(true));
    const preflopBetB = Provable.if(action.equals(this.PostBB),
      betSize.equals(Field(2)),
      Bool(true));
    assert(preflopBetA.and(preflopBetB), "Bad preflop betsize!");

    // Call - betsize should make stacks equal
    // So we might need to override the other betsize here
    const betSizeReal = Provable.if(action.equals(this.Call).or(action.equals(this.PreflopCall)),
      stackDiff,
      betSize,
    )

    const compareStack = Provable.if(p1turn,
      stack0,
      stack1)

    // betSizeReal.assertLessThanOrEqual(compareStack, "Cannot bet more than stack!");
    assert(betSizeReal.lessThanOrEqual(compareStack), "Cannot bet more than stack!");
    const allin: Bool = betSizeReal.equals(compareStack);

    const raiseOk: Bool = Provable.if(action.equals(this.Raise),
      betSize.greaterThanOrEqual(stackDiff.mul(2)).or(allin),
      Bool(true),
    )
    //.assertTrue("Invalid raise amount!");
    assert(raiseOk, "Invalid raise amount!");


    // Make sure the player has enough funds to take the action
    const case1 = player.equals(player0Key).and(betSizeReal.lessThanOrEqual(stack0));
    const case2 = player.equals(player1Key).and(betSizeReal.lessThanOrEqual(stack1));
    // case1.or(case2).assertTrue("Not enough balance for bet!");
    assert(case1.or(case2), "Not enough balance for bet!");


    // const stack0New = this.uint_subtraction(playerHash.equals(player0Hash),
    //   stack0, betSizeReal,
    //   stack0, UInt32.from(0));
    // const stack1New = this.uint_subtraction(playerHash.equals(player1Hash),
    //   stack1, betSizeReal,
    //   stack1, UInt32.from(0));
    const stack0New = Provable.if(player.equals(player0Key),
      stack0.sub(betSizeReal),
      stack0.sub(Field(0)));
    const stack1New = Provable.if(player.equals(player1Key),
      stack1.sub(betSizeReal),
      stack1.sub(Field(0)));

    // Need to check if we've hit the end of the street - transition to next street
    // Scenarios for this would be:
    // 1. Either player has called - (but not the PreflopCall)
    // 2. Player 2 has checked
    const newStreetBool = action.equals(this.Call).or(player.equals(player1Key).and(action.equals(this.Check)));

    // Is there any way we could simplify this with something like:
    // If newStreetBool and (isPreflop or isTurn) -> Add 2
    // If newStreetBool and (isFlop or isRiver) -> Add 4
    // Else keep same street
    // Showdown takes priority over other logic
    const nextShowdownEnd = Provable.if(isRiver.and(newStreetBool), Bool(true), Bool(false));
    // Additional scenario where we can have a showdown - both allin
    const nextShowdownAllin = stack0New.equals(Field(0)).and(stack1New.equals(Field(0)));
    const nextShowdown = nextShowdownEnd.or(nextShowdownAllin);
    const nextPreflop = Provable.if(nextShowdown.not().and(isPreflop.and(newStreetBool.not())), Bool(true), Bool(false));
    const nextFlop = Provable.if(nextShowdown.not().and(isFlop.and(newStreetBool.not()).or(isPreflop.and(newStreetBool))), Bool(true), Bool(false));
    const nextTurn = Provable.if(nextShowdown.not().and(isTurn.and(newStreetBool.not()).or(isFlop.and(newStreetBool))), Bool(true), Bool(false));
    const nextRiver = Provable.if(nextShowdown.not().and(isRiver.and(newStreetBool.not()).or(isTurn.and(newStreetBool))), Bool(true), Bool(false));

    // TODO - can we simplify this logic by adding ONE if it's a transition?
    const handStageNew = Provable.switch(
      [nextPreflop, nextFlop, nextTurn, nextRiver, nextShowdown],
      Field,
      [this.DealHolecardsA, this.FlopDeal, this.TurnDeal, this.RiverDeal, this.ShowdownA]
    );

    // If we did go to the next street, previous action should be 'Null'
    const facingAction = Provable.if(
      newStreetBool,
      this.Null,
      action
    );

    const playerTurnNow = Provable.if(
      newStreetBool.or(p2turn),
      this.P0Turn,
      this.P1Turn
    );

    const handOverNow: Bool = Provable.if(
      action.equals(this.Fold),
      Bool(true),
      Bool(false)
    )

    // If game is over from a fold - need to send funds to winner
    const p1WinnerBal = stack0.add(pot);
    const p2WinnerBal = stack1.add(pot);

    const stack0Final = Provable.if(
      handOverNow.equals(Bool(true)).and(player.equals(player1Key)),
      p1WinnerBal,
      stack0New
    );
    const stack1Final = Provable.if(
      handOverNow.equals(Bool(true)).and(player.equals(player0Key)),
      p2WinnerBal,
      stack1New
    );

    const potNew = Provable.if(
      handOverNow.equals(Bool(true)),
      Field(0),
      pot.add(betSizeReal)
    );

    // TODO - double check logic - any other scenarios we should reset lastBetSize?
    const newLastBetSize = Provable.if(
      action.equals(this.Call),
      Field(0),
      betSizeReal
    )

    this.stack0.set(stack0Final);
    this.stack1.set(stack1Final);
    this.playerTurn.set(playerTurnNow);
    this.handStage.set(handStageNew);
    this.lastAction.set(facingAction);
    this.lastBetSize.set(newLastBetSize);
    // this.handOver.set(handOverNow);
    this.pot.set(potNew);
  }

  @runtimeMethod()
  public settle(): void {
    // We should only call this if we actually made it to showdown
    // const [stack0, stack1, turn, street, lastAction, lastBetSize, handOver, pot] = this.getGamestate();
    const stack0: Field = this.stack0.get().value;
    const stack1: Field = this.stack1.get().value;
    const pot: Field = this.pot.get().value;
    const handStage: Field = this.handStage.get().value;

    //street.equals(this.ShowdownComplete).assertTrue("Invalid showdown gamestate!");
    assert(handStage.equals(this.Settle), "Invalid settle gamestate!");

    const p1WinnerBal = stack0.add(pot);
    const p2WinnerBal = stack1.add(pot);

    //Even if a player folds we'll have stored showdown values
    const showdownValueP0 = this.showdownValueP0.get().value;
    const showdownValueP1 = this.showdownValueP1.get().value;

    // If we get a tie - split the pot
    const tieAdj = Provable.if(
      Bool(showdownValueP0 === showdownValueP1),
      // pot should always be evenly divisible by 2 if it's a tie...
      pot.div(Field(2)),
      Field(0),
    );

    // Lower is better for the hand rankings
    const stack0Final = Provable.if(
      Bool(showdownValueP0.lessThan(showdownValueP1)),
      p1WinnerBal,
      stack0.add(tieAdj)
    );
    const stack1Final = Provable.if(
      Bool(showdownValueP1.lessThan(showdownValueP0)),
      p2WinnerBal,
      stack1.add(tieAdj)
    );

    this.stack0.set(stack0Final);
    this.stack1.set(stack1Final);
    // this.handOver.set(Bool(true));
    this.pot.set(Field(0));

    // Resetting values for next hand!
    this.handStage.set(this.SBPost);

    // Need to swap button!
    const button = this.button.get().value;
    const newButton = Provable.if(button.equals(Field(0)), Field(1), Field(0));
    this.button.set(newButton);

    // And increment handId
    const handId = this.handId.get().value;
    this.handId.set(handId.add(1));
  }

  cardPrimeToCardPoint(cardPrime: Field): PublicKey {
    /*
    Players will pass in the prime52 value of their card, we want to get
    the publickey, the cardPoint, associated with that card, so we can
    ensure the cards they passed in are the cards that were committed
   
    Code to generate this mapping is in gameutils
    */
    const cardPoint = Provable.switch([cardPrime.equals(Field(2)),
    cardPrime.equals(Field(3)),
    cardPrime.equals(Field(5)),
    cardPrime.equals(Field(7)),
    cardPrime.equals(Field(11)),
    cardPrime.equals(Field(13)),
    cardPrime.equals(Field(17)),
    cardPrime.equals(Field(19)),
    cardPrime.equals(Field(23)),
    cardPrime.equals(Field(29)),
    cardPrime.equals(Field(31)),
    cardPrime.equals(Field(37)),
    cardPrime.equals(Field(41)),
    cardPrime.equals(Field(43)),
    cardPrime.equals(Field(47)),
    cardPrime.equals(Field(53)),
    cardPrime.equals(Field(59)),
    cardPrime.equals(Field(61)),
    cardPrime.equals(Field(67)),
    cardPrime.equals(Field(71)),
    cardPrime.equals(Field(73)),
    cardPrime.equals(Field(79)),
    cardPrime.equals(Field(83)),
    cardPrime.equals(Field(89)),
    cardPrime.equals(Field(97)),
    cardPrime.equals(Field(101)),
    cardPrime.equals(Field(103)),
    cardPrime.equals(Field(107)),
    cardPrime.equals(Field(109)),
    cardPrime.equals(Field(113)),
    cardPrime.equals(Field(127)),
    cardPrime.equals(Field(131)),
    cardPrime.equals(Field(137)),
    cardPrime.equals(Field(139)),
    cardPrime.equals(Field(149)),
    cardPrime.equals(Field(151)),
    cardPrime.equals(Field(157)),
    cardPrime.equals(Field(163)),
    cardPrime.equals(Field(167)),
    cardPrime.equals(Field(173)),
    cardPrime.equals(Field(179)),
    cardPrime.equals(Field(181)),
    cardPrime.equals(Field(191)),
    cardPrime.equals(Field(193)),
    cardPrime.equals(Field(197)),
    cardPrime.equals(Field(199)),
    cardPrime.equals(Field(211)),
    cardPrime.equals(Field(223)),
    cardPrime.equals(Field(227)),
    cardPrime.equals(Field(229)),
    cardPrime.equals(Field(233)),
    cardPrime.equals(Field(239))],
      PublicKey,
      [PublicKey.fromBase58("B62qs2xPJgNhvBw7ubgppB4YSDf1dYyvLYD1ghCrhnkXabLSVAainWx"),
      PublicKey.fromBase58("B62qoK7BxuzJx9Kn7hzNXxJGLXXzmXgzfg59p4ZCWYGXsJE2hbwZC2j"),
      PublicKey.fromBase58("B62qrKpP3NBbF97cx2aAdCmaSuVqaiGgvs9fMARxASPmVFgugoQekjr"),
      PublicKey.fromBase58("B62qmn9ZV1nNyLUG7fCcQHpkkt4PaT8ctgtrPyqtBNHP2KfexF2hPro"),
      PublicKey.fromBase58("B62qkj5CSRx9qWwYtHUWaYp5M3whGuhavCmZWBwsTAK9Du7xsq1NgUb"),
      PublicKey.fromBase58("B62qopEG5GqujH3reoh4uAwcbGMJnzSBnokPS1aP7KZGJDK9Yvsn8g3"),
      PublicKey.fromBase58("B62qoYts8pW1GVTt44vhA3esBDN67UsX9jLBackLGarfVKBRWtjQBkU"),
      PublicKey.fromBase58("B62qmK1iyMJfJZXd717RexE9TVf7uLd848gpkWYnnnEufUUWjsmN1Xs"),
      PublicKey.fromBase58("B62qjuepd8NRZzHqVbKcRJUtM5zdM9B2Me2pzDi4i1kUKz1C8Mous19"),
      PublicKey.fromBase58("B62qmS2bNfvrRXPzLyvbaBVF9g2J6crL4zR6LjcRQzTxzqXTBEjprno"),
      PublicKey.fromBase58("B62qnLS6BkhAXF3YHkpSZ9brNoLk1kSo55VQsZqrfYorZVrnjckzQfQ"),
      PublicKey.fromBase58("B62qjbhEXAYUqMESzUk4XZcXf5dcTpUy8Sv4Kd231oKs29j25AF23Jc"),
      PublicKey.fromBase58("B62qoa5ohnNnFEXfbPshXCzkBkgWSzXk3auy2yS9hyjLma4EkH7xWbs"),
      PublicKey.fromBase58("B62qqqUB9WmFCviaiPxnvT6a8PhtFyyfWtGUC5fLzrZh8MLuHteR23u"),
      PublicKey.fromBase58("B62qn7Qv1Ur7eEd8MUvm8G2QX2xy5KZ2XGFpHSvXFapzpUPe3mkqscG"),
      PublicKey.fromBase58("B62qpaK3GbVbpeoZyF95KmaDbTzM9YPpzeGNFVNfiuCAaS6iEAUqTVy"),
      PublicKey.fromBase58("B62qj8HkeQ2fzttty6TdWuDawJzFB1YozQARYCAtU3w2SUhDBtkQk8V"),
      PublicKey.fromBase58("B62qj7gbbFMhEPnsmVsouRyDuqzqY5GYYL9xYYxC9VVoREJcGEZAmRy"),
      PublicKey.fromBase58("B62qrYfYzv33FQ7tkKSveW4Bv5TPWR8w8BHFRboCezML9uia1JvQqM4"),
      PublicKey.fromBase58("B62qnT7U86RKp6wmCeDN9H8hLoQM63iwREcaYZ3QprmbHFp3B8pJ3Tg"),
      PublicKey.fromBase58("B62qmTF5nNcEfTqmoEuTgjBFRYdZ2P4SBBNsyV4qgtFuqKvWKVZ6vxH"),
      PublicKey.fromBase58("B62qk6tpoVSvS9N6tba72VAYij9kGkYfntz2HxuGXWbKTHnJcexYLBU"),
      PublicKey.fromBase58("B62qoXjH7mB9F1Lh7bqCJ2HK6ugV5aL4hsmJQKDhnNVPojqoUywk8tD"),
      PublicKey.fromBase58("B62qpYXzESQUfvssCXHpMBBA68PDWyg5AbKqsS6uPh6edTeJRaeMCeX"),
      PublicKey.fromBase58("B62qoNUbnMGz2wSP6fThYAzi9pgXjbXCsFLcN24feAGjfK9FEikyv44"),
      PublicKey.fromBase58("B62qiuLMUJ9xPCYGqAzJY2C8JTwgAFhfgZFTnVRsq3EBksHKAE1G3mX"),
      PublicKey.fromBase58("B62qobewhPUGcq3d51k7LpprwpdvZXHa3tt5cQqrHXFwGMYr1sfzytJ"),
      PublicKey.fromBase58("B62qpzcCZwyVuc3jMMK6hSWML5XFBDHhjGzxmQxqbxsj7CUq69tz73u"),
      PublicKey.fromBase58("B62qkJX7rwZhVvERKLTgdP1nR2uvp7r71gUMbg4r433hqGchqVUSAvH"),
      PublicKey.fromBase58("B62qjzb33UZEW73Azm4UNLHt5h9j8QGN1VHthZ5qtLp4HW2RopPgqnq"),
      PublicKey.fromBase58("B62qiyjjmivsXANPdai446hdVxbzp3XGvBeqrp2MwPagawWgGFscitu"),
      PublicKey.fromBase58("B62qmm9QtXK2sgunTFQZHcZ4QLoWxcm2kqR8Funhhz1cCnoWDKrZCo7"),
      PublicKey.fromBase58("B62qmCRjfwQf5TqVAthSsahapRo3TzAJLWV111Jvjysnd52T15Hhqv8"),
      PublicKey.fromBase58("B62qndkT7z5GRdNdVzFVJS5n3VyY2F7Vz3EpGyPiCUpiHRUm6uLdb8Z"),
      PublicKey.fromBase58("B62qkehCjfnN9sppd6XqsP8yBg5QcBgKpYbBqBz57ucmi5PLhwG2S9f"),
      PublicKey.fromBase58("B62qnfRT4wwPbTqDA5RaLYpoQEnB1HoafQmpZDjyhqUGfy6JmcpW5cB"),
      PublicKey.fromBase58("B62qpemVeQk9KtShw7i4LBkXHKncPLEmWvubA2Rm79adXDmNYP8DbuA"),
      PublicKey.fromBase58("B62qiczv8AH2wHirAXEYWs3FofpqmwMAMqsH1turCF5pg4yDyTHo96o"),
      PublicKey.fromBase58("B62qoxgp76z6NxCACZMhVFmtFivGBXySv6rt1K4njuQj5FDek14KqmZ"),
      PublicKey.fromBase58("B62qrjCGUYUt7RkTaycWK9UxmK2UrL2PqzTnsfbZ2TqKJzoRRQ4AETX"),
      PublicKey.fromBase58("B62qju23mB8xFV8LD6KuzjYP5TrQ5oC8m3nbq21kJCaQyJhwBrS1BYJ"),
      PublicKey.fromBase58("B62qniYvDRvQeGenwoCSWbuHkRYVJP35a1KhrWVg8DEV22HMg9BbRby"),
      PublicKey.fromBase58("B62qpt7XdABiHZtKWaf7wYmf4ZpeYJd2LfbT7w9dJAR9hhM4UC8MpsP"),
      PublicKey.fromBase58("B62qn6aN7zUMDNDCq4s39nf32mks7YRRatUimtgmTyEH5ghPnbnCqER"),
      PublicKey.fromBase58("B62qnwVexivudVh5CAj1yqGXFkrgjimR1F3WB4cq3VZ2KNn5WL8XNGX"),
      PublicKey.fromBase58("B62qmTVrhEfXW1h5R9Ea8Lzgv8LapGZmmjBwzujsPoe58DtKA896QLb"),
      PublicKey.fromBase58("B62qqPPARzHjNc222t1EHbaU2jAVNGxai1Pfv229xj2Qen6R3dHuw6V"),
      PublicKey.fromBase58("B62qrdxHXHyuQjDSyYPsWYTEgtZBSEqF5bpTktk5RqSwbdojebLVZLH"),
      PublicKey.fromBase58("B62qn9vSE3Jmep2pwx2XtfKV86omVpdcaYiY91mbcseKRRoPSEzx28Y"),
      PublicKey.fromBase58("B62qogwrj3eDhmoNETRUX3VToBYuXo8r7NM8w1onp6RWYat1c56zpyu"),
      PublicKey.fromBase58("B62qnp98SGKe6dQ2cTMUKJeWGhECfj57vZGS5D5MA9hr5bXFYMo3wDM"),
      PublicKey.fromBase58("B62qqA4jWdkLUE2ceoJPyqVYViFga2kJJ1UUMG2hS4pbD8zxEHhtfvW")]);

    return cardPoint;
  }

  /*
  @runtimeMethod()
  public tallyBoardCards(cardPrime52: Field): void {
    // Remember - cardPrime52 should be in the 52 format
    // We'll always store the board card product in slot2
    const slot2 = this.slot2.getAndRequireEquals();
   
    // Remember - we start out having the board card be Null*5
    // Need to do this so we can ensure at showdown that player submitted all cards
    const slot2New = slot2.mul(cardPrime52).div(this.NullBoardcard);
    this.slot2.set(slot2New)
  }
  */

  convert52to13(c52: Field): Field {
    // takes care of converting a card in cardMapping52 format to cardMapping13
    // "2h": 2,  "2d": 43, "2c": 103, "2s": 173,
    // "3h": 3,  "3d": 47, "3c": 107, "3s": 179,
    // "4h": 5,  "4d": 53, "4c": 109, "4s": 181,
    // "5h": 7,  "5d": 59, "5c": 113, "5s": 191,
    // "6h": 11, "6d": 61, "6c": 127, "6s": 193,
    // "7h": 13, "7d": 67, "7c": 131, "7s": 197,
    // "8h": 17, "8d": 71, "8c": 137, "8s": 199,
    // "9h": 19, "9d": 73, "9c": 139, "9s": 211,
    // "Th": 23, "Td": 79, "Tc": 149, "Ts": 223,
    // "Jh": 29, "Jd": 83, "Jc": 151, "Js": 227,
    // "Qh": 31, "Qd": 89, "Qc": 157, "Qs": 229,
    // "Kh": 37, "Kd": 97, "Kc": 163, "Ks": 233,
    // "Ah": 41, "Ad": 101,"Ac": 167, "As": 239,

    const c13 = Provable.switch([
      // CONDITIONS
      c52.equals(Field(2)).or(c52.equals(Field(43))).or(c52.equals(Field(103))).or(c52.equals(Field(173))),
      c52.equals(Field(3)).or(c52.equals(Field(47))).or(c52.equals(Field(107))).or(c52.equals(Field(179))),
      c52.equals(Field(5)).or(c52.equals(Field(53))).or(c52.equals(Field(109))).or(c52.equals(Field(181))),
      c52.equals(Field(7)).or(c52.equals(Field(59))).or(c52.equals(Field(113))).or(c52.equals(Field(191))),
      c52.equals(Field(11)).or(c52.equals(Field(61))).or(c52.equals(Field(127))).or(c52.equals(Field(193))),
      c52.equals(Field(13)).or(c52.equals(Field(67))).or(c52.equals(Field(131))).or(c52.equals(Field(197))),
      c52.equals(Field(17)).or(c52.equals(Field(71))).or(c52.equals(Field(137))).or(c52.equals(Field(199))),
      c52.equals(Field(19)).or(c52.equals(Field(73))).or(c52.equals(Field(139))).or(c52.equals(Field(211))),
      c52.equals(Field(23)).or(c52.equals(Field(79))).or(c52.equals(Field(149))).or(c52.equals(Field(223))),
      c52.equals(Field(29)).or(c52.equals(Field(83))).or(c52.equals(Field(151))).or(c52.equals(Field(227))),
      c52.equals(Field(31)).or(c52.equals(Field(89))).or(c52.equals(Field(157))).or(c52.equals(Field(229))),
      c52.equals(Field(37)).or(c52.equals(Field(97))).or(c52.equals(Field(163))).or(c52.equals(Field(233))),
      c52.equals(Field(41)).or(c52.equals(Field(101))).or(c52.equals(Field(167))).or(c52.equals(Field(239)))],
      // RETURN TYPE
      Field,
      // SELECT VALUES
      [Field(2),
      Field(3),
      Field(5),
      Field(7),
      Field(11),
      Field(13),
      Field(17),
      Field(19),
      Field(23),
      Field(29),
      Field(31),
      Field(37),
      Field(41),])

    return c13;

  }

  calcLookupVal(holecard0: Field,
    holecard1: Field,
    boardcard0: Field,
    boardcard1: Field,
    boardcard2: Field,
    boardcard3: Field,
    boardcard4: Field,
    useHolecard0: Bool,
    useHolecard1: Bool,
    useBoardcards0: Bool,
    useBoardcards1: Bool,
    useBoardcards2: Bool,
    useBoardcards3: Bool,
    useBoardcards4: Bool,
  ): Field {
    // Remember - all cards are in cardMapping52 format
    // let lookupVal = Field(1);
    let lookupVal = Field(1);

    const cardList = [holecard0, holecard1, boardcard0, boardcard1, boardcard2, boardcard3, boardcard4];
    const boolList = [useHolecard0, useHolecard1, useBoardcards0, useBoardcards1, useBoardcards2, useBoardcards3, useBoardcards4];

    // Incredibly ugly but we need to convert cards from cardMapping52 to cardMapping13
    // And then multiply together all the ones that are used to get the lookup val
    for (let i = 0; i < 7; i++) {
      const c52: Field = cardList[i];
      const c13: Field = this.convert52to13(c52)
      const boolUse: Bool = boolList[i];
      // So if we use it, use the value, otherwise just 1...
      const lvMul = Provable.if(boolUse, c13, Field(1));
      lookupVal = lookupVal.mul(lvMul);
    }

    return lookupVal;
  }


  calcCheckFlush(holecard0: Field,
    holecard1: Field,
    boardcard0: Field,
    boardcard1: Field,
    boardcard2: Field,
    boardcard3: Field,
    boardcard4: Field,
    useHolecard0: Bool,
    useHolecard1: Bool,
    useBoardcards0: Bool,
    useBoardcards1: Bool,
    useBoardcards2: Bool,
    useBoardcards3: Bool,
    useBoardcards4: Bool,
  ): Bool {

    const cardList = [holecard0, holecard1, boardcard0, boardcard1, boardcard2, boardcard3, boardcard4];
    const boolList = [useHolecard0, useHolecard1, useBoardcards0, useBoardcards1, useBoardcards2, useBoardcards3, useBoardcards4];

    let allHearts = Bool(true);
    let allDiamonds = Bool(true);
    let allClubs = Bool(true);
    let allSpades = Bool(true);

    // So idea - go through and set all to true
    // After each valid card, all the suits that don't match
    // will be set to false
    // So at the end if any of the bools is still 'true', it
    // must be the case that every card we used was of that suit

    for (let i = 0; i < 7; i++) {
      const c52 = cardList[i];
      const boolUse = boolList[i];

      // Ranges for each suit
      // "2h": 2, "Ah": 41,
      // "2d": 43, "Ad": 101,
      // "2c": 103, "Ac": 167,
      // "2s": 173, "As": 239,
      const minHeart = Field(2);
      const maxHeart = Field(41);
      const minDiamond = Field(43);
      const maxDiamond = Field(101);
      const minClub = Field(103);
      const maxClub = Field(167);
      const minSpade = Field(173);
      const maxSpade = Field(239);

      const isHeart = Provable.if(boolUse.not(), Bool(true), c52.greaterThanOrEqual(minHeart).and(c52.lessThanOrEqual(maxHeart)));
      const isDiamond = Provable.if(boolUse.not(), Bool(true), c52.greaterThanOrEqual(minDiamond).and(c52.lessThanOrEqual(maxDiamond)));
      const isClub = Provable.if(boolUse.not(), Bool(true), c52.greaterThanOrEqual(minClub).and(c52.lessThanOrEqual(maxClub)));
      const isSpade = Provable.if(boolUse.not(), Bool(true), c52.greaterThanOrEqual(minSpade).and(c52.lessThanOrEqual(maxSpade)));

      allHearts = allHearts.and(isHeart);
      allDiamonds = allDiamonds.and(isDiamond);
      allClubs = allClubs.and(isClub);
      allSpades = allSpades.and(isSpade);
    }

    const isFlush = allHearts.or(allDiamonds).or(allClubs).or(allSpades)
    return isFlush;

  }

  @runtimeMethod()
  public showCards(holecard0: Field,
    holecard1: Field,
    boardcard0: Field,
    boardcard1: Field,
    boardcard2: Field,
    boardcard3: Field,
    boardcard4: Field,
    useHolecard0: Bool,
    useHolecard1: Bool,
    useBoardcards0: Bool,
    useBoardcards1: Bool,
    useBoardcards2: Bool,
    useBoardcards3: Bool,
    useBoardcards4: Bool,
    isFlush: Bool,
    shuffleKey: PrivateKey,
    merkleMapKey: Field,
    merkleMapVal: Field,
    path: MerkleMapWitness,
  ): void {

    /*
    Each player has to pass in their holecards, along with all board cards
    And specify which cards are used to make their best 6c hand
     
    To make cheating impossible, we need these checks:
    1. confirm the card lookup key and value are valid entries in the merkle map
    2. independently calculate the card lookup key using their cards and confirm the lookup key is valid
    3. re-hash the cards and confirm it matches their stored hash
    4. check that board cards are the real board cards
    */

    // const [stack0, stack1, turn, street, lastAction, lastBetSize, handOver, pot] = this.getGamestate();
    const handStage = this.handStage.get().value;
    assert(handStage.equals(this.ShowdownA).or(handStage.equals(this.ShowdownB)));

    // Player card hash will be stored in slot1 or slot1
    // const slot0 = this.slot0.get().value;
    // const slot1 = this.slot1.get().value;
    // // We are going to be storing the product of all the board card primes here!
    // const slot2 = this.slot2.get().value;


    // CHECK 0. - make sure player is a part of the game...
    const player = this.transaction.sender.value;
    assert(this.inGame(player), "Player not in game!")

    const player0Key = this.player0Key.get().value;
    const player1Key = this.player1Key.get().value;

    const isP0 = Provable.if(player.equals(player0Key), Bool(false), Bool(true));

    const p0Hc0 = this.p0Hc0.get().value;
    const p0Hc1 = this.p0Hc1.get().value;
    const p1Hc0 = this.p1Hc0.get().value;
    const p1Hc1 = this.p1Hc1.get().value;
    const card0 = Provable.if(isP0, Card, p0Hc0, p1Hc0);
    const card1 = Provable.if(isP0, Card, p0Hc1, p1Hc1);


    // CHECK 2. independently calculate the card lookup key using their cards and confirm the lookup key is valid
    // the lookupVal is the expected key for our merkle map
    const lookupVal: Field = this.calcLookupVal(holecard0,
      holecard1,
      boardcard0,
      boardcard1,
      boardcard2,
      boardcard3,
      boardcard4,
      useHolecard0,
      useHolecard1,
      useBoardcards0,
      useBoardcards1,
      useBoardcards2,
      useBoardcards3,
      useBoardcards4)

    const isFlushReal: Bool = this.calcCheckFlush(holecard0,
      holecard1,
      boardcard0,
      boardcard1,
      boardcard2,
      boardcard3,
      boardcard4,
      useHolecard0,
      useHolecard1,
      useBoardcards0,
      useBoardcards1,
      useBoardcards2,
      useBoardcards3,
      useBoardcards4)

    //isFlushReal.assertEquals(isFlush, 'Player did not pass in correct flush value!');
    assert(isFlushReal.equals(isFlush), 'Player did not pass in correct flush value!');
    //lookupVal.assertEquals(merkleMapKey, 'Incorrect hand strenght passed in!');
    assert(lookupVal.equals(merkleMapKey), 'Incorrect hand strenght passed in!');

    // CHECK 1. confirm the card lookup key and value are valid entries in the merkle map
    // MerkleMapRootBasic
    // MerkleMapRootFlush
    // TEMP - disabling since we don't currently have access to merkle map on front end
    // const root = Provable.if(
    //     isFlush,
    //     this.MerkleMapRootFlush,
    //     this.MerkleMapRootBasic,
    // );
    // const pathValid = path.computeRootAndKey(merkleMapVal);
    // pathValid[0].assertEquals(root);
    // pathValid[1].assertEquals(merkleMapKey);

    // TODO - reenable check, figure out what makes sense
    // CHECK 3. re-hash the cards and confirm it matches their stored hash
    /*
    const cardPoint1 = this.cardPrimeToCardPoint(holecard0);
    const cardPoint2 = this.cardPrimeToCardPoint(holecard1);
    const cardPoint1F = cardPoint1.toFields()[0]
    const cardPoint2F = cardPoint2.toFields()[0]
    const cardHash = this.generateHash(cardPoint1F, cardPoint2F, shuffleKey);
    //cardHash.assertEquals(holecardsHash, 'Player did not pass in their real cards!');
    assert(cardHash.equals(holecardsHash), 'Player did not pass in their real cards!');
    */

    // TODO - reenable check, figure out what makes sense
    // CHECK 4. check that board cards are the real board cards
    /*
    const boardcardMul = boardcard0.mul(boardcard1).mul(boardcard2).mul(boardcard3).mul(boardcard4);
    const boardcardMulReal = Field(slot2);
    // boardcardMul.assertEquals(boardcardMulReal);
    assert(boardcardMul.equals(boardcardMulReal), "Bad board cards passed in!");
    // And check that we have 5 boardcards - should not be divisible by null val
    const nullBoardcardUint = Field(this.NullBoardcard);
    const divModRes = UInt32.from(boardcardMulReal).divMod(UInt32.from(nullBoardcardUint));
    const evenDiv = divModRes.rest.value.equals(Field(0));
    // evenDiv.assertFalse()
    assert(evenDiv.not(), "Should have five board cards!");
    */
    // boardcardMulReal.divMod(nullBoardcardUint).rest.equals(Field(0)).assertFalse();

    // And now we can store the lookup value in the appropriate slot



    // Assuming we made it past all our checks - 
    // We are now storing the merkleMapVal, which represents
    // hand strength in these slots!  Lower is better!
    const showdownValueP0 = this.showdownValueP0.get().value;
    const showdownValueP1 = this.showdownValueP1.get().value;

    // Make sure they can only showdown once
    const confirm0 = Provable.if(
      player.equals(player1Key),
      showdownValueP0,
      showdownValueP1,
    );
    assert(confirm0.equals(0), "Player already showed cards!")

    const showdownValueP0New = Provable.if(
      player.equals(player0Key),
      merkleMapVal,
      showdownValueP0,
    );
    const showdownValueP1New = Provable.if(
      player.equals(player1Key),
      merkleMapVal,
      showdownValueP1,
    );
    this.showdownValueP0.set(showdownValueP0New);
    this.showdownValueP1.set(showdownValueP1New);

    // Handstage should ALWAYS increment - takes two increments to transition to Settle
    this.handStage.set(handStage.add(1));

  }


  private inGame(caller: PublicKey): Bool {
    const player0Key = this.player0Key.get().value;
    const player1Key = this.player1Key.get().value;
    return caller.equals(player0Key).or(caller.equals(player1Key));
  }

  @runtimeMethod()
  public commitOpponentHolecards(card0: Card, card1: Card): void {
    const handStage: Field = this.handStage.get().value;
    assert(handStage.equals(this.DealHolecardsA).or(handStage.equals(this.DealHolecardsA)));

    const player = this.transaction.sender.value;
    assert(this.inGame(player), "Player not in game!")
    // If caller is player0 - cards are for player1, and vice versa
    const p0Hc0 = this.p0Hc0.get().value;
    const p0Hc1 = this.p0Hc1.get().value;
    const p1Hc0 = this.p1Hc0.get().value;
    const p1Hc1 = this.p1Hc1.get().value;

    const player0Key = this.player0Key.get().value;
    const player1Key = this.player1Key.get().value;

    // So if caller is player0 - cards are for player1
    const p1Hc0New = Provable.if(player.equals(player0Key), Card, p1Hc0, card0);
    const p1Hc1New = Provable.if(player.equals(player0Key), Card, p1Hc1, card1);
    // And opposite if caller is player1
    const p0Hc0New = Provable.if(player.equals(player1Key), Card, p0Hc0, card0);
    const p0Hc1New = Provable.if(player.equals(player1Key), Card, p0Hc1, card1);

    this.p0Hc0.set(p0Hc0New);
    this.p0Hc1.set(p0Hc1New);
    this.p1Hc0.set(p1Hc0New);
    this.p1Hc1.set(p1Hc1New);

    // Handstage should ALWAYS increment - takes two increments to transition to PreflopBetting
    this.handStage.set(handStage.add(1));

  }

  @runtimeMethod()
  public commitBoardcards(card0: Card, card1: Card, card2: Card): void {
    // Only valid if we're in the 'deal' stage of flop/turn/river
    // Note that for turn and river we will not be using card1 and card2, so those can be empty Card objects
    const handStage: Field = this.handStage.get().value;
    assert(handStage.equals(this.FlopDeal).or(handStage.equals(this.TurnDeal)).or(handStage.equals(this.RiverDeal)), "Not in deal stage!");

    const flop0 = this.flop0.get().value;
    const flop1 = this.flop1.get().value;
    const flop2 = this.flop2.get().value;
    const turn0 = this.turn0.get().value;
    const river0 = this.river0.get().value;

    const flop0New = Provable.if(handStage.equals(this.FlopDeal),
      Card,
      card0,
      flop0)
    const flop1New = Provable.if(handStage.equals(this.FlopDeal),
      Card,
      card1,
      flop1)
    const flop2New = Provable.if(handStage.equals(this.FlopDeal),
      Card,
      card2,
      flop2)
    const turn0New = Provable.if(handStage.equals(this.TurnDeal),
      Card,
      card0,
      turn0)
    const river0New = Provable.if(handStage.equals(this.RiverDeal),
      Card,
      card0,
      river0)

    this.flop0.set(flop0New);
    this.flop1.set(flop1New);
    this.flop2.set(flop2New);
    this.turn0.set(turn0New);
    this.river0.set(river0New);
  }


  @runtimeMethod()
  public decodeBoardcards(decryptKey: PrivateKey): void {
    // TODO - big security issue, this is actually public so it will expose
    // the other player's card, we'd need to replace this with a proof to keep it private

    // We should still be in the handStage phase... if cards aren't committed this will just fail
    const handStage: Field = this.handStage.get().value;
    assert(handStage.equals(this.FlopDeal).or(handStage.equals(this.TurnDeal)).or(handStage.equals(this.RiverDeal)), "Not in deal stage!");

    const flop0 = this.flop0.get().value;
    const flop1 = this.flop1.get().value;
    const flop2 = this.flop2.get().value;
    const turn0 = this.turn0.get().value;
    const river0 = this.river0.get().value;

    const flop0New = Provable.if(handStage.equals(this.FlopDeal),
      Card,
      partialUnmaskProvable(flop0, decryptKey),
      flop0)
    const flop1New = Provable.if(handStage.equals(this.FlopDeal),
      Card,
      partialUnmaskProvable(flop1, decryptKey),
      flop1)
    const flop2New = Provable.if(handStage.equals(this.FlopDeal),
      Card,
      partialUnmaskProvable(flop2, decryptKey),
      flop2)
    const turn0New = Provable.if(handStage.equals(this.TurnDeal),
      Card,
      partialUnmaskProvable(turn0, decryptKey),
      turn0)
    const river0New = Provable.if(handStage.equals(this.RiverDeal),
      Card,
      partialUnmaskProvable(river0, decryptKey),
      river0)

    this.flop0.set(flop0New);
    this.flop1.set(flop1New);
    this.flop2.set(flop2New);
    this.turn0.set(turn0New);
    this.river0.set(river0New);

    // Handstage should ALWAYS increment - transition from "Deal" to "Betting"
    this.handStage.set(handStage.add(1));
  }

}