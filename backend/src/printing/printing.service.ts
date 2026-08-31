import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import { PrintJobStatus } from '../common/enums/print-job-status.enum';
import { CreatePrintJobDto } from './dto/create-print-job.dto';
import { ClaimPrintJobsDto } from './dto/claim-print-jobs.dto';
import { AckPrintJobDto } from './dto/ack-print-job.dto';
import { QueryPrintJobsDto } from './dto/query-print-jobs.dto';
import { PrintJob } from './entities/print-job.entity';
import { PrintStation } from './entities/print-station.entity';
import { PrinterStatus } from './interfaces/printer-status.interface';

/** Give up on a slip after this many failed attempts. */
const MAX_ATTEMPTS = 3;

/**
 * A claimed job with no verdict after this long is assumed lost (the bridge
 * crashed or lost power mid-print) and goes back on the queue.
 */
const STALE_CLAIM_MS = 60_000;

/** A station that has not polled within this window counts as offline. */
const STATION_ONLINE_MS = 30_000;

/** Jobs older than this are never printed — nobody wants yesterday's receipt. */
const JOB_EXPIRY_MS = 10 * 60_000;

@Injectable()
export class PrintingService {
  private readonly logger = new Logger(PrintingService.name);

  constructor(
    @InjectRepository(PrintJob)
    private readonly jobs: Repository<PrintJob>,
    @InjectRepository(PrintStation)
    private readonly stations: Repository<PrintStation>,
    private readonly dataSource: DataSource,
  ) {}

  /** Queue a slip for the shop's bridge to print. */
  async enqueue(dto: CreatePrintJobDto, shopId: string): Promise<PrintJob> {
    const job = this.jobs.create({
      shopId,
      type: dto.type,
      payload: dto.payload,
      status: PrintJobStatus.PENDING,
    });
    return this.jobs.save(job);
  }

  /**
   * Hand the caller's station up to `limit` jobs and mark them PRINTING.
   *
   * `FOR UPDATE SKIP LOCKED` is what makes this safe to call concurrently:
   * two bridges polling the same shop each get a disjoint set rather than
   * both printing the same receipt.
   */
  async claim(dto: ClaimPrintJobsDto, shopId: string): Promise<PrintJob[]> {
    await this.heartbeat(dto, shopId);
    await this.requeueStale(shopId);
    await this.expireStale(shopId);

    const limit = dto.limit ?? 5;

    return this.dataSource.transaction(async (manager) => {
      const rows = await manager
        .createQueryBuilder(PrintJob, 'job')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where('job.shop_id = :shopId', { shopId })
        .andWhere('job.status = :status', { status: PrintJobStatus.PENDING })
        .orderBy('job.created_at', 'ASC')
        .limit(limit)
        .getMany();

      if (!rows.length) return [];

      // Counted at claim time, so a bridge that dies mid-print still burns an
      // attempt and the job cannot loop forever.
      await manager
        .createQueryBuilder()
        .update(PrintJob)
        .set({
          status: PrintJobStatus.PRINTING,
          claimedAt: new Date(),
          attempts: () => '"attempts" + 1',
        })
        .whereInIds(rows.map((r) => r.id))
        .execute();

      return rows.map((row) => ({
        ...row,
        status: PrintJobStatus.PRINTING,
        attempts: row.attempts + 1,
      }));
    });
  }

  /** Record the bridge's verdict on a claimed job. */
  async ack(
    id: string,
    dto: AckPrintJobDto,
    shopId: string,
  ): Promise<PrintJob> {
    const job = await this.jobs.findOne({ where: { id, shopId } });
    if (!job) {
      throw new NotFoundException('Print job not found');
    }

    if (dto.success) {
      job.status = PrintJobStatus.DONE;
      job.error = null;
    } else {
      job.error = dto.error ?? 'Unknown printer error';
      // Out of attempts: stop retrying so the queue cannot wedge.
      job.status =
        job.attempts >= MAX_ATTEMPTS
          ? PrintJobStatus.FAILED
          : PrintJobStatus.PENDING;
      job.claimedAt = null;
      this.logger.warn(
        `Print job ${id} failed (attempt ${job.attempts}/${MAX_ATTEMPTS}): ${job.error}`,
      );
    }

    return this.jobs.save(job);
  }

  /** What the POS checks before queueing rather than printing in-browser. */
  async getPrinterStatus(shopId: string): Promise<PrinterStatus> {
    const [station, pendingJobs] = await Promise.all([
      this.stations.findOne({ where: { shopId } }),
      this.jobs.count({
        where: {
          shopId,
          status: In([PrintJobStatus.PENDING, PrintJobStatus.PRINTING]),
        },
      }),
    ]);

    const stationOnline =
      !!station &&
      Date.now() - station.lastSeenAt.getTime() < STATION_ONLINE_MS;

    return {
      online: stationOnline && station.printerConnected,
      stationOnline,
      stationName: station?.name ?? null,
      lastSeenAt: station?.lastSeenAt.toISOString() ?? null,
      lastError: station?.lastError ?? null,
      pendingJobs,
    };
  }

  async findAll(query: QueryPrintJobsDto, shopId: string): Promise<PrintJob[]> {
    return this.jobs.find({
      where: { shopId, ...(query.status ? { status: query.status } : {}) },
      order: { createdAt: 'DESC' },
      take: query.limit ?? 50,
    });
  }

  /** Put a failed slip back on the queue with a fresh attempt budget. */
  async retry(id: string, shopId: string): Promise<PrintJob> {
    const job = await this.jobs.findOne({ where: { id, shopId } });
    if (!job) {
      throw new NotFoundException('Print job not found');
    }
    job.status = PrintJobStatus.PENDING;
    job.attempts = 0;
    job.error = null;
    job.claimedAt = null;
    return this.jobs.save(job);
  }

  /** Upsert the shop's station row. One station per shop; last writer wins. */
  private async heartbeat(
    dto: ClaimPrintJobsDto,
    shopId: string,
  ): Promise<void> {
    await this.stations.upsert(
      {
        shopId,
        name: dto.name ?? 'Print station',
        printerConnected: dto.printerConnected ?? false,
        lastError: dto.lastError ?? null,
        lastSeenAt: new Date(),
      },
      { conflictPaths: ['shopId'] },
    );
  }

  /** Return jobs abandoned mid-print to the queue, or fail them for good. */
  private async requeueStale(shopId: string): Promise<void> {
    const cutoff = new Date(Date.now() - STALE_CLAIM_MS);

    await this.jobs.update(
      {
        shopId,
        status: PrintJobStatus.PRINTING,
        claimedAt: LessThan(cutoff),
        attempts: LessThan(MAX_ATTEMPTS),
      },
      { status: PrintJobStatus.PENDING, claimedAt: null },
    );

    await this.jobs.update(
      {
        shopId,
        status: PrintJobStatus.PRINTING,
        claimedAt: LessThan(cutoff),
        attempts: MoreThanOrEqual(MAX_ATTEMPTS),
      },
      {
        status: PrintJobStatus.FAILED,
        error: 'Print station stopped responding',
      },
    );
  }

  /**
   * Drop slips that waited too long. When the bridge comes back after an hour
   * offline, the staff want a working printer — not an hour of stale receipts.
   */
  private async expireStale(shopId: string): Promise<void> {
    await this.jobs.update(
      {
        shopId,
        status: PrintJobStatus.PENDING,
        createdAt: LessThan(new Date(Date.now() - JOB_EXPIRY_MS)),
      },
      { status: PrintJobStatus.FAILED, error: 'Expired before it could print' },
    );
  }
}
