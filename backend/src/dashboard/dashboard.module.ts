import { Module } from '@nestjs/common';
import { ExpensesModule } from '../expenses/expenses.module';
import { OrdersModule } from '../orders/orders.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [OrdersModule, ExpensesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
