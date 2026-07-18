import { SetMetadata } from '@nestjs/common';
import { ACCESS_SCOPE_METADATA, AccessScope } from './consumer.types';

/**
 * Marks a route as reachable without any access key.
 * Reserved for liveness checks — an orchestrator cannot present a key.
 */
export const PublicRoute = () => SetMetadata<string, AccessScope>(ACCESS_SCOPE_METADATA, 'public');

/**
 * Marks a route as requiring the internal key. A client key is rejected here:
 * the key shipped inside a browser widget must never grant write access.
 */
export const InternalRoute = () =>
  SetMetadata<string, AccessScope>(ACCESS_SCOPE_METADATA, 'internal');
