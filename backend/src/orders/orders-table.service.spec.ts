import { BadRequestException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { OrderStatus } from '../common/enums/order-status.enum';
import { PaymentMethod } from '../common/enums/payment-method.enum';
import { MenuItem } from '../menu/entities/menu-item.entity';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrdersService } from './orders.service';

/**
 * Dine-in rules: a table keeps one bill until it is settled, and paying and
 * serving are separate events that can happen in either order.
 */
describe('OrdersService — tables, paying and serving', () => {
  const SHOP = 'shop-1';
  const CHA = 'item-cha';

  /**
   * A transaction manager over an in-memory pair of tables. Only the handful
   * of calls `create()` makes are implemented — enough to exercise the
   * open-bill rule without a database.
   */
  function buildCreateHarness(openBill: Order | null) {
    const savedOrders: Order[] = [];
    const savedItems: OrderItem[][] = [];
    const updates: { id: string; changes: Partial<Order> }[] = [];

    const manager = {
      findBy: jest
        .fn()
        .mockResolvedValue([
          { id: CHA, name: 'Cha', price: 30, isAvailable: true } as MenuItem,
        ]),
      findOne: jest.fn().mockResolvedValue(openBill),
      findOneOrFail: jest
        .fn()
        .mockResolvedValue({ ...(openBill ?? {}) } as Order),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn(
        (_entity: unknown, id: string, changes: Partial<Order>) => {
          updates.push({ id, changes });
          return Promise.resolve({ affected: 1 });
        },
      ),
      create: jest.fn((_entity: unknown, data: unknown) => ({
        ...(data as object),
      })),
      save: jest.fn((value: Order | OrderItem[]) => {
        if (Array.isArray(value)) savedItems.push(value);
        else savedOrders.push(value);
        return Promise.resolve(value);
      }),
    } as unknown as EntityManager;

    const dataSource = {
      transaction: (fn: (m: EntityManager) => Promise<unknown>) => fn(manager),
    } as unknown as DataSource;

    const service = new OrdersService(
      {} as unknown as Repository<Order>,
      dataSource,
    );
    return { service, manager, savedOrders, savedItems, updates };
  }

  const ringUp = (tableNumber?: string, quantity = 2) => ({
    items: [{ menuItemId: CHA, quantity }],
    paymentMethod: PaymentMethod.CASH,
    tableNumber,
  });

  describe('ringing up', () => {
    it('starts every order unpaid and unserved', async () => {
      const { service, savedOrders } = buildCreateHarness(null);

      await service.create(ringUp(), 'user-1', SHOP);

      expect(savedOrders[0]).toMatchObject({ isPaid: false, isServed: false });
    });

    it('records the table, trimmed, and null for a counter sale', async () => {
      const withTable = buildCreateHarness(null);
      await withTable.service.create(ringUp('  7 '), 'user-1', SHOP);
      expect(withTable.savedOrders[0].tableNumber).toBe('7');

      const counter = buildCreateHarness(null);
      await counter.service.create(ringUp(), 'user-1', SHOP);
      expect(counter.savedOrders[0].tableNumber).toBeNull();
    });

    it('does not look for an open bill for a counter sale', async () => {
      const { service, manager } = buildCreateHarness(null);

      await service.create(ringUp(), 'user-1', SHOP);

      expect(manager.findOne).not.toHaveBeenCalled();
    });

    it("looks for the table's unpaid, un-voided bill", async () => {
      const { service, manager } = buildCreateHarness(null);

      await service.create(ringUp('7'), 'user-1', SHOP);

      expect(manager.findOne).toHaveBeenCalledWith(
        Order,
        expect.objectContaining({
          where: {
            shopId: SHOP,
            tableNumber: '7',
            isPaid: false,
            status: OrderStatus.COMPLETED,
          },
        }),
      );
    });
  });

  describe('a second round at the same table', () => {
    const openBill = () =>
      ({
        id: 'open-1',
        shopId: SHOP,
        tableNumber: '7',
        orderNumber: 'ORD-1',
        subtotal: 100,
        discount: 10,
        tax: 0,
        total: 90,
        isPaid: false,
        isServed: true,
        servedAt: new Date(),
        status: OrderStatus.COMPLETED,
      }) as Order;

    it('adds to the unpaid bill instead of starting a second one', async () => {
      const { service, savedItems, updates } = buildCreateHarness(openBill());

      const result = await service.create(ringUp('7'), 'user-1', SHOP);

      // 100 + (30 × 2) = 160, less the existing 10 discount.
      expect(updates[0].id).toBe('open-1');
      expect(updates[0].changes).toMatchObject({ subtotal: 160, total: 150 });
      expect(result.appendedToOpenBill).toBe(true);
      // The new lines are attached to that bill.
      expect(savedItems[0][0].orderId).toBe('open-1');
    });

    it('never saves the bill entity, which would drop the new lines', async () => {
      // `items` is eager and cascading: saving the entity would write back the
      // line array as it was loaded and detach the round just inserted,
      // leaving a bill that charges the new total against the old lines.
      const { service, savedOrders } = buildCreateHarness(openBill());

      await service.create(ringUp('7'), 'user-1', SHOP);

      expect(savedOrders).toHaveLength(0);
    });

    it('reopens serving, because this round has not gone out', async () => {
      const { service, updates } = buildCreateHarness(openBill());

      await service.create(ringUp('7'), 'user-1', SHOP);

      expect(updates[0].changes).toMatchObject({
        isServed: false,
        servedAt: null,
      });
    });

    it('starts a fresh bill once the table has paid', async () => {
      // A paid bill is not an open bill, so the lookup finds nothing.
      const { service, savedOrders } = buildCreateHarness(null);

      const result = await service.create(ringUp('7'), 'user-1', SHOP);

      expect(result.appendedToOpenBill).toBeUndefined();
      expect(savedOrders[0].orderNumber).toMatch(/^ORD-\d{8}-0001$/);
    });
  });

  // ---- paying and serving -------------------------------------------------

  function buildOrderHarness(existing: Partial<Order>) {
    const stored = {
      id: 'o1',
      shopId: SHOP,
      total: 500,
      status: OrderStatus.COMPLETED,
      paymentMethod: PaymentMethod.CASH,
      isPaid: false,
      paidAt: null,
      isServed: false,
      servedAt: null,
      ...existing,
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
    };
  }

  describe('pay', () => {
    it('takes the money and stamps when', async () => {
      const { service, saved } = buildOrderHarness({});

      await service.pay('o1', {}, SHOP);

      expect(saved[0].isPaid).toBe(true);
      expect(saved[0].paidAt).toBeInstanceOf(Date);
    });

    it('records how they actually paid, overriding the ring-up guess', async () => {
      const { service, saved } = buildOrderHarness({
        paymentMethod: PaymentMethod.CASH,
      });

      await service.pay('o1', { paymentMethod: PaymentMethod.BKASH }, SHOP);

      expect(saved[0].paymentMethod).toBe(PaymentMethod.BKASH);
    });

    it('keeps the ring-up method when none is given', async () => {
      const { service, saved } = buildOrderHarness({
        paymentMethod: PaymentMethod.NAGAD,
      });

      await service.pay('o1', {}, SHOP);

      expect(saved[0].paymentMethod).toBe(PaymentMethod.NAGAD);
    });

    it('refuses to take the money twice', async () => {
      const { service, saved } = buildOrderHarness({ isPaid: true });

      await expect(service.pay('o1', {}, SHOP)).rejects.toThrow(
        /already paid/i,
      );
      expect(saved).toHaveLength(0);
    });

    it('refuses to settle a voided order', async () => {
      const { service } = buildOrderHarness({ status: OrderStatus.VOIDED });

      await expect(service.pay('o1', {}, SHOP)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('can undo a payment marked by mistake', async () => {
      const { service, saved } = buildOrderHarness({
        isPaid: true,
        paidAt: new Date(),
      });

      await service.unpay('o1', SHOP);

      expect(saved[0].isPaid).toBe(false);
      expect(saved[0].paidAt).toBeNull();
    });

    it('refuses to undo a payment that was never marked', async () => {
      const { service } = buildOrderHarness({ isPaid: false });

      await expect(service.unpay('o1', SHOP)).rejects.toThrow(
        /not marked paid/i,
      );
    });
  });

  describe('serve', () => {
    it('marks the food served and stamps when', async () => {
      const { service, saved } = buildOrderHarness({});

      await service.setServed('o1', true, SHOP);

      expect(saved[0].isServed).toBe(true);
      expect(saved[0].servedAt).toBeInstanceOf(Date);
    });

    it('takes back a premature served, clearing the stamp', async () => {
      const { service, saved } = buildOrderHarness({
        isServed: true,
        servedAt: new Date(),
      });

      await service.setServed('o1', false, SHOP);

      expect(saved[0].isServed).toBe(false);
      expect(saved[0].servedAt).toBeNull();
    });

    it('is independent of payment: an unpaid order can be served', async () => {
      const { service, saved } = buildOrderHarness({ isPaid: false });

      await service.setServed('o1', true, SHOP);

      expect(saved[0].isServed).toBe(true);
      expect(saved[0].isPaid).toBe(false);
    });

    it('refuses to serve twice', async () => {
      const { service } = buildOrderHarness({ isServed: true });

      await expect(service.setServed('o1', true, SHOP)).rejects.toThrow(
        /already served/i,
      );
    });
  });
});
