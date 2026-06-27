import { ApiProperty } from '@nestjs/swagger';

export class ErrorDetail {
  @ApiProperty()
  field?: string;

  @ApiProperty()
  message: string;
}

export class ErrorBody {
  @ApiProperty()
  code: string;

  @ApiProperty()
  message: string;

  @ApiProperty({ type: [ErrorDetail], required: false })
  details?: ErrorDetail[];
}

export class ErrorResponseDto {
  @ApiProperty({ type: ErrorBody })
  error: ErrorBody;
}
