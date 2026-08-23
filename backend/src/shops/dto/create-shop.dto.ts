import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** The first OWNER account, created together with the shop. */
export class CreateShopOwnerDto {
  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'jane@navalbay.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'secret123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;
}

export class CreateShopDto {
  @ApiProperty({ example: 'Naval Bay' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({
    example: 'naval-bay',
    description: 'Lowercase letters, numbers and hyphens only.',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'slug must contain only lowercase letters, numbers and single hyphens',
  })
  slug: string;

  @ApiPropertyOptional({ example: 'Sector-7, Road-5, Uttara, Dhaka' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: '+8801700000000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ type: CreateShopOwnerDto })
  @IsObject()
  @ValidateNested()
  @Type(() => CreateShopOwnerDto)
  owner: CreateShopOwnerDto;
}
