import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateMenuCategoryDto {
  @ApiProperty({ example: 'Beverages' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional({ example: 'Hot and cold drinks' })
  @IsOptional()
  @IsString()
  description?: string;
}
