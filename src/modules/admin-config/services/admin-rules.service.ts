import { Injectable, Inject } from '@nestjs/common';
import { DATABASE_TOKEN, DrizzleDB } from '../../../database/database.module';
import { adminRules, AdminRule } from '../../../database/schema';
import { eq, and } from 'drizzle-orm';

@Injectable()
export class AdminRulesService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: DrizzleDB) {}

  async getForNetwork(rn: string, target = 'WEB'): Promise<AdminRule | null> {
    const [rule] = await this.db
      .select()
      .from(adminRules)
      .where(and(eq(adminRules.rn, rn), eq(adminRules.target, target)))
      .limit(1);

    return rule ?? null;
  }

  async getMaxCards(rn: string, target = 'WEB'): Promise<number> {
    const rule = await this.getForNetwork(rn, target);
    return rule?.maxCardsInResponse ?? 5;
  }

  async getBannedPhrases(rn: string, target = 'WEB'): Promise<string[]> {
    const rule = await this.getForNetwork(rn, target);
    return (rule?.bannedPhrases as string[]) ?? [];
  }
}
