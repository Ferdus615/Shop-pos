import { ExpensesService } from '../expenses/expenses.service';
import { OrdersService } from '../orders/orders.service';
import { DashboardService } from './dashboard.service';

/**
 * The dashboard does no querying of its own — it pairs each period's sales
 * with its expenses and derives the figures. These tests pin that arithmetic
 * (net profit, average basket, the year trend) so the screen can never be
 * asked to compute money client-side.
 */
describe('DashboardService.getOverview', () => {
  const SHOP = 'shop-1';

  const soldItem = (
    name: string,
    quantitySold: number,
    categoryName = 'Uncategorized',
  ) => ({
    name,
    categoryId: categoryName === 'Uncategorized' ? null : categoryName,
    categoryName,
    quantitySold,
    revenue: quantitySold * 100,
  });

  const sales = (
    totalSales: number,
    orderCount: number,
    itemsSold: ReturnType<typeof soldItem>[] = [],
  ) => ({
    orderCount,
    totalSales,
    byPaymentMethod: [],
    topItems: itemsSold.slice(0, 5),
    itemsSold,
  });
  const expenses = (totalExpenses: number, expenseCount: number) => ({
    expenseCount,
    totalExpenses,
    byCategory: [],
  });

  function buildService(
    overrides: {
      daySales?: ReturnType<typeof sales>;
      salesSeries?: { month: string; orderCount: number; totalSales: number }[];
      expenseSeries?: {
        month: string;
        expenseCount: number;
        totalExpenses: number;
      }[];
    } = {},
  ) {
    const day = overrides.daySales ?? sales(1000, 4);
    const orders = {
      getSalesSummary: jest
        .fn()
        .mockResolvedValue({ date: '2026-09-06', ...day }),
      getMonthlySalesSummary: jest
        .fn()
        .mockResolvedValue({ month: '2026-09', ...sales(9000, 30) }),
      getYearlySalesSummary: jest
        .fn()
        .mockResolvedValue({ year: '2026', ...sales(120000, 400) }),
      getMonthlySalesSeries: jest.fn().mockResolvedValue(
        overrides.salesSeries ?? [
          { month: '2026-01', orderCount: 10, totalSales: 5000 },
          { month: '2026-02', orderCount: 0, totalSales: 0 },
        ],
      ),
    } as unknown as OrdersService;

    const expenseService = {
      getDailySummary: jest
        .fn()
        .mockResolvedValue({ date: '2026-09-06', ...expenses(250, 2) }),
      getMonthlySummary: jest
        .fn()
        .mockResolvedValue({ month: '2026-09', ...expenses(3000, 12) }),
      getYearlySummary: jest
        .fn()
        .mockResolvedValue({ year: '2026', ...expenses(45000, 130) }),
      getMonthlyExpenseSeries: jest.fn().mockResolvedValue(
        overrides.expenseSeries ?? [
          { month: '2026-01', expenseCount: 3, totalExpenses: 1500 },
          { month: '2026-02', expenseCount: 0, totalExpenses: 0 },
        ],
      ),
    } as unknown as ExpensesService;

    return new DashboardService(orders, expenseService);
  }

  it('resolves the day, its month and its year from one reference date', async () => {
    const result = await buildService().getOverview(SHOP, '2026-09-06');

    expect(result.date).toBe('2026-09-06');
    expect(result.month).toBe('2026-09');
    expect(result.year).toBe('2026');
    expect(result.periods.day.label).toBe('2026-09-06');
    expect(result.periods.month.label).toBe('2026-09');
    expect(result.periods.year.label).toBe('2026');
  });

  it('nets sales against expenses for every period', async () => {
    const { periods } = await buildService().getOverview(SHOP, '2026-09-06');

    expect(periods.day.netProfit).toBe(750); // 1000 - 250
    expect(periods.month.netProfit).toBe(6000); // 9000 - 3000
    expect(periods.year.netProfit).toBe(75000); // 120000 - 45000
  });

  it('computes the average basket, and does not divide by zero', async () => {
    const { periods } = await buildService().getOverview(SHOP, '2026-09-06');
    expect(periods.day.sales.averageOrderValue).toBe(250); // 1000 / 4
    expect(periods.year.sales.averageOrderValue).toBe(300); // 120000 / 400

    // A day with no orders must read 0, not NaN or Infinity.
    const quiet = buildService({ daySales: sales(0, 0) });
    const empty = await quiet.getOverview(SHOP, '2026-09-06');
    expect(empty.periods.day.sales.averageOrderValue).toBe(0);
    expect(empty.periods.day.netProfit).toBe(-250); // spent, took nothing
  });

  it('joins sales and expenses per month into one trend', async () => {
    const { monthlyTrend } = await buildService().getOverview(
      SHOP,
      '2026-09-06',
    );

    expect(monthlyTrend).toEqual([
      {
        month: '2026-01',
        orderCount: 10,
        totalSales: 5000,
        totalExpenses: 1500,
        netProfit: 3500,
      },
      {
        month: '2026-02',
        orderCount: 0,
        totalSales: 0,
        totalExpenses: 0,
        netProfit: 0,
      },
    ]);
  });

  it('reports a loss when a month spent more than it took', async () => {
    const service = buildService({
      salesSeries: [{ month: '2026-03', orderCount: 2, totalSales: 400 }],
      expenseSeries: [
        { month: '2026-03', expenseCount: 1, totalExpenses: 1000 },
      ],
    });

    const { monthlyTrend } = await service.getOverview(SHOP, '2026-09-06');
    expect(monthlyTrend[0].netProfit).toBe(-600);
  });

  it('keeps a month with expenses but no sales in the trend', async () => {
    const service = buildService({
      salesSeries: [{ month: '2026-04', orderCount: 0, totalSales: 0 }],
      expenseSeries: [
        { month: '2026-04', expenseCount: 2, totalExpenses: 800 },
      ],
    });

    const { monthlyTrend } = await service.getOverview(SHOP, '2026-09-06');
    expect(monthlyTrend).toHaveLength(1);
    expect(monthlyTrend[0]).toMatchObject({
      month: '2026-04',
      totalExpenses: 800,
      netProfit: -800,
    });
  });

  it('passes the whole sold-item list through, not only the best sellers', async () => {
    const itemsSold = [
      soldItem('Tea', 40, 'Drinks'),
      soldItem('Samosa', 30, 'Snacks'),
      soldItem('Coffee', 20, 'Drinks'),
      soldItem('Roll', 10, 'Snacks'),
      soldItem('Cake', 5, 'Bakery'),
      soldItem('Water', 1),
    ];
    const service = buildService({ daySales: sales(1000, 4, itemsSold) });

    const { periods } = await service.getOverview(SHOP, '2026-09-06');
    expect(periods.day.sales.itemsSold).toEqual(itemsSold);
    // The ranking is the head of that same list, so the two cannot disagree.
    expect(periods.day.sales.topItems).toEqual(itemsSold.slice(0, 5));
  });

  it('still serves the original today / monthToDate fields', async () => {
    const result = await buildService().getOverview(SHOP, '2026-09-06');

    expect(result.today.date).toBe('2026-09-06');
    expect(result.today.totalSales).toBe(1000);
    expect(result.monthToDate).toMatchObject({
      totalSales: 9000,
      totalExpenses: 3000,
      netProfit: 6000,
    });
  });
});
