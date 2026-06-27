import { Injectable, Inject } from '@nestjs/common';
import { DATABASE_TOKEN, DrizzleDB } from '../../../database/database.module';
import {
  assistantSuggestions,
  AssistantSuggestion,
  NewAssistantSuggestion,
} from '../../../database/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

@Injectable()
export class SuggestionAdminService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: DrizzleDB) {}

  async findAll(rn: string): Promise<AssistantSuggestion[]> {
    return this.db.select().from(assistantSuggestions).where(eq(assistantSuggestions.rn, rn));
  }

  async create(
    data: Omit<NewAssistantSuggestion, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<AssistantSuggestion> {
    const [created] = await this.db
      .insert(assistantSuggestions)
      .values({ id: randomUUID(), ...data, createdAt: new Date(), updatedAt: new Date() })
      .returning();
    return created;
  }

  async update(
    id: string,
    data: Partial<AssistantSuggestion>,
  ): Promise<AssistantSuggestion | null> {
    const [updated] = await this.db
      .update(assistantSuggestions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(assistantSuggestions.id, id))
      .returning();
    return updated ?? null;
  }
}
