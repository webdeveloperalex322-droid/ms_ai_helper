import { describe, it, expect, vi } from 'vitest';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AccessKeyGuard } from '../access-key.guard';
import { AccessKeyRegistry } from '../access-key.registry';
import { AccessScope, CONSUMER_REQUEST_PROPERTY } from '../consumer.types';

const CLIENT_KEY = 'client-key';
const INTERNAL_KEY = 'internal-key';

function buildRegistry() {
  const configService = {
    get: (key: string) => {
      if (key === 'clientApiKeys') return [{ label: 'web-widget', key: CLIENT_KEY }];
      if (key === 'INTERNAL_API_KEY') return INTERNAL_KEY;
      return undefined;
    },
  } as unknown as ConfigService;

  return new AccessKeyRegistry(configService);
}

function buildContext(
  headers: Record<string, string> = {},
  method = 'POST',
): { context: ExecutionContext; request: Record<string, unknown> } {
  const request = { headers, method, url: '/v1/assistant/product-answer', ip: '10.0.0.1' };

  const context = {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;

  return { context, request: request as unknown as Record<string, unknown> };
}

function buildGuard(scope: AccessScope | undefined, mode: 'enforce' | 'observe' = 'enforce') {
  const reflector = { getAllAndOverride: () => scope } as unknown as Reflector;
  const configService = {
    get: (key: string) => (key === 'ACCESS_CONTROL_MODE' ? mode : undefined),
  } as unknown as ConfigService;

  return new AccessKeyGuard(reflector, buildRegistry(), configService);
}

describe('AccessKeyGuard', () => {
  describe('client contour (default scope)', () => {
    it('allows a request carrying a valid client key', () => {
      const guard = buildGuard(undefined);
      const { context, request } = buildContext({ 'x-api-key': CLIENT_KEY });

      expect(guard.canActivate(context)).toBe(true);
      expect(request[CONSUMER_REQUEST_PROPERTY]).toEqual({ label: 'web-widget', scope: 'client' });
    });

    it('rejects a request with no key at all', () => {
      const guard = buildGuard(undefined);
      const { context } = buildContext();

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('rejects a request with a wrong key', () => {
      const guard = buildGuard(undefined);
      const { context } = buildContext({ 'x-api-key': 'nope' });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('closes a route that carries no decorator at all', () => {
      // The inversion that matters: forgetting a decorator must not open a route.
      const guard = buildGuard(undefined);
      const { context } = buildContext();

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });
  });

  describe('internal contour', () => {
    it('allows a request carrying the internal key', () => {
      const guard = buildGuard('internal');
      const { context, request } = buildContext({ 'x-internal-api-key': INTERNAL_KEY });

      expect(guard.canActivate(context)).toBe(true);
      expect(request[CONSUMER_REQUEST_PROPERTY]).toEqual({ label: 'internal', scope: 'internal' });
    });

    it('rejects a client key presented on an internal route', () => {
      const guard = buildGuard('internal');
      const { context } = buildContext({ 'x-api-key': CLIENT_KEY });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('rejects the client key even when sent under the internal header', () => {
      const guard = buildGuard('internal');
      const { context } = buildContext({ 'x-internal-api-key': CLIENT_KEY });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });
  });

  describe('public routes', () => {
    it('allows a request with no key', () => {
      const guard = buildGuard('public');
      const { context } = buildContext({}, 'GET');

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('CORS preflight', () => {
    it('lets an OPTIONS request through without a key', () => {
      // A browser sends no custom headers on a preflight; requiring a key here
      // would break every browser client while curl checks stayed green.
      const guard = buildGuard(undefined);
      const { context } = buildContext({}, 'OPTIONS');

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('indistinguishable rejections (FR-006)', () => {
    it('throws the same message for a missing key, a wrong key and a cross-contour key', () => {
      const collect = (scope: AccessScope | undefined, headers: Record<string, string>) => {
        const guard = buildGuard(scope);
        const { context } = buildContext(headers);
        try {
          guard.canActivate(context);
          return null;
        } catch (error) {
          return (error as UnauthorizedException).getResponse();
        }
      };

      const missing = collect(undefined, {});
      const wrong = collect(undefined, { 'x-api-key': 'nope' });
      const crossContour = collect('internal', { 'x-api-key': CLIENT_KEY });

      expect(missing).not.toBeNull();
      expect(wrong).toEqual(missing);
      expect(crossContour).toEqual(missing);
    });
  });

  describe('observation mode', () => {
    it('lets an unkeyed client request through and records it', () => {
      const guard = buildGuard(undefined, 'observe');
      const warn = vi.spyOn(guard['logger'], 'warn').mockImplementation(() => undefined);
      const { context } = buildContext();

      expect(guard.canActivate(context)).toBe(true);
      expect(warn).toHaveBeenCalledOnce();
    });

    it('never logs the presented key value', () => {
      // FR-010: key values must not reach logs under any circumstances.
      const guard = buildGuard(undefined, 'observe');
      const warn = vi.spyOn(guard['logger'], 'warn').mockImplementation(() => undefined);
      const { context } = buildContext({ 'x-api-key': 'leaked-secret-value' });

      guard.canActivate(context);

      const logged = warn.mock.calls.flat().join(' ');
      expect(logged).not.toContain('leaked-secret-value');
    });

    it('still rejects the internal contour', () => {
      // FR-010d: observation mode never weakens write endpoints.
      const guard = buildGuard('internal', 'observe');
      const { context } = buildContext();

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('still attaches the consumer when a valid key is present', () => {
      const guard = buildGuard(undefined, 'observe');
      const { context, request } = buildContext({ 'x-api-key': CLIENT_KEY });

      expect(guard.canActivate(context)).toBe(true);
      expect(request[CONSUMER_REQUEST_PROPERTY]).toEqual({ label: 'web-widget', scope: 'client' });
    });
  });
});
