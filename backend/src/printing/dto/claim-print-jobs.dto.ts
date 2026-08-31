import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Sent by the bridge on every poll. Doubles as the station's heartbeat, so a
 * bridge that is running but idle still reports the printer as reachable.
 */
export class ClaimPrintJobsDto {
  @ApiPropertyOptional({ description: 'Station label, e.g. "Counter PC"' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ description: 'Is the printer port currently open?' })
  @IsOptional()
  @IsBoolean()
  printerConnected?: boolean;

  @ApiPropertyOptional({ description: 'Printer-side error, if any' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  lastError?: string;

  @ApiPropertyOptional({ default: 5, description: 'Max jobs to claim' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}
