import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentShop } from '../common/decorators/current-shop.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CreateExpenseItemDto } from './dto/create-expense-item.dto';
import { QueryExpenseItemsDto } from './dto/query-expense-items.dto';
import { UpdateExpenseItemDto } from './dto/update-expense-item.dto';
import { ExpenseItemsService } from './expense-items.service';

@ApiTags('expense-items')
@ApiBearerAuth()
@Roles(Role.OWNER)
@Controller('expenses/items')
export class ExpenseItemsController {
  constructor(private readonly itemsService: ExpenseItemsService) {}

  @Post()
  @ApiOperation({ summary: 'Add an item to a category' })
  create(@Body() dto: CreateExpenseItemDto, @CurrentShop() shopId: string) {
    return this.itemsService.create(dto, shopId);
  }

  @Get()
  @ApiOperation({ summary: 'List catalogued items, optionally by category' })
  findAll(@Query() query: QueryExpenseItemsDto, @CurrentShop() shopId: string) {
    return this.itemsService.findAll(query, shopId);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentShop() shopId: string,
  ) {
    return this.itemsService.findOne(id, shopId);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseItemDto,
    @CurrentShop() shopId: string,
  ) {
    return this.itemsService.update(id, dto, shopId);
  }

  /**
   * 200, not 204: an item with purchases behind it is retired rather than
   * deleted, and the client has to be able to tell the two apart.
   */
  @Delete(':id')
  @ApiOperation({
    summary: 'Delete an unused item, or retire one that has purchases',
  })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentShop() shopId: string,
  ) {
    return this.itemsService.remove(id, shopId);
  }
}
