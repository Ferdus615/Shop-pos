import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

/** One line of the basket. The date is shared by the whole basket. */
export class BulkExpenseLineDto {
  @ApiProperty({ description: 'Expense item being bought' })
  @IsUUID()
  itemId: string;

  @ApiPropertyOptional({
    description:
      'Total spent on this line. Optional when quantity and unitPrice are both given.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  quantity?: number | null;

  @ApiPropertyOptional({ example: 320 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number | null;

  @ApiPropertyOptional({ example: 'kg' })
  @IsOptional()
  @IsString()
  unit?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

/**
 * A day's shopping saved in one go — the basket built up item by item on the
 * screen, then committed together so a half-saved day is impossible.
 */
export class CreateExpensesBulkDto {
  @ApiPropertyOptional({
    example: '2026-09-09',
    description: 'Date every line is recorded against. Defaults to today.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'expenseDate must be YYYY-MM-DD' })
  expenseDate?: string;

  @ApiProperty({ type: [BulkExpenseLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => BulkExpenseLineDto)
  entries: BulkExpenseLineDto[];
}
