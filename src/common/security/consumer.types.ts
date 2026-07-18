/**
 * Access contour of a route.
 *
 * `client` is the default: a route with no scope decorator requires a client key.
 * The inversion is deliberate — a forgotten decorator leaves a route closed, not open.
 */
export type AccessScope = 'client' | 'internal' | 'public';

export const ACCESS_SCOPE_METADATA = 'accessScope';

export const CLIENT_KEY_HEADER = 'x-api-key';
/** Kept as-is: already used by the suggestion admin endpoints. */
export const INTERNAL_KEY_HEADER = 'x-internal-api-key';

/** Label used for requests authenticated with the internal key. */
export const INTERNAL_CONSUMER_LABEL = 'internal';

/**
 * The consumer recognised for the current request. Request-scoped only —
 * never persisted. Read by the logging interceptor and the rate-limit tracker.
 */
export interface Consumer {
  label: string;
  scope: AccessScope;
}

/** Property under which the guard attaches the consumer to the request object. */
export const CONSUMER_REQUEST_PROPERTY = 'consumer';

export interface RequestWithConsumer {
  [CONSUMER_REQUEST_PROPERTY]?: Consumer;
}
