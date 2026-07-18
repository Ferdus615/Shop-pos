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
  formatDay,
  parseDayRange,
  parseMonthRange,
  round2,
} from '../common/utils/date.util';
import { MenuItem } from '../menu/entities/menu-item.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { OrderItem } from './entities/order-item.entity';
import { Order } from './entities/order.entity';
import {
  PaymentMethodBreakdown,
  SalesSummary,
  TopSellingItem,
} from './interfaces/sales-summary.interface';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateOrderDto, userId: string | null): Promise<Order> {
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
      const menuItems = await manager.findBy(MenuItem, {
        id: In(menuItemIds),
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

      const order = manager.create(Order, {
        orderNumber: await this.generateOrderNumber(manager),
        subtotal,
        discount,
        tax,
        total,
        paymentMethod: dto.paymentMethod,
        status: OrderStatus.COMPLETED,
        createdById: userId,
        items: orderItems,
      });

      return manager.save(order);
    });
  }

  /** Sequential, date-prefixed number. Unique constraint guards against races. */
  private async generateOrderNumber(manager: EntityManager): Promise<string> {
    const now = new Date();
    const { start, end } = parseDayRange(formatDay(now));
    const countToday = await manager.count(Order, {
      where: { createdAt: Between(start, end) },
    });
    const seq = String(countToday + 1).padStart(4, '0');
    return `ORD-${formatDay(now).replace(/-/g, '')}-${seq}`;
  }

  async findAll(query: QueryOrdersDto): Promise<Order[]> {
    const qb = this.ordersRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
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

  async findOne(id: string): Promise<Order> {
    const order = await this.ordersRepository.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  async void(id: string): Promise<Order> {
    const order = await this.findOne(id);
    if (order.status === OrderStatus.VOIDED) {
      throw new BadRequestException('Order is already voided');
    }
    order.status = OrderStatus.VOIDED;
    return this.ordersRepository.save(order);
  }

  /** Daily sales summary. Defaults to today when no date is supplied. */
  async getSalesSummary(date?: string): Promise<SalesSummary> {
    const { start, end, day } = parseDayRange(date);

    const totals = await this.ordersRepository
      .createQueryBuilder('order')
      .select('COUNT(*)', 'orderCount')
      .addSelect('COALESCE(SUM(order.total), 0)', 'totalSales')
      .where('order.status = :status', { status: OrderStatus.COMPLETED })
      .andWhere('order.createdAt BETWEEN :start AND :end', { start, end })
      .getRawOne<{ orderCount: string; totalSales: string }>();

    const paymentRows = await this.ordersRepository
      .createQueryBuilder('order')
      .select('order.payment_method', 'paymentMethod')
      .addSelect('COUNT(*)', 'orderCount')
      .addSelect('COALESCE(SUM(order.total), 0)', 'total')
      .where('order.status = :status', { status: OrderStatus.COMPLETED })
      .andWhere('order.createdAt BETWEEN :start AND :end', { start, end })
      .groupBy('order.payment_method')
      .getRawMany<{
        paymentMethod: PaymentMethod;
        orderCount: string;
        total: string;
      }>();

    const topRows = await this.ordersRepository
      .createQueryBuilder('order')
      .innerJoin('order.items', 'item')
      .select('item.name_snapshot', 'name')
      .addSelect('SUM(item.quantity)', 'quantitySold')
      .addSelect('SUM(item.line_total)', 'revenue')
      .where('order.status = :status', { status: OrderStatus.COMPLETED })
      .andWhere('order.createdAt BETWEEN :start AND :end', { start, end })
      .groupBy('item.name_snapshot')
      .orderBy('"quantitySold"', 'DESC')
      .limit(5)
      .getRawMany<{ name: string; quantitySold: string; revenue: string }>();

    const byPaymentMethod: PaymentMethodBreakdown[] = paymentRows.map(
      (row) => ({
        paymentMethod: row.paymentMethod,
        orderCount: Number(row.orderCount),
        total: round2(Number(row.total)),
      }),
    );

    const topItems: TopSellingItem[] = topRows.map((row) => ({
      name: row.name,
      quantitySold: Number(row.quantitySold),
      revenue: round2(Number(row.revenue)),
    }));

    return {
      date: day,
      orderCount: Number(totals?.orderCount ?? 0),
      totalSales: round2(Number(totals?.totalSales ?? 0)),
      byPaymentMethod,
      topItems,
    };
  }

  /** Total completed sales for a month (YYYY-MM). Defaults to current month. */
  async getMonthlySalesTotal(month?: string): Promise<number> {
    const { start, end } = parseMonthRange(month);
    const row = await this.ordersRepository
      .createQueryBuilder('order')
      .select('COALESCE(SUM(order.total), 0)', 'total')
      .where('order.status = :status', { status: OrderStatus.COMPLETED })
      .andWhere('order.createdAt BETWEEN :start AND :end', { start, end })
      .getRawOne<{ total: string }>();
    return round2(Number(row?.total ?? 0));
  }
}
