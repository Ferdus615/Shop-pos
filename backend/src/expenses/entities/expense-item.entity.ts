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
import { decimalTransformer } from '../../common/transformers/decimal.transformer';
import { Shop } from '../../shops/entities/shop.entity';
import { ExpenseCategory } from './expense-category.entity';
import { Expense } from './expense.entity';

/**
 * A thing the shop buys, catalogued once and then reused every time it is
 * bought — "Chicken" under "Groceries", bought at 1 kg today and 2 kg next
 * week. Recording spend picks an item off this list rather than retyping a
 * title, which is what makes per-item history possible at all.
 *
 * An item always belongs to a category: the category is how the item list is
 * browsed, so an item outside one would be unreachable.
 */
// Item names only have to be unique inside one category of one shop.
@Index(['shopId', 'categoryId', 'name'], { unique: true })
@Entity('expense_items')
export class ExpenseItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Shop, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shop_id' })
  shop: Shop;

  @Index()
  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  @ManyToOne(() => ExpenseCategory, (category) => category.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'category_id' })
  category: ExpenseCategory;

  @Index()
  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @Column()
  name: string;

  /** How this item is measured: kg, g, ltr, pcs, pack… */
  @Column({ default: 'pcs' })
  unit: string;

  /**
   * Price per unit, used only to pre-fill the amount when recording spend.
   * The entry keeps its own copy, so changing this never rewrites history.
   */
  @Column({
    name: 'default_unit_price',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  defaultUnitPrice: number | null;

  /**
   * Retired items stay in the table so their past entries keep their name and
   * category; they are just hidden from the pick lists.
   */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => Expense, (expense) => expense.item)
  expenses: Expense[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
