import { DrizzleDB } from '../src/database/database.module';
import { retailNetworks, cities } from '../src/database/schema';
import { randomUUID } from 'crypto';

export const TEST_RN = 'A79C5050-1EE7-11EB-9B6E-05B5FC40DF2A';
export const TEST_BR = '11111111-1111-1111-1111-111111111111';
export const TEST_CITY_NAME = 'Москва (тест)';

export async function seedTestData(db: DrizzleDB): Promise<void> {
  // Retail network
  await db
    .insert(retailNetworks)
    .values({
      id: randomUUID(),
      rn: TEST_RN,
      name: 'SushiMaster (тест)',
      isActive: true,
    })
    .onConflictDoUpdate({
      target: [retailNetworks.rn],
      set: { name: 'SushiMaster (тест)', updatedAt: new Date() },
    });

  // Test city
  await db
    .insert(cities)
    .values({
      id: randomUUID(),
      rn: TEST_RN,
      br: TEST_BR,
      name: TEST_CITY_NAME,
      isActive: true,
      importedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [cities.rn, cities.br],
      set: { name: TEST_CITY_NAME, importedAt: new Date() },
    });

  console.log(`Seeded test retail network (rn=${TEST_RN}) and city (br=${TEST_BR})`);
}
