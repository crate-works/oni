export type OniErrorKind =
  | 'not-found'
  | 'forbidden'
  | 'unauthorized'
  | 'metadata-denied'
  | 'transport'
  | 'aborted'
  | 'http'
  | 'invalid-response'
  | 'configuration';

/** The only error type thrown by client operations. No redirects or UI work. */
export class OniClientError extends Error {
  readonly kind: OniErrorKind;
  readonly status?: number;
  readonly code?: string;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(
    message: string,
    options: {
      kind: OniErrorKind;
      status?: number;
      code?: string;
      details?: unknown;
      requestId?: string;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = 'OniClientError';
    this.kind = options.kind;
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    this.requestId = options.requestId;
  }
}

export const isAbort = (error: unknown, signal?: AbortSignal): boolean =>
  Boolean(
    signal?.aborted || (error !== null && typeof error === 'object' && 'name' in error && error.name === 'AbortError'),
  );

export const aborted = (cause?: unknown) => new OniClientError('Request aborted', { kind: 'aborted', cause });

// Auth callbacks and shared renewal may not support cancellation themselves.
// Cancel the waiting request without cancelling renewal for the other callers.
export function withSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise;
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(aborted(signal.reason));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
    }
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}
