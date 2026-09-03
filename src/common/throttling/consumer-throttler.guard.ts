import { ExecutionContext, Inject, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ThrottlerException,
  ThrottlerGuard,
  ThrottlerLimitDetail,
  ThrottlerModuleOptions,
  ThrottlerStorage,
  getOptionsToken,
  getStorageToken,
} from '@nestjs/throttler';
import { FastifyRequest } from 'fastify';
import { CONSUMER_REQUEST_PROPERTY, Consumer } from '@/common/security/consumer.types';

/**
 * Rate limiting keyed by consumer, and — in the client contour — by address too.
 *
 * Three cases, each for a different reason:
 *
 * 1. `internal` scope keys by label alone. One key, one operator, possibly a
 *    changing address (CI runner, cron host): the quota belongs to the key.
 *
 * 2. `client` scope keys by label *and* address. The client key ships inside a
 *    browser widget, so it is public by construction and every visitor of the
 *    site presents the same label. Label alone put the entire site on one
 *    counter — one visitor could spend the shared LLM budget and hand everyone
 *    else a 429. The label stays in the key, so the original guarantee holds:
 *    two integrators behind one office NAT still cannot eat each other's quota.
 *
 * 3. No recognised consumer (health, or a request let through in observation
 *    mode) keys by address.
 *
 * The address is always `req.ip`, never `req.ips[0]`. `ips[0]` is the leftmost
 * X-Forwarded-For entry, which the client writes: keying on it let an attacker
 * mint a fresh counter per request. `req.ip` is resolved by Fastify against the
 * trusted hop count — see the trustProxy note in main.ts.
 */
@Injectable()
export class ConsumerThrottlerGuard extends ThrottlerGuard {
  private readonly throttleLogger = new Logger(ConsumerThrottlerGuard.name);

  // A subclass that declares no constructor emits no design:paramtypes, leaving
  // Nest nothing to inject. Declaring it explicitly keeps the base class fed.
  constructor(
    @Inject(getOptionsToken()) options: ThrottlerModuleOptions,
    @Inject(getStorageToken()) storageService: ThrottlerStorage,
    @Inject(Reflector) reflector: Reflector,
  ) {
    super(options, storageService, reflector);
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const consumer = req[CONSUMER_REQUEST_PROPERTY] as Consumer | undefined;
    const address = (req as unknown as FastifyRequest).ip;

    if (consumer?.scope === 'internal') return `consumer:${consumer.label}`;
    if (consumer?.label) return `consumer:${consumer.label}|ip:${address}`;

    return `ip:${address}`;
  }

  /**
   * Logged so the thresholds can later be tuned against evidence rather than
   * guesswork (FR-013a) — the spec deliberately leaves the numbers open.
   */
  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();

    // With named throttlers the library emits `Retry-After-<name>` (e.g.
    // `Retry-After-costly`), which no HTTP client honours. Set the canonical
    // header too so a well-behaved caller can actually back off.
    http
      .getResponse<{ header(name: string, value: unknown): void }>()
      .header('Retry-After', throttlerLimitDetail.timeToBlockExpire);

    this.throttleLogger.warn(
      `Rate limit hit: ${request.method} ${request.url} by ${throttlerLimitDetail.key} ` +
        `(limit ${throttlerLimitDetail.limit} per ${throttlerLimitDetail.ttl}ms)`,
    );

    throw new ThrottlerException();
  }
}
