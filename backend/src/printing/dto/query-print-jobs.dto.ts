import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PrintJobStatus } from '../../common/enums/print-job-status.enum';

export class QueryPrintJobsDto {
  @ApiPropertyOptional({ enum: PrintJobStatus })
  @IsOptional()
  @IsEnum(PrintJobStatus)
  status?: PrintJobStatus;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
