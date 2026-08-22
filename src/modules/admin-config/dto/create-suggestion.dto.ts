import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class SuggestionSlotsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferred_ingredients?: string[];

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excluded_ingredients?: string[];

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  budget_max?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  spicy?: boolean | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  people_count?: number | null;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excluded_product_names?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  scenario?: string;
}

export class SuggestionPayloadDto {
  @ApiProperty()
  @IsString()
  intent: string;

  @ApiProperty({ type: SuggestionSlotsDto })
  @ValidateNested()
  @Type(() => SuggestionSlotsDto)
  slots: SuggestionSlotsDto;

  @ApiProperty()
  @IsString()
  retrieval_query: string;
}

export class AvailabilityRulesDto {
  @ApiProperty()
  @IsBoolean()
  check_products_exist: boolean;

  @ApiProperty()
  @IsInt()
  min_products_count: number;

  @ApiProperty()
  @IsBoolean()
  hide_if_empty: boolean;

  @ApiProperty()
  @IsBoolean()
  respect_city_availability: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  respect_price?: boolean;
}

export class FallbackPayloadDto {
  @ApiProperty()
  @IsString()
  reply_text: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  quick_replies: string[];
}

export class CreateSuggestionDto {
  @ApiProperty({ example: 'A79C5050-1EE7-11EB-9B6E-05B5FC40DF2A' })
  @IsUUID()
  rn: string;

  @ApiProperty()
  @IsString()
  code: string;

  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  emoji?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  screenContext?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  target?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  activeFrom?: Date;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  activeTo?: Date;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedBr?: string[];

  @ApiProperty({ type: SuggestionPayloadDto })
  @ValidateNested()
  @Type(() => SuggestionPayloadDto)
  payload: SuggestionPayloadDto;

  @ApiProperty({ type: AvailabilityRulesDto })
  @ValidateNested()
  @Type(() => AvailabilityRulesDto)
  availabilityRules: AvailabilityRulesDto;

  @ApiProperty({ required: false, type: FallbackPayloadDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => FallbackPayloadDto)
  fallbackPayload?: FallbackPayloadDto;
}
