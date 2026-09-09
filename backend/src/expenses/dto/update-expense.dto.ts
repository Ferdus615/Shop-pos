import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { CreateExpenseDto } from './create-expense.dto';

/**
 * Every field is optional, including the item: editing an entry recorded
 * before the item catalogue existed must not force an item onto it.
 */
export class UpdateExpenseDto extends PartialType(CreateExpenseDto) {
  @ApiPropertyOptional({ description: 'Move the entry to a different item' })
  @IsOptional()
  @IsUUID()
  itemId?: string;
}
