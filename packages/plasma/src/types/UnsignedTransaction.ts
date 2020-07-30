import {
  Address,
  Range,
  BigNumber,
  Bytes,
  Struct,
  Property
} from '@cryptoeconomicslab/primitives'
import { Wallet } from '@cryptoeconomicslab/wallet'
import { Keccak256 } from '@cryptoeconomicslab/hash'
import { Transaction, SignedTransaction } from './'

export default class UnsignedTransaction implements Transaction {
  constructor(
    readonly depositContractAddress: Address,
    readonly range: Range,
    readonly maxBlockNumber: BigNumber,
    readonly stateObject: Property,
    readonly from: Address
  ) {}

  /**
   * return empty instance of StateUpdate
   */
  public static default(): UnsignedTransaction {
    return new UnsignedTransaction(
      Address.default(),
      new Range(BigNumber.default(), BigNumber.default()),
      BigNumber.default(),
      new Property(Address.default(), []),
      Address.default()
    )
  }

  public static getParamType(): Struct {
    return new Struct([
      { key: 'depositContractAddress', value: Address.default() },
      { key: 'range', value: Range.getParamType() },
      { key: 'maxBlockNumber', value: BigNumber.default() },
      { key: 'stateObject', value: Property.getParamType() },
      { key: 'from', value: Address.default() }
    ])
  }

  public static fromStruct(struct: Struct): UnsignedTransaction {
    const depositContractAddress = struct.data[0].value as Address
    const range = struct.data[1].value as Struct
    const maxBlockNumber = struct.data[2].value as BigNumber
    const stateObject = struct.data[3].value as Struct
    const from = struct.data[4].value as Address

    return new UnsignedTransaction(
      depositContractAddress as Address,
      Range.fromStruct(range as Struct),
      maxBlockNumber,
      Property.fromStruct(stateObject as Struct),
      from as Address
    )
  }

  public toStruct(): Struct {
    return new Struct([
      { key: 'depositContractAddress', value: this.depositContractAddress },
      { key: 'range', value: this.range.toStruct() },
      { key: 'maxBlockNumber', value: this.maxBlockNumber },
      { key: 'stateObject', value: this.stateObject.toStruct() },
      { key: 'from', value: this.from }
    ])
  }

  public async sign(signer: Wallet): Promise<SignedTransaction> {
    const signature = await signer.signMessage(
      ovmContext.coder.encode(this.toStruct())
    )

    return new SignedTransaction(
      this.depositContractAddress,
      this.range,
      this.maxBlockNumber,
      this.stateObject,
      this.from,
      signature
    )
  }

  public getHash(): Bytes {
    return Keccak256.hash(ovmContext.coder.encode(this.toStruct()))
  }

  public toString(): string {
    return `UnsignedTransaction(depositContractAddress: ${
      this.depositContractAddress.raw
    }, maxBlockNumber: ${
      this.maxBlockNumber.raw
    }, range: ${this.range.toString()}, so: ${
      this.stateObject.deciderAddress.data
    }, from: ${this.from.raw})`
  }

  public get message(): Bytes {
    return ovmContext.coder.encode(this.toStruct())
  }
}
