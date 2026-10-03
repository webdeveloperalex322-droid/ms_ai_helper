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
    /** Upper calorie bound, in the unit the catalogue provider reports (spec 012). */
    calories_max?: number | null;
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

/** A fragment of a site page handed to the model as grounding for a service question. */
export interface KnowledgePassageInput {
  id: string;
  title: string;
  heading?: string | null;
  url: string;
  text: string;
}

export interface KnowledgeAnswerInput {
  question: string;
  passages: KnowledgePassageInput[];
  city_name?: string;
}

export interface KnowledgeAnswerResult {
  /** Russian answer grounded in the passages, or a short "not on the site" note. */
  answer_text: string;
  /** Subset of the input passage ids the answer relied on. */
  used_passage_ids: string[];
  /** True when the passages do not contain the answer. */
  not_found: boolean;
  quick_replies?: string[];
}

export interface LLMProvider {
  parseIntent(input: IntentParseInput): Promise<IntentResult>;
  rerankAndAnswer(input: RerankerInput): Promise<LLMRerankerResult>;
  answerFromKnowledge(input: KnowledgeAnswerInput): Promise<KnowledgeAnswerResult>;
}
