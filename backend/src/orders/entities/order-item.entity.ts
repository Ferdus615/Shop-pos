import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { decimalTransformer } from '../../common/transformers/decimal.transformer';
import { MenuItem } from '../../menu/entities/menu-item.entity';
import { Order } from './order.entity';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  // Kept for reference; nulled if the menu item is later deleted.
  @ManyToOne(() => MenuItem, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'menu_item_id' })
  menuItem: MenuItem | null;

  @Column({ name: 'menu_item_id', type: 'uuid', nullable: true })
  menuItemId: string | null;

  // Snapshot of name + price at sale time, so historical sales never change.
  @Column({ name: 'name_snapshot' })
  nameSnapshot: string;

  @Column({
    name: 'unit_price',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  unitPrice: number;

  @Column({ type: 'int' })
  quantity: number;

  @Column({
    name: 'line_total',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  lineTotal: number;
}
