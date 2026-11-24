export class ChannelError extends Error {
  location?: string

  /** hint 是给人看的补充说明，不参与失败分类，只随原因码一起显示。 */
  constructor(readonly code: string, readonly retryAfterSeconds?: number, location?: string, readonly hint?: string) {
    super(code)
    this.location = location
  }
}
