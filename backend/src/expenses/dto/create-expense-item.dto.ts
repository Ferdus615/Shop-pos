import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateExpenseItemDto {
  @ApiProperty({ example: 'Chicken' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @ApiProperty({ description: 'Category this item is filed under' })
  @IsUUID()
  categoryId: string;

  @ApiPropertyOptional({
    example: 'kg',
    default: 'pcs',
    description: 'How the item is measured: kg, g, ltr, ml, pcs, pack…',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unit?: string;

  @ApiPropertyOptional({
    example: 220,
    description: 'Price per unit, used to pre-fill an entry amount.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  defaultUnitPrice?: number | null;

  @ApiPropertyOptional({
    default: true,
    description: 'Retired items keep their history but leave the pick lists.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
