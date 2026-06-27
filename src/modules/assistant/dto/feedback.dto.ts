import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum } from 'class-validator';

export class FeedbackRequestDto {
  @ApiProperty()
  @IsString()
  request_id: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  session_id?: string;

  @ApiProperty({ enum: ['like', 'dislike'] })
  @IsEnum(['like', 'dislike'])
  feedback: 'like' | 'dislike';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  comment?: string;
}
