import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Shop } from '../../shops/entities/shop.entity';
import { Expense } from './expense.entity';

// Category names only have to be unique inside one shop.
@Index(['shopId', 'name'], { unique: true })
@Entity('expense_categories')
export class ExpenseCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Shop, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shop_id' })
  shop: Shop;

  @Index()
  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  @Column()
  name: string;

  @OneToMany(() => Expense, (expense) => expense.category)
  expenses: Expense[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
