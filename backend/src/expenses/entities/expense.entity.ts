import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../../common/transformers/decimal.transformer';
import { Shop } from '../../shops/entities/shop.entity';
import { User } from '../../users/entities/user.entity';
import { ExpenseCategory } from './expense-category.entity';
import { ExpenseItem } from './expense-item.entity';

@Entity('expenses')
export class Expense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Shop, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shop_id' })
  shop: Shop;

  @Index()
  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  /**
   * The item's name as it stood when the entry was recorded. Kept alongside
   * `itemId` on purpose: renaming or retiring an item must not rewrite what
   * the books say was bought. Entries predating the item catalogue have only
   * this, which is why it is still the field every list and export reads.
   */
  @Column()
  title: string;

  @ManyToOne(() => ExpenseItem, (item) => item.expenses, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'item_id' })
  item: ExpenseItem | null;

  @Index()
  @Column({ name: 'item_id', type: 'uuid', nullable: true })
  itemId: string | null;

  /** How much was bought, in `unit`. Null for entries with no quantity. */
  @Column({
    type: 'numeric',
    precision: 12,
    scale: 3,
    nullable: true,
    transformer: decimalTransformer,
  })
  quantity: number | null;

  /** Unit snapshot, so a later change to the item leaves history alone. */
  @Column({ type: 'varchar', nullable: true })
  unit: string | null;

  @Column({
    name: 'unit_price',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  unitPrice: number | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  amount: number;

  // Stored as a plain date (no time component), e.g. '2026-07-12'.
  @Index()
  @Column({ name: 'expense_date', type: 'date' })
  expenseDate: string;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @ManyToOne(() => ExpenseCategory, (category) => category.expenses, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'category_id' })
  category: ExpenseCategory | null;

  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
