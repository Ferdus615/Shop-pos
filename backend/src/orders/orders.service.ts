import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, EntityManager, In, Repository } from 'typeorm';
import { OrderStatus } from '../common/enums/order-status.enum';
import { PaymentMethod } from '../common/enums/payment-method.enum';
import {
  APP_TIME_ZONE,
  formatDay,
  monthsOfYear,
  parseDayRange,
  parseMonthRange,
  parseYearRange,
  round2,
} from '../common/utils/date.util';
import { MenuItem } from '../menu/entities/menu-item.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { PayOrderDto } from './dto/pay-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { OrderItem } from './entities/order-item.entity';
import { Order } from './entities/order.entity';
import {
  MonthlySalesPoint,
  PaymentMethodBreakdown,
  SalesAggregate,
  SalesSummary,
  SoldItem,
} from './interfaces/sales-summary.interface';

/** How many best sellers the summaries lead with. */
const TOP_ITEM_COUNT = 5;

/** Label for items sold under no category, or whose menu item is gone. */
const UNCATEGORIZED = 'Uncategorized';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    dto: CreateOrderDto,
    userId: string | null,
    shopId: string,
  ): Promise<Order> {
    // Collapse duplicate line entries for the same item into one line.
    const quantityByItem = new Map<string, number>();
    for (const line of dto.items) {
      quantityByItem.set(
        line.menuItemId,
        (quantityByItem.get(line.menuItemId) ?? 0) + line.quantity,
      );
    }
    const menuItemIds = [...quantityByItem.keys()];

    return this.dataSource.transaction(async (manager) => {
      // Scoped: an item id from another shop simply will not be found, and
      // the loop below rejects the order rather than pricing it.
      const menuItems = await manager.findBy(MenuItem, {
        id: In(menuItemIds),
        shopId,
      });
      const itemsById = new Map(menuItems.map((item) => [item.id, item]));

      const orderItems: OrderItem[] = [];
      let subtotal = 0;

      for (const [menuItemId, quantity] of quantityByItem) {
        const menuItem = itemsById.get(menuItemId);
        if (!menuItem) {
          throw new BadRequestException(
            `Menu item ${menuItemId} does not exist`,
          );
        }
        if (!menuItem.isAvailable) {
          throw new BadRequestException(
            `"${menuItem.name}" is currently unavailable`,
          );
        }

        const unitPrice = menuItem.price;
        const lineTotal = round2(unitPrice * quantity);
        subtotal = round2(subtotal + lineTotal);

        orderItems.push(
          manager.create(OrderItem, {
            menuItemId: menuItem.id,
            nameSnapshot: menuItem.name,
            unitPrice,
            quantity,
            lineTotal,
          }),
        );
      }

      const discount = round2(dto.discount ?? 0);
      const tax = round2(dto.tax ?? 0);
      if (discount > subtotal) {
        throw new BadRequestException('Discount cannot exceed the subtotal');
      }
      const total = round2(subtotal - discount + tax);

      const tableNumber = dto.tableNumber?.trim() || null;
      // Most sales are paid as they are rung up; a table that settles later
      // is the exception the till has to ask for.
      const payingNow = dto.markPaid !== false;
      const now = new Date();

      // A table that still owes money keeps one bill: a second round of
      // ordering is added to it rather than starting a rival bill nobody
      // would think to settle. Once the table has paid, the next round is a
      // new order — which is what makes "two rounds, two bills" true only
      // when the first one is already closed.
      const openBill = tableNumber
        ? await this.findOpenBill(manager, shopId, tableNumber)
        : null;

      if (openBill) {
        // New lines are appended rather than merged into the existing ones:
        // the kitchen needs to see this round on its own, and the bill reads
        // as the sequence of what was actually ordered.
        for (const item of orderItems) {
          item.orderId = openBill.id;
        }
        await manager.save(orderItems);

        const nextSubtotal = round2(openBill.subtotal + subtotal);
        const nextDiscount = round2(openBill.discount + discount);
        const nextTax = round2(openBill.tax + tax);
        if (nextDiscount > nextSubtotal) {
          throw new BadRequestException('Discount cannot exceed the subtotal');
        }

        /**
         * `update`, not `save`.
         *
         * `items` is an eager, cascading relation, so the bill arrived with
         * its lines already loaded — the lines as they were *before* this
         * round. Saving the entity would cascade that stale array and detach
         * the rows just inserted, leaving a bill that charges the new total
         * against the old lines. Updating the columns touches no relation.
         */
        await manager.update(Order, openBill.id, {
          subtotal: nextSubtotal,
          discount: nextDiscount,
          tax: nextTax,
          total: round2(nextSubtotal - nextDiscount + nextTax),
          // Serving starts again: this round has not gone out yet.
          isServed: false,
          servedAt: null,
          // Paying now settles the whole bill, this round included — a table
          // has one bill, so there is nothing else it could mean.
          ...(payingNow
            ? { isPaid: true, paidAt: now, paymentMethod: dto.paymentMethod }
            : {}),
        });

        const updated = await manager.findOneOrFail(Order, {
          where: { id: openBill.id },
        });
        updated.appendedToOpenBill = true;
        return updated;
      }

      const order = manager.create(Order, {
        shopId,
        orderNumber: await this.generateOrderNumber(manager, shopId),
        tableNumber,
        subtotal,
        discount,
        tax,
        total,
        paymentMethod: dto.paymentMethod,
        status: OrderStatus.COMPLETED,
        // Paid at the till unless the customer is settling later. Serving is
        // always still to come — the food has only just been ordered.
        isPaid: payingNow,
        paidAt: payingNow ? now : null,
        isServed: false,
        createdById: userId,
        items: orderItems,
      });

      return manager.save(order);
    });
  }

  /**
   * Sequential, date-prefixed number. Counted per shop, so each tenant has its
   * own ORD-YYYYMMDD-0001 series. The (shop_id, order_number) unique index
   * guards against races.
   */
  private async generateOrderNumber(
    manager: EntityManager,
    shopId: string,
  ): Promise<string> {
    const now = new Date();
    const { start, end } = parseDayRange(formatDay(now));
    const countToday = await manager.count(Order, {
      where: { shopId, createdAt: Between(start, end) },
    });

    const seq = String(countToday + 1).padStart(4, '0');
    return `ORD-${formatDay(now).replace(/-/g, '')}-${seq}`;
  }

  async findAll(query: QueryOrdersDto, shopId: string): Promise<Order[]> {
    const qb = this.ordersRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .where('order.shop_id = :shopId', { shopId })
      .orderBy('order.createdAt', 'DESC');

    if (query.from) {
      qb.andWhere('order.createdAt >= :start', {
        start: parseDayRange(query.from).start,
      });
    }
    if (query.to) {
      qb.andWhere('order.createdAt <= :end', {
        end: parseDayRange(query.to).end,
      });
    }
    if (query.status) {
      qb.andWhere('order.status = :status', { status: query.status });
    }

    return qb.getMany();
  }

  /**
   * Everything still needing something done to it: not yet paid, or not yet
   * served, or both.
   *
   * Deliberately not filtered by date. A bill opened before midnight is still
   * the same bill afterwards, and a floor view that dropped it at the day
   * boundary would hide a table that is still sitting there. Oldest first,
   * because that is the one that has been waiting longest.
   */
  findOpen(shopId: string): Promise<Order[]> {
    return this.ordersRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .where('order.shop_id = :shopId', { shopId })
      .andWhere('order.status = :status', { status: OrderStatus.COMPLETED })
      .andWhere('(order.is_paid = false OR order.is_served = false)')
      .orderBy('order.createdAt', 'ASC')
      .getMany();
  }

  async findOne(id: string, shopId: string): Promise<Order> {
    const order = await this.ordersRepository.findOne({
      where: { id, shopId },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  /**
   * Voids an order: it should never have been rung up. The record stays and
   * only the status changes, so a mis-punch stays distinguishable from a
   * refund — which is exactly why a refund cannot be overwritten with a void.
   */
  async void(id: string, shopId: string): Promise<Order> {
    const order = await this.findOne(id, shopId);
    if (order.status === OrderStatus.VOIDED) {
      throw new BadRequestException('Order is already voided');
    }
    if (order.status === OrderStatus.REFUNDED) {
      throw new BadRequestException(
        'Cannot void a refunded order — the money has already been returned',
      );
    }
    order.status = OrderStatus.VOIDED;
    return this.ordersRepository.save(order);
  }

  async refund(id: string, shopId: string): Promise<Order> {
    const order = await this.findOne(id, shopId);
    if (order.status === OrderStatus.REFUNDED) {
      throw new BadRequestException('Order is already refunded');
    }
    if (order.status === OrderStatus.VOIDED) {
      throw new BadRequestException('Cannot refund a voided order');
    }
    order.status = OrderStatus.REFUNDED;
    return this.ordersRepository.save(order);
  }

  /**
   * The table's unsettled bill, if it has one. Voided and refunded orders are
   * not bills anyone can add to, and a paid one is closed.
   */
  private findOpenBill(
    manager: EntityManager,
    shopId: string,
    tableNumber: string,
  ): Promise<Order | null> {
    return manager.findOne(Order, {
      where: {
        shopId,
        tableNumber,
        isPaid: false,
        status: OrderStatus.COMPLETED,
      },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Takes the money. The payment method is confirmed here rather than at
   * ring-up, because for a table that settles later this is the first moment
   * anyone knows how they actually paid.
   */
  async pay(id: string, dto: PayOrderDto, shopId: string): Promise<Order> {
    const order = await this.findOne(id, shopId);
    if (order.status !== OrderStatus.COMPLETED) {
      throw new BadRequestException(
        `A ${order.status.toLowerCase()} order cannot be paid`,
      );
    }
    if (order.isPaid) {
      throw new BadRequestException('Order is already paid');
    }
    if (dto.paymentMethod) {
      order.paymentMethod = dto.paymentMethod;
    }
    order.isPaid = true;
    order.paidAt = new Date();
    return this.ordersRepository.save(order);
  }

  /**
   * Undoes a payment marked by mistake. Owner-only, and deliberately not a
   * refund: no money went back, the button was simply pressed in error.
   */
  async unpay(id: string, shopId: string): Promise<Order> {
    const order = await this.findOne(id, shopId);
    if (!order.isPaid) {
      throw new BadRequestException('Order is not marked paid');
    }
    order.isPaid = false;
    order.paidAt = null;
    return this.ordersRepository.save(order);
  }

  /** Marks the food as served, or takes that back if it was premature. */
  async setServed(id: string, served: boolean, shopId: string): Promise<Order> {
    const order = await this.findOne(id, shopId);
    if (order.status !== OrderStatus.COMPLETED) {
      throw new BadRequestException(
        `A ${order.status.toLowerCase()} order cannot be served`,
      );
    }
    if (order.isServed === served) {
      throw new BadRequestException(
        served ? 'Order is already served' : 'Order is not marked served',
      );
    }
    order.isServed = served;
    order.servedAt = served ? new Date() : null;
    return this.ordersRepository.save(order);
  }

  /** Daily sales summary. Defaults to today when no date is supplied. */
  async getSalesSummary(shopId: string, date?: string): Promise<SalesSummary> {
    const { start, end, day } = parseDayRange(date);
    return { date: day, ...(await this.aggregateSales(shopId, start, end)) };
  }

  /** Sales summary for a whole month (YYYY-MM). Defaults to this month. */
  async getMonthlySalesSummary(
    shopId: string,
    month?: string,
  ): Promise<SalesAggregate & { month: string }> {
    const { start, end, month: resolved } = parseMonthRange(month);
    return {
      month: resolved,
      ...(await this.aggregateSales(shopId, start, end)),
    };
  }

  /** Sales summary for a whole year (YYYY). Defaults to this year. */
  async getYearlySalesSummary(
    shopId: string,
    year?: string,
  ): Promise<SalesAggregate & { year: string }> {
    const { start, end, year: resolved } = parseYearRange(year);
    return {
      year: resolved,
      ...(await this.aggregateSales(shopId, start, end)),
    };
  }

  /**
   * Takings per month across a calendar year, including months with no sales
   * so a trend has no gaps in it.
   */
  async getMonthlySalesSeries(
    shopId: string,
    year?: string,
  ): Promise<MonthlySalesPoint[]> {
    const { start, end, year: resolved } = parseYearRange(year);

    const rows = await this.ordersRepository
      .createQueryBuilder('order')
      .select("to_char(order.created_at AT TIME ZONE :tz, 'YYYY-MM')", 'month')
      .addSelect('COUNT(*)', 'orderCount')
      .addSelect('COALESCE(SUM(order.total), 0)', 'totalSales')
      .where('order.shop_id = :shopId', { shopId })
      .andWhere('order.status = :status', { status: OrderStatus.COMPLETED })
      .andWhere('order.is_paid = true')
      .andWhere('order.createdAt BETWEEN :start AND :end', { start, end })
      .setParameter('tz', APP_TIME_ZONE)
      .groupBy('month')
      .getRawMany<{
        month: string;
        orderCount: string;
        totalSales: string;
      }>();

    const byMonth = new Map(rows.map((r) => [r.month, r]));
    return monthsOfYear(resolved).map((month) => {
      const row = byMonth.get(month);
      return {
        month,
        orderCount: Number(row?.orderCount ?? 0),
        totalSales: round2(Number(row?.totalSales ?? 0)),
      };
    });
  }

  /**
   * The shared aggregate behind the daily, monthly and yearly views: totals,
   * the payment-method split, and everything sold over one range. The best
   * sellers are the head of that same list, so both always agree.
   */
  private async aggregateSales(
    shopId: string,
    start: Date,
    end: Date,
  ): Promise<SalesAggregate> {
    const totals = await this.ordersRepository
      .createQueryBuilder('order')
      .select('COUNT(*)', 'orderCount')
      .addSelect('COALESCE(SUM(order.total), 0)', 'totalSales')
      .where('order.shop_id = :shopId', { shopId })
      .andWhere('order.status = :status', { status: OrderStatus.COMPLETED })
      .andWhere('order.is_paid = true')
      .andWhere('order.createdAt BETWEEN :start AND :end', { start, end })
      .getRawOne<{ orderCount: string; totalSales: string }>();

    // What has been rung up and not settled. Deliberately a separate figure
    // from takings rather than folded into them: the owner asked for sales to
    // mean money received, and this is money still owed.
    const outstanding = await this.ordersRepository
      .createQueryBuilder('order')
      .select('COUNT(*)', 'unpaidOrderCount')
      .addSelect('COALESCE(SUM(order.total), 0)', 'unpaidTotal')
      .where('order.shop_id = :shopId', { shopId })
      .andWhere('order.status = :status', { status: OrderStatus.COMPLETED })
      .andWhere('order.is_paid = false')
      .andWhere('order.createdAt BETWEEN :start AND :end', { start, end })
      .getRawOne<{ unpaidOrderCount: string; unpaidTotal: string }>();

    const paymentRows = await this.ordersRepository
      .createQueryBuilder('order')
      .select('order.payment_method', 'paymentMethod')
      .addSelect('COUNT(*)', 'orderCount')
      .addSelect('COALESCE(SUM(order.total), 0)', 'total')
      .where('order.shop_id = :shopId', { shopId })
      .andWhere('order.status = :status', { status: OrderStatus.COMPLETED })
      .andWhere('order.is_paid = true')
      .andWhere('order.createdAt BETWEEN :start AND :end', { start, end })
      .groupBy('order.payment_method')
      .getRawMany<{
        paymentMethod: PaymentMethod;
        orderCount: string;
        total: string;
      }>();

    // Every line sold in the range, not just the leaders: the owner needs the
    // whole list, and a category can only be excluded from the ranking if the
    // rows carry their category. The menu item may since have been deleted,
    // which is why both joins are left joins and the name is the snapshot.
    const itemRows = await this.ordersRepository
      .createQueryBuilder('order')
      .innerJoin('order.items', 'item')
      .leftJoin('item.menuItem', 'menuItem')
      .leftJoin('menuItem.category', 'category')
      .select('item.name_snapshot', 'name')
      .addSelect('category.id', 'categoryId')
      .addSelect('category.name', 'categoryName')
      .addSelect('SUM(item.quantity)', 'quantitySold')
      .addSelect('SUM(item.line_total)', 'revenue')
      .where('order.shop_id = :shopId', { shopId })
      .andWhere('order.status = :status', { status: OrderStatus.COMPLETED })
      .andWhere('order.is_paid = true')
      .andWhere('order.createdAt BETWEEN :start AND :end', { start, end })
      .groupBy('item.name_snapshot')
      .addGroupBy('category.id')
      .addGroupBy('category.name')
      .orderBy('"quantitySold"', 'DESC')
      .addOrderBy('"revenue"', 'DESC')
      .getRawMany<{
        name: string;
        categoryId: string | null;
        categoryName: string | null;
        quantitySold: string;
        revenue: string;
      }>();

    const byPaymentMethod: PaymentMethodBreakdown[] = paymentRows.map(
      (row) => ({
        paymentMethod: row.paymentMethod,
        orderCount: Number(row.orderCount),
        total: round2(Number(row.total)),
      }),
    );

    const itemsSold: SoldItem[] = itemRows.map((row) => ({
      name: row.name,
      categoryId: row.categoryId ?? null,
      categoryName: row.categoryName ?? UNCATEGORIZED,
      quantitySold: Number(row.quantitySold),
      revenue: round2(Number(row.revenue)),
    }));

    return {
      orderCount: Number(totals?.orderCount ?? 0),
      totalSales: round2(Number(totals?.totalSales ?? 0)),
      unpaidOrderCount: Number(outstanding?.unpaidOrderCount ?? 0),
      unpaidTotal: round2(Number(outstanding?.unpaidTotal ?? 0)),
      byPaymentMethod,
      topItems: itemsSold.slice(0, TOP_ITEM_COUNT),
      itemsSold,
    };
  }

  /** Total completed sales for a month (YYYY-MM). Defaults to current month. */
  async getMonthlySalesTotal(shopId: string, month?: string): Promise<number> {
    const { start, end } = parseMonthRange(month);
    const row = await this.ordersRepository
      .createQueryBuilder('order')
      .select('COALESCE(SUM(order.total), 0)', 'total')
      .where('order.shop_id = :shopId', { shopId })
      .andWhere('order.status = :status', { status: OrderStatus.COMPLETED })
      .andWhere('order.is_paid = true')
      .andWhere('order.createdAt BETWEEN :start AND :end', { start, end })
      .getRawOne<{ total: string }>();
    return round2(Number(row?.total ?? 0));
  }
}
