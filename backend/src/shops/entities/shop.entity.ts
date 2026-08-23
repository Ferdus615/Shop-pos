import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A tenant. Every piece of trading data (menu, orders, expenses, staff)
 * belongs to exactly one shop and is never visible from another.
 */
@Entity('shops')
export class Shop {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  /** URL-safe handle, e.g. "naval-bay". Unique across the platform. */
  @Column({ unique: true })
  slug: string;

  /** Printed on receipts under the shop name. */
  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  /** Deactivating a shop blocks login for every user that belongs to it. */
  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
