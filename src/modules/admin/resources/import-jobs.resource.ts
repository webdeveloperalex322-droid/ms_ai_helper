import { CityImportService } from '../../catalog-import/services/city-import.service';
import { ProductImportService } from '../../catalog-import/services/product-import.service';
import { createCityImportAction, createProductImportAction } from '../actions/trigger-import.action';

export function importJobsResource(
  db: any,
  cityImportService: CityImportService,
  productImportService: ProductImportService,
  defaultRn: string,
) {
  return {
    resource: db.table('import_jobs'),
    options: {
      navigation: { name: 'Импорт', icon: 'Upload' },
      actions: {
        new: { isAccessible: false },
        edit: { isAccessible: false },
        // Enabled so operators can cancel a running import: deleting the job row is
        // the cancellation signal the import loop polls for (ImportJobService.exists).
        delete: { isAccessible: true },
        'trigger-city-import': createCityImportAction(cityImportService, defaultRn),
        'trigger-product-import': createProductImportAction(productImportService, defaultRn),
      },
      listProperties: ['job_type', 'rn', 'br', 'status', 'started_at', 'finished_at'],
      filterProperties: ['job_type', 'status', 'rn'],
      showProperties: ['id', 'job_type', 'rn', 'br', 'target', 'status', 'started_at', 'finished_at', 'stats', 'error'],
      properties: {
        id: { label: 'ID' },
        job_type: { label: 'Тип задания' },
        rn: { label: 'Торговая сеть (rn)' },
        br: { label: 'Город (br)' },
        target: { label: 'Платформа' },
        status: { label: 'Статус' },
        started_at: { label: 'Запущено' },
        finished_at: { label: 'Завершено' },
        stats: { label: 'Статистика (JSON)', type: 'textarea' },
        error: { label: 'Ошибка' },
      },
    },
  };
}
