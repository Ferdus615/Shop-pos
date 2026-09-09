import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';

/**
 * One recorded purchase of a catalogued item.
 *
 * The item is required: spending is entered by picking something off the
 * category's item list, not by typing a name, so that each item carries its
 * own history. The title and category are taken from the item.
 *
 * `amount` may be omitted when `quantity` and `unitPrice` are both given — the
 * service multiplies them. Sending `amount` as well wins, so an odd price paid
 * on the day can still be recorded exactly.
 */
export class CreateExpenseDto {
  @ApiProperty({ description: 'Expense item being bought' })
  @IsUUID()
  itemId: string;

  @ApiPropertyOptional({
    example: 480,
    description:
      'Total spent. Optional when quantity and unitPrice are both given.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ example: 1.5, description: 'How much was bought.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  quantity?: number | null;

  @ApiPropertyOptional({
    example: 320,
    description: "Price per unit. Defaults to the item's default price.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number | null;

  @ApiPropertyOptional({
    example: 'kg',
    description: "Unit for the quantity. Defaults to the item's unit.",
  })
  @IsOptional()
  @IsString()
  unit?: string | null;

  @ApiPropertyOptional({
    example: '2026-09-09',
    description: 'Date of the expense. Defaults to today.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'expenseDate must be YYYY-MM-DD' })
  expenseDate?: string;

  @ApiPropertyOptional({ example: 'Bought from the morning market' })
  @IsOptional()
  @IsString()
  note?: string;
}
