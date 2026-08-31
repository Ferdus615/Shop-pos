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
import { PrintJobStatus } from '../../common/enums/print-job-status.enum';
import { PrintJobType } from '../../common/enums/print-job-type.enum';
import { Shop } from '../../shops/entities/shop.entity';

/**
 * One slip waiting to come out of a shop's Bluetooth printer.
 *
 * The tills cannot reach the printer themselves — Android Chrome cannot open
 * a Bluetooth Classic serial port and iOS blocks it outright — so they drop a
 * job here and a bridge process running on the shop's counter PC claims it,
 * renders ESC/POS, and writes it to the printer.
 *
 * `payload` is stored as-is: it is the same object the frontend already builds
 * for browser printing, so both paths render from one shape.
 */
@Index(['shopId', 'status'])
@Entity('print_jobs')
export class PrintJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Shop, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shop_id' })
  shop: Shop;

  @Index()
  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  @Column({ type: 'enum', enum: PrintJobType })
  type: PrintJobType;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: PrintJobStatus,
    default: PrintJobStatus.PENDING,
  })
  status: PrintJobStatus;

  /** Incremented on every claim, so a job that keeps failing gives up. */
  @Column({ type: 'int', default: 0 })
  attempts: number;

  /** Last failure reported by the bridge. */
  @Column({ type: 'text', nullable: true })
  error: string | null;

  /** When the current station claimed it — used to requeue stale jobs. */
  @Column({ name: 'claimed_at', type: 'timestamptz', nullable: true })
  claimedAt: Date | null;

  @Index()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
