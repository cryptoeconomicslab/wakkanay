import {
  Integer,
  BigNumber,
  Bytes,
  Address,
  Property,
  Range
} from '@cryptoeconomicslab/primitives'
import { StateUpdate } from '@cryptoeconomicslab/plasma'

export interface IDepositContract {
  address: Address
  /**
   * Deposits token with initial state
   * @param amount Amount of token. e.g. The unit is wei in ethereum.
   * @param initialState Initial state of the range
   */
  deposit(amount: BigNumber, initialState: Property): Promise<void>
  /**
   * Finalizes checkpoint claim
   * @param checkpoint Checkpoint property which has been decided true by Adjudicator Contract.
   */
  finalizeCheckpoint(checkpoint: StateUpdate): Promise<void>
  /**
   * Finalizes exit claim and withdraw fund
   * @param exit The exit property which has been decided true by Adjudicator Contract.
   * @param depositedRangeId The id of range. We can know depositedRangeId from deposited event and finalizeExited event.
   */
  finalizeExit(exit: StateUpdate, depositedRangeId: Integer): Promise<void>

  /**
   * subscribe to checkpoint finalized event
   */
  subscribeCheckpointFinalized(
    handler: (checkpointId: Bytes, checkpoint: StateUpdate) => Promise<void>
  ): void

  /**
   * subscribe to exit finalized event
   */
  subscribeExitFinalized(
    handler: (exitId: Bytes, exit: StateUpdate) => Promise<void>
  ): void

  subscribeDepositedRangeExtended(
    handler: (range: Range) => Promise<void>
  ): void

  subscribeDepositedRangeRemoved(handler: (range: Range) => Promise<void>): void

  /**
   * startWatchingEvents wait until fetch latest events
   */
  startWatchingEvents(): Promise<void>

  unsubscribeAll(): void
}
