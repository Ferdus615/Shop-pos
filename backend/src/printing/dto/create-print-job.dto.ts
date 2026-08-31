import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsObject } from 'class-validator';
import { PrintJobType } from '../../common/enums/print-job-type.enum';

export class CreatePrintJobDto {
  @ApiProperty({ enum: PrintJobType })
  @IsEnum(PrintJobType)
  type: PrintJobType;

  /**
   * Slip contents. Deliberately unvalidated beyond "is an object": the bridge
   * owns the receipt layout, so adding a field to a slip should not require a
   * backend release. The bridge treats every field as untrusted.
   */
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Receipt or kitchen-ticket contents, rendered by the bridge',
  })
  @IsObject()
  payload: Record<string, unknown>;
}
