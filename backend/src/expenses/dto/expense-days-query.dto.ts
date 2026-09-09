import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

export class ExpenseDaysQueryDto {
  @ApiPropertyOptional({
    example: '2026-09',
    description:
      'Month to list days for (YYYY-MM). Defaults to the current month.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be YYYY-MM' })
  month?: string;
}
