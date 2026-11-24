export class ChannelError extends Error {
  location?: string

  constructor(readonly code: string, readonly retryAfterSeconds?: number, location?: string) {
    super(code)
    this.location = location
  }
}
