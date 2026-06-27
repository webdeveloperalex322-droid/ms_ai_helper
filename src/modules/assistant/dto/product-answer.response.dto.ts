import { ApiProperty } from '@nestjs/swagger';

export class ProductCardDto {
  @ApiProperty()
  product_id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  price: number;

  @ApiProperty({ example: 'RUB' })
  currency: string;

  @ApiProperty({ required: false })
  image_url?: string;

  @ApiProperty()
  reason: string;

  @ApiProperty({ example: 'show_product_card' })
  ui_action: string;
}

export class ProductAnswerResponseDto {
  @ApiProperty()
  request_id: string;

  @ApiProperty()
  reply_text: string;

  @ApiProperty({ type: [ProductCardDto] })
  cards: ProductCardDto[];

  @ApiProperty({ type: [String] })
  quick_replies: string[];

  @ApiProperty({ type: [Object] })
  actions: any[];

  @ApiProperty()
  need_clarification: boolean;

  @ApiProperty({ required: false, nullable: true })
  clarification_question?: string | null;

  @ApiProperty({ required: false, nullable: true })
  debug?: any;
}
