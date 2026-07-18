/**
 * Consumer attribution in the request log (spec 007, FR-009b / SC-007a).
 *
 * Traffic must be attributable to a consumer without anyone having to look up
 * a key value — and the key value itself must never appear in a log line.
 */
import { describe, it, expect, vi } from 'vitest';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { LoggingInterceptor } from '../logging.interceptor';
import { CONSUMER_REQUEST_PROPERTY } from '../../security/consumer.types';

function buildContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ statusCode: 200 }),
    }),
  } as unknown as ExecutionContext;
}

const nextHandler: CallHandler = { handle: () => of({ ok: true }) };

async function runInterceptor(request: Record<string, unknown>) {
  const interceptor = new LoggingInterceptor();
  const log = vi.spyOn(interceptor['logger'], 'log').mockImplementation(() => undefined);

  await new Promise<void>((resolve, reject) => {
    interceptor
      .intercept(buildContext(request), nextHandler)
      .subscribe({ complete: resolve, error: reject });
  });

  return log.mock.calls.flat().join(' ');
}

describe('LoggingInterceptor consumer attribution', () => {
  it('records the owner label of the recognised consumer', async () => {
    const line = await runInterceptor({
      method: 'POST',
      url: '/v1/assistant/product-answer',
      [CONSUMER_REQUEST_PROPERTY]: { label: 'partner-acme', scope: 'client' },
    });

    expect(line).toContain('partner-acme');
  });

  it('distinguishes two consumers in the log', async () => {
    const first = await runInterceptor({
      method: 'POST',
      url: '/v1/assistant/product-answer',
      [CONSUMER_REQUEST_PROPERTY]: { label: 'web-widget', scope: 'client' },
    });
    const second = await runInterceptor({
      method: 'POST',
      url: '/v1/assistant/product-answer',
      [CONSUMER_REQUEST_PROPERTY]: { label: 'partner-acme', scope: 'client' },
    });

    expect(first).toContain('web-widget');
    expect(second).toContain('partner-acme');
    expect(first).not.toContain('partner-acme');
  });

  it('logs cleanly when no consumer was recognised', async () => {
    const line = await runInterceptor({ method: 'GET', url: '/v1/health' });

    expect(line).toContain('/v1/health');
  });

  it('never writes a key value into the log line', async () => {
    const line = await runInterceptor({
      method: 'POST',
      url: '/v1/assistant/product-answer',
      headers: { 'x-api-key': 'super-secret-key-value' },
      [CONSUMER_REQUEST_PROPERTY]: { label: 'web-widget', scope: 'client' },
    });

    expect(line).not.toContain('super-secret-key-value');
  });
});
