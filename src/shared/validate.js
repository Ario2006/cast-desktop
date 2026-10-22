// Tiny hand-written validators. Each validator is (value, path) => normalizedValue and throws
// ValidationError on bad input. Used for IPC payloads, action params and AI output.

export class ValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ValidationError'
    this.code = 'INVALID'
  }
}

const fail = (path, msg) => {
  throw new ValidationError(`${path}: ${msg}`)
}

export const str =
  (max = 1000, min = 0) =>
  (x, p = 'value') => {
    if (typeof x !== 'string') fail(p, 'expected string')
    if (x.length > max) fail(p, `too long (max ${max})`)
    if (x.length < min) fail(p, `too short (min ${min})`)
    return x
  }

export const num =
  (min = -Infinity, max = Infinity) =>
  (x, p = 'value') => {
    if (typeof x !== 'number' || !Number.isFinite(x)) fail(p, 'expected number')
    if (x < min || x > max) fail(p, `out of range (${min}..${max})`)
    return x
  }

export const int =
  (min = -Infinity, max = Infinity) =>
  (x, p = 'value') => {
    if (!Number.isInteger(x)) fail(p, 'expected integer')
    return num(min, max)(x, p)
  }

export const bool = (x, p = 'value') => {
  if (typeof x !== 'boolean') fail(p, 'expected boolean')
  return x
}

export const oneOf =
  (...values) =>
  (x, p = 'value') => {
    if (!values.includes(x)) fail(p, `expected one of ${values.join(', ')}`)
    return x
  }

/** ISO-8601 date string (must be parseable). Returned unchanged. */
export const isoDate = (x, p = 'value') => {
  if (typeof x !== 'string' || x.length > 40 || Number.isNaN(Date.parse(x))) {
    fail(p, 'expected ISO date string')
  }
  return x
}

export const arr =
  (item, max = 50) =>
  (x, p = 'value') => {
    if (!Array.isArray(x)) fail(p, 'expected array')
    if (x.length > max) fail(p, `too many items (max ${max})`)
    return x.map((v, i) => item(v, `${p}[${i}]`))
  }

export const opt = (fn) => (x, p) => (x === undefined || x === null ? undefined : fn(x, p))

/** Object validator. Unknown keys are dropped (or rejected with `strict`). */
export const obj =
  (shape, { strict = false } = {}) =>
  (x, p = 'value') => {
    if (x === null || typeof x !== 'object' || Array.isArray(x)) fail(p, 'expected object')
    const out = {}
    for (const [key, fn] of Object.entries(shape)) {
      const v = fn(x[key], `${p}.${key}`)
      if (v !== undefined) out[key] = v
    }
    if (strict) {
      for (const key of Object.keys(x)) if (!(key in shape)) fail(p, `unknown key "${key}"`)
    }
    return out
  }

/** Accepts anything, used for opaque pass-through values with their own size limit. */
export const any =
  (maxJson = 10000) =>
  (x, p = 'value') => {
    if (JSON.stringify(x ?? null).length > maxJson) fail(p, 'value too large')
    return x
  }

export const validate = (fn, x) => fn(x, 'value')

export const safe = (fn, x) => {
  try {
    return { ok: true, value: fn(x, 'value') }
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, error: e.message }
    throw e
  }
}
