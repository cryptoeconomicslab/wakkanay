import { Wallet } from 'ethers'
import {
  Address,
  Range,
  BigNumber,
  Bytes,
  List
} from '@cryptoeconomicslab/primitives'
import { EthCoder as Coder } from '@cryptoeconomicslab/eth-coder'
import { setupContext } from '@cryptoeconomicslab/context'
import {
  initializeDeciderManager,
  SampleDeciderAddress
} from '../helpers/initiateDeciderManager'
import {
  Property,
  CompiledDecider,
  CompiledPredicate,
  DeciderManager,
  LogicalConnective,
  FreeVariable,
  encodeProperty
} from '../../src'
import { putWitness, replaceHint } from '@cryptoeconomicslab/db'
setupContext({ coder: Coder })

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

describe('StateUpdate', () => {
  let deciderManager: DeciderManager
  const predicateAddress = Address.from(
    '0x0250035000301010002000900380005700060001'
  )
  const tokenAddress = Address.from(
    '0x0888888888888888888888888888888888888888'
  )
  const txAddress = Address.from('0x7777777777777777777777777777777777777777')
  const compiledPredicate = CompiledPredicate.fromSource(
    predicateAddress,
    STATEUPDATE_SOURCE
  )
  const compiledDecider = new CompiledDecider(compiledPredicate, {
    txAddress: Coder.encode(txAddress)
  })
  const stateObject = new Property(SampleDeciderAddress, [
    Bytes.fromHexString('0x01')
  ])
  const blockNumber = BigNumber.from(1)
  const range = new Range(BigNumber.from(0), BigNumber.from(5))
  const inputs = [
    Bytes.fromString('StateUpdateT'),
    Coder.encode(tokenAddress),
    Coder.encode(range.toStruct()),
    Coder.encode(blockNumber),
    Coder.encode(stateObject.toStruct())
  ]
  const property = new Property(predicateAddress, inputs)

  beforeEach(() => {
    deciderManager = initializeDeciderManager()
    deciderManager.setDecider(predicateAddress, compiledDecider)
  })

  test('stateUpdate decides to true', async () => {
    // prepare witness tx
    const txProperty = new Property(txAddress, [
      Coder.encode(tokenAddress),
      Coder.encode(range.toStruct()),
      Coder.encode(BigNumber.from(5)),
      Coder.encode(stateObject.toStruct())
    ])

    await putWitness(
      deciderManager.witnessDb,
      replaceHint('tx.block${b}.range${token},RANGE,${range}', {
        b: Coder.encode(blockNumber),
        token: Coder.encode(tokenAddress),
        range: Coder.encode(range.toStruct())
      }),
      Coder.encode(txProperty.toStruct())
    )

    const decision = await compiledDecider.decide(
      deciderManager,
      property.inputs,
      {}
    )

    // create witness
    const witnesses: Bytes[] = []
    witnesses.push(
      Coder.encode(
        List.from(Bytes, [
          Coder.encode(List.from(Bytes, [])),
          Coder.encode(List.from(Bytes, [])),
          Coder.encode(List.from(Bytes, [])),
          Coder.encode(List.from(Bytes, []))
        ])
      )
    )
    witnesses.push(Coder.encode(List.from(Bytes, [])))
    witnesses.push(Coder.encode(txProperty.toStruct()))

    expect(decision).toStrictEqual({
      witnesses,
      challenges: [],
      outcome: true
    })
  })

  test('stateUpdate decides to false with invalid tx', async () => {
    // prepare witness tx
    const txProperty = new Property(txAddress, [
      Coder.encode(tokenAddress),
      Coder.encode(range.toStruct()),
      Coder.encode(BigNumber.from(0)),
      Coder.encode(stateObject.toStruct())
    ])

    const hint = replaceHint('tx.block${b}.range${token},RANGE,${range}', {
      b: Coder.encode(blockNumber),
      token: Coder.encode(tokenAddress),
      range: Coder.encode(range.toStruct())
    })

    await putWitness(
      deciderManager.witnessDb,
      hint,
      Coder.encode(txProperty.toStruct())
    )

    const decision = await compiledDecider.decide(
      deciderManager,
      property.inputs,
      {}
    )

    const challengeProperty = new Property(
      deciderManager.getDeciderAddress(LogicalConnective.ForAllSuchThat),
      [
        Bytes.fromString(hint),
        Bytes.fromString('tx'),
        Coder.encode(
          new Property(
            deciderManager.getDeciderAddress(LogicalConnective.Not),
            [
              encodeProperty(
                Coder,
                new Property(predicateAddress, [
                  Bytes.fromString('StateUpdateTA'),
                  FreeVariable.from('tx'),
                  Coder.encode(tokenAddress),
                  Coder.encode(range.toStruct()),
                  Coder.encode(blockNumber),
                  Coder.encode(stateObject.toStruct())
                ])
              )
            ]
          ).toStruct()
        )
      ]
    )

    expect(decision.outcome).toBeFalsy()
    expect(decision.challenges).toStrictEqual([
      { challengeInput: null, property: challengeProperty }
    ])
  })
})