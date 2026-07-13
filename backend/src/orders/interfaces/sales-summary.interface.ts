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

export interface SalesSummary {
  date: string; // YYYY-MM-DD
  orderCount: number;
  totalSales: number;
  byPaymentMethod: PaymentMethodBreakdown[];
  topItems: TopSellingItem[];
}
