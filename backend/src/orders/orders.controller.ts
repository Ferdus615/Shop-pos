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
import { PayOrderDto } from './dto/pay-order.dto';
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

  // Owner + staff: staff work the sales page to settle and serve orders, so
  // they see the same day's figures. Declared before ':id' to avoid clashing.
  @Get('summary')
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

  // --- Settling and serving: owner + staff, this is floor work ---

  @Post(':id/pay')
  @ApiOperation({ summary: 'Mark an order paid, confirming how they paid' })
  pay(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayOrderDto,
    @CurrentShop() shopId: string,
  ) {
    return this.ordersService.pay(id, dto, shopId);
  }

  /**
   * Undoing a payment is owner-only: it corrects a mis-click, and letting
   * anyone move an order back out of the day's takings is not floor work.
   */
  @Post(':id/unpay')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Undo a payment marked in error (owner only)' })
  unpay(@Param('id', ParseUUIDPipe) id: string, @CurrentShop() shopId: string) {
    return this.ordersService.unpay(id, shopId);
  }

  @Post(':id/serve')
  @ApiOperation({ summary: 'Mark the food as served' })
  serve(@Param('id', ParseUUIDPipe) id: string, @CurrentShop() shopId: string) {
    return this.ordersService.setServed(id, true, shopId);
  }

  @Post(':id/unserve')
  @ApiOperation({ summary: 'Take back a premature "served"' })
  unserve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentShop() shopId: string,
  ) {
    return this.ordersService.setServed(id, false, shopId);
  }
}
