export interface ExpenseCategoryBreakdown {
  categoryId: string | null;
  categoryName: string;
  expenseCount: number;
  total: number;
}

export interface ExpenseSummary {
  month: string; // YYYY-MM
  expenseCount: number;
  totalExpenses: number;
  byCategory: ExpenseCategoryBreakdown[];
}
