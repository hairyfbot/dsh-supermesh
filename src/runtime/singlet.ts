type KeyGenerator<T extends (...args: any[]) => any> = string | ((...args: Parameters<T>) => string)

interface Pending {
  promise: Promise<unknown>
  startedAt: number
  key: string
}

const pending = new Map<string, Pending>()

/** 超过这个时长还占着 key 的，视为卡死：不再复用它的 Promise，改为重新执行。 */
export const STALE_MS = 120_000

function resolveKey<T extends (...args: any[]) => any>(keyOrGen: KeyGenerator<T>, args: Parameters<T>): string {
  return typeof keyOrGen === 'function' ? keyOrGen(...args) : keyOrGen
}

/**
 * 【单飞原语】同一 key 正在执行时复用同一个 Promise，不排队、不阻塞调用方。
 *
 * 超过 `STALE_MS` 仍未结束的记录判定为卡死并让位：新调用重新执行，
 * 而不是继续等一个可能永不 settle 的 Promise。原任务之后才结束时，
 * 它的 settle 不会误删新记录（按记录身份比对）。
 *
 * @param keyOrGen 静态 key 或按入参生成 key 的函数
 * @param fn 需要单飞保护的异步函数
 *
 * @example
 * export const worker = defineService({
 *   reconcile: singlet('worker:slots', async () => {
 *     await db.worker.listRunning()
 *   }),
 *   process: singlet(id => `worker:process:${id}`, async (id: string) => {
 *     await runFor(id)
 *   }),
 * })
 */
export function singlet<T extends (...args: any[]) => Promise<any>>(
  keyOrGen: KeyGenerator<T>,
  fn: T,
): (...args: Parameters<T>) => ReturnType<T> {
  return ((...args: Parameters<T>): ReturnType<T> => {
    const key = resolveKey(keyOrGen, args)
    const current = pending.get(key)
    if (current && Date.now() - current.startedAt < STALE_MS)
      return current.promise as ReturnType<T>
    const task = Promise.resolve().then(() => fn(...args)) as ReturnType<T>
    const record: Pending = { promise: task, startedAt: Date.now(), key }
    pending.set(key, record)
    const settle = (): void => {
      if (pending.get(key) === record)
        pending.delete(key)
    }
    task.then(settle, settle)
    return task
  }) as (...args: Parameters<T>) => ReturnType<T>
}

singlet.busy = function busy(key?: string): boolean {
  return key === undefined ? pending.size > 0 : pending.has(key)
}

singlet.keys = function keys(): string[] {
  return [...pending.keys()]
}

/** 卡住超过 `STALE_MS` 的 key 与已运行时长，用于排查采集或投递停摆。 */
singlet.stale = function stale(): { key: string, runningMs: number }[] {
  const now = Date.now()
  return [...pending.values()]
    .map(record => ({ key: record.key, runningMs: now - record.startedAt }))
    .filter(record => record.runningMs >= STALE_MS)
}

singlet.drain = async function drain(): Promise<void> {
  while (pending.size)
    await Promise.allSettled([...pending.values()].map(record => record.promise))
}
