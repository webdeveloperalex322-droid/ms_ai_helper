import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class ProductAnswerRequestDto {
  @ApiProperty({ required: false, example: 'site' })
  @IsOptional()
  @IsString()
  channel?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  session_id?: string;

  @ApiProperty({ example: 'A79C5050-1EE7-11EB-9B6E-05B5FC40DF2A' })
  @IsString()
  rn: string;

  @ApiProperty({ example: '11111111-1111-1111-1111-111111111111' })
  @IsString()
  br: string;

  @ApiProperty({ example: 'WEB', enum: ['WEB', 'MOBILE'] })
  @IsOptional()
  @IsString()
  target?: string;

  @ApiProperty({ required: false, example: 'catalog' })
  @IsOptional()
  @IsString()
  screen_context?: string;

  @ApiProperty({ required: false, example: 'Подбери сет на двоих до 1500 без креветки' })
  @IsOptional()
  @IsString()
  user_message?: string;

  @ApiProperty({ required: false, description: 'UUID of preset suggestion' })
  @IsOptional()
  @IsString()
  suggestion_id?: string;
}
