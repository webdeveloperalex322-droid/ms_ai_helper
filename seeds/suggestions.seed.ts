import { DrizzleDB } from '../src/database/database.module';
import { assistantSuggestions } from '../src/database/schema';
import { randomUUID } from 'crypto';

const DEFAULT_RN = 'A79C5050-1EE7-11EB-9B6E-05B5FC40DF2A';

const DEFAULT_AVAILABILITY_RULES = {
  check_products_exist: true,
  min_products_count: 1,
  hide_if_empty: true,
  respect_city_availability: true,
};

const SUGGESTIONS = [
  {
    code: 'first_try',
    title: '🍣 Что попробовать впервые?',
    sortOrder: 10,
    payload: {
      intent: 'product_recommendation',
      slots: { tags: ['популярное'], spicy: false },
      retrieval_query: 'популярные роллы для первого раза нежный вкус',
    },
    fallbackPayload: {
      reply_text: 'Сейчас не нашёл подходящих товаров. Покажу что-нибудь другое?',
      quick_replies: ['Показать популярное', 'Показать новинки'],
    },
  },
  {
    code: 'popular_rolls',
    title: '🔥 Самые популярные роллы',
    sortOrder: 20,
    payload: {
      intent: 'product_recommendation',
      slots: { category: 'roll', tags: ['популярное'] },
      retrieval_query: 'самые популярные роллы хит продаж',
    },
    fallbackPayload: {
      reply_text: 'Не нашёл популярных роллов в вашем городе.',
      quick_replies: ['Показать все роллы', 'Показать сеты'],
    },
  },
  {
    code: 'no_meat',
    title: '💚 Что заказать без мяса?',
    sortOrder: 30,
    payload: {
      intent: 'product_recommendation',
      slots: { excluded_ingredients: ['мясо', 'курица', 'бекон', 'говядина', 'свинина'] },
      retrieval_query: 'роллы без мяса вегетарианские овощные рыбные',
    },
    fallbackPayload: {
      reply_text: 'Не нашёл вегетарианских вариантов. Уточните запрос?',
      quick_replies: ['Показать роллы с рыбой', 'Показать все роллы'],
    },
  },
  {
    code: 'company_set',
    title: '👨‍👩‍👧‍👦 Набор на компанию',
    sortOrder: 40,
    payload: {
      intent: 'product_recommendation',
      slots: { category: 'set', people_count: 3 },
      retrieval_query: 'сет набор на компанию большой для нескольких',
    },
    fallbackPayload: {
      reply_text: 'Не нашёл подходящих сетов на компанию.',
      quick_replies: ['Показать все сеты', 'Показать большие наборы'],
    },
  },
  {
    code: 'for_series',
    title: '🎬 Что взять под сериал?',
    sortOrder: 50,
    payload: {
      intent: 'product_recommendation',
      slots: { scenario: 'movie' },
      retrieval_query: 'сеты комбо закуски под вечер сериал отдых дома',
    },
    fallbackPayload: {
      reply_text: 'Не нашёл подходящих вариантов.',
      quick_replies: ['Показать сеты', 'Показать популярное'],
    },
  },
  {
    code: 'spicy',
    title: '🌶 Люблю поострее',
    sortOrder: 60,
    payload: {
      intent: 'product_recommendation',
      slots: { spicy: true, tags: ['острый'] },
      retrieval_query: 'острые роллы спайси перец васаби',
    },
    fallbackPayload: {
      reply_text: 'Острых роллов нет в вашем городе. Попробуйте что-нибудь другое?',
      quick_replies: ['Показать все роллы', 'Показать популярные'],
    },
  },
  {
    code: 'shrimp_rolls',
    title: '🍤 Роллы с креветкой',
    sortOrder: 70,
    payload: {
      intent: 'product_recommendation',
      slots: { category: 'roll', preferred_ingredients: ['креветка'] },
      retrieval_query: 'роллы с креветкой tempura',
    },
    fallbackPayload: {
      reply_text: 'Сейчас нет роллов с креветкой в вашем городе.',
      quick_replies: ['Показать роллы с лососем', 'Показать все роллы'],
    },
  },
  {
    code: 'under_1000',
    title: '💸 Что заказать до 1000 ₽?',
    sortOrder: 80,
    payload: {
      intent: 'product_recommendation',
      slots: { budget_max: 1000 },
      retrieval_query: 'роллы до 1000 рублей бюджетные недорогие',
    },
    fallbackPayload: {
      reply_text: 'Не нашёл товаров до 1000 ₽ в вашем городе.',
      quick_replies: ['Показать дешевле 1500', 'Показать всё'],
    },
  },
  {
    code: 'perfect_dinner',
    title: '🥢 Собери идеальный ужин',
    sortOrder: 90,
    payload: {
      intent: 'product_recommendation',
      slots: { scenario: 'dinner' },
      retrieval_query: 'ужин роллы сеты напитки вечер',
    },
    fallbackPayload: {
      reply_text: 'Не нашёл подходящих вариантов для ужина.',
      quick_replies: ['Показать сеты', 'Показать роллы'],
    },
  },
  {
    code: 'gift_sushi_fan',
    title: '🎁 Что подарить любителю суши?',
    sortOrder: 100,
    payload: {
      intent: 'product_recommendation',
      slots: { tags: ['premium', 'подарок', 'премиальный'] },
      retrieval_query: 'премиальный сет подарок суши ассорти',
    },
    fallbackPayload: {
      reply_text: 'Не нашёл премиальных наборов в вашем городе.',
      quick_replies: ['Показать большие сеты', 'Показать популярное'],
    },
  },
  {
    code: 'like_philadelphia',
    title: '❤️ Какой ролл похож на Филадельфию?',
    sortOrder: 110,
    payload: {
      intent: 'product_recommendation',
      slots: {
        category: 'roll',
        preferred_ingredients: ['лосось', 'сливочный сыр'],
        taste: ['нежный'],
        excluded_product_names: ['Филадельфия'],
      },
      retrieval_query: 'роллы похожие на Филадельфию лосось сливочный сыр нежный вкус',
    },
    fallbackPayload: {
      reply_text: 'Не нашёл роллов, похожих на Филадельфию, в вашем городе.',
      quick_replies: ['Показать роллы с лососем', 'Показать нежные роллы'],
    },
  },
  {
    code: 'only_salmon',
    title: '🐟 Только с лососем',
    sortOrder: 120,
    payload: {
      intent: 'product_recommendation',
      slots: {
        category: 'roll',
        preferred_ingredients: ['лосось'],
        tags: ['лосось'],
      },
      retrieval_query: 'роллы с лососем семга',
    },
    fallbackPayload: {
      reply_text:
        'Сейчас не нашёл роллов с лососем в вашем городе. Могу показать похожие нежные роллы.',
      quick_replies: ['Показать нежные роллы', 'Показать популярное'],
    },
  },
  {
    code: 'tender_rolls',
    title: '🧀 Самые нежные роллы',
    sortOrder: 130,
    payload: {
      intent: 'product_recommendation',
      slots: { tags: ['нежный', 'сливочный сыр'], spicy: false },
      retrieval_query: 'нежные роллы сливочный сыр филадельфия',
    },
    fallbackPayload: {
      reply_text: 'Не нашёл нежных роллов в вашем городе.',
      quick_replies: ['Показать роллы с лососем', 'Показать все роллы'],
    },
  },
  {
    code: 'lunch',
    title: '🍱 Полноценный обед',
    sortOrder: 140,
    payload: {
      intent: 'product_recommendation',
      slots: { scenario: 'lunch' },
      retrieval_query: 'обед сытные роллы сеты комбо',
    },
    fallbackPayload: {
      reply_text: 'Не нашёл подходящих вариантов для обеда.',
      quick_replies: ['Показать сеты', 'Показать роллы'],
    },
  },
  {
    code: 'quick_snack',
    title: '⚡️ Быстрый перекус',
    sortOrder: 150,
    payload: {
      intent: 'product_recommendation',
      slots: { budget_max: 700 },
      retrieval_query: 'небольшой перекус роллы закуски быстро недорого',
    },
    fallbackPayload: {
      reply_text: 'Не нашёл недорогих вариантов для перекуса.',
      quick_replies: ['Показать до 1000 ₽', 'Показать все роллы'],
    },
  },
  {
    code: 'evening',
    title: '🥂 Что заказать к вечеру?',
    sortOrder: 160,
    payload: {
      intent: 'product_recommendation',
      slots: { scenario: 'evening' },
      retrieval_query: 'роллы сеты напитки вечер романтика отдых',
    },
    fallbackPayload: {
      reply_text: 'Не нашёл подходящих вариантов для вечера.',
      quick_replies: ['Показать сеты', 'Показать популярное'],
    },
  },
  {
    code: 'avocado',
    title: '🥑 Что есть с авокадо?',
    sortOrder: 170,
    payload: {
      intent: 'product_recommendation',
      slots: { preferred_ingredients: ['авокадо'] },
      retrieval_query: 'роллы с авокадо калифорния',
    },
    fallbackPayload: {
      reply_text: 'Не нашёл роллов с авокадо в вашем городе.',
      quick_replies: ['Показать роллы с крабом', 'Показать все роллы'],
    },
  },
  {
    code: 'for_kids',
    title: '🍗 Что понравится детям?',
    sortOrder: 180,
    payload: {
      intent: 'product_recommendation',
      slots: { spicy: false, tags: ['детское', 'курица', 'нежный'] },
      retrieval_query: 'роллы для детей без острого мягкий вкус курица',
    },
    fallbackPayload: {
      reply_text: 'Не нашёл подходящих вариантов для детей.',
      quick_replies: ['Показать нежные роллы', 'Показать без острого'],
    },
  },
  {
    code: 'hot_food',
    title: '🍲 Добавь что-нибудь горячее',
    sortOrder: 190,
    payload: {
      intent: 'product_recommendation',
      slots: { tags: ['горячее', 'запечённый', 'суп'] },
      retrieval_query: 'горячие блюда запеченные роллы суп',
    },
    fallbackPayload: {
      reply_text: 'Не нашёл горячих блюд в вашем городе.',
      quick_replies: ['Показать всё меню', 'Показать роллы'],
    },
  },
  {
    code: 'dessert',
    title: '🍰 Не забудь десерт',
    sortOrder: 200,
    payload: {
      intent: 'product_recommendation',
      slots: { category: 'dessert' },
      retrieval_query: 'десерт сладкое торт пирожное мороженое',
    },
    fallbackPayload: {
      reply_text: 'Десертов нет в текущем меню вашего города.',
      quick_replies: ['Показать всё меню', 'Показать напитки'],
    },
  },
  {
    code: 'new_items',
    title: '👀 Что новенького?',
    sortOrder: 210,
    payload: {
      intent: 'product_recommendation',
      slots: { tags: ['new', 'новинка', 'новый'] },
      retrieval_query: 'новинки новые позиции новое в меню',
    },
    fallbackPayload: {
      reply_text: 'Пока нет новинок в вашем городе.',
      quick_replies: ['Показать популярное', 'Показать все роллы'],
    },
  },
  // Service presets (spec 011): answered from the site knowledge base, not
  // from the catalog — so the "products exist" availability check is off.
  {
    code: 'info_delivery',
    title: '🚚 Условия доставки и оплаты',
    sortOrder: 300,
    payload: {
      intent: 'info_question',
      slots: {},
      retrieval_query: 'условия доставки и способы оплаты заказа',
    },
    availabilityRules: { ...DEFAULT_AVAILABILITY_RULES, check_products_exist: false },
    fallbackPayload: {
      reply_text: 'Условия доставки и оплаты смотрите в разделе «Доставка» на сайте.',
      quick_replies: ['Показать популярное', 'Подобрать сет'],
    },
  },
  {
    code: 'info_bonus',
    title: '🎁 Бонусная программа',
    sortOrder: 310,
    payload: {
      intent: 'info_question',
      slots: {},
      retrieval_query: 'бонусная программа кешбэк баллы как начисляются и списываются',
    },
    availabilityRules: { ...DEFAULT_AVAILABILITY_RULES, check_products_exist: false },
    fallbackPayload: {
      reply_text: 'Правила бонусной программы смотрите в разделе «Бонусы» на сайте.',
      quick_replies: ['Показать популярное', 'Подобрать сет'],
    },
  },
];

export async function seedSuggestions(db: DrizzleDB, rn = DEFAULT_RN): Promise<void> {
  for (const s of SUGGESTIONS) {
    await db
      .insert(assistantSuggestions)
      .values({
        id: randomUUID(),
        rn,
        code: s.code,
        title: s.title,
        enabled: true,
        sortOrder: s.sortOrder,
        screenContext: 'catalog',
        target: 'WEB',
        payload: s.payload as any,
        availabilityRules: (s as any).availabilityRules ?? DEFAULT_AVAILABILITY_RULES,
        fallbackPayload: s.fallbackPayload,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [assistantSuggestions.rn, assistantSuggestions.code],
        set: {
          title: s.title,
          payload: s.payload as any,
          availabilityRules: (s as any).availabilityRules ?? DEFAULT_AVAILABILITY_RULES,
          fallbackPayload: s.fallbackPayload,
          updatedAt: new Date(),
        },
      });
  }

  console.log(`Seeded ${SUGGESTIONS.length} suggestions`);
}
