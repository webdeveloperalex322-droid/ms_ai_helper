import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import * as schema from '../src/database/schema';
import { seedTestData } from './test-data.seed';
import { seedTestProducts } from './test-products.seed';
import { seedSuggestions } from './suggestions.seed';

const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path: resolve(process.cwd(), envFile) });

async function seed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema }) as any;

  console.log('Seeding database...');

  await seedTestData(db);
  await seedTestProducts(db);
  await seedSuggestions(db);

  console.log('Seeding completed!');
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
