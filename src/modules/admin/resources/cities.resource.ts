export function citiesResource(db: any) {
  return {
    resource: db.table('cities'),
    options: {
      navigation: { name: 'Справочники', icon: 'Location' },
      actions: {
        new: { isAccessible: false },
        delete: { isAccessible: false },
      },
      listProperties: ['name', 'br', 'rn', 'is_active'],
      filterProperties: ['rn', 'is_active'],
      editProperties: ['is_active'],
      properties: {
        id: { label: 'ID', isVisible: { edit: false } },
        rn: { label: 'Торговая сеть (rn)', isVisible: { edit: false } },
        br: { label: 'GUID города (br)', isVisible: { edit: false } },
        name: { label: 'Название', isVisible: { edit: false } },
        is_active: { label: 'Активен' },
        slug: { isVisible: { edit: false } },
        imported_at: { isVisible: { edit: false } },
        raw_payload: { isVisible: { list: false, show: false, edit: false, filter: false } },
      },
    },
  };
}
