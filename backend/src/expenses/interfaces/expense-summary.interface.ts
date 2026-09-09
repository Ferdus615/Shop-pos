export interface ExpenseCategoryBreakdown {
  categoryId: string | null;
  categoryName: string;
  expenseCount: number;
  total: number;
}

/** One catalogued item's share of a period's spend. */
export interface ExpenseItemBreakdown {
  /** Null for entries recorded before the item catalogue existed. */
  itemId: string | null;
  /** The item name as stored on the entries, so retiring one changes nothing. */
  itemName: string;
  entryCount: number;
  /** Summed quantity — only meaningful when `unit` is the same throughout. */
  totalQuantity: number;
  unit: string | null;
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
  byItem: ExpenseItemBreakdown[];
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

/** One day's spend, for the day-by-day view. */
export interface ExpenseDayPoint {
  date: string; // YYYY-MM-DD
  entryCount: number;
  total: number;
}
