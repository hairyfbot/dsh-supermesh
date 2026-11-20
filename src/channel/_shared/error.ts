export class ChannelError extends Error {
  constructor(readonly code: string, readonly retryAfterSeconds?: number) {
    super(code)
  }
}
