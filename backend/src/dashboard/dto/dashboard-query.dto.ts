import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

export class DashboardQueryDto {
  @ApiPropertyOptional({
    example: '2026-07-12',
    description: 'Reference day (YYYY-MM-DD). Defaults to today.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date?: string;
}
