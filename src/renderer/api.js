// Thin wrapper over the preload bridge: unwraps { ok, data } envelopes into promises that
// resolve with `data` or reject with an Error carrying `.code` (and `.permission`).
const bridge = window.cast

async function unwrap(result) {
  if (result?.ok) return result.data
  const err = new Error(result?.error?.message ?? 'Something went wrong')
  err.code = result?.error?.code ?? 'ERROR'
  err.permission = result?.error?.permission
  throw err
}

const wrap = (ns) =>
  Object.fromEntries(
    Object.entries(ns).map(([name, fn]) => [
      name,
      (...args) => {
        const out = fn(...args)
        return out && typeof out.then === 'function' ? out.then(unwrap) : out
      }
    ])
  )

export const api = Object.fromEntries(Object.entries(bridge).map(([k, ns]) => [k, wrap(ns)]))
