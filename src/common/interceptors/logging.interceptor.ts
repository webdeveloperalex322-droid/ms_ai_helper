import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { randomUUID } from 'crypto';
import { FastifyRequest } from 'fastify';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const requestId = randomUUID();
    const start = Date.now();

    (req as any).requestId = requestId;

    return next.handle().pipe(
      tap({
        next: () => {
          const latency = Date.now() - start;
          const status = context.switchToHttp().getResponse<any>().statusCode;
          this.logger.log(`${req.method} ${req.url} → ${status} (${latency}ms) [${requestId}]`);
        },
        error: (err) => {
          const latency = Date.now() - start;
          this.logger.error(
            `${req.method} ${req.url} → ERROR (${latency}ms) [${requestId}]: ${err.message}`,
          );
        },
      }),
    );
  }
}
