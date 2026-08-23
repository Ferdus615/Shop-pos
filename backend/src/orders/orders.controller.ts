import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentShop } from '../common/decorators/current-shop.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { SalesSummaryQueryDto } from './dto/sales-summary-query.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // Ring up a sale: owner + staff.
  @Post()
  @ApiOperation({ summary: 'Create a sale (POS)' })
  create(
    @Body() dto: CreateOrderDto,
    @CurrentUser('id') userId: string,
    @CurrentShop() shopId: string,
  ) {
    return this.ordersService.create(dto, userId, shopId);
  }

  // Daily sales summary: owner only. Declared before ':id' to avoid clashing.
  @Get('summary')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Daily sales summary (defaults to today)' })
  getSummary(
    @Query() query: SalesSummaryQueryDto,
    @CurrentShop() shopId: string,
  ) {
    return this.ordersService.getSalesSummary(shopId, query.date);
  }

  @Get()
  @ApiOperation({ summary: 'List orders, filterable by date range' })
  findAll(@Query() query: QueryOrdersDto, @CurrentShop() shopId: string) {
    return this.ordersService.findAll(query, shopId);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentShop() shopId: string,
  ) {
    return this.ordersService.findOne(id, shopId);
  }

  @Post(':id/void')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Void an order (owner only)' })
  void(@Param('id', ParseUUIDPipe) id: string, @CurrentShop() shopId: string) {
    return this.ordersService.void(id, shopId);
  }

  @Post(':id/refund')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Refund an order (owner only)' })
  refund(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentShop() shopId: string,
  ) {
    return this.ordersService.refund(id, shopId);
  }
}
