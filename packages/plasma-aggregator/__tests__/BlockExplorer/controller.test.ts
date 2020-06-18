import BlockExplorerController from '../../src/BlockExplorer/Controller'
import { Block, StateUpdate } from '@cryptoeconomicslab/plasma'
import {
  Address,
  Bytes,
  BigNumber,
  Range
} from '@cryptoeconomicslab/primitives'
import { Property } from '@cryptoeconomicslab/ovm'
import Coder from '@cryptoeconomicslab/coder'
import { setupContext } from '@cryptoeconomicslab/context'
import { DateUtils } from '@cryptoeconomicslab/utils'
setupContext({ coder: Coder })
import Aggregator from '../../src/Aggregator'
import { initializeAggregatorWithBlocks } from './helper'

const testAddr = '0x0000000000000000000000000000000000000001'

const su = (bn: number, start: number, end: number, msg: string) =>
  new StateUpdate(
    Address.default(),
    Address.default(),
    new Range(BigNumber.from(start), BigNumber.from(end)),
    BigNumber.from(bn),
    new Property(Address.default(), [Bytes.fromString(msg)])
  )

const TIME_STAMP = DateUtils.getCurrentDate()

const block = (bn: number, addr: string, sus: StateUpdate[]) => {
  const map = new Map()
  map.set(addr, sus)
  return new Block(BigNumber.from(bn), map, TIME_STAMP)
}

describe('BlockExplorerController', () => {
  let aggregator: Aggregator
  beforeEach(async () => {
    new Array(12)
    const blocks = [
      block(1, testAddr, [
        su(1, 0, 10, 'hi'),
        su(1, 10, 20, 'hello'),
        su(1, 30, 35, 'hey')
      ])
    ].concat(
      Array(12)
        .fill(0)
        .map((v, i) =>
          block(i + 2, testAddr, [su(i + 2, 0, 10, (i + 2).toString())])
        )
    )
    aggregator = await initializeAggregatorWithBlocks(
      blocks,
      BigNumber.from(12)
    )
  })

  describe('handleBlock', () => {
    test('returns block correctly', async () => {
      const controller = new BlockExplorerController(aggregator)
      const b = await controller.handleBlock(BigNumber.from(1))
      expect(b).toEqual({
        blockNumber: '1',
        transactions: 3,
        timestamp: TIME_STAMP
      })
    })

    test('returns null for too large block number', async () => {
      const controller = new BlockExplorerController(aggregator)
      const b = await controller.handleBlock(BigNumber.from(15))
      expect(b).toBeNull()
    })

    test('throws invalid parameter', async () => {
      const controller = new BlockExplorerController(aggregator)
      await expect(controller.handleBlock(BigNumber.from(-15))).rejects.toEqual(
        new Error('Invalid Parameter')
      )
    })
  })

  describe('handleBlockList', () => {
    test('returns 10 blocks without params', async () => {
      const controller = new BlockExplorerController(aggregator)
      const blocks = await controller.handleBlockList()
      expect(blocks).toEqual([
        { blockNumber: '3', transactions: 1, timestamp: TIME_STAMP },
        { blockNumber: '4', transactions: 1, timestamp: TIME_STAMP },
        { blockNumber: '5', transactions: 1, timestamp: TIME_STAMP },
        { blockNumber: '6', transactions: 1, timestamp: TIME_STAMP },
        { blockNumber: '7', transactions: 1, timestamp: TIME_STAMP },
        { blockNumber: '8', transactions: 1, timestamp: TIME_STAMP },
        { blockNumber: '9', transactions: 1, timestamp: TIME_STAMP },
        { blockNumber: '10', transactions: 1, timestamp: TIME_STAMP },
        { blockNumber: '11', transactions: 1, timestamp: TIME_STAMP },
        { blockNumber: '12', transactions: 1, timestamp: TIME_STAMP }
      ])
    })

    test('returns blocks specified with from and to', async () => {
      const controller = new BlockExplorerController(aggregator)
      const blocks = await controller.handleBlockList({
        from: BigNumber.from(7),
        to: BigNumber.from(9)
      })
      expect(blocks).toEqual([
        { blockNumber: '7', transactions: 1, timestamp: TIME_STAMP },
        { blockNumber: '8', transactions: 1, timestamp: TIME_STAMP },
        { blockNumber: '9', transactions: 1, timestamp: TIME_STAMP }
      ])
    })

    test('returns blocks til end only `from` specified', async () => {
      const controller = new BlockExplorerController(aggregator)
      const blocks = await controller.handleBlockList({
        from: BigNumber.from(7)
      })
      expect(blocks).toEqual([
        { blockNumber: '7', transactions: 1, timestamp: TIME_STAMP },
        { blockNumber: '8', transactions: 1, timestamp: TIME_STAMP },
        { blockNumber: '9', transactions: 1, timestamp: TIME_STAMP },
        { blockNumber: '10', transactions: 1, timestamp: TIME_STAMP },
        { blockNumber: '11', transactions: 1, timestamp: TIME_STAMP },
        { blockNumber: '12', transactions: 1, timestamp: TIME_STAMP }
      ])
    })

    test('returns 10 blocks til specified only `to` specified', async () => {
      const controller = new BlockExplorerController(aggregator)
      const blocks = await controller.handleBlockList({
        to: BigNumber.from(11)
      })
      expect(blocks).toEqual([
        { blockNumber: '2', transactions: 1, timestamp: TIME_STAMP },
        { blockNumber: '3', transactions: 1, timestamp: TIME_STAMP },
        { blockNumber: '4', transactions: 1, timestamp: TIME_STAMP },
        { blockNumber: '5', transactions: 1, timestamp: TIME_STAMP },
        { blockNumber: '6', transactions: 1, timestamp: TIME_STAMP },
        { blockNumber: '7', transactions: 1, timestamp: TIME_STAMP },
        { blockNumber: '8', transactions: 1, timestamp: TIME_STAMP },
        { blockNumber: '9', transactions: 1, timestamp: TIME_STAMP },
        { blockNumber: '10', transactions: 1, timestamp: TIME_STAMP },
        { blockNumber: '11', transactions: 1, timestamp: TIME_STAMP }
      ])
    })

    test('returns empty array when specified range is out of the range', async () => {
      const controller = new BlockExplorerController(aggregator)
      const blocks = await controller.handleBlockList({
        from: BigNumber.from(15),
        to: BigNumber.from(20)
      })
      expect(blocks).toEqual([])
    })

    test('throws invalid params', async () => {
      const controller = new BlockExplorerController(aggregator)
      await expect(
        controller.handleBlockList({
          from: BigNumber.from(-15)
        })
      ).rejects.toEqual(new Error('Invalid Parameter'))
    })
  })
})
