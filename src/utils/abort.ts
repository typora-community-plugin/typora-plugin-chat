/** An `AbortError`-shaped error, matching the DOM convention. */
export function abortError(): Error {
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

/** Throw when `signal` has already been aborted. */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError()
}

/** Resolve with `promise`, or reject as soon as `signal` aborts. */
export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError())
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError())
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      value => { signal.removeEventListener('abort', onAbort); resolve(value) },
      error => { signal.removeEventListener('abort', onAbort); reject(error) },
    )
  })
}
