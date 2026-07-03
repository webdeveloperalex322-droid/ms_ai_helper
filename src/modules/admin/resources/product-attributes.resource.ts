export function productAttributesResource(db: any) {
  return {
    resource: db.table('product_attributes'),
    options: {
      navigation: { name: 'Справочники', icon: 'Tag' },
      actions: {
        new: { isAccessible: false },
        edit: { isAccessible: false },
        delete: { isAccessible: false },
      },
      listProperties: ['name', 'group_name', 'rn', 'is_active', 'updated_at'],
      filterProperties: ['name', 'group_name', 'rn', 'is_active'],
      showProperties: ['id', 'rn', 'external_id', 'name', 'group_name', 'is_active', 'updated_at'],
      properties: {
        id: { label: 'ID' },
        rn: { label: 'Торговая сеть (rn)' },
        external_id: { label: 'Внешний ID' },
        name: { label: 'Название' },
        group_name: { label: 'Группа' },
        is_active: { label: 'Активен' },
        raw_payload: { isVisible: { list: false, show: false, edit: false, filter: false } },
        updated_at: { label: 'Обновлён' },
      },
    },
  };
}
