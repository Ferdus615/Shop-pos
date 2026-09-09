import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, FindOptionsWhere, Repository } from 'typeorm';
import { ExpenseItem } from './entities/expense-item.entity';
import { Expense } from './entities/expense.entity';
import {
  formatDay,
  monthsOfYear,
  parseDayRange,
  parseMonthRange,
  parseYearRange,
  round2,
} from '../common/utils/date.util';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateExpensesBulkDto } from './dto/create-expenses-bulk.dto';
import { QueryExpensesDto } from './dto/query-expenses.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import {
  ExpenseAggregate,
  ExpenseCategoryBreakdown,
  ExpenseDayPoint,
  ExpenseItemBreakdown,
  ExpenseSummary,
  MonthlyExpensePoint,
} from './interfaces/expense-summary.interface';

/**
 * The money side of one entry, before the item's defaults are applied. Shared
 * by a single entry, a basket line and an edit, which differ only in what else
 * they carry.
 */
interface EntryAmountInput {
  amount?: number | null;
  quantity?: number | null;
  unitPrice?: number | null;
  unit?: string | null;
}

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(Expense)
    private readonly expensesRepository: Repository<Expense>,
    @InjectRepository(ExpenseItem)
    private readonly itemsRepository: Repository<ExpenseItem>,
    private readonly dataSource: DataSource,
  ) {}

  /** Scoped: an item id from another shop is treated as invalid. */
  private async loadItem(itemId: string, shopId: string): Promise<ExpenseItem> {
    const item = await this.itemsRepository.findOne({
      where: { id: itemId, shopId },
    });
    if (!item) {
      throw new BadRequestException('Referenced expense item does not exist');
    }
    return item;
  }

  /**
   * Fills an entry in from the item it points at: the title, category, unit
   * and unit price all default to the item's, and every one of them is copied
   * onto the row rather than read through the relation later. That is what
   * keeps a renamed, re-filed or retired item from rewriting old books.
   *
   * The amount is whatever was actually paid when given; otherwise it is
   * quantity × unit price, which is the normal case — 1.5 kg at 320.
   */
  private buildEntryFields(
    line: EntryAmountInput,
    item: ExpenseItem,
  ): {
    title: string;
    categoryId: string;
    itemId: string;
    quantity: number | null;
    unit: string;
    unitPrice: number | null;
    amount: number;
  } {
    const quantity = line.quantity ?? null;
    const unitPrice = line.unitPrice ?? item.defaultUnitPrice ?? null;

    let amount = line.amount;
    if (amount === undefined || amount === null) {
      if (quantity === null || unitPrice === null) {
        throw new BadRequestException(
          `Enter an amount for "${item.name}", or a quantity and a unit price`,
        );
      }
      amount = round2(quantity * unitPrice);
    }

    return {
      title: item.name,
      categoryId: item.categoryId,
      itemId: item.id,
      quantity,
      unit: line.unit?.trim() || item.unit,
      unitPrice,
      amount,
    };
  }

  async create(
    dto: CreateExpenseDto,
    userId: string | null,
    shopId: string,
  ): Promise<Expense> {
    const item = await this.loadItem(dto.itemId, shopId);
    const expense = this.expensesRepository.create({
      shopId,
      ...this.buildEntryFields(dto, item),
      expenseDate: dto.expenseDate ?? formatDay(new Date()),
      note: dto.note?.trim() || null,
      createdById: userId,
    });
    const saved = await this.expensesRepository.save(expense);
    return this.findOne(saved.id, shopId);
  }

  /**
   * A day's basket, saved as one unit. Committed in a transaction so a run of
   * lines cannot land half-recorded and leave the day's total wrong; the items
   * are all looked up first, so a bad id fails before anything is written.
   */
  async createMany(
    dto: CreateExpensesBulkDto,
    userId: string | null,
    shopId: string,
  ): Promise<Expense[]> {
    const expenseDate = dto.expenseDate ?? formatDay(new Date());

    // One query for every item in the basket, then resolved from the map.
    const items = await this.itemsRepository.find({
      where: dto.entries.map((line) => ({ id: line.itemId, shopId })),
    });
    const byId = new Map(items.map((item) => [item.id, item]));

    const rows = dto.entries.map((line) => {
      const item = byId.get(line.itemId);
      if (!item) {
        throw new BadRequestException('Referenced expense item does not exist');
      }
      return {
        shopId,
        ...this.buildEntryFields(line, item),
        expenseDate,
        note: line.note?.trim() || null,
        createdById: userId,
      };
    });

    const savedIds = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Expense);
      const saved = await repo.save(rows.map((row) => repo.create(row)));
      return saved.map((entry) => entry.id);
    });

    return this.expensesRepository.find({
      where: savedIds.map((id) => ({ id, shopId })),
      relations: { category: true, item: true },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * The entry list. A `date` narrows it to that one day — the day-by-day view
   * this screen is built around — and without one it falls back to the whole
   * month, which is what the month navigation and the exports read.
   */
  findAll(query: QueryExpensesDto, shopId: string): Promise<Expense[]> {
    const where: FindOptionsWhere<Expense> = { shopId };

    if (query.date) {
      where.expenseDate = query.date;
    } else {
      // Default to the current month when no month filter is provided.
      const { start, end } = parseMonthRange(query.month);
      where.expenseDate = Between(formatDay(start), formatDay(end));
    }

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }
    if (query.itemId) {
      where.itemId = query.itemId;
    }

    return this.expensesRepository.find({
      where,
      relations: { category: true, item: true },
      order: { expenseDate: 'DESC', createdAt: 'DESC' },
    });
  }

  async findOne(id: string, shopId: string): Promise<Expense> {
    const expense = await this.expensesRepository.findOne({
      where: { id, shopId },
      relations: { category: true, item: true },
    });
    if (!expense) {
      throw new NotFoundException('Expense not found');
    }
    return expense;
  }

  /**
   * Editing an entry. Past entries stay intact by default: only the fields
   * actually sent are touched, and switching the item re-derives the title,
   * category, unit and price from the new one — the same rules a fresh entry
   * follows. Entries recorded before the item catalogue keep their typed title
   * and no item unless one is chosen here.
   */
  async update(
    id: string,
    dto: UpdateExpenseDto,
    shopId: string,
  ): Promise<Expense> {
    /**
     * Loaded **without** the category or item relations, deliberately.
     *
     * `save()` lets a loaded relation take precedence over the FK column, and
     * the two disagreeing is silent data loss: with the stale `category`
     * object attached, a new `categoryId` was overwritten by the old one, and
     * nulling the relation to force the column through wiped the category of
     * any expense saved with its category unchanged. With no relation loaded,
     * the FK columns are the single source of truth.
     */
    const expense = await this.expensesRepository.findOne({
      where: { id, shopId },
    });
    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    if (dto.itemId && dto.itemId !== expense.itemId) {
      // A different item: re-derive everything the item owns.
      const item = await this.loadItem(dto.itemId, shopId);
      const fields = this.buildEntryFields(
        {
          ...dto,
          // Fall back to what the entry already holds, so an item swap alone
          // does not silently drop the quantity that was recorded.
          quantity: dto.quantity ?? expense.quantity,
          unitPrice: dto.unitPrice ?? null,
          amount: dto.amount ?? expense.amount,
        },
        item,
      );
      Object.assign(expense, fields);
    } else {
      if (dto.quantity !== undefined) expense.quantity = dto.quantity ?? null;
      if (dto.unit !== undefined) expense.unit = dto.unit?.trim() || null;
      if (dto.unitPrice !== undefined) {
        expense.unitPrice = dto.unitPrice ?? null;
      }
      if (dto.amount !== undefined) {
        expense.amount = dto.amount;
      } else if (
        // No explicit amount, but the maths behind it moved — recompute.
        (dto.quantity !== undefined || dto.unitPrice !== undefined) &&
        expense.quantity !== null &&
        expense.unitPrice !== null
      ) {
        expense.amount = round2(expense.quantity * expense.unitPrice);
      }
    }

    if (dto.expenseDate !== undefined) expense.expenseDate = dto.expenseDate;
    if (dto.note !== undefined) expense.note = dto.note?.trim() || null;

    await this.expensesRepository.save(expense);
    // Re-read so the client gets the item and category it now belongs to.
    return this.findOne(id, shopId);
  }

  async remove(id: string, shopId: string): Promise<void> {
    const expense = await this.findOne(id, shopId);
    await this.expensesRepository.remove(expense);
  }

  /** Monthly expense summary. Defaults to the current month. */
  async getMonthlySummary(
    shopId: string,
    month?: string,
  ): Promise<ExpenseSummary> {
    const { start, end, month: resolvedMonth } = parseMonthRange(month);
    return {
      month: resolvedMonth,
      ...(await this.aggregateExpenses(
        shopId,
        formatDay(start),
        formatDay(end),
      )),
    };
  }

  /** One day's expenses. Defaults to today. */
  async getDailySummary(
    shopId: string,
    date?: string,
  ): Promise<ExpenseAggregate & { date: string }> {
    const { start, end, day } = parseDayRange(date);
    return {
      date: day,
      ...(await this.aggregateExpenses(
        shopId,
        formatDay(start),
        formatDay(end),
      )),
    };
  }

  /** A whole year's expenses (YYYY). Defaults to this year. */
  async getYearlySummary(
    shopId: string,
    year?: string,
  ): Promise<ExpenseAggregate & { year: string }> {
    const { start, end, year: resolved } = parseYearRange(year);
    return {
      year: resolved,
      ...(await this.aggregateExpenses(
        shopId,
        formatDay(start),
        formatDay(end),
      )),
    };
  }

  /**
   * Every day of a month that has spending on it, with that day's total.
   *
   * Only days with entries come back: this drives the day-picker list, where a
   * run of empty days is noise rather than information — "today chicken,
   * tomorrow 7up, biscuit, bread" is the shape being shown.
   */
  async getDays(shopId: string, month?: string): Promise<ExpenseDayPoint[]> {
    const { start, end } = parseMonthRange(month);

    const rows = await this.expensesRepository
      .createQueryBuilder('expense')
      .select('expense.expense_date', 'date')
      .addSelect('COUNT(*)', 'entryCount')
      .addSelect('COALESCE(SUM(expense.amount), 0)', 'total')
      .where('expense.shop_id = :shopId', { shopId })
      .andWhere('expense.expense_date BETWEEN :startDay AND :endDay', {
        startDay: formatDay(start),
        endDay: formatDay(end),
      })
      .groupBy('expense.expense_date')
      .orderBy('expense.expense_date', 'DESC')
      .getRawMany<{ date: string | Date; entryCount: string; total: string }>();

    return rows.map((row) => ({
      // `date` columns come back as a string on some drivers, a Date on others.
      date: row.date instanceof Date ? formatDay(row.date) : String(row.date),
      entryCount: Number(row.entryCount),
      total: round2(Number(row.total)),
    }));
  }

  /**
   * Spend per month across a calendar year, including months with nothing
   * recorded so a trend has no gaps in it.
   */
  async getMonthlyExpenseSeries(
    shopId: string,
    year?: string,
  ): Promise<MonthlyExpensePoint[]> {
    const { start, end, year: resolved } = parseYearRange(year);

    const rows = await this.expensesRepository
      .createQueryBuilder('expense')
      // expense_date is a plain date, so the month needs no zone conversion.
      .select("to_char(expense.expense_date, 'YYYY-MM')", 'month')
      .addSelect('COUNT(*)', 'expenseCount')
      .addSelect('COALESCE(SUM(expense.amount), 0)', 'totalExpenses')
      .where('expense.shop_id = :shopId', { shopId })
      .andWhere('expense.expense_date BETWEEN :startDay AND :endDay', {
        startDay: formatDay(start),
        endDay: formatDay(end),
      })
      .groupBy('month')
      .getRawMany<{
        month: string;
        expenseCount: string;
        totalExpenses: string;
      }>();

    const byMonth = new Map(rows.map((r) => [r.month, r]));
    return monthsOfYear(resolved).map((month) => {
      const row = byMonth.get(month);
      return {
        month,
        expenseCount: Number(row?.expenseCount ?? 0),
        totalExpenses: round2(Number(row?.totalExpenses ?? 0)),
      };
    });
  }

  /**
   * The shared aggregate behind the daily, monthly and yearly views: the
   * total, the entry count, and the per-category split over one date range.
   */
  private async aggregateExpenses(
    shopId: string,
    startDay: string,
    endDay: string,
  ): Promise<ExpenseAggregate> {
    const totals = await this.expensesRepository
      .createQueryBuilder('expense')
      .select('COUNT(*)', 'expenseCount')
      .addSelect('COALESCE(SUM(expense.amount), 0)', 'totalExpenses')
      .where('expense.shop_id = :shopId', { shopId })
      .andWhere('expense.expense_date BETWEEN :startDay AND :endDay', {
        startDay,
        endDay,
      })
      .getRawOne<{ expenseCount: string; totalExpenses: string }>();

    const categoryRows = await this.expensesRepository
      .createQueryBuilder('expense')
      .leftJoin('expense.category', 'category')
      .select('expense.category_id', 'categoryId')
      .addSelect("COALESCE(category.name, 'Uncategorized')", 'categoryName')
      .addSelect('COUNT(*)', 'expenseCount')
      .addSelect('COALESCE(SUM(expense.amount), 0)', 'total')
      .where('expense.shop_id = :shopId', { shopId })
      .andWhere('expense.expense_date BETWEEN :startDay AND :endDay', {
        startDay,
        endDay,
      })
      .groupBy('expense.category_id')
      .addGroupBy('category.name')
      .orderBy('total', 'DESC')
      .getRawMany<{
        categoryId: string | null;
        categoryName: string;
        expenseCount: string;
        total: string;
      }>();

    /**
     * The same split by item, so a period can be read as "what did we keep
     * buying" and not only "which category swallowed the money".
     */
    const itemRows = await this.expensesRepository
      .createQueryBuilder('expense')
      .select('expense.item_id', 'itemId')
      // Falls back to the stored title for entries with no item behind them.
      .addSelect('expense.title', 'itemName')
      .addSelect('COUNT(*)', 'entryCount')
      .addSelect('COALESCE(SUM(expense.quantity), 0)', 'totalQuantity')
      .addSelect('MAX(expense.unit)', 'unit')
      .addSelect('COALESCE(SUM(expense.amount), 0)', 'total')
      .where('expense.shop_id = :shopId', { shopId })
      .andWhere('expense.expense_date BETWEEN :startDay AND :endDay', {
        startDay,
        endDay,
      })
      .groupBy('expense.item_id')
      .addGroupBy('expense.title')
      .orderBy('total', 'DESC')
      .getRawMany<{
        itemId: string | null;
        itemName: string;
        entryCount: string;
        totalQuantity: string;
        unit: string | null;
        total: string;
      }>();

    const byItem: ExpenseItemBreakdown[] = itemRows.map((row) => ({
      itemId: row.itemId,
      itemName: row.itemName,
      entryCount: Number(row.entryCount),
      totalQuantity: Number(row.totalQuantity),
      unit: row.unit,
      total: round2(Number(row.total)),
    }));

    const byCategory: ExpenseCategoryBreakdown[] = categoryRows.map((row) => ({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      expenseCount: Number(row.expenseCount),
      total: round2(Number(row.total)),
    }));

    return {
      expenseCount: Number(totals?.expenseCount ?? 0),
      totalExpenses: round2(Number(totals?.totalExpenses ?? 0)),
      byCategory,
      byItem,
    };
  }
}
