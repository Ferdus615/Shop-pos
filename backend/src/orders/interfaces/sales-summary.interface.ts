import { PaymentMethod } from '../../common/enums/payment-method.enum';

export interface PaymentMethodBreakdown {
  paymentMethod: PaymentMethod;
  orderCount: number;
  total: number;
}

export interface TopSellingItem {
  name: string;
  quantitySold: number;
  revenue: number;
}

/**
 * Sales aggregates for an arbitrary period. The daily, monthly and yearly
 * views are the same figures over a different range, so they share one shape.
 */
export interface SalesAggregate {
  orderCount: number;
  totalSales: number;
  byPaymentMethod: PaymentMethodBreakdown[];
  topItems: TopSellingItem[];
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
