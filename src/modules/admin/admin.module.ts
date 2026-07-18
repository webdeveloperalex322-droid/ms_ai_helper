import { Module, OnModuleInit, Logger } from '@nestjs/common';
import * as path from 'path';
import { createHash, timingSafeEqual } from 'node:crypto';
import { HttpAdapterHost } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { CatalogImportModule } from '../catalog-import/catalog-import.module';
import { CityImportService } from '../catalog-import/services/city-import.service';
import { ProductImportService } from '../catalog-import/services/product-import.service';
import { CategoryImportService } from '../catalog-import/services/category-import.service';
import { AttributeImportService } from '../catalog-import/services/attribute-import.service';
import { productsResource } from './resources/products.resource';
import { cityProductsResource } from './resources/city-products.resource';
import { adminRulesResource } from './resources/admin-rules.resource';
import { suggestionsResource } from './resources/suggestions.resource';
import { importJobsResource } from './resources/import-jobs.resource';
import { citiesResource } from './resources/cities.resource';
import { categoriesResource } from './resources/categories.resource';
import { productAttributesResource } from './resources/product-attributes.resource';

// Bypass TypeScript's import()->require() compilation for ESM-only packages
const esmImport = new Function('modulePath', 'return import(modulePath)') as (
  m: string,
) => Promise<any>;

/**
 * Constant-time string comparison. Hashing first equalises the lengths —
 * timingSafeEqual throws when the buffers differ in size, and a thrown error
 * would itself be a distinguishable path.
 */
function safeEquals(a: string, b: string): boolean {
  const left = createHash('sha256')
    .update(a ?? '', 'utf8')
    .digest();
  const right = createHash('sha256')
    .update(b ?? '', 'utf8')
    .digest();
  return timingSafeEqual(left, right);
}

@Module({
  imports: [CatalogImportModule],
})
export class AdminModule implements OnModuleInit {
  private readonly logger = new Logger(AdminModule.name);

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly configService: ConfigService,
    private readonly cityImportService: CityImportService,
    private readonly productImportService: ProductImportService,
    private readonly categoryImportService: CategoryImportService,
    private readonly attributeImportService: AttributeImportService,
  ) {}

  async onModuleInit() {
    const databaseUrl = this.configService.get<string>('DATABASE_URL')!;
    const adminUser = this.configService.get<string>('ADMIN_USER')!;
    const adminPassword = this.configService.get<string>('ADMIN_PASSWORD')!;
    const cookieSecret = this.configService.get<string>('ADMIN_COOKIE_SECRET')!;
    const defaultRn = this.configService.get<string>('DEFAULT_RN')!;

    const dbUrlParsed = new URL(databaseUrl);
    const database = dbUrlParsed.pathname.slice(1);

    const { default: AdminJS, ComponentLoader } = await esmImport('adminjs');
    const { Database, Resource, Adapter } = await esmImport('@adminjs/sql');
    const { buildAuthenticatedRouter } = await esmImport('@adminjs/fastify');

    AdminJS.registerAdapter({ Database, Resource });

    const db = await new Adapter('postgresql', {
      connectionString: databaseUrl,
      database,
    }).init();

    const componentLoader = new ComponentLoader();
    const imagePreviewComponent = componentLoader.add(
      'ImagePreview',
      path.resolve(process.cwd(), 'src/modules/admin/components/image-preview'),
    );
    const attributesShowComponent = componentLoader.add(
      'AttributesShow',
      path.resolve(process.cwd(), 'src/modules/admin/components/attributes-show'),
    );
    const ingredientsShowComponent = componentLoader.add(
      'IngredientsShow',
      path.resolve(process.cwd(), 'src/modules/admin/components/ingredients-show'),
    );

    const admin = new AdminJS({
      rootPath: '/admin',
      componentLoader,
      resources: [
        productsResource(db, {
          imagePreview: imagePreviewComponent,
          attributesShow: attributesShowComponent,
          ingredientsShow: ingredientsShowComponent,
        }),
        cityProductsResource(db),
        adminRulesResource(db),
        suggestionsResource(db),
        importJobsResource(
          db,
          this.cityImportService,
          this.productImportService,
          this.categoryImportService,
          this.attributeImportService,
          defaultRn,
        ),
        citiesResource(db),
        categoriesResource(db),
        productAttributesResource(db),
      ],
      branding: {
        companyName: 'Sushi Master Admin',
        logo: false,
        favicon: '',
      },
    });

    if (process.env.NODE_ENV === 'production') {
      await admin.initialize();
    } else {
      await admin.watch();
    }

    const { httpAdapter } = this.httpAdapterHost;
    const fastify = httpAdapter.getInstance();

    // NestJS Fastify adapter pre-registers application/x-www-form-urlencoded;
    // @adminjs/fastify also registers it via @fastify/formbody — remove first to avoid conflict
    fastify.removeContentTypeParser('application/x-www-form-urlencoded');

    const isProduction = process.env.NODE_ENV === 'production';

    await buildAuthenticatedRouter(
      admin,
      {
        authenticate: async (email: string, password: string) => {
          // Both comparisons always run and neither short-circuits, so the
          // response time says nothing about which half was wrong. A single
          // null return keeps the failure reason opaque to the caller too.
          const emailOk = safeEquals(email, adminUser);
          const passwordOk = safeEquals(password, adminPassword);
          return emailOk && passwordOk ? { email } : null;
        },
        cookieName: 'adminjs',
        cookiePassword: cookieSecret,
      },
      fastify,
      {
        cookie: {
          // nginx terminates TLS in production, so the session cookie must not
          // be allowed to travel over plain HTTP. Tied to the mode rather than
          // hardcoded true, so local HTTP development still works.
          secure: isProduction,
          httpOnly: true,
          sameSite: 'lax',
        },
      },
    );

    this.logger.log('AdminJS panel mounted at /admin');
  }
}
