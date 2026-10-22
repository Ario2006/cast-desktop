export class ProviderError extends Error {
  /** @param {'unauthorized'|'rate_limited'|'offline'|'timeout'|'bad_response'|'http'} code */
  constructor(code, message, { retryAfterMs, status } = {}) {
    super(message)
    this.name = 'ProviderError'
    this.code = code
    this.retryAfterMs = retryAfterMs
    this.status = status
  }
}
