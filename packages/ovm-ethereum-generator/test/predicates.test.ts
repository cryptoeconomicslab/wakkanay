import * as MockAdjudicationContract from '../build/contracts/MockAdjudicationContract.json'
import * as MockAtomicPredicate from '../build/contracts/MockAtomicPredicate.json'
import * as MockCompiledPredicate from '../build/contracts/MockCompiledPredicate.json'
import * as Utils from '../build/contracts/Utils.json'
import * as ethers from 'ethers'
import { TestCaseSet, setUpCompiledPredicateTest } from '../src/helper'
import { createTestCaseOfAndLogicalConnective } from './AndTestPredicateTestCase'
import { createTestCaseOfForAllSuchThatQuantifier } from './ForTestPredicateTestCase'
import { createTestCaseOfDynamicLink } from './DynamicLinkTestCase'
import { createTestCaseOfNotNotP } from './NotNotTestCase'

const createTestCases: (wallet: ethers.Wallet) => TestCaseSet[] = (
  wallet: ethers.Wallet
) => [
  createTestCaseOfAndLogicalConnective(wallet),
  createTestCaseOfForAllSuchThatQuantifier(wallet),
  createTestCaseOfDynamicLink(wallet),
  createTestCaseOfNotNotP(wallet)
]

setUpCompiledPredicateTest(
  'predicates',
  createTestCases,
  MockAtomicPredicate,
  MockCompiledPredicate,
  Utils,
  MockAdjudicationContract
)
