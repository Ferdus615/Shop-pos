import { ExpenseCategoryBreakdown } from '../../expenses/interfaces/expense-summary.interface';
import {
  PaymentMethodBreakdown,
  SalesSummary,
  SoldItem,
  TopSellingItem,
} from '../../orders/interfaces/sales-summary.interface';

/** One period (a day, a month or a year) of trading, priced and netted. */
export interface PeriodOverview {
  /** YYYY-MM-DD, YYYY-MM or YYYY, depending on the period. */
  label: string;
  sales: {
    orderCount: number;
    totalSales: number;
    averageOrderValue: number;
    byPaymentMethod: PaymentMethodBreakdown[];
    topItems: TopSellingItem[];
    /** Every item sold in the period and how many — not just the top few. */
    itemsSold: SoldItem[];
  };
  expenses: {
    expenseCount: number;
    totalExpenses: number;
    byCategory: ExpenseCategoryBreakdown[];
  };
  netProfit: number;
}

/** A month in the year-long trend: takings, spend and the net of the two. */
export interface MonthlyTrendPoint {
  month: string; // YYYY-MM
  orderCount: number;
  totalSales: number;
  totalExpenses: number;
  netProfit: number;
}

export interface DashboardOverview {
  date: string; // YYYY-MM-DD — the reference day
  month: string; // YYYY-MM
  year: string; // YYYY
  periods: {
    day: PeriodOverview;
    month: PeriodOverview;
    year: PeriodOverview;
  };
  monthlyTrend: MonthlyTrendPoint[];

  /**
   * The original `GET /dashboard` fields, retained so the documented contract
   * keeps working for anything already reading them.
   */
  today: SalesSummary;
  monthToDate: {
    totalSales: number;
    totalExpenses: number;
    netProfit: number;
    expensesByCategory: ExpenseCategoryBreakdown[];
  };
}
