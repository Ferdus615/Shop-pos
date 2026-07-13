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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CreateExpenseDto } from './dto/create-expense.dto';
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
  getSummary(@Query() query: ExpenseSummaryQueryDto) {
    return this.expensesService.getMonthlySummary(query.month);
  }

  @Post()
  create(@Body() dto: CreateExpenseDto, @CurrentUser('id') userId: string) {
    return this.expensesService.create(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'List expenses (defaults to the current month)' })
  findAll(@Query() query: QueryExpensesDto) {
    return this.expensesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.expensesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expensesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.expensesService.remove(id);
  }
}
