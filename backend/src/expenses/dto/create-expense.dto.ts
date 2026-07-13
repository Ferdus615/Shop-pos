import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  MinLength,
} from 'class-validator';

export class CreateExpenseDto {
  @ApiProperty({ example: 'July shop rent' })
  @IsString()
  @MinLength(1)
  title: string;

  @ApiProperty({ example: 1200.0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;

  @ApiPropertyOptional({
    example: '2026-07-12',
    description: 'Date of the expense. Defaults to today.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'expenseDate must be YYYY-MM-DD' })
  expenseDate?: string;

  @ApiPropertyOptional({ description: 'Expense category id' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ example: 'Paid via bank transfer' })
  @IsOptional()
  @IsString()
  note?: string;
}
