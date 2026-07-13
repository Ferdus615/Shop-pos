import { Injectable } from '@nestjs/common';
import { formatMonth, parseDayRange, round2 } from '../common/utils/date.util';
import { ExpensesService } from '../expenses/expenses.service';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly expensesService: ExpensesService,
  ) {}

  /**
   * At-a-glance snapshot: the day's sales plus the month-to-date sales,
   * expenses and net profit.
   */
  async getOverview(date?: string) {
    const { start, day } = parseDayRange(date);
    const month = formatMonth(start);

    const [todaySales, monthlySalesTotal, monthlyExpenseSummary] =
      await Promise.all([
        this.ordersService.getSalesSummary(day),
        this.ordersService.getMonthlySalesTotal(month),
        this.expensesService.getMonthlySummary(month),
      ]);

    const netProfit = round2(
      monthlySalesTotal - monthlyExpenseSummary.totalExpenses,
    );

    return {
      date: day,
      month,
      today: todaySales,
      monthToDate: {
        totalSales: monthlySalesTotal,
        totalExpenses: monthlyExpenseSummary.totalExpenses,
        netProfit,
        expensesByCategory: monthlyExpenseSummary.byCategory,
      },
    };
  }
}
