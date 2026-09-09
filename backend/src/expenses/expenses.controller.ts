import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentShop } from '../common/decorators/current-shop.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateExpensesBulkDto } from './dto/create-expenses-bulk.dto';
import { ExpenseDaysQueryDto } from './dto/expense-days-query.dto';
import { ExpenseSummaryQueryDto } from './dto/expense-summary-query.dto';
import { QueryExpensesDto } from './dto/query-expenses.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpensesService } from './expenses.service';

@ApiTags('expenses')
@ApiBearerAuth()
@Roles(Role.OWNER)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  // Declared before ':id' so it is not captured by the param route.
  @Get('summary')
  @ApiOperation({ summary: 'Monthly expense summary (defaults to this month)' })
  getSummary(
    @Query() query: ExpenseSummaryQueryDto,
    @CurrentShop() shopId: string,
  ) {
    return this.expensesService.getMonthlySummary(shopId, query.month);
  }

  @Get('days')
  @ApiOperation({
    summary: "A month's days that have spending, newest first",
  })
  getDays(@Query() query: ExpenseDaysQueryDto, @CurrentShop() shopId: string) {
    return this.expensesService.getDays(shopId, query.month);
  }

  @Post('bulk')
  @ApiOperation({ summary: "Save a day's basket of items in one go" })
  createMany(
    @Body() dto: CreateExpensesBulkDto,
    @CurrentUser('id') userId: string,
    @CurrentShop() shopId: string,
  ) {
    return this.expensesService.createMany(dto, userId, shopId);
  }

  @Post()
  @ApiOperation({ summary: 'Record one purchase of a catalogued item' })
  create(
    @Body() dto: CreateExpenseDto,
    @CurrentUser('id') userId: string,
    @CurrentShop() shopId: string,
  ) {
    return this.expensesService.create(dto, userId, shopId);
  }

  @Get()
  @ApiOperation({
    summary:
      'List expenses for a day (`date`) or a month (defaults to this month)',
  })
  findAll(@Query() query: QueryExpensesDto, @CurrentShop() shopId: string) {
    return this.expensesService.findAll(query, shopId);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentShop() shopId: string,
  ) {
    return this.expensesService.findOne(id, shopId);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseDto,
    @CurrentShop() shopId: string,
  ) {
    return this.expensesService.update(id, dto, shopId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentShop() shopId: string,
  ) {
    return this.expensesService.remove(id, shopId);
  }
}
