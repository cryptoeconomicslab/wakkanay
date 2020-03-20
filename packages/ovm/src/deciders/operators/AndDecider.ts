import { Bytes, Integer, List } from '@cryptoeconomicslab/primitives'
import { Decider } from '../../interfaces/Decider'
import { Decision, Property, Challenge, LogicalConnective } from '../../types'
import { DeciderManagerInterface } from '../../DeciderManager'
import { decodeProperty } from '../../helpers'
import { TraceInfoCreator } from '../../Tracer'

/**
 * AndDecider recieves multiple inputs and returns logical and of those decision.
 * If decision outcome is true, AndDecider returns encoded witnesses of each child properties.
 * If decision outcome is false, valid challenge is a negation of a inner property and index of the inner property is `challengeInput`.
 * The valid challenge of And(p0, p1, ...) is Not(p_index) and `challengeInput` is index of false property.
 *    However, if p_index is not atomic proposition, AndDecider should return valid challenge of "p_index".
 */
export class AndDecider implements Decider {
  public async decide(
    manager: DeciderManagerInterface,
    inputs: Bytes[]
  ): Promise<Decision> {
    let properties: Property[]
    try {
      properties = inputs.map(i => decodeProperty(ovmContext.coder, i))
    } catch (e) {
      return {
        outcome: false,
        witnesses: [],
        challenges: [],
        traceInfo: TraceInfoCreator.exception(
          'And connective has an invalid child.'
        )
      }
    }

    const decisions = await Promise.all(
      properties.map(async (p: Property, index: number) => {
        const decision = await manager.decide(p)
        if (decision.outcome) {
          return decision
        }
        const challenge: Challenge = {
          property: new Property(
            manager.getDeciderAddress(LogicalConnective.Not),
            [ovmContext.coder.encode(p.toStruct())]
          ),
          challengeInput: ovmContext.coder.encode(Integer.from(index))
        }
        return {
          outcome: false,
          witnesses: [],
          challenges: [challenge].concat(decision.challenges),
          traceInfo: decision.traceInfo
            ? TraceInfoCreator.createAnd(index, decision.traceInfo)
            : undefined
        }
      })
    )
    const falseDecisions = decisions.filter(d => d.outcome === false)
    if (falseDecisions[0]) {
      return falseDecisions[0]
    }
    // every decisions must be true
    const witnesses = decisions.map(d =>
      ovmContext.coder.encode(List.from(Bytes, d.witnesses || []))
    )
    return {
      outcome: true,
      witnesses,
      challenges: []
    }
  }
}
