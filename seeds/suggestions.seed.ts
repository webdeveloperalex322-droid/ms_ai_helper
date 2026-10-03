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

/** Screens a suggestion may appear on (spec 012). Most suggestions build an order. */
const CATALOG_ONLY = ['catalog'];
/** Add-ons also belong in the cart, where the order is already being closed. */
const CATALOG_AND_CART = ['catalog', 'cart'];
/** Service questions fit the catalogue, the checkout and an empty screen. */
const SERVICE_CONTEXTS = ['catalog', 'checkout', 'empty'];

interface SuggestionSeed {
  code: string;
  title: string;
  sortOrder: number;
  /** Defaults to the catalogue only. */
  screenContexts?: string[];
  payload: {
    intent: string;
    slots: Record<string, any>;
    retrieval_query: string;
  };
  availabilityRules?: Record<string, any>;
  fallbackPayload: {
    reply_text: string;
    quick_replies: string[];
  };
}

/** Service questions never run the catalogue check — their source is the knowledge base. */
const SERVICE_RULES = { ...DEFAULT_AVAILABILITY_RULES, check_products_exist: false };

const SUGGESTIONS: SuggestionSeed[] = [
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
    screenContexts: CATALOG_AND_CART,
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
    screenContexts: CATALOG_AND_CART,
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
    screenContexts: SERVICE_CONTEXTS,
    payload: {
      intent: 'info_question',
      slots: {},
      retrieval_query: 'условия доставки и способы оплаты заказа',
    },
    availabilityRules: SERVICE_RULES,
    fallbackPayload: {
      reply_text: 'Условия доставки и оплаты смотрите в разделе «Доставка» на сайте.',
      quick_replies: ['Показать популярное', 'Подобрать сет'],
    },
  },
  {
    code: 'info_bonus',
    title: '🎁 Бонусная программа',
    sortOrder: 310,
    screenContexts: SERVICE_CONTEXTS,
    payload: {
      intent: 'info_question',
      slots: {},
      retrieval_query: 'бонусная программа кешбэк баллы как начисляются и списываются',
    },
    availabilityRules: SERVICE_RULES,
    fallbackPayload: {
      reply_text: 'Правила бонусной программы смотрите в разделе «Бонусы» на сайте.',
      quick_replies: ['Показать популярное', 'Подобрать сет'],
    },
  },
  {
    code: 'delivery_time',
    title: '⏱ Как быстро привезёте?',
    sortOrder: 320,
    screenContexts: SERVICE_CONTEXTS,
    payload: {
      intent: 'info_question',
      slots: {},
      retrieval_query: 'сроки доставки время ожидания заказа',
    },
    availabilityRules: SERVICE_RULES,
    fallbackPayload: {
      reply_text: 'Сроки доставки смотрите в разделе «Доставка» на сайте.',
      quick_replies: ['Условия доставки и оплаты', 'Адреса и часы работы'],
    },
  },
  {
    code: 'payment_methods',
    title: '💳 Чем можно оплатить?',
    sortOrder: 330,
    screenContexts: SERVICE_CONTEXTS,
    payload: {
      intent: 'info_question',
      slots: {},
      retrieval_query: 'способы оплаты картой онлайн наличными курьеру',
    },
    availabilityRules: SERVICE_RULES,
    fallbackPayload: {
      reply_text: 'Способы оплаты смотрите в разделе «Доставка и оплата» на сайте.',
      quick_replies: ['Условия доставки и оплаты', 'Бонусная программа'],
    },
  },
  {
    code: 'current_promos',
    title: '🏷 Какие сейчас акции?',
    sortOrder: 340,
    screenContexts: SERVICE_CONTEXTS,
    payload: {
      intent: 'info_question',
      slots: {},
      retrieval_query: 'акции скидки специальные предложения',
    },
    availabilityRules: SERVICE_RULES,
    fallbackPayload: {
      reply_text: 'Действующие акции смотрите в разделе «Акции» на сайте.',
      quick_replies: ['Бонусная программа', 'Где ввести промокод?'],
    },
  },
  {
    code: 'promo_code',
    title: '🎟 Где ввести промокод?',
    sortOrder: 350,
    screenContexts: SERVICE_CONTEXTS,
    payload: {
      intent: 'info_question',
      slots: {},
      retrieval_query: 'промокод применение купон скидка',
    },
    availabilityRules: SERVICE_RULES,
    fallbackPayload: {
      reply_text: 'Про промокоды смотрите в разделе «Акции» на сайте или спросите поддержку.',
      quick_replies: ['Какие сейчас акции?', 'Бонусная программа'],
    },
  },
  {
    code: 'restaurants_info',
    title: '📍 Адреса и часы работы',
    sortOrder: 360,
    screenContexts: SERVICE_CONTEXTS,
    payload: {
      intent: 'info_question',
      slots: {},
      retrieval_query: 'адреса ресторанов режим работы самовывоз',
    },
    availabilityRules: SERVICE_RULES,
    fallbackPayload: {
      reply_text: 'Адреса и часы работы смотрите в разделе «Наши рестораны» на сайте.',
      quick_replies: ['Как быстро привезёте?', 'Условия доставки и оплаты'],
    },
  },
  {
    code: 'min_order',
    title: '🧾 Минимальная сумма заказа',
    sortOrder: 370,
    screenContexts: SERVICE_CONTEXTS,
    payload: {
      intent: 'info_question',
      slots: {},
      retrieval_query: 'минимальная сумма заказа зона доставки',
    },
    availabilityRules: SERVICE_RULES,
    fallbackPayload: {
      reply_text: 'Минимальную сумму заказа смотрите в разделе «Доставка» на сайте.',
      quick_replies: ['Условия доставки и оплаты', 'Как быстро привезёте?'],
    },
  },

  // --- diet and exclusions (spec 012) ----------------------------------
  // The most common live phrasings: people state what they will not eat.
  {
    code: 'no_fish',
    title: '🍗 Без рыбы',
    sortOrder: 400,
    payload: {
      intent: 'product_recommendation',
      slots: {
        // Stems, not dictionary forms: the catalogue writes "Креветки в
        // панировке", "краб-микс соус", "икра масаго".
        excluded_ingredients: [
          'лосос',
          'тунц',
          'тунец',
          'угор',
          'угр',
          'креветк',
          'икра',
          'икр',
          'рыб',
          'сёмг',
          'семг',
          'краб',
        ],
      },
      retrieval_query: 'роллы без рыбы с курицей овощные',
    },
    fallbackPayload: {
      reply_text: 'Не нашёл вариантов без рыбы. Могу показать что-нибудь ещё?',
      quick_replies: ['Показать роллы с курицей', 'Показать все роллы'],
    },
  },
  {
    code: 'no_spicy_at_all',
    title: '😌 Совсем не острое',
    sortOrder: 410,
    payload: {
      intent: 'product_recommendation',
      slots: { spicy: false },
      retrieval_query: 'не острые роллы мягкий вкус без спайси',
    },
    fallbackPayload: {
      reply_text: 'Не нашёл неострых вариантов. Могу показать что-нибудь ещё?',
      quick_replies: ['Показать нежные роллы', 'Показать все роллы'],
    },
  },
  {
    code: 'no_cucumber',
    title: '🥒 Без огурца',
    sortOrder: 420,
    payload: {
      intent: 'product_recommendation',
      slots: { excluded_ingredients: ['огур'] },
      retrieval_query: 'роллы без огурца',
    },
    fallbackPayload: {
      reply_text: 'Не нашёл роллов без огурца. Могу показать что-нибудь ещё?',
      quick_replies: ['Показать роллы с лососем', 'Показать все роллы'],
    },
  },
  {
    code: 'no_cream_cheese',
    title: '🧀 Без сливочного сыра',
    sortOrder: 430,
    payload: {
      intent: 'product_recommendation',
      // The live catalogue calls it "Крем чиз", not "сливочный сыр".
      slots: { excluded_ingredients: ['крем чиз', 'сливочный сыр', 'творожн'] },
      retrieval_query: 'роллы без сливочного сыра',
    },
    fallbackPayload: {
      reply_text: 'Не нашёл роллов без сливочного сыра. Могу показать что-нибудь ещё?',
      quick_replies: ['Показать роллы с лососем', 'Показать все роллы'],
    },
  },
  {
    code: 'light_calories',
    title: '🥗 Что-то полегче',
    sortOrder: 440,
    payload: {
      intent: 'product_recommendation',
      // The provider's calorie unit is not documented, so the bound lives in the
      // suggestion and gets tuned against the live catalogue (spec 012, R7).
      slots: { calories_max: 200, spicy: false },
      retrieval_query: 'лёгкие роллы овощные небольшая калорийность',
    },
    fallbackPayload: {
      reply_text: 'Не нашёл лёгких вариантов. Могу показать что-нибудь ещё?',
      quick_replies: ['Показать овощные роллы', 'Показать все роллы'],
    },
  },
  {
    code: 'veggie_only',
    title: '🌱 Только растительное',
    sortOrder: 450,
    payload: {
      intent: 'product_recommendation',
      slots: {
        excluded_ingredients: [
          'рыб',
          'лосос',
          'тунц',
          'тунец',
          'угор',
          'угр',
          'креветк',
          'краб',
          'икр',
          'мидии',
          'мидий',
          'кальмар',
          'гребеш',
          'мясо',
          'курин',
          'курица',
          'бекон',
          'говядин',
          'свинин',
          'сыр',
          'чиз',
          'майонез',
        ],
      },
      retrieval_query: 'овощные роллы вегетарианские без животных продуктов',
    },
    fallbackPayload: {
      reply_text: 'Не нашёл полностью растительных вариантов. Могу показать овощные роллы?',
      quick_replies: ['Показать овощные роллы', 'Показать без мяса'],
    },
  },

  // --- occasions and add-ons (spec 012) --------------------------------
  {
    code: 'for_two',
    title: '💑 На двоих',
    sortOrder: 500,
    payload: {
      intent: 'product_recommendation',
      slots: { category: 'set', people_count: 2 },
      retrieval_query: 'сет на двоих небольшой набор для двух человек',
    },
    fallbackPayload: {
      reply_text: 'Не нашёл подходящих сетов на двоих.',
      quick_replies: ['Показать все сеты', 'Показать популярное'],
    },
  },
  {
    code: 'office_lunch',
    title: '🏢 Обед в офис',
    sortOrder: 510,
    payload: {
      intent: 'product_recommendation',
      slots: { scenario: 'lunch', people_count: 5 },
      retrieval_query: 'обед в офис на несколько человек сытные сеты',
    },
    fallbackPayload: {
      reply_text: 'Не нашёл подходящих вариантов для офиса.',
      quick_replies: ['Показать сеты', 'Показать популярное'],
    },
  },
  {
    code: 'big_party',
    title: '🎉 На большую компанию',
    sortOrder: 520,
    payload: {
      intent: 'product_recommendation',
      slots: { category: 'set', people_count: 6 },
      retrieval_query: 'большой сет на компанию много роллов',
    },
    fallbackPayload: {
      reply_text: 'Не нашёл больших сетов на компанию.',
      quick_replies: ['Показать все сеты', 'Показать популярное'],
    },
  },
  {
    code: 'birthday',
    title: '🎂 На день рождения',
    sortOrder: 530,
    payload: {
      intent: 'product_recommendation',
      slots: { scenario: 'birthday', tags: ['премиальный', 'сет'] },
      retrieval_query: 'праздничный сет на день рождения ассорти',
    },
    fallbackPayload: {
      reply_text: 'Не нашёл праздничных наборов.',
      quick_replies: ['Показать большие сеты', 'Показать премиальное'],
    },
  },
  {
    code: 'drinks',
    title: '🥤 Добавь напитки',
    sortOrder: 540,
    screenContexts: CATALOG_AND_CART,
    payload: {
      intent: 'product_recommendation',
      slots: { category: 'drink' },
      retrieval_query: 'напитки лимонад чай сок кола',
    },
    fallbackPayload: {
      reply_text: 'Напитков нет в текущем меню вашего города.',
      quick_replies: ['Показать десерты', 'Показать всё меню'],
    },
  },
  {
    code: 'sauces_addons',
    title: '🥡 Соусы и дополнения',
    sortOrder: 550,
    screenContexts: CATALOG_AND_CART,
    payload: {
      // The live directory has no "Соусы" entry — sauces, wasabi and ginger sit
      // under "Дополнительно", and an unresolved category means NO filter at
      // all (ADR-012), i.e. the suggestion would answer with random products.
      intent: 'product_recommendation',
      slots: { category: 'дополнительно' },
      retrieval_query: 'соусы васаби имбирь дополнения к роллам',
    },
    fallbackPayload: {
      reply_text: 'Соусов нет в текущем меню вашего города.',
      quick_replies: ['Показать напитки', 'Показать всё меню'],
    },
  },
  {
    code: 'baked_rolls',
    title: '🔥 Запечённые роллы',
    sortOrder: 560,
    payload: {
      intent: 'product_recommendation',
      slots: { category: 'roll', tags: ['запечённый', 'запеченный'] },
      retrieval_query: 'запечённые роллы под сыром горячие',
    },
    fallbackPayload: {
      reply_text: 'Не нашёл запечённых роллов в вашем городе.',
      quick_replies: ['Показать горячее', 'Показать все роллы'],
    },
  },
  {
    code: 'best_value',
    title: '⚖️ Выгодно по цене и объёму',
    sortOrder: 570,
    payload: {
      intent: 'product_recommendation',
      slots: { category: 'set', budget_max: 2000 },
      retrieval_query: 'выгодный большой сет много роллов за свои деньги',
    },
    fallbackPayload: {
      reply_text: 'Не нашёл выгодных наборов в вашем городе.',
      quick_replies: ['Показать все сеты', 'Показать до 1000 ₽'],
    },
  },
  {
    code: 'premium_choice',
    title: '💎 Что-то особенное',
    sortOrder: 580,
    payload: {
      intent: 'product_recommendation',
      slots: { tags: ['премиальный', 'premium'] },
      retrieval_query: 'премиальные роллы с гребешком тунцом икрой особенное',
    },
    fallbackPayload: {
      reply_text: 'Не нашёл премиальных позиций в вашем городе.',
      quick_replies: ['Показать большие сеты', 'Показать популярное'],
    },
  },
  {
    code: 'with_tuna',
    title: '🐠 Роллы с тунцом',
    sortOrder: 590,
    payload: {
      intent: 'product_recommendation',
      slots: { category: 'roll', preferred_ingredients: ['тунц', 'тунец'] },
      retrieval_query: 'роллы с тунцом',
    },
    fallbackPayload: {
      reply_text: 'Сейчас нет роллов с тунцом в вашем городе.',
      quick_replies: ['Показать роллы с лососем', 'Показать все роллы'],
    },
  },
  {
    code: 'with_eel',
    title: '🐍 Роллы с угрём',
    sortOrder: 600,
    payload: {
      intent: 'product_recommendation',
      slots: { category: 'roll', preferred_ingredients: ['угор', 'угр'] },
      retrieval_query: 'роллы с угрём унаги',
    },
    fallbackPayload: {
      reply_text: 'Сейчас нет роллов с угрём в вашем городе.',
      quick_replies: ['Показать роллы с лососем', 'Показать все роллы'],
    },
  },

  // --- "looks like X" (spec 012) ---------------------------------------
  // The exemplar is dropped from the shortlist, not merely discouraged in the
  // prompt — it is the closest match by every score the retriever has.
  {
    code: 'like_california',
    title: '🦀 Похож на Калифорнию',
    sortOrder: 610,
    payload: {
      intent: 'product_recommendation',
      slots: {
        category: 'roll',
        preferred_ingredients: ['краб', 'икра', 'авокадо'],
        excluded_product_names: ['Калифорния'],
      },
      retrieval_query: 'роллы похожие на Калифорнию краб икра тобико авокадо',
    },
    fallbackPayload: {
      reply_text: 'Не нашёл роллов, похожих на Калифорнию, в вашем городе.',
      quick_replies: ['Показать роллы с крабом', 'Показать все роллы'],
    },
  },
  {
    code: 'like_dragon',
    title: '🐉 Похож на Дракон',
    sortOrder: 620,
    payload: {
      intent: 'product_recommendation',
      slots: {
        category: 'roll',
        preferred_ingredients: ['угор', 'унаги', 'авокадо'],
        excluded_product_names: ['Дракон'],
      },
      retrieval_query: 'роллы похожие на Дракон угорь унаги авокадо',
    },
    fallbackPayload: {
      reply_text: 'Не нашёл роллов, похожих на Дракон, в вашем городе.',
      quick_replies: ['Показать роллы с угрём', 'Показать все роллы'],
    },
  },
  {
    code: 'like_canada',
    title: '🍁 Похож на Канаду',
    sortOrder: 630,
    payload: {
      intent: 'product_recommendation',
      slots: {
        category: 'roll',
        preferred_ingredients: ['угор', 'лосос', 'крем чиз'],
        excluded_product_names: ['Канада'],
      },
      retrieval_query: 'роллы похожие на Канаду угорь лосось сливочный сыр',
    },
    fallbackPayload: {
      reply_text: 'Не нашёл роллов, похожих на Канаду, в вашем городе.',
      quick_replies: ['Показать роллы с угрём', 'Показать все роллы'],
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
        screenContexts: s.screenContexts ?? CATALOG_ONLY,
        target: 'WEB',
        payload: s.payload as any,
        availabilityRules: (s.availabilityRules ?? DEFAULT_AVAILABILITY_RULES) as any,
        fallbackPayload: s.fallbackPayload,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [assistantSuggestions.rn, assistantSuggestions.code],
        set: {
          title: s.title,
          sortOrder: s.sortOrder,
          screenContexts: s.screenContexts ?? CATALOG_ONLY,
          payload: s.payload as any,
          availabilityRules: (s.availabilityRules ?? DEFAULT_AVAILABILITY_RULES) as any,
          fallbackPayload: s.fallbackPayload,
          updatedAt: new Date(),
        },
      });
  }

  console.log(`Seeded ${SUGGESTIONS.length} suggestions`);
}
