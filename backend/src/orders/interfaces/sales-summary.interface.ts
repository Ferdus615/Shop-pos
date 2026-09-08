import { PaymentMethod } from '../../common/enums/payment-method.enum';

export interface PaymentMethodBreakdown {
  paymentMethod: PaymentMethod;
  orderCount: number;
  total: number;
}

/**
 * One menu item's sales over a period. Carries the category so the reader can
 * leave a whole category out of the best-seller ranking.
 */
export interface SoldItem {
  name: string;
  categoryId: string | null;
  /** "Uncategorized" for items whose menu item or category is gone. */
  categoryName: string;
  quantitySold: number;
  revenue: number;
}

/** A best seller is just a sold item that made the ranking. */
export type TopSellingItem = SoldItem;

/**
 * Sales aggregates for an arbitrary period. The daily, monthly and yearly
 * views are the same figures over a different range, so they share one shape.
 */
export interface SalesAggregate {
  /** Paid orders only — see `totalSales`. */
  orderCount: number;
  /**
   * Money actually taken in the period: paid orders only. An order that has
   * been rung up but not settled is not takings yet, it is `unpaidTotal`.
   */
  totalSales: number;
  /** Rung up and still owed — orders waiting to be settled. */
  unpaidOrderCount: number;
  unpaidTotal: number;
  byPaymentMethod: PaymentMethodBreakdown[];
  /** The five best sellers, quantity first. A subset of `itemsSold`. */
  topItems: TopSellingItem[];
  /** Every item sold in the period, quantity first — not just the top few. */
  itemsSold: SoldItem[];
}

export interface SalesSummary extends SalesAggregate {
  date: string; // YYYY-MM-DD
}

/** One month's takings, for a year-long trend. */
export interface MonthlySalesPoint {
  month: string; // YYYY-MM
  orderCount: number;
  totalSales: number;
}
