import { describe, it, expect } from 'vitest';
import {
  parseBulkIndexArgs,
  formatHelp,
  EXIT_OK,
  EXIT_ERROR,
  EXIT_EMPTY,
  EXIT_PARTIAL_FAILURE,
  MAX_CONCURRENCY,
} from '../bulk-index-options';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

function options(argv: string[]) {
  const result = parseBulkIndexArgs(argv);
  if (result.kind !== 'options') {
    throw new Error(`expected options, got ${result.kind}: ${JSON.stringify(result)}`);
  }
  return result;
}

describe('parseBulkIndexArgs', () => {
  describe('defaults', () => {
    it('applies documented defaults for an empty argv', () => {
      const { options: opts, warnings } = options([]);

      expect(opts).toEqual({
        rn: undefined,
        br: undefined,
        target: undefined,
        force: false,
        dryRun: false,
        batchSize: 32,
        concurrency: 3,
        pageSize: 500,
        retries: 3,
        limit: undefined,
      });
      expect(warnings).toEqual([]);
    });
  });

  describe('filters', () => {
    it('parses rn, br and target', () => {
      const { options: opts } = options(['--rn', UUID_A, '--br', UUID_B, '--target', 'WEB']);

      expect(opts.rn).toBe(UUID_A);
      expect(opts.br).toBe(UUID_B);
      expect(opts.target).toBe('WEB');
    });

    it('accepts --flag=value form', () => {
      const { options: opts } = options([`--br=${UUID_B}`, '--target=APP']);

      expect(opts.br).toBe(UUID_B);
      expect(opts.target).toBe('APP');
    });

    it('rejects a malformed uuid in --rn', () => {
      const result = parseBulkIndexArgs(['--rn', 'not-a-uuid']);

      expect(result.kind).toBe('error');
      expect(result.kind === 'error' && result.message).toContain('--rn');
    });

    it('rejects a malformed uuid in --br', () => {
      const result = parseBulkIndexArgs(['--br', '123']);

      expect(result.kind).toBe('error');
    });

    it('rejects an empty --target', () => {
      const result = parseBulkIndexArgs(['--target', '']);

      expect(result.kind).toBe('error');
    });
  });

  describe('boolean flags', () => {
    it('parses --force and --dry-run', () => {
      const { options: opts } = options(['--force', '--dry-run']);

      expect(opts.force).toBe(true);
      expect(opts.dryRun).toBe(true);
    });

    it('does not consume the next argument as a boolean flag value', () => {
      const { options: opts } = options(['--force', '--target', 'WEB']);

      expect(opts.force).toBe(true);
      expect(opts.target).toBe('WEB');
    });
  });

  describe('numeric flags', () => {
    it('parses batch size, page size, retries and limit', () => {
      const { options: opts } = options([
        '--batch-size',
        '10',
        '--page-size',
        '100',
        '--retries',
        '5',
        '--limit',
        '42',
      ]);

      expect(opts.batchSize).toBe(10);
      expect(opts.pageSize).toBe(100);
      expect(opts.retries).toBe(5);
      expect(opts.limit).toBe(42);
    });

    it('rejects a non-numeric value', () => {
      const result = parseBulkIndexArgs(['--batch-size', 'many']);

      expect(result.kind).toBe('error');
      expect(result.kind === 'error' && result.message).toContain('--batch-size');
    });

    it('rejects a value below the allowed range', () => {
      const result = parseBulkIndexArgs(['--batch-size', '0']);

      expect(result.kind).toBe('error');
    });

    it('rejects a value above the allowed range', () => {
      const result = parseBulkIndexArgs(['--batch-size', '1000']);

      expect(result.kind).toBe('error');
    });

    it('rejects a fractional value', () => {
      const result = parseBulkIndexArgs(['--retries', '2.5']);

      expect(result.kind).toBe('error');
    });

    it('rejects a missing value at the end of argv', () => {
      const result = parseBulkIndexArgs(['--batch-size']);

      expect(result.kind).toBe('error');
    });
  });

  describe('concurrency clamping', () => {
    it('clamps a too large concurrency and warns instead of failing', () => {
      const { options: opts, warnings } = options(['--concurrency', '100']);

      expect(opts.concurrency).toBe(MAX_CONCURRENCY);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain(String(MAX_CONCURRENCY));
    });

    it('keeps a concurrency inside the allowed range', () => {
      const { options: opts, warnings } = options(['--concurrency', '7']);

      expect(opts.concurrency).toBe(7);
      expect(warnings).toEqual([]);
    });

    it('rejects a concurrency below one', () => {
      const result = parseBulkIndexArgs(['--concurrency', '0']);

      expect(result.kind).toBe('error');
    });
  });

  describe('help and unknown input', () => {
    it('reports help for --help', () => {
      expect(parseBulkIndexArgs(['--help']).kind).toBe('help');
      expect(parseBulkIndexArgs(['-h']).kind).toBe('help');
    });

    it('prefers help over other arguments', () => {
      expect(parseBulkIndexArgs(['--force', '--help']).kind).toBe('help');
    });

    it('rejects an unknown flag', () => {
      const result = parseBulkIndexArgs(['--nope']);

      expect(result.kind).toBe('error');
      expect(result.kind === 'error' && result.message).toContain('--nope');
    });

    it('rejects a positional argument', () => {
      const result = parseBulkIndexArgs(['product-id']);

      expect(result.kind).toBe('error');
    });
  });

  describe('formatHelp', () => {
    it('documents every supported flag', () => {
      const help = formatHelp();

      for (const flag of [
        '--rn',
        '--br',
        '--target',
        '--force',
        '--dry-run',
        '--batch-size',
        '--concurrency',
        '--page-size',
        '--retries',
        '--limit',
        '--help',
      ]) {
        expect(help).toContain(flag);
      }
    });

    it('documents the exit codes', () => {
      const help = formatHelp();

      expect(help).toContain('0');
      expect(help).toContain('2');
      expect(help).toContain('3');
    });
  });

  describe('exit codes', () => {
    it('exposes distinct exit codes per outcome', () => {
      expect(new Set([EXIT_OK, EXIT_ERROR, EXIT_EMPTY, EXIT_PARTIAL_FAILURE]).size).toBe(4);
      expect(EXIT_OK).toBe(0);
      expect(EXIT_ERROR).toBe(1);
      expect(EXIT_EMPTY).toBe(2);
      expect(EXIT_PARTIAL_FAILURE).toBe(3);
    });
  });
});
