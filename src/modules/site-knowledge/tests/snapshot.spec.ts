import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  DEFAULT_INFO_PAGES,
  MIN_CONTENT_CHARS,
  SNAPSHOT_VERSION,
  SnapshotValidationError,
  contentHash,
  pageKeyFromPath,
  readSnapshot,
  validateSnapshot,
  type CrawlSnapshot,
} from '../snapshot';

const RN = 'A79C5050-1EE7-11EB-9B6E-05B5FC40DF2A';
const BR = 'E3AFD1AC-4D3D-EA11-A958-8B023DE8EF69';

function okPage(path: string, content = 'x'.repeat(MIN_CONTENT_CHARS)) {
  return {
    key: pageKeyFromPath(path),
    path,
    url: `https://tyumen.sushi-master.ru${path}`,
    title: `Title ${path}`,
    status: 'ok' as const,
    error: null,
    fetched_at: '2026-10-02T06:00:00.000Z',
    content_hash: contentHash(content),
    content,
  };
}

function snapshot(pages: unknown[] = [okPage('/delivery')]): Record<string, unknown> {
  return {
    version: SNAPSHOT_VERSION,
    site_url: 'https://tyumen.sushi-master.ru',
    city_slug: 'tyumen',
    rn: RN,
    br: BR,
    crawled_at: '2026-10-02T06:00:00.000Z',
    pages,
  };
}

describe('DEFAULT_INFO_PAGES', () => {
  it('lists the ten informational routes of the city site', () => {
    expect(DEFAULT_INFO_PAGES).toEqual([
      '/about',
      '/delivery',
      '/bonus',
      '/promotions',
      '/our-restourants',
      '/llm-info',
      '/public-oferta',
      '/privacy',
      '/personal-data-processing',
      '/personal-data-transfer',
    ]);
  });
});

describe('pageKeyFromPath', () => {
  it('maps the root to "home"', () => {
    expect(pageKeyFromPath('/')).toBe('home');
    expect(pageKeyFromPath('')).toBe('home');
  });

  it('strips the leading slash and keeps nested paths', () => {
    expect(pageKeyFromPath('/delivery')).toBe('delivery');
    expect(pageKeyFromPath('/promotions/den-rozhdeniya')).toBe('promotions/den-rozhdeniya');
  });

  it('drops a trailing slash and query string', () => {
    expect(pageKeyFromPath('/bonus/')).toBe('bonus');
    expect(pageKeyFromPath('/about?utm=1')).toBe('about');
  });
});

describe('contentHash', () => {
  it('is a stable md5 hex digest', () => {
    expect(contentHash('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(contentHash('abc')).toBe(contentHash('abc'));
    expect(contentHash('abd')).not.toBe(contentHash('abc'));
  });
});

describe('validateSnapshot', () => {
  it('accepts a well-formed snapshot and returns it typed', () => {
    const result: CrawlSnapshot = validateSnapshot(snapshot());
    expect(result.pages).toHaveLength(1);
    expect(result.rn).toBe(RN);
  });

  it.each(['version', 'rn', 'br', 'pages', 'site_url'])(
    'rejects a snapshot without %s',
    (field) => {
      const input = snapshot();
      delete input[field];
      expect(() => validateSnapshot(input)).toThrow(SnapshotValidationError);
      expect(() => validateSnapshot(input)).toThrow(new RegExp(field));
    },
  );

  it('rejects an unsupported version', () => {
    expect(() => validateSnapshot({ ...snapshot(), version: 99 })).toThrow(/version/);
  });

  it('rejects duplicate page urls', () => {
    expect(() => validateSnapshot(snapshot([okPage('/delivery'), okPage('/delivery')]))).toThrow(
      /duplicate/i,
    );
  });

  it('rejects an ok page without content', () => {
    const page = { ...okPage('/about'), content: '' };
    expect(() => validateSnapshot(snapshot([page]))).toThrow(/content/);
  });

  it('accepts a failed page without content', () => {
    const page = {
      ...okPage('/about'),
      status: 'failed',
      error: 'timeout',
      content: '',
      content_hash: '',
    };
    expect(validateSnapshot(snapshot([page])).pages[0].status).toBe('failed');
  });

  it('rejects a page with an unknown status', () => {
    expect(() => validateSnapshot(snapshot([{ ...okPage('/about'), status: 'meh' }]))).toThrow(
      /status/,
    );
  });

  it('rejects a non-object input', () => {
    expect(() => validateSnapshot(null)).toThrow(SnapshotValidationError);
    expect(() => validateSnapshot('[]')).toThrow(SnapshotValidationError);
  });
});

describe('readSnapshot', () => {
  it('reads and validates a snapshot file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'snap-'));
    const file = join(dir, 'tyumen.json');
    writeFileSync(file, JSON.stringify(snapshot()), 'utf-8');

    const result = await readSnapshot(file);
    expect(result.br).toBe(BR);
    expect(result.pages[0].key).toBe('delivery');
  });

  it('wraps JSON syntax errors into SnapshotValidationError', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'snap-'));
    const file = join(dir, 'broken.json');
    writeFileSync(file, '{ not json', 'utf-8');

    await expect(readSnapshot(file)).rejects.toBeInstanceOf(SnapshotValidationError);
  });
});
