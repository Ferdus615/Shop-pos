import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, Matches } from 'class-validator';

export class QueryExpensesDto {
  @ApiPropertyOptional({
    example: '2026-09-09',
    description:
      'Filter to a single day (YYYY-MM-DD). Takes precedence over `month`.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date?: string;

  @ApiPropertyOptional({
    example: '2026-09',
    description: 'Filter by month (YYYY-MM). Defaults to the current month.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be YYYY-MM' })
  month?: string;

  @ApiPropertyOptional({ description: 'Filter by category id' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Filter by item id' })
  @IsOptional()
  @IsUUID()
  itemId?: string;
}
