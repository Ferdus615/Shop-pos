import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { PaymentMethod } from '../../common/enums/payment-method.enum';
import { decimalTransformer } from '../../common/transformers/decimal.transformer';
import { Shop } from '../../shops/entities/shop.entity';
import { User } from '../../users/entities/user.entity';
import { OrderItem } from './order-item.entity';

// Order numbers restart per shop, so they are only unique within one.
@Index(['shopId', 'orderNumber'], { unique: true })
// Finding a table's open bill is on the hot path of every dine-in ring-up.
@Index(['shopId', 'tableNumber', 'isPaid'])
@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Shop, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shop_id' })
  shop: Shop;

  @Index()
  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  @Column({ name: 'order_number' })
  orderNumber: string;

  /**
   * Where the order is being served, free text so "7", "A3" or "Terrace 2"
   * all work. NULL means it was not for a table — a counter or takeaway sale.
   */
  @Column({ name: 'table_number', type: 'varchar', length: 16, nullable: true })
  tableNumber: string | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  subtotal: number;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  discount: number;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  tax: number;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  total: number;

  @Column({ name: 'payment_method', type: 'enum', enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.COMPLETED,
  })
  status: OrderStatus;

  /**
   * Whether the money has actually been taken.
   *
   * Payment and service are tracked separately because in a dine-in shop they
   * happen at different moments and in either order: food can go out before
   * the bill is settled, and a bill can be settled before the last dish
   * arrives. Only paid orders count towards takings.
   */
  @Column({ name: 'is_paid', default: false })
  isPaid: boolean;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  /** Whether the food has been served. */
  @Column({ name: 'is_served', default: false })
  isServed: boolean;

  @Column({ name: 'served_at', type: 'timestamptz', nullable: true })
  servedAt: Date | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @OneToMany(() => OrderItem, (item) => item.order, {
    cascade: true,
    eager: true,
  })
  items: OrderItem[];

  @Index()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  /**
   * Not a column: set on the response when a ring-up was added to a table's
   * existing bill rather than starting a new one, so the till can say so
   * instead of leaving staff wondering why no new order appeared.
   */
  appendedToOpenBill?: boolean;
}
