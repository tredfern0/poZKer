import { PublicKey, Struct } from 'o1js';

/**
 * Represents a playing card, masked or not.
 */
export class Card extends Struct({
  /**
   * The joint ephemeral key for this card, resulting from all the masking operations.
   * New cards should have this set to the zero point (For example `Group.generator.sub(Group.generator)`)
   */
  epk: PublicKey,

  /**
   * The card value( or masked value) represented as a Group element.
   *
   * Mapping to and from actual game cards and group elements must be done at the application level.
   */
  msg: PublicKey,

  /**
   * The elliptic curve point representing the sum of the public keys of all players masking this card.
   */
  pk: PublicKey,
}) {
  constructor(c1: PublicKey, c2: PublicKey, h: PublicKey) {
    super({ pk: h, epk: c1, msg: c2 });
  }
}

