import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { FastifyRequest } from 'fastify';
import { AccessKeyRegistry } from './access-key.registry';
import {
  ACCESS_SCOPE_METADATA,
  AccessScope,
  CLIENT_KEY_HEADER,
  CONSUMER_REQUEST_PROPERTY,
  Consumer,
  INTERNAL_KEY_HEADER,
} from './consumer.types';

/**
 * Single access-control point for every route in the Nest pipeline.
 *
 * Closed by default: a route without a scope decorator requires a client key.
 * The previous arrangement was the opposite — a handler that forgot to call the
 * manual auth check was silently public.
 *
 * NOT covered by this guard: the AdminJS panel (mounted straight onto the raw
 * Fastify instance, bypassing Nest entirely) and static files. The panel keeps
 * its own form authentication.
 */
@Injectable()
export class AccessKeyGuard implements CanActivate {
  private readonly logger = new Logger(AccessKeyGuard.name);

  // Explicit @Inject: see the note in AccessKeyRegistry.
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AccessKeyRegistry) private readonly registry: AccessKeyRegistry,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();

    // A CORS preflight carries no custom headers, so it can never present a key.
    // Rejecting it would break the public contour for every browser client
    // while leaving curl-based checks green.
    if (request.method === 'OPTIONS') return true;

    const scope = this.resolveScope(context);
    if (scope === 'public') return true;

    const consumer =
      scope === 'internal' ? this.authenticateInternal(request) : this.authenticateClient(request);

    if (consumer) {
      (request as FastifyRequest & Record<string, unknown>)[CONSUMER_REQUEST_PROPERTY] = consumer;
      return true;
    }

    return this.reject(request, scope);
  }

  private resolveScope(context: ExecutionContext): AccessScope {
    // Handler metadata wins over controller metadata.
    return (
      this.reflector.getAllAndOverride<AccessScope>(ACCESS_SCOPE_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'client'
    );
  }

  private authenticateClient(request: FastifyRequest): Consumer | null {
    const label = this.registry.verifyClientKey(readHeader(request, CLIENT_KEY_HEADER));
    return label ? { label, scope: 'client' } : null;
  }

  private authenticateInternal(request: FastifyRequest): Consumer | null {
    const label = this.registry.verifyInternalKey(readHeader(request, INTERNAL_KEY_HEADER));
    return label ? { label, scope: 'internal' } : null;
  }

  /**
   * Observation mode lets an unkeyed client request through while recording it,
   * so existing consumers can be found and updated before enforcement begins.
   *
   * It never applies to the internal contour: those endpoints have no external
   * consumers needing a coordinated rollout, and they rewrite the catalogue.
   */
  private reject(request: FastifyRequest, scope: AccessScope): boolean {
    const mode = this.configService.get<string>('ACCESS_CONTROL_MODE') ?? 'enforce';

    if (scope === 'client' && mode === 'observe') {
      this.logger.warn(
        `[observe] would reject ${request.method} ${request.url} from ${request.ip} — no valid client key`,
      );
      return true;
    }

    // Same exception for "no header", "wrong key" and "client key on an
    // internal route": the response must not tell them apart.
    throw new UnauthorizedException('Access denied');
  }
}

function readHeader(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}
