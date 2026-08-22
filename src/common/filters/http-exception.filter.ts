import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();
    const requestId = (request as FastifyRequest & { requestId?: string }).requestId;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    let details: any[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();

      if (typeof response === 'object' && response !== null) {
        const res = response as any;
        if (res.message && Array.isArray(res.message)) {
          code = 'VALIDATION_ERROR';
          message = 'Validation failed';
          details = res.message.map((msg: string) => ({ message: msg }));
        } else {
          code = res.error ?? 'HTTP_ERROR';
          message = Array.isArray(res.message) ? res.message[0] : (res.message ?? message);
        }
      } else if (status === HttpStatus.TOO_MANY_REQUESTS) {
        // ThrottlerException carries its response as a plain string
        // ("ThrottlerException: Too Many Requests"). Echoing it would both
        // break the documented error shape and hand the client an internal
        // class name, so the throttled case gets its own contract-compliant body.
        code = 'TOO_MANY_REQUESTS';
        message = 'Rate limit exceeded';
      } else {
        code = 'HTTP_ERROR';
        message = String(response);
      }
    } else if (exception instanceof Error) {
      // The client never sees exception.message here: it can carry SQL
      // fragments, connection strings, or file paths. The full message and
      // stack still go to the log, tied to the same requestId as the
      // response, so an operator can look the failure up (spec 008, FR-010).
      try {
        this.logger.error(
          `Unhandled error${requestId ? ` [${requestId}]` : ''}: ${exception.message}`,
          exception.stack,
        );
      } catch {
        // A broken logging backend must not turn an already-generic error
        // response into a crashed request.
      }
    }

    const body = {
      error: {
        code,
        message,
        ...(details ? { details } : {}),
        ...(requestId ? { requestId } : {}),
      },
    };

    this.logger.debug(`${request.method} ${request.url} → ${status} ${code}`);

    reply.status(status).send(body);
  }
}
