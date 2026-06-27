export const LLM_PROVIDER_TOKEN = 'LLM_PROVIDER';

export interface IntentParseInput {
  message: string;
  screenContext?: string;
  target?: string;
  knownCategories?: string[];
  knownIngredients?: string[];
}

export interface IntentResult {
  intent: string;
  slots: {
    city_id?: string;
    target?: string;
    category?: string;
    budget_max?: number | null;
    preferred_ingredients?: string[];
    excluded_ingredients?: string[];
    taste?: string[];
    spicy?: boolean | null;
    people_count?: number | null;
    product_mentions?: string[];
    scenario?: string;
    excluded_product_names?: string[];
    allergy_risk?: boolean;
  };
  need_clarification: boolean;
  clarification_question?: string | null;
  confidence: number;
}

export interface ProductCandidate {
  product_id: string;
  name: string;
  price: number;
  currency: string;
  image_url?: string;
  ingredients?: string[];
  allergens?: string[];
  tags?: string[];
  category_id?: string;
}

export interface RerankerInput {
  user_request: string;
  constraints: Record<string, any>;
  candidates: ProductCandidate[];
  max_cards?: number;
}

export interface LLMRerankerResult {
  selected: Array<{
    product_id: string;
    reason: string;
  }>;
  reply_text: string;
  quick_replies?: string[];
  need_clarification?: boolean;
  clarification_question?: string | null;
}

export interface LLMProvider {
  parseIntent(input: IntentParseInput): Promise<IntentResult>;
  rerankAndAnswer(input: RerankerInput): Promise<LLMRerankerResult>;
}
