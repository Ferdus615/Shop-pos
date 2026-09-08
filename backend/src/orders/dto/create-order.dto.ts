import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '../../common/enums/payment-method.enum';

export class OrderLineDto {
  @ApiProperty({ description: 'Menu item id' })
  @IsUUID()
  menuItemId: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateOrderDto {
  @ApiProperty({ type: [OrderLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  items: OrderLineDto[];

  @ApiProperty({
    enum: PaymentMethod,
    example: PaymentMethod.CASH,
    description:
      'How the customer is expected to pay. Orders start unpaid, and the' +
      ' method can be confirmed or changed when the bill is settled.',
  })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({
    example: '7',
    description:
      'Table this order is for. Omit for a counter or takeaway sale. If the' +
      ' table already has an unpaid bill, these items are added to it' +
      ' instead of starting a second one.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  tableNumber?: string;

  @ApiPropertyOptional({ example: 0, description: 'Flat discount amount' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discount?: number;

  @ApiPropertyOptional({
    example: true,
    description:
      'Whether the customer is paying as the order is rung up. The usual' +
      ' case, so the till sends it true; false leaves the order unpaid for a' +
      ' table that settles later. Paying a table that already has an open' +
      ' bill settles that whole bill, since a table has only one.',
  })
  @IsOptional()
  @IsBoolean()
  markPaid?: boolean;

  @ApiPropertyOptional({ example: 0, description: 'Flat tax amount' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  tax?: number;
}
