/**
 * Screen contexts and suggestion kinds (spec 012).
 *
 * A suggestion may live on several screens, which `screen_contexts` carries.
 * The older single `screen_context` column stays as the fallback so existing
 * rows and the admin API keep working.
 */

export const SCREEN_CONTEXTS = ['catalog', 'cart', 'checkout', 'empty'] as const;

export type ScreenContext = (typeof SCREEN_CONTEXTS)[number];

export const DEFAULT_SCREEN_CONTEXT: ScreenContext = 'catalog';

/** Suggestions that upsell an order rather than build one: boosted in the cart. */
export const CART_ADDON_CODES = ['drinks', 'dessert', 'sauces_addons', 'hot_food'] as const;

export type SuggestionKind = 'product' | 'service';

export function isScreenContext(value: unknown): value is ScreenContext {
  return typeof value === 'string' && (SCREEN_CONTEXTS as readonly string[]).includes(value);
}

/** An unknown context from a client is treated as the catalogue (FR-023). */
export function normalizeScreenContext(value: string | undefined | null): ScreenContext {
  return isScreenContext(value) ? value : DEFAULT_SCREEN_CONTEXT;
}

/**
 * Contexts a suggestion is allowed on: the array first, then the legacy single
 * value, then the catalogue. Unknown values in the array are dropped; if
 * nothing valid remains the suggestion falls back to the catalogue rather than
 * disappearing from every screen.
 */
export function resolveContexts(suggestion: {
  screenContexts?: string[] | null;
  screenContext?: string | null;
}): ScreenContext[] {
  const fromArray = (suggestion.screenContexts ?? []).filter(isScreenContext);
  if (fromArray.length) return [...new Set(fromArray)];

  if (isScreenContext(suggestion.screenContext)) return [suggestion.screenContext];

  return [DEFAULT_SCREEN_CONTEXT];
}

export function matchesContext(
  suggestion: { screenContexts?: string[] | null; screenContext?: string | null },
  context: ScreenContext,
): boolean {
  return resolveContexts(suggestion).includes(context);
}

/** Service questions are answered from the site knowledge base, not the catalogue. */
export function resolveKind(payload: { intent?: string } | null | undefined): SuggestionKind {
  return payload?.intent === 'info_question' ? 'service' : 'product';
}

/**
 * Whether the suggestion is the kind a given screen is there for: add-ons in
 * the cart, service questions at checkout and on an empty screen.
 */
export function isProfileForContext(
  suggestion: { code: string },
  kind: SuggestionKind,
  context: ScreenContext,
): boolean {
  switch (context) {
    case 'cart':
      return (CART_ADDON_CODES as readonly string[]).includes(suggestion.code);
    case 'checkout':
    case 'empty':
      return kind === 'service';
    default:
      return false;
  }
}
