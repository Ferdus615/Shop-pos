import { DataSource, Repository } from 'typeorm';
import { OrderStatus } from '../common/enums/order-status.enum';
import { Order } from './entities/order.entity';
import { OrdersService } from './orders.service';

/**
 * Void and refund are the only two ways an order leaves the takings, and
 * neither deletes anything — the status is the record of *why* it left. These
 * tests pin the transitions so the two can never be conflated: a mis-punch
 * (void) must stay distinguishable from money handed back (refund).
 */
describe('OrdersService — void and refund', () => {
  const SHOP = 'shop-1';

  function buildService(status: OrderStatus) {
    const stored = {
      id: 'o1',
      shopId: SHOP,
      orderNumber: 'ORD-20260907-0001',
      total: 500,
      status,
    } as Order;

    const saved: Order[] = [];
    const orders = {
      findOne: jest.fn().mockResolvedValue(stored),
      save: jest.fn((o: Order) => {
        saved.push({ ...o });
        return Promise.resolve(o);
      }),
    } as unknown as Repository<Order>;

    return {
      service: new OrdersService(orders, {} as unknown as DataSource),
      saved,
      repo: orders,
    };
  }

  describe('void', () => {
    it('takes a completed order out of the takings', async () => {
      const { service, saved } = buildService(OrderStatus.COMPLETED);

      await service.void('o1', SHOP);

      expect(saved[0].status).toBe(OrderStatus.VOIDED);
      // The order itself is kept — only its status moved.
      expect(saved[0].total).toBe(500);
      expect(saved[0].orderNumber).toBe('ORD-20260907-0001');
    });

    it('refuses to void the same order twice', async () => {
      const { service, saved } = buildService(OrderStatus.VOIDED);

      await expect(service.void('o1', SHOP)).rejects.toThrow(/already voided/i);
      expect(saved).toHaveLength(0);
    });

    it('refuses to void a refunded order, so the refund is not erased', async () => {
      const { service, saved } = buildService(OrderStatus.REFUNDED);

      await expect(service.void('o1', SHOP)).rejects.toThrow(
        /cannot void a refunded order/i,
      );
      expect(saved).toHaveLength(0);
    });
  });

  describe('refund', () => {
    it('marks a completed order refunded', async () => {
      const { service, saved } = buildService(OrderStatus.COMPLETED);

      await service.refund('o1', SHOP);

      expect(saved[0].status).toBe(OrderStatus.REFUNDED);
    });

    it('refuses to refund twice', async () => {
      const { service, saved } = buildService(OrderStatus.REFUNDED);

      await expect(service.refund('o1', SHOP)).rejects.toThrow(
        /already refunded/i,
      );
      expect(saved).toHaveLength(0);
    });

    it('refuses to refund a voided order', async () => {
      const { service, saved } = buildService(OrderStatus.VOIDED);

      await expect(service.refund('o1', SHOP)).rejects.toThrow(
        /cannot refund a voided order/i,
      );
      expect(saved).toHaveLength(0);
    });
  });

  it('scopes the lookup to the caller shop', async () => {
    const { service, repo } = buildService(OrderStatus.COMPLETED);

    await service.void('o1', SHOP);

    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: 'o1', shopId: SHOP },
    });
  });
});
