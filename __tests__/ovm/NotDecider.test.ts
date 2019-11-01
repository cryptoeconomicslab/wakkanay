import { DeciderManager } from '../../src/ovm/DeciderManager'
import { NotDecider, SampleDecider } from '../../src/ovm/deciders'
import { Property } from '../../src/ovm/types'
import { Address, Bytes } from '../../src/types/Codables'
import { utils } from 'ethers'
import EthCoder from '../../src/coder/EthCoder'

describe('NotDecider', () => {
  const SampleDeciderAddress = Address.from(
    '0x000000000000000000000000000000000000001'
  )
  const NotDeciderAddress = Address.from(
    '0x0000000000000000000000000000000000000002'
  )
  it('decide not(false)', async () => {
    const deciderManager = new DeciderManager()
    deciderManager.setDecider(SampleDeciderAddress, new SampleDecider())
    deciderManager.setDecider(NotDeciderAddress, new NotDecider())
    const decision = await deciderManager.decide(
      new Property(NotDeciderAddress, [
        Bytes.from(
          utils.arrayify(
            EthCoder.encode(new Property(SampleDeciderAddress, []).toStruct())
          )
        )
      ])
    )
    expect(decision.outcome).toEqual(true)
  })
  it('decide not(true)', async () => {
    const deciderManager = new DeciderManager()
    deciderManager.setDecider(SampleDeciderAddress, new SampleDecider())
    deciderManager.setDecider(NotDeciderAddress, new NotDecider())
    const decision = await deciderManager.decide(
      new Property(NotDeciderAddress, [
        Bytes.from(
          utils.arrayify(
            EthCoder.encode(
              new Property(SampleDeciderAddress, [
                Bytes.fromString('true')
              ]).toStruct()
            )
          )
        )
      ])
    )
    expect(decision.outcome).toEqual(false)
    // valid challenge is SampleDecider(true)
    expect(decision.challenges[0]).toEqual({
      challengeInput: null,
      property: { deciderAddress: SampleDeciderAddress, inputs: ['true'] }
    })
  })
})