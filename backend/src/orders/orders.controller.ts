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
  create(@Body() dto: CreateOrderDto, @CurrentUser('id') userId: string) {
    return this.ordersService.create(dto, userId);
  }

  // Daily sales summary: owner only. Declared before ':id' to avoid clashing.
  @Get('summary')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Daily sales summary (defaults to today)' })
  getSummary(@Query() query: SalesSummaryQueryDto) {
    return this.ordersService.getSalesSummary(query.date);
  }

  @Get()
  @ApiOperation({ summary: 'List orders, filterable by date range' })
  findAll(@Query() query: QueryOrdersDto) {
    return this.ordersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.findOne(id);
  }

  @Post(':id/void')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Void an order (owner only)' })
  void(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.void(id);
  }
}
