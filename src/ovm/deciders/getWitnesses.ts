import { Bytes, Integer } from '../../types/Codables'
import { KeyValueStore, RangeDb } from '../../db'
import { decodeStructable } from '../../utils/DecoderUtil'
import { Range } from '../../types'
import Coder from '../../coder'
import { makeRange } from '../../utils/ArrayUtils'

/**
 * get witnesses from witness db using hint.
 * witness can be quantified by bucket name and single key or range.
 * bucket must be specified by bucket name. when bucket must be chained,
 * connect bucket name with dot s.t. bucket1.bucket2.bucket3
 * when using key, hint must be in following format
 * 'bucket,KEY,key'
 * when using range, hint must be in following format
 * 'bucket,RANGE,(start,end)'
 * when quantify by iterator, hint must be in following format
 * 'bucket,KEY.ITER,lower_bound'
 * 'bucket,RANGE.ITER,(start end)'
 * @param witnessDb key value store
 * @param hint hint string
 */
export default async function getWitnesses(
  witnessDb: KeyValueStore,
  hint: string
): Promise<Bytes[]> {
  const [bucket, type, param] = hint.split(',')
  const bucketNames = bucket.split('.')
  let db
  if (type === 'KEY') {
    db = witnessDb
    for (const b of bucketNames) {
      db = await db.bucket(Bytes.fromString(b))
    }
    const result = await db.get(Bytes.fromHexString(param))
    return result === null ? [] : [result]
  } else if (type === 'RANGE') {
    db = new RangeDb(witnessDb)
    for await (const b of bucketNames) {
      db = await db.bucket(Bytes.fromString(b))
    }
    const range = decodeStructable(Range, Coder, Bytes.fromHexString(param))
    const result = await db.get(range.start.data, range.end.data)
    return result.map(r => r.value)
  } else if (type === 'ITER') {
    db = witnessDb
    for (const b of bucketNames) {
      db = await db.bucket(Bytes.fromString(b))
    }
    const iter = db.iter(Bytes.fromHexString(param))
    const result = []
    let next = await iter.next()
    while (next) {
      result.push(next.value)
      next = await iter.next()
    }
    return result
  } else if (type === 'NUMBER') {
    let start = 0,
      end = 0
    if (bucket == 'lessthan') {
      end = Number.parseInt(param)
    } else if (bucket == 'range') {
      ;[start, end] = param.split('-').map(n => Number.parseInt(n))
    } else {
      throw new Error(`${bucket} is unknown bucket of NUMBER type.`)
    }
    return makeRange(start, end - 1)
      .map(Integer.from)
      .map(Coder.encode)
  } else {
    throw new Error(`${type} is unknown type of hint.`)
  }
}

// check if b is hint string
export function isHint(b: Bytes): boolean {
  return b.intoString().split(',').length === 3
}

/**
 *
 * @param hint is template string like "aaa,${b},ccc"
 * @param substitutions is object which has variables to replace template string, e.g. {b: "bar"}
 */
export function replaceHint(
  hint: string,
  substitutions: { [key: string]: Bytes }
): string {
  const fillTemplate = function(
    templateString: string,
    templateVars: string[]
  ) {
    return new Function(
      ...Object.keys(substitutions).concat(['return `' + templateString + '`'])
    ).call(null, ...templateVars)
  }
  return fillTemplate(
    hint,
    Object.keys(substitutions).map(k => substitutions[k].toHexString())
  )
}
