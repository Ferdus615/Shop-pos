import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

export class ExpenseSummaryQueryDto {
  @ApiPropertyOptional({
    example: '2026-07',
    description: 'Month to summarise (YYYY-MM). Defaults to the current month.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be YYYY-MM' })
  month?: string;
}
