import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  CatalogApiClient,
  CityApiResponse,
  ProductApiResponse,
} from './catalog-api.client.interface';

@Injectable()
export class CatalogApiHttpClient implements CatalogApiClient {
  private readonly logger = new Logger(CatalogApiHttpClient.name);
  private readonly citiesBaseUrl: string;
  private readonly catalogBaseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    this.citiesBaseUrl = config.get<string>('CITIES_API_BASE_URL')!;
    this.catalogBaseUrl = config.get<string>('CATALOG_API_BASE_URL')!;
  }

  async getCities(rn: string): Promise<CityApiResponse[]> {
    const url = `${this.citiesBaseUrl}/v1/cities?rn=${rn}`;
    this.logger.debug(`GET ${url}`);
    const response: any = await firstValueFrom(this.httpService.get<CityApiResponse[]>(url));
    return response.data;
  }

  async getProductsByCategory(
    rn: string,
    br: string,
    target: string,
    categoryId: string,
  ): Promise<ProductApiResponse[]> {
    const url = `${this.catalogBaseUrl}/v1/products?rn=${rn}&br=${br}&target=${target}&cat=${categoryId}&withArchive=false`;
    this.logger.debug(`GET ${url}`);
    const response: any = await firstValueFrom(this.httpService.get<ProductApiResponse[]>(url));
    return response.data;
  }

  async getProductsByIds(
    rn: string,
    br: string,
    target: string,
    ids: string[],
  ): Promise<ProductApiResponse[]> {
    const url = `${this.catalogBaseUrl}/v1/products/?rn=${rn}&br=${br}&target=${target}`;
    const response: any = await firstValueFrom(
      this.httpService.post<ProductApiResponse[]>(url, { ids }),
    );
    return response.data;
  }

  async getProductById(
    rn: string,
    br: string,
    target: string,
    productId: string,
  ): Promise<ProductApiResponse | null> {
    const url = `${this.catalogBaseUrl}/v1/products/${productId}?rn=${rn}&br=${br}&target=${target}&withArchive=false`;
    try {
      const response: any = await firstValueFrom(this.httpService.get<ProductApiResponse>(url));
      return response.data;
    } catch {
      return null;
    }
  }
}
