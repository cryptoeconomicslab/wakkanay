import { BigNumber, Range } from '@cryptoeconomicslab/primitives'
import { ICheckpointDisputeContract } from '@cryptoeconomicslab/contract'
import { KeyValueStore, getWitnesses } from '@cryptoeconomicslab/db'
import { StateUpdate, Checkpoint } from '@cryptoeconomicslab/plasma'
import { DoubleLayerInclusionProof } from '@cryptoeconomicslab/merkle-tree'
import { hint as Hint, DeciderManager } from '@cryptoeconomicslab/ovm'
import {
  StateUpdateRepository,
  SyncRepository,
  CheckpointRepository,
  TransactionRepository,
  InclusionProofRepository
} from '../repository'
import APIClient from '../APIClient'
import JSBI from 'jsbi'
import TokenManager from '../managers/TokenManager'
import { verifyCheckpoint } from '../verifier/CheckpointVerifier'
import { prepareCheckpointWitness } from '../helper/checkpointWitnessHelper'

const INTERVAL = 60000
const DISPUTE_PERIOD = 100 // FIXME: set correct dispute period from .env

/**
 * CheckpointDispute class used by Plasma Light Client responsible for following activities
 * - claim checkpoint when necessary
 * - watch checkpoint dispute contract
 * - challenge checkpoint claim when necessary
 * - removeChallenge checkpoint challenge when necessary
 * - settle checkpoint when possible
 * - polling to settle claimed checkpoint if this client claimed a checkpoint
 */
export class CheckpointDispute {
  private polling = false
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private contract: ICheckpointDisputeContract,
    private witnessDb: KeyValueStore,
    private deciderManager: DeciderManager,
    private tokenManager: TokenManager,
    private apiClient: APIClient
  ) {
    contract.subscribeCheckpointClaimed(this.handleCheckpointClaimed.bind(this))
    contract.subscribeCheckpointChallenged(
      this.handleCheckpointChallenged.bind(this)
    )
    contract.subscribeCheckpointChallengeRemoved(
      this.handleChallengeRemoved.bind(this)
    )
    contract.subscribeCheckpointSettled(this.handleCheckpointSettled.bind(this))
    this.contract.startWatchingEvents()
  }

  async handleCheckpointClaimed(
    stateUpdate: StateUpdate,
    _inclusionProof: DoubleLayerInclusionProof
  ) {
    const suRepo = await StateUpdateRepository.init(this.witnessDb)
    const inclusionProofRepo = await InclusionProofRepository.init(
      this.witnessDb
    )

    // check if claimed stateUpdate is same range and greater blockNumber of owning stateUpdate
    const stateUpdates = await suRepo.getVerifiedStateUpdates(
      stateUpdate.depositContractAddress,
      stateUpdate.range
    )
    if (stateUpdates.length === 0) return

    const challengeSu = stateUpdates.find(su =>
      JSBI.lessThan(su.blockNumber.data, stateUpdate.blockNumber.data)
    )
    if (!challengeSu) return

    await prepareCheckpointWitness(stateUpdate, this.apiClient, this.witnessDb)

    // evaluate the stateUpdate history validity and
    const result = await verifyCheckpoint(
      this.witnessDb,
      this.deciderManager,
      stateUpdate
    )
    if (!result.challenge && result.decision) return

    // get inclusionProof of challengingStateUpdate
    const challengingStateUpdate = result.challenge as StateUpdate
    const inclusionProofs = await inclusionProofRepo.getInclusionProofs(
      challengingStateUpdate.depositContractAddress,
      challengingStateUpdate.blockNumber,
      challengingStateUpdate.range
    )

    await this.contract.challenge(
      stateUpdate,
      challengingStateUpdate,
      inclusionProofs[0]
    )
    console.log('Challenge checkpoint')
  }

  async handleCheckpointChallenged(
    stateUpdate: StateUpdate,
    challenge: StateUpdate,
    inclusionProof: DoubleLayerInclusionProof
  ) {
    const checkpointRepo = await CheckpointRepository.init(this.witnessDb)
    const claims = await checkpointRepo.getClaimedCheckpoints(
      stateUpdate.depositContractAddress,
      stateUpdate.range
    )
    if (claims.length === 0) return

    const txRepo = await TransactionRepository.init(this.witnessDb)
    const transactions = await txRepo.getTransactions(
      challenge.depositContractAddress,
      challenge.blockNumber,
      challenge.range
    )
    if (transactions.length !== 1) {
      // do nothing
      return
    }
    const txBytes = transactions[0].message

    const signature = await getWitnesses(
      this.witnessDb,
      Hint.createSignatureHint(txBytes)
    )
    if (signature.length !== 1) {
      // do nothing
      return
    }

    await this.contract.removeChallenge(stateUpdate, challenge, [
      txBytes,
      signature[0]
    ])
  }

  handleChallengeRemoved(stateUpdate: StateUpdate, challenge: StateUpdate) {
    // you can do nothing. challenge is just removed
    console.log('checkpoint challenge removed')
  }

  async handleCheckpointSettled(stateUpdate: StateUpdate) {
    console.log('checkpoint settled') // TODO: log informative message
    const repository = await CheckpointRepository.init(this.witnessDb)
    const claimedCheckpoints = await repository.getClaimedCheckpoints(
      stateUpdate.depositContractAddress,
      stateUpdate.range
    )
    if (claimedCheckpoints.length === 1) {
      const checkpoint = claimedCheckpoints[0]
      await repository.removeClaimedCheckpoint(checkpoint)
      await repository.insertSettledCheckpoint(checkpoint.stateUpdate)
    }
  }

  /**
   * polling claim if there remains claims not settled, do polling
   * stop polling when no claims remains.
   */
  private pollClaim() {
    this.timer = setTimeout(async () => {
      const checkpoints = await this.getAllClaimedCheckpoints()
      const syncRepo = await SyncRepository.init(this.witnessDb)
      const currentBlockNumber = await syncRepo.getSyncedBlockNumber()

      if (checkpoints.length > 0) {
        checkpoints.map(c => {
          if (
            JSBI.lessThanOrEqual(
              JSBI.add(c.claimedBlockNumber.data, JSBI.BigInt(DISPUTE_PERIOD)),
              currentBlockNumber.data
            )
          ) {
            this.contract.settle(c.stateUpdate)
          }
        })
        this.pollClaim()
      }
    }, INTERVAL)
  }

  /**
   * claim checkpoint.
   * LightClient does not call checkpoint from this method in ordinaly case
   */
  public async claim(
    stateUpdate: StateUpdate,
    inclusionProof: DoubleLayerInclusionProof
  ) {
    const syncRepo = await SyncRepository.init(this.witnessDb)
    const claimedBlockNumber = await syncRepo.getSyncedBlockNumber()
    await this.contract.claim(stateUpdate, inclusionProof)

    const checkpoint = new Checkpoint(stateUpdate, claimedBlockNumber)
    const checkpointRepo = await CheckpointRepository.init(this.witnessDb)
    await checkpointRepo.insertClaimedCheckpoint(checkpoint)
    if (!this.polling) this.pollClaim()
  }

  public async getAllClaimedCheckpoints(): Promise<Checkpoint[]> {
    const checkpointRepository = await CheckpointRepository.init(this.witnessDb)
    const checkpoints = await Promise.all(
      this.tokenManager.depositContractAddresses.map(async addr => {
        return await checkpointRepository.getClaimedCheckpoints(
          addr,
          new Range(BigNumber.from(0), BigNumber.MAX_NUMBER)
        )
      })
    )

    // flatten checkpoints
    return ([] as Checkpoint[]).concat(...checkpoints)
  }

  public async settle(stateUpdate: StateUpdate) {
    this.contract.settle(stateUpdate)
  }
}
