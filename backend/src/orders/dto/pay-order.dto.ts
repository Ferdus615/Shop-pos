import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { PaymentMethod } from '../../common/enums/payment-method.enum';

export class PayOrderDto {
  @ApiPropertyOptional({
    enum: PaymentMethod,
    description:
      'How the customer actually paid. Defaults to the method recorded when' +
      ' the order was rung up — for a table that settles later, this is the' +
      ' moment the real method is known.',
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    example: 500,
    description:
      'Cash handed over, for the change line on the receipt. Recorded' +
      ' nowhere — the receipt is printed by the client.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  receivedAmount?: number;
}
