/** Do not start cancelled work; observe every promise, including callers that already started one. */
export async function beforeDeadline<T>(work: Promise<T> | (() => Promise<T>), signal: AbortSignal): Promise<T> {
  if (typeof work === 'function') {
    signal.throwIfAborted()
    const start = work
    work = Promise.resolve().then(() => { signal.throwIfAborted(); return start() })
  }
  const pending = work as Promise<T>
  void pending.catch(() => {})
  signal.throwIfAborted()
  let rejectAbort: (() => void) | undefined
  try {
    return await Promise.race([pending, new Promise<T>((_, reject) => {
      rejectAbort = () => reject(signal.reason ?? new Error('image cycle deadline reached'))
      signal.addEventListener('abort', rejectAbort, { once: true })
      if (signal.aborted) rejectAbort()
    })])
  } finally { if (rejectAbort) signal.removeEventListener('abort', rejectAbort) }
}
