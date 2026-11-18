type KeyGenerator<T extends (...args: any[]) => any> = string | ((...args: Parameters<T>) => string)

interface Pending {
  promise: Promise<unknown>
  startedAt: number
}

const pending = new Map<string, Pending>()

function resolveKey<T extends (...args: any[]) => any>(keyOrGen: KeyGenerator<T>, args: Parameters<T>): string {
  return typeof keyOrGen === 'function' ? keyOrGen(...args) : keyOrGen
}

/**
 * 【单飞原语】同一 key 正在执行时复用同一个 Promise，不排队、不阻塞调用方。
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
    if (current)
      return current.promise as ReturnType<T>
    const task = Promise.resolve().then(() => fn(...args)) as ReturnType<T>
    const record: Pending = { promise: task, startedAt: Date.now() }
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

singlet.drain = async function drain(): Promise<void> {
  while (pending.size)
    await Promise.allSettled([...pending.values()].map(record => record.promise))
}
