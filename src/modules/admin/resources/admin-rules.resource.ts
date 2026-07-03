export function adminRulesResource(db: any) {
  return {
    resource: db.table('admin_rules'),
    options: {
      navigation: { name: 'Настройки', icon: 'Settings' },
      listProperties: ['rn', 'br', 'target', 'max_cards_in_response', 'updated_at'],
      filterProperties: ['rn', 'br', 'target'],
      showProperties: [
        'id',
        'rn',
        'br',
        'target',
        'tone',
        'max_cards_in_response',
        'max_suggestions_on_screen',
        'banned_phrases',
        'fallback_templates',
        'updated_at',
      ],
      editProperties: [
        'rn',
        'br',
        'target',
        'tone',
        'max_cards_in_response',
        'max_suggestions_on_screen',
        'banned_phrases',
        'fallback_templates',
      ],
      properties: {
        id: { label: 'ID' },
        rn: { label: 'Торговая сеть (rn)' },
        br: { label: 'Город (br)', description: 'Пусто = глобальное правило' },
        target: { label: 'Платформа' },
        tone: { label: 'Тональность', type: 'textarea' },
        max_cards_in_response: { label: 'Макс. карточек в ответе' },
        max_suggestions_on_screen: { label: 'Макс. подсказок на экране' },
        banned_phrases: { label: 'Запрещённые фразы (JSON массив)', type: 'textarea' },
        fallback_templates: { label: 'Шаблоны fallback (JSON)', type: 'textarea' },
        updated_at: { label: 'Обновлено' },
      },
    },
  };
}
