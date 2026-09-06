import { Injectable } from '@nestjs/common';
import {
  formatMonth,
  formatYear,
  parseDayRange,
  round2,
} from '../common/utils/date.util';
import { ExpensesService } from '../expenses/expenses.service';
import { OrdersService } from '../orders/orders.service';
import {
  DashboardOverview,
  PeriodOverview,
} from './interfaces/overview.interface';

@Injectable()
export class DashboardService {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly expensesService: ExpensesService,
  ) {}

  /**
   * The owner's snapshot around one reference day: that day, its month and its
   * year, each with sales, expenses and net profit, plus a month-by-month
   * trend for the year.
   *
   * One call rather than three so the screen cannot show figures from
   * different moments — and the client does no arithmetic of its own.
   */
  async getOverview(shopId: string, date?: string): Promise<DashboardOverview> {
    const { start, day } = parseDayRange(date);
    const month = formatMonth(start);
    const year = formatYear(start);

    const [
      daySales,
      dayExpenses,
      monthSales,
      monthExpenses,
      yearSales,
      yearExpenses,
      salesSeries,
      expenseSeries,
    ] = await Promise.all([
      this.ordersService.getSalesSummary(shopId, day),
      this.expensesService.getDailySummary(shopId, day),
      this.ordersService.getMonthlySalesSummary(shopId, month),
      this.expensesService.getMonthlySummary(shopId, month),
      this.ordersService.getYearlySalesSummary(shopId, year),
      this.expensesService.getYearlySummary(shopId, year),
      this.ordersService.getMonthlySalesSeries(shopId, year),
      this.expensesService.getMonthlyExpenseSeries(shopId, year),
    ]);

    const expensesByMonth = new Map(
      expenseSeries.map((point) => [point.month, point]),
    );
    const monthlyTrend = salesSeries.map((point) => {
      const expenses = expensesByMonth.get(point.month);
      const totalExpenses = expenses?.totalExpenses ?? 0;
      return {
        month: point.month,
        orderCount: point.orderCount,
        totalSales: point.totalSales,
        totalExpenses,
        netProfit: round2(point.totalSales - totalExpenses),
      };
    });

    return {
      date: day,
      month,
      year,
      periods: {
        day: buildPeriod(day, daySales, dayExpenses),
        month: buildPeriod(month, monthSales, monthExpenses),
        year: buildPeriod(year, yearSales, yearExpenses),
      },
      monthlyTrend,
      // Kept for the original dashboard contract, which clients may still use.
      today: daySales,
      monthToDate: {
        totalSales: monthSales.totalSales,
        totalExpenses: monthExpenses.totalExpenses,
        netProfit: round2(monthSales.totalSales - monthExpenses.totalExpenses),
        expensesByCategory: monthExpenses.byCategory,
      },
    };
  }
}

/** Pair one period's sales and expenses, and derive the figures from them. */
function buildPeriod(
  label: string,
  sales: {
    orderCount: number;
    totalSales: number;
    byPaymentMethod: PeriodOverview['sales']['byPaymentMethod'];
    topItems: PeriodOverview['sales']['topItems'];
    itemsSold: PeriodOverview['sales']['itemsSold'];
  },
  expenses: {
    expenseCount: number;
    totalExpenses: number;
    byCategory: PeriodOverview['expenses']['byCategory'];
  },
): PeriodOverview {
  return {
    label,
    sales: {
      orderCount: sales.orderCount,
      totalSales: sales.totalSales,
      // Average basket, which every period view would otherwise recompute.
      averageOrderValue:
        sales.orderCount > 0 ? round2(sales.totalSales / sales.orderCount) : 0,
      byPaymentMethod: sales.byPaymentMethod,
      topItems: sales.topItems,
      itemsSold: sales.itemsSold,
    },
    expenses: {
      expenseCount: expenses.expenseCount,
      totalExpenses: expenses.totalExpenses,
      byCategory: expenses.byCategory,
    },
    netProfit: round2(sales.totalSales - expenses.totalExpenses),
  };
}
