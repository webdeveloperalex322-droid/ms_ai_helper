import { describe, it, expect, vi } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from '../filters/http-exception.filter';

function makeMocks(opts: { requestId?: string } = {}) {
  const send = vi.fn();
  const status = vi.fn().mockReturnValue({ send });
  const reply = { status } as any;
  const request = { method: 'GET', url: '/test', id: 'req-1', requestId: opts.requestId } as any;
  const host = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => reply }),
  } as any;
  return { send, status, reply, request, host };
}

describe('AllExceptionsFilter', () => {
  it('formats HttpException with correct status', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, send } = makeMocks();
    const ex = new HttpException('Not found', HttpStatus.NOT_FOUND);
    filter.catch(ex, host);
    expect(status).toHaveBeenCalledWith(404);
    expect(send).toHaveBeenCalled();
    const payload = send.mock.calls[0][0];
    expect(payload.error).toBeDefined();
    expect(payload.error.message).toBe('Not found');
  });

  it('formats generic Error as 500', () => {
    const filter = new AllExceptionsFilter();
    const { host, status } = makeMocks();
    filter.catch(new Error('oops'), host);
    expect(status).toHaveBeenCalledWith(500);
  });

  it('returns VALIDATION_ERROR code for array messages', () => {
    const filter = new AllExceptionsFilter();
    const { host, send } = makeMocks();
    const ex = new HttpException({ message: ['field is required'], error: 'Bad Request' }, 400);
    filter.catch(ex, host);
    const payload = send.mock.calls[0][0];
    expect(payload.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns a contract-compliant body for a throttled request', () => {
    // ThrottlerException carries its response as a plain string, which used to
    // fall through to the generic branch: the client got INTERNAL_ERROR plus
    // the exception's class name. Caught by hitting the real running app.
    const filter = new AllExceptionsFilter();
    const { host, status, send } = makeMocks();

    filter.catch(
      new HttpException('ThrottlerException: Too Many Requests', HttpStatus.TOO_MANY_REQUESTS),
      host,
    );

    expect(status).toHaveBeenCalledWith(429);
    const payload = send.mock.calls[0][0];
    expect(payload.error.code).toBe('TOO_MANY_REQUESTS');
    expect(payload.error.message).toBe('Rate limit exceeded');
    expect(JSON.stringify(payload)).not.toContain('ThrottlerException');
  });
});

describe('AllExceptionsFilter — internal errors do not leak (spec 008, US3)', () => {
  it('replaces exception.message with a generic message for a non-HttpException', () => {
    const filter = new AllExceptionsFilter();
    const { host, send } = makeMocks({ requestId: 'req-123' });

    filter.catch(new Error('connection to postgresql://user:pass@db-host:5432 failed'), host);

    const payload = send.mock.calls[0][0];
    expect(payload.error.message).toBe('Internal server error');
    expect(JSON.stringify(payload)).not.toContain('postgresql://');
    expect(JSON.stringify(payload)).not.toContain('db-host');
  });

  it('includes requestId in the body when the request carries one', () => {
    const filter = new AllExceptionsFilter();
    const { host, send } = makeMocks({ requestId: 'req-123' });

    filter.catch(new Error('oops'), host);

    const payload = send.mock.calls[0][0];
    expect(payload.error.requestId).toBe('req-123');
  });

  it('omits requestId when the request has none (exception raised before the interceptor ran)', () => {
    const filter = new AllExceptionsFilter();
    const { host, send } = makeMocks();

    filter.catch(new Error('oops'), host);

    const payload = send.mock.calls[0][0];
    expect(payload.error.requestId).toBeUndefined();
    expect(payload.error.message).toBe('Internal server error');
  });

  it('logs the requestId, original message and stack for a non-HttpException', () => {
    const filter = new AllExceptionsFilter();
    const { host } = makeMocks({ requestId: 'req-123' });
    const logSpy = vi.spyOn((filter as any).logger, 'error').mockImplementation(() => undefined);

    const err = new Error('db unreachable');
    filter.catch(err, host);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('req-123'), err.stack);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('db unreachable'), err.stack);
  });

  it('still sends a well-formed response if the logger itself throws', () => {
    const filter = new AllExceptionsFilter();
    const { host, status, send } = makeMocks({ requestId: 'req-123' });
    vi.spyOn((filter as any).logger, 'error').mockImplementation(() => {
      throw new Error('logging backend unavailable');
    });

    expect(() => filter.catch(new Error('oops'), host)).not.toThrow();

    expect(status).toHaveBeenCalledWith(500);
    const payload = send.mock.calls[0][0];
    expect(payload.error.message).toBe('Internal server error');
    expect(payload.error.requestId).toBe('req-123');
  });

  it('includes requestId on an HttpException response without altering its message', () => {
    const filter = new AllExceptionsFilter();
    const { host, send } = makeMocks({ requestId: 'req-456' });

    filter.catch(new HttpException('Not found', HttpStatus.NOT_FOUND), host);

    const payload = send.mock.calls[0][0];
    expect(payload.error.message).toBe('Not found');
    expect(payload.error.requestId).toBe('req-456');
  });

  it('keeps validation error details unchanged and adds requestId', () => {
    const filter = new AllExceptionsFilter();
    const { host, send } = makeMocks({ requestId: 'req-789' });

    filter.catch(
      new HttpException({ message: ['field is required'], error: 'Bad Request' }, 400),
      host,
    );

    const payload = send.mock.calls[0][0];
    expect(payload.error.code).toBe('VALIDATION_ERROR');
    expect(payload.error.details).toEqual([{ message: 'field is required' }]);
    expect(payload.error.requestId).toBe('req-789');
  });
});
