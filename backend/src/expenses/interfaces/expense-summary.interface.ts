export interface ExpenseCategoryBreakdown {
  categoryId: string | null;
  categoryName: string;
  expenseCount: number;
  total: number;
}

/**
 * Expense aggregates for an arbitrary period. The daily, monthly and yearly
 * views are the same figures over a different range, so they share one shape.
 */
export interface ExpenseAggregate {
  expenseCount: number;
  totalExpenses: number;
  byCategory: ExpenseCategoryBreakdown[];
}

export interface ExpenseSummary extends ExpenseAggregate {
  month: string; // YYYY-MM
}

/** One month's spend, for a year-long trend. */
export interface MonthlyExpensePoint {
  month: string; // YYYY-MM
  expenseCount: number;
  totalExpenses: number;
}
