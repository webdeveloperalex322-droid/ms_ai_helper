import { describe, it, expect } from 'vitest';
import {
  EXIT_ERROR,
  EXIT_NO_BROWSER,
  EXIT_OK,
  EXIT_PARTIAL,
  formatCrawlHelp,
  formatImportHelp,
  parseCrawlArgs,
  parseImportArgs,
} from '../cli-options';
import { DEFAULT_INFO_PAGES } from '../snapshot';

const RN = 'A79C5050-1EE7-11EB-9B6E-05B5FC40DF2A';
const BR = 'E3AFD1AC-4D3D-EA11-A958-8B023DE8EF69';
const REQUIRED = [
  '--url',
  'https://tyumen.sushi-master.ru',
  '--rn',
  RN,
  '--br',
  BR,
  '--out',
  'data/x.json',
];

describe('exit codes', () => {
  it('are distinct and documented', () => {
    expect([EXIT_OK, EXIT_ERROR, EXIT_NO_BROWSER, EXIT_PARTIAL]).toEqual([0, 1, 2, 3]);
  });
});

describe('parseCrawlArgs', () => {
  it('returns help for --help / -h', () => {
    expect(parseCrawlArgs(['--help'])).toEqual({ kind: 'help' });
    expect(parseCrawlArgs(['-h', ...REQUIRED])).toEqual({ kind: 'help' });
    expect(formatCrawlHelp()).toContain('--url');
  });

  it('parses the required flags with defaults', () => {
    const result = parseCrawlArgs(REQUIRED);
    expect(result.kind).toBe('options');
    if (result.kind !== 'options') return;
    expect(result.options).toEqual({
      siteUrl: 'https://tyumen.sushi-master.ru',
      rn: RN,
      br: BR,
      out: 'data/x.json',
      pages: [...DEFAULT_INFO_PAGES],
      promotionDetails: true,
      browser: undefined,
      pageTimeoutMs: 180_000,
      concurrency: 2,
    });
  });

  it.each(['--url', '--rn', '--br', '--out'])('fails without %s', (flag) => {
    const idx = REQUIRED.indexOf(flag);
    const argv = [...REQUIRED.slice(0, idx), ...REQUIRED.slice(idx + 2)];
    const result = parseCrawlArgs(argv);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.message).toContain(flag);
  });

  it('validates uuids and the site url', () => {
    expect(parseCrawlArgs([...REQUIRED.slice(0, 3), 'nope', ...REQUIRED.slice(4)]).kind).toBe(
      'error',
    );
    expect(parseCrawlArgs(['--url', 'tyumen', ...REQUIRED.slice(2)]).kind).toBe('error');
  });

  it('accepts --pages as a comma separated list, trimming and normalizing', () => {
    const result = parseCrawlArgs([...REQUIRED, '--pages', ' about, /delivery ,bonus/']);
    expect(result.kind).toBe('options');
    if (result.kind === 'options')
      expect(result.options.pages).toEqual(['/about', '/delivery', '/bonus']);
  });

  it('accepts --no-promotion-details, --browser, --page-timeout, --concurrency', () => {
    const result = parseCrawlArgs([
      ...REQUIRED,
      '--no-promotion-details',
      '--browser',
      'C:\\edge\\msedge.exe',
      '--page-timeout=60000',
      '--concurrency',
      '3',
    ]);
    expect(result.kind).toBe('options');
    if (result.kind !== 'options') return;
    expect(result.options.promotionDetails).toBe(false);
    expect(result.options.browser).toBe('C:\\edge\\msedge.exe');
    expect(result.options.pageTimeoutMs).toBe(60_000);
    expect(result.options.concurrency).toBe(3);
  });

  it('rejects out-of-range numbers, unknown flags and positional arguments', () => {
    expect(parseCrawlArgs([...REQUIRED, '--concurrency', '0']).kind).toBe('error');
    expect(parseCrawlArgs([...REQUIRED, '--page-timeout', 'abc']).kind).toBe('error');
    expect(parseCrawlArgs([...REQUIRED, '--wat']).kind).toBe('error');
    expect(parseCrawlArgs([...REQUIRED, 'extra']).kind).toBe('error');
    expect(parseCrawlArgs([...REQUIRED, '--browser']).kind).toBe('error');
  });
});

describe('parseImportArgs', () => {
  it('returns help for --help', () => {
    expect(parseImportArgs(['--help'])).toEqual({ kind: 'help' });
    expect(formatImportHelp()).toContain('--force');
  });

  it('requires the snapshot path', () => {
    const result = parseImportArgs([]);
    expect(result.kind).toBe('error');
    expect(parseImportArgs(['--force']).kind).toBe('error');
  });

  it('parses the path and flags', () => {
    const result = parseImportArgs(['data/site-pages/tyumen.json', '--force', '--dry-run']);
    expect(result).toEqual({
      kind: 'options',
      options: { snapshotPath: 'data/site-pages/tyumen.json', force: true, dryRun: true },
    });
  });

  it('rejects a second positional argument and unknown flags', () => {
    expect(parseImportArgs(['a.json', 'b.json']).kind).toBe('error');
    expect(parseImportArgs(['a.json', '--nope']).kind).toBe('error');
  });
});
