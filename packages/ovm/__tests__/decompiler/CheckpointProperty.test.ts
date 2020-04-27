import { Wallet } from 'ethers'
import {
  Address,
  Range,
  BigNumber,
  Bytes,
  FixedBytes
} from '@cryptoeconomicslab/primitives'
import { EthCoder as Coder } from '@cryptoeconomicslab/eth-coder'
import { Secp256k1Signer } from '@cryptoeconomicslab/signature'
import { setupContext } from '@cryptoeconomicslab/context'
import { initializeDeciderManager } from '../helpers/initiateDeciderManager'
import {
  Property,
  CompiledDecider,
  CompiledPredicate,
  DeciderManager
} from '../../src'
import { putWitness, replaceHint } from '@cryptoeconomicslab/db'
import {
  DoubleLayerTreeGenerator,
  DoubleLayerTreeLeaf
} from '@cryptoeconomicslab/merkle-tree'
import { Keccak256 } from '@cryptoeconomicslab/hash'
import { decodeStructable } from '@cryptoeconomicslab/coder'
setupContext({ coder: Coder })

// Setting up predicates
const OWNERSHIP_SOURCE = `
@library
@quantifier("signatures,KEY,\${m}")
def SignedBy(sig, m, signer) := IsValidSignature(m, sig, signer, $secp256k1)
def ownership(owner, tx) := SignedBy(tx, owner).any()
`

const STATEUPDATE_SOURCE = `
@library
def IsValidTx(tx, token, range, block_number) :=
  Equal(tx.address, $txAddress)
  and Equal(tx.0, token)
  and IsContained(range, tx.1)
  and IsLessThan(block_number, tx.2)

@library
@quantifier("tx.block\${b}.range\${token},RANGE,\${range}")
def Tx(tx, token, range, b) :=
  IsValidTx(tx, token, range, b)

def stateUpdate(token, range, block_number, so) :=
  Tx(token, range, block_number).any(tx ->
    so(tx)
  )
`

const CHECKPOINT_SOURCE = `
@library
@quantifier("stored.\${contract},KEY,\${key}")
def Stored(value, contract, key) := IsStored(contract, key, value)

@library
@quantifier("proof.block\${b}.range\${token},RANGE,\${range}")
def IncludedAt(proof, leaf, token, range, b, commitmentContract) :=
  Stored(commitmentContract, b).any(root ->
    VerifyInclusion(leaf, token, range, proof, root)
  )

@library
@quantifier("range,NUMBER,\${zero}-\${upper_bound}")
def LessThan(n, upper_bound) :=
  IsLessThan(n, upper_bound)

@library
@quantifier("su.block\${b}.range\${token},RANGE,\${range}")
def SU(su, token, range, b) :=
  IncludedAt(su.3, token, range, b, $commitmentContract).any()

def checkpoint(su, proof) :=
  Stored($commitmentContract, su.2).any(root ->
    VerifyInclusion(su.3, su.0, su.1, proof, root)
  )
  and LessThan(su.2).all(b -> 
    SU(su.0, su.1, b).all(old_su -> old_su())
  )
`

const commitmentContractAddress = Address.from(
  '0x4444444444444444444444444444444444444444'
)
const txAddress = Address.from('0x7777777777777777777777777777777777777777')

// setup deciders
const stateUpdateAddress = Address.from(
  '0x0250035000301010002000900380005700060000'
)
const stateUpdatePredicate = CompiledPredicate.fromSource(
  stateUpdateAddress,
  STATEUPDATE_SOURCE
)
const stateUpdateDecider = new CompiledDecider(stateUpdatePredicate, {
  txAddress: Coder.encode(txAddress)
})

const checkpointAddress = Address.from(
  '0x0250035000301010002000900380005700060001'
)
const checkpointPredicate = CompiledPredicate.fromSource(
  checkpointAddress,
  CHECKPOINT_SOURCE
)
const checkpointDecider = new CompiledDecider(checkpointPredicate, {
  commitmentContract: Coder.encode(commitmentContractAddress)
})

const ownershipAddress = Address.from(
  '0x0000000000000000000000000000000000011111'
)
const ownershipPredicate = CompiledPredicate.fromSource(
  ownershipAddress,
  OWNERSHIP_SOURCE
)
const ownershipDecider = new CompiledDecider(ownershipPredicate)

const tokenAddress = Address.from('0x0000000000000000000000888880000000000000')

function createSU(
  start: number,
  end: number,
  blockNumber: number,
  owner: Address
): Property {
  return new Property(stateUpdateAddress, [
    Coder.encode(tokenAddress),
    Coder.encode(
      new Range(BigNumber.from(start), BigNumber.from(end)).toStruct()
    ),
    Coder.encode(BigNumber.from(blockNumber)),
    Coder.encode(
      ownershipPredicate.makeProperty([Coder.encode(owner)]).toStruct()
    )
  ])
}

function getBlockNumber(su: Property) {
  return Coder.decode(BigNumber.default(), su.inputs[2])
}
function getRange(su: Property) {
  return decodeStructable(Range, Coder, su.inputs[1])
}
function getDepositContractAddress(su: Property) {
  return Coder.decode(Address.default(), su.inputs[0])
}
function getStateObject(su: Property) {
  return decodeStructable(Property, Coder, su.inputs[3])
}

function createLeaf(su: Property) {
  const depositContractAddress = Coder.decode(Address.default(), su.inputs[0])
  const start = decodeStructable(Range, Coder, su.inputs[1]).start
  return new DoubleLayerTreeLeaf(
    depositContractAddress,
    start,
    FixedBytes.from(32, Keccak256.hash(su.inputs[3]).data)
  )
}

describe('Checkpoint', () => {
  let deciderManager: DeciderManager
  const wallet = new Wallet(
    '0xc87509a1c067bbde78beb793e6fa76530b6382a4c0241e5e4a9ec0a0f44dc0d3'
  )
  const aliceAddress = Address.from(
    '0x4444444444444444455555555555555554444444'
  )
  const aliceSU = createSU(0, 10, 1, aliceAddress)

  const bobAddress = Address.from(wallet.address)
  const bobSU = createSU(0, 10, 2, bobAddress)
  const signer = new Secp256k1Signer(Bytes.fromHexString(wallet.privateKey))

  const generator = new DoubleLayerTreeGenerator()
  const merkleTree = generator.generate([
    createLeaf(bobSU),
    createLeaf(createSU(20, 30, 1, Address.default())),
    createLeaf(createSU(100, 120, 1, Address.default())),
    createLeaf(createSU(200, 201, 1, Address.default()))
  ])
  const root = merkleTree.getRoot()
  const inclusionProof = merkleTree.getInclusionProofByAddressAndIndex(
    tokenAddress,
    0
  )

  beforeEach(() => {
    deciderManager = initializeDeciderManager()
    deciderManager.setDecider(ownershipAddress, ownershipDecider)
    deciderManager.setDecider(checkpointAddress, checkpointDecider)
    deciderManager.setDecider(stateUpdateAddress, stateUpdateDecider)
  })

  test('checkpoint decides to true', async () => {
    // prepare witnesses
    // store state object for SU
    const suHint = replaceHint('su.block${b}.range${token},RANGE,${range}', {
      b: Coder.encode(getBlockNumber(aliceSU)),
      token: Coder.encode(getDepositContractAddress(aliceSU)),
      range: Coder.encode(getRange(aliceSU).toStruct())
    })
    await putWitness(
      deciderManager.witnessDb,
      suHint,
      Coder.encode(aliceSU.toStruct())
    )

    const bobSuBN = getBlockNumber(bobSU)

    // store proof for IncludedAt
    const proofHint = replaceHint(
      'proof.block${b}.range${token},RANGE,${range}',
      {
        b: Coder.encode(bobSuBN),
        token: Coder.encode(getDepositContractAddress(bobSU)),
        range: Coder.encode(getRange(bobSU).toStruct())
      }
    )
    await putWitness(
      deciderManager.witnessDb,
      proofHint,
      Coder.encode(inclusionProof.toStruct())
    )

    // store proof for su and signatures
    const txProperty = new Property(txAddress, [
      Coder.encode(tokenAddress),
      Coder.encode(new Range(BigNumber.from(0), BigNumber.from(10)).toStruct()),
      Coder.encode(BigNumber.from(5)),
      Coder.encode(
        ownershipPredicate.makeProperty([Coder.encode(aliceAddress)]).toStruct()
      )
    ])

    const txBody = Coder.encode(txProperty.toStruct())
    const sig = await signer.sign(txBody)

    await putWitness(
      deciderManager.witnessDb,
      replaceHint('tx.block${b}.range${token},RANGE,${range}', {
        b: Coder.encode(bobSuBN),
        token: Coder.encode(tokenAddress),
        range: Coder.encode(getRange(bobSU).toStruct())
      }),
      Coder.encode(txProperty.toStruct())
    )

    await putWitness(
      deciderManager.witnessDb,
      replaceHint('signatures,KEY,${m}', { m: txBody }),
      sig
    )

    // store root hash to storage db and witness
    const rootHint = replaceHint('stored.${contract},KEY,${key}', {
      contract: Coder.encode(commitmentContractAddress),
      key: Coder.encode(bobSuBN)
    })
    await putWitness(deciderManager.witnessDb, rootHint, Coder.encode(root))

    const storageDb = await deciderManager.getStorageDb()
    const bucket = await storageDb.bucket(
      Coder.encode(commitmentContractAddress)
    )
    await bucket.put(Coder.encode(bobSuBN), Coder.encode(root))

    const checkpointInputs = [
      Bytes.fromString('CheckpointA'),
      Coder.encode(bobSU.toStruct()),
      Coder.encode(inclusionProof.toStruct())
    ]

    const checkpointProperty = new Property(checkpointAddress, checkpointInputs)
    const decision = await checkpointDecider.decide(
      deciderManager,
      checkpointProperty.inputs
    )
    expect(decision.outcome).toBeTruthy()
  })
})
