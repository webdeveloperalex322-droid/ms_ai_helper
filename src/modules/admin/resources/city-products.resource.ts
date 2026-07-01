export function cityProductsResource(db: any) {
  return {
    resource: db.table('city_products'),
    options: {
      navigation: { name: 'Каталог', icon: 'Store' },
      actions: {
        new: { isAccessible: false },
        delete: { isAccessible: false },
      },
      listProperties: ['br', 'target', 'price', 'is_available', 'is_valid', 'imported_at'],
      filterProperties: ['rn', 'br', 'target', 'is_available', 'is_valid'],
      showProperties: [
        'id', 'rn', 'br', 'target', 'product_id',
        'price', 'old_price', 'currency',
        'is_available', 'is_valid', 'invalid_reason', 'imported_at',
      ],
      editProperties: ['is_available', 'is_valid', 'invalid_reason'],
      properties: {
        id: { label: 'ID' },
        rn: { label: 'Торговая сеть (rn)' },
        br: { label: 'Город (br)' },
        target: { label: 'Платформа' },
        product_id: { label: 'Товар (product_id)' },
        price: { label: 'Цена', isDisabled: true },
        old_price: { label: 'Старая цена', isDisabled: true },
        currency: { label: 'Валюта' },
        is_available: { label: 'Доступен' },
        is_valid: { label: 'Валиден' },
        invalid_reason: { label: 'Причина недоступности' },
        imported_at: { label: 'Дата импорта' },
        raw_payload: { isVisible: { list: false, show: false, edit: false, filter: false } },
      },
    },
  };
}
