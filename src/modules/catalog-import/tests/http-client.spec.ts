import { describe, it, expect, vi, beforeEach } from 'vitest';
import { of } from 'rxjs';
import { CatalogApiHttpClient } from '../clients/catalog-api-http.client';

function makeHttpService(data: any) {
  const get = vi.fn().mockReturnValue(of({ data }));
  const post = vi.fn().mockReturnValue(of({ data }));
  return { service: { get, post } as any, get, post };
}

function makeConfig() {
  return {
    get: vi.fn((key: string) =>
      key === 'CITIES_API_BASE_URL' ? 'https://cities.example' : 'https://catalog.example',
    ),
  } as any;
}

describe('CatalogApiHttpClient', () => {
  let http: ReturnType<typeof makeHttpService>;
  let client: CatalogApiHttpClient;

  beforeEach(() => {
    http = makeHttpService([]);
    client = new CatalogApiHttpClient(http.service, makeConfig());
  });

  it('getProductsByCategory uses the "category" param with the slug value (not "cat")', async () => {
    await client.getProductsByCategory('rn1', 'br1', 'WEB', 'rolly');
    const url = http.get.mock.calls[0][0] as string;
    expect(url).toContain('&category=rolly');
    expect(url).not.toContain('&cat=');
    expect(url).toContain('withArchive=false');
  });

  it('getCategories calls /v1/init and returns br + categories', async () => {
    http = makeHttpService({
      businessRegion: { id: 'br-guid' },
      categories: [{ categoryId: 'C1', slug: 'rolly', name: 'Роллы' }],
    });
    client = new CatalogApiHttpClient(http.service, makeConfig());

    const result = await client.getCategories('rn1', 'tyumen', 'WEB');

    const url = http.get.mock.calls[0][0] as string;
    expect(url).toContain('https://cities.example/v1/init');
    expect(url).toContain('rn=rn1');
    expect(url).toContain('slug=tyumen');
    expect(url).toContain('target=WEB');
    expect(result.br).toBe('br-guid');
    expect(result.categories).toHaveLength(1);
    expect(result.categories[0].slug).toBe('rolly');
  });

  it('getCategories tolerates a missing categories array', async () => {
    http = makeHttpService({ businessRegion: { id: 'br-guid' } });
    client = new CatalogApiHttpClient(http.service, makeConfig());
    const result = await client.getCategories('rn1', 'tyumen', 'WEB');
    expect(result.categories).toEqual([]);
  });

  it('requests UTF-8 JSON decoding so Cyrillic is not mangled (mojibake)', async () => {
    await client.getProductsByCategory('rn1', 'br1', 'WEB', 'rolly');
    const config = http.get.mock.calls[0][1] as any;
    expect(config).toMatchObject({ responseType: 'json', responseEncoding: 'utf8' });
  });

  it('passes UTF-8 Cyrillic product text through unchanged', async () => {
    http = makeHttpService([{ id: 'P1', name: 'Ролл Чесночный драйв', price: 259 }]);
    client = new CatalogApiHttpClient(http.service, makeConfig());
    const products = await client.getProductsByCategory('rn1', 'br1', 'WEB', 'rolly');
    expect(products[0].name).toBe('Ролл Чесночный драйв');
    expect(products[0].name).not.toContain('Ð');
  });
});
