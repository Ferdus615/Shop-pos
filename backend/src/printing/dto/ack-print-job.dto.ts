import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** The bridge's verdict on a claimed job. */
export class AckPrintJobDto {
  @ApiProperty({ description: 'Did the slip actually reach the paper?' })
  @IsBoolean()
  success: boolean;

  @ApiPropertyOptional({ description: 'Failure reason when success is false' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  error?: string;
}
