import { Exclude } from 'class-transformer';
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
import { Role } from '../../common/enums/role.enum';
import { Shop } from '../../shops/entities/shop.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  /**
   * Unique across the whole platform, not per shop. Login takes an email and
   * nothing else, so the address has to identify one account unambiguously —
   * that is what lets us resolve the shop from the credentials alone, with no
   * shop picker on the login screen.
   */
  @Column({ unique: true })
  email: string;

  // select:false keeps the hash out of DB reads; @Exclude keeps it out of
  // serialized responses even when it is set in memory (e.g. right after create).
  @Exclude()
  @Column({ name: 'password_hash', select: false })
  passwordHash: string;

  @Column({ type: 'enum', enum: Role, default: Role.STAFF })
  role: Role;

  /**
   * The tenant this user works for. NULL only for SUPER_ADMIN, who sits above
   * every shop and belongs to none.
   */
  @ManyToOne(() => Shop, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shop_id' })
  shop: Shop | null;

  @Index()
  @Column({ name: 'shop_id', type: 'uuid', nullable: true })
  shopId: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
