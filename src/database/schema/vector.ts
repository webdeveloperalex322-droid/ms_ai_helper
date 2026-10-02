import { customType } from 'drizzle-orm/pg-core';

/**
 * pgvector column type shared by every embeddings table.
 * Drizzle has no built-in vector type; the driver exchanges the value as a
 * `[x,y,z]` string.
 */
export const vector = customType<{ data: number[]; driverData: string }>({
  dataType(config?: { dimensions?: number }) {
    return config?.dimensions ? `vector(${config.dimensions})` : 'vector';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    return value.replace('[', '').replace(']', '').split(',').map(Number);
  },
});
