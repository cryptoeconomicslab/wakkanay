import { Bytes, Integer } from '@cryptoeconomicslab/primitives'
import { Decider } from '../../interfaces/Decider'
import { Decision, Property, LogicalConnective } from '../../types'
import { DeciderManagerInterface } from '../../DeciderManager'
import { encodeProperty, decodeProperty } from '../../helpers'
import { TraceInfo, TraceInfoCreator } from '../../Tracer'

/**
 * OrDecider recieves multiple inputs and returns logical or of those decision.
 * If decision outcome is true, it returns encoded index of the child as witness.
 *   This witness is appended to the witnesses generated by the child property.
 * If decision outcome is false, it returns the valid challenge as challenges.
 *   The valid challenge of Or(p0, p1, ...) is And(Not(p0) Not(p1), ...).
 *   When p0 is not(c0), OrDecider replaces not(not(c0)) to c0.
 */
export class OrDecider implements Decider {
  public async decide(
    manager: DeciderManagerInterface,
    inputs: Bytes[]
  ): Promise<Decision> {
    let properties: Array<Property>
    try {
      properties = inputs.map(i => decodeProperty(ovmContext.coder, i))
    } catch (e) {
      return {
        outcome: false,
        witnesses: [],
        challenge: null,
        traceInfo: TraceInfoCreator.exception(
          'Or connective has an invalid child.'
        )
      }
    }

    const decisions = await Promise.all(
      properties.map(async p => {
        return await manager.decide(p)
      })
    )

    const index = decisions.findIndex(d => d.outcome)
    if (index >= 0) {
      const childWitnesses = decisions[index].witnesses || []
      return {
        outcome: true,
        witnesses: childWitnesses.concat([
          ovmContext.coder.encode(Integer.from(index))
        ]),
        challenge: null
      }
    }

    const challenge = {
      property: new Property(
        manager.getDeciderAddress(LogicalConnective.And),
        properties.map(p => {
          const decompiledProperty = manager.decompile(p) || p
          if (
            decompiledProperty &&
            decompiledProperty.deciderAddress.equals(
              manager.getDeciderAddress('Not')
            )
          ) {
            // When decompiledProperty is Not predicate, OrDecider replaces not(not(p)) to p.
            return decompiledProperty.inputs[0]
          } else {
            return encodeProperty(
              ovmContext.coder,
              new Property(manager.getDeciderAddress(LogicalConnective.Not), [
                encodeProperty(ovmContext.coder, p)
              ])
            )
          }
        })
      ),
      challengeInputs: [null]
    }

    return {
      outcome: false,
      witnesses: [],
      challenge,
      traceInfo: TraceInfoCreator.createOr(
        decisions.map(d => d.traceInfo).filter(t => !!t) as TraceInfo[]
      )
    }
  }
}
