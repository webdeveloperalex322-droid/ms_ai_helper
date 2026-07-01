export function citiesResource(db: any) {
  return {
    resource: db.table('cities'),
    options: {
      navigation: { name: 'Справочники', icon: 'Location' },
      actions: {
        new: { isAccessible: false },
        edit: { isAccessible: false },
        delete: { isAccessible: false },
      },
      listProperties: ['name', 'br', 'rn', 'is_active'],
      filterProperties: ['rn', 'is_active'],
      properties: {
        id: { label: 'ID' },
        rn: { label: 'Торговая сеть (rn)' },
        br: { label: 'GUID города (br)' },
        name: { label: 'Название' },
        is_active: { label: 'Активен' },
      },
    },
  };
}
