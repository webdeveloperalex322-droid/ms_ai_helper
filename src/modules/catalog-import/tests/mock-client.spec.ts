import { describe, it, expect, beforeEach } from 'vitest';
import { CatalogApiMockClient } from '../clients/catalog-api-mock.client';

describe('CatalogApiMockClient', () => {
  let client: CatalogApiMockClient;

  beforeEach(() => {
    client = new CatalogApiMockClient();
  });

  it('getCities returns a non-empty list', async () => {
    const cities = await client.getCities('any-rn');
    expect(cities.length).toBeGreaterThan(0);
    cities.forEach((c) => {
      expect(c.id).toBeTruthy();
      expect(c.name).toBeTruthy();
    });
  });

  it('getProductsByCategory filters by categoryId', async () => {
    const rolls = await client.getProductsByCategory('rn', 'br', 'WEB', 'roll');
    expect(rolls.length).toBeGreaterThan(0);
    rolls.forEach((p) => expect(p.categoryId).toBe('roll'));
  });

  it('getProductsByCategory with empty categoryId returns all', async () => {
    const all = await client.getProductsByCategory('rn', 'br', 'WEB', '');
    expect(all.length).toBeGreaterThan(0);
  });

  it('getProductsByIds returns only requested products', async () => {
    const allRolls = await client.getProductsByCategory('rn', 'br', 'WEB', 'roll');
    const firstId = allRolls[0].id;
    const result = await client.getProductsByIds('rn', 'br', 'WEB', [firstId]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(firstId);
  });

  it('getProductsByIds with unknown id returns empty', async () => {
    const result = await client.getProductsByIds('rn', 'br', 'WEB', ['non-existent-id']);
    expect(result).toHaveLength(0);
  });

  it('getProductById returns the product', async () => {
    const all = await client.getProductsByCategory('rn', 'br', 'WEB', 'roll');
    const id = all[0].id;
    const product = await client.getProductById('rn', 'br', 'WEB', id);
    expect(product).not.toBeNull();
    expect(product!.id).toBe(id);
  });

  it('getProductById returns null for unknown id', async () => {
    const result = await client.getProductById('rn', 'br', 'WEB', 'unknown');
    expect(result).toBeNull();
  });

  it('all mock products have required fields', async () => {
    const all = await client.getProductsByCategory('rn', 'br', 'WEB', '');
    all.forEach((p) => {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(typeof p.price).toBe('number');
      expect(p.price).toBeGreaterThan(0);
      expect(Array.isArray(p.ingredients)).toBe(true);
    });
  });
});
