import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Shop } from '../../shops/entities/shop.entity';

/**
 * The bridge process attached to a shop's printer.
 *
 * Exists so a till can ask "is the printer reachable right now?" before it
 * queues a job — if no station has checked in recently the POS falls back to
 * the browser print dialog instead of silently queueing a slip nobody prints.
 */
@Entity('print_stations')
export class PrintStation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Shop, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shop_id' })
  shop: Shop;

  /** One station per shop; a second bridge checking in takes over this row. */
  @Column({ name: 'shop_id', type: 'uuid', unique: true })
  shopId: string;

  /** Free-text label from the bridge's config, e.g. "Counter PC". */
  @Column({ type: 'varchar' })
  name: string;

  /** Whether the bridge's last check-in had the printer port open. */
  @Column({ name: 'printer_connected', default: false })
  printerConnected: boolean;

  /** Printer-side error from the bridge, e.g. "COM3: Access denied". */
  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
