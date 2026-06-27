import { describe, it, expect, vi } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from '../filters/http-exception.filter';

function makeMocks() {
  const send = vi.fn();
  const status = vi.fn().mockReturnValue({ send });
  const reply = { status } as any;
  const request = { method: 'GET', url: '/test', id: 'req-1' } as any;
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
});
