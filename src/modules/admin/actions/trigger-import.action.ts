import { CityImportService } from '../../catalog-import/services/city-import.service';
import { ProductImportService } from '../../catalog-import/services/product-import.service';
import { CategoryImportService } from '../../catalog-import/services/category-import.service';
import { AttributeImportService } from '../../catalog-import/services/attribute-import.service';

export function createCityImportAction(cityImportService: CityImportService, defaultRn: string) {
  return {
    actionType: 'resource',
    icon: 'Play',
    label: 'Запустить импорт городов',
    component: false,
    isAccessible: true,
    handler: async (request: any, _response: any, context: any) => {
      const rn = request.payload?.rn || defaultRn;
      try {
        const result = await cityImportService.importCities(rn);
        return {
          notice: {
            message: `Импорт городов запущен. Job ID: ${result.jobId}, импортировано: ${result.imported}`,
            type: 'success',
          },
          redirectUrl: `${context._admin.options.rootPath}/resources/import_jobs`,
        };
      } catch (err: any) {
        return { notice: { message: `Ошибка импорта городов: ${err.message}`, type: 'error' } };
      }
    },
  };
}

export function createCategoryImportAction(
  categoryImportService: CategoryImportService,
  defaultRn: string,
) {
  return {
    actionType: 'resource',
    icon: 'Tag',
    label: 'Запустить импорт категорий',
    component: false,
    isAccessible: true,
    handler: async (request: any, _response: any, context: any) => {
      const payload = request.payload || {};
      const rn = payload.rn || defaultRn;
      const target = payload.target || 'WEB';
      const slug = payload.slug || undefined;
      try {
        const result = await categoryImportService.importCategories({ rn, target, slug });
        return {
          notice: {
            message: `Импорт категорий запущен. Job ID: ${result.jobId}, импортировано: ${result.imported}, ошибок: ${result.errors}, городов: ${result.cities}`,
            type: 'success',
          },
          redirectUrl: `${context._admin.options.rootPath}/resources/import_jobs`,
        };
      } catch (err: any) {
        return { notice: { message: `Ошибка импорта категорий: ${err.message}`, type: 'error' } };
      }
    },
  };
}

export function createProductImportAction(
  productImportService: ProductImportService,
  defaultRn: string,
) {
  return {
    actionType: 'resource',
    icon: 'Refresh',
    label: 'Запустить импорт товаров',
    component: false,
    isAccessible: true,
    handler: async (request: any, _response: any, context: any) => {
      const payload = request.payload || {};
      const rn = payload.rn || defaultRn;
      const target = payload.target || 'WEB';
      try {
        const result = await productImportService.importProducts({ rn, target, mode: 'full' });
        return {
          notice: {
            message: `Импорт товаров запущен. Job ID: ${result.jobId}, импортировано: ${result.imported}`,
            type: 'success',
          },
          redirectUrl: `${context._admin.options.rootPath}/resources/import_jobs`,
        };
      } catch (err: any) {
        return { notice: { message: `Ошибка импорта товаров: ${err.message}`, type: 'error' } };
      }
    },
  };
}

export function createAttributeImportAction(
  attributeImportService: AttributeImportService,
  defaultRn: string,
) {
  return {
    actionType: 'resource',
    icon: 'List',
    label: 'Запустить импорт атрибутов',
    component: false,
    isAccessible: true,
    handler: async (request: any, _response: any, context: any) => {
      const rn = request.payload?.rn || defaultRn;
      try {
        const result = await attributeImportService.importAttributes(rn);
        return {
          notice: {
            message: `Импорт атрибутов завершён. Job ID: ${result.jobId}, импортировано: ${result.imported}`,
            type: 'success',
          },
          redirectUrl: `${context._admin.options.rootPath}/resources/import_jobs`,
        };
      } catch (err: any) {
        return { notice: { message: `Ошибка импорта атрибутов: ${err.message}`, type: 'error' } };
      }
    },
  };
}
