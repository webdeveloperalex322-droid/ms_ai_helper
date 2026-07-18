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
 * Rate limiting keyed by consumer rather than by network address.
 *
 * Two consumers sharing an office NAT must not eat each other's quota, and an
 * integrator with its own key must be throttled — and observable — on its own.
 * Requests with no recognised consumer (health, or a request let through in
 * observation mode) fall back to the client address.
 *
 * `req.ips` is only populated when trustProxy is enabled on the adapter; see
 * the note in main.ts for why that matters.
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
    if (consumer?.label) return `consumer:${consumer.label}`;

    const request = req as unknown as FastifyRequest;
    const address = request.ips?.length ? request.ips[0] : request.ip;
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
