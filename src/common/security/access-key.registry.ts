import { createHash, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientApiKeyEntry } from '@/config/configuration';
import { INTERNAL_CONSUMER_LABEL } from './consumer.types';

interface HashedKey {
  label: string;
  hash: Buffer;
}

/** SHA-256 gives every candidate a fixed 32-byte length. */
function hashKey(key: string): Buffer {
  return createHash('sha256').update(key, 'utf8').digest();
}

/**
 * Holds the configured access keys and verifies presented ones.
 *
 * Two properties matter here and both are easy to lose:
 *
 * 1. Comparison is constant-time. `timingSafeEqual` throws on unequal buffer
 *    lengths, so raw keys can't be passed to it directly — a shorter or longer
 *    candidate would take a visibly different path and leak the real key's
 *    length. Hashing first makes every comparison 32 bytes against 32 bytes.
 *
 * 2. The scan does not break on the first match. An early exit would make
 *    response time depend on a key's position in the list.
 */
@Injectable()
export class AccessKeyRegistry {
  private readonly clientKeys: HashedKey[];
  private readonly internalKey: HashedKey;

  // Explicit @Inject rather than relying on emitted design:paramtypes —
  // that metadata is produced by tsc but not by the test runner's transform,
  // so type-only injection would work at runtime and fail under test.
  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {
    const entries = this.configService.get<ClientApiKeyEntry[]>('clientApiKeys') ?? [];
    this.clientKeys = entries.map((entry) => ({
      label: entry.label,
      hash: hashKey(entry.key),
    }));

    this.internalKey = {
      label: INTERNAL_CONSUMER_LABEL,
      hash: hashKey(this.configService.get<string>('INTERNAL_API_KEY') ?? ''),
    };
  }

  /** Returns the owner label of the matching client key, or null. */
  verifyClientKey(presented: string | undefined): string | null {
    return this.matchAgainst(presented, this.clientKeys);
  }

  /** Returns the internal label if the key matches, or null. */
  verifyInternalKey(presented: string | undefined): string | null {
    return this.matchAgainst(presented, [this.internalKey]);
  }

  private matchAgainst(presented: string | undefined, candidates: HashedKey[]): string | null {
    if (presented === undefined || presented === '') return null;

    const presentedHash = hashKey(presented);
    let matchedLabel: string | null = null;

    // Deliberately no early exit — see the class comment.
    for (const candidate of candidates) {
      if (timingSafeEqual(presentedHash, candidate.hash)) {
        matchedLabel = candidate.label;
      }
    }

    return matchedLabel;
  }
}
