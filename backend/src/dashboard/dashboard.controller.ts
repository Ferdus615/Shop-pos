import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentShop } from '../common/decorators/current-shop.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Roles(Role.OWNER)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({
    summary:
      'Owner dashboard: sales, expenses and net profit for the day, its month' +
      ' and its year, plus a month-by-month trend for the year',
  })
  getOverview(
    @Query() query: DashboardQueryDto,
    @CurrentShop() shopId: string,
  ) {
    return this.dashboardService.getOverview(shopId, query.date);
  }
}
