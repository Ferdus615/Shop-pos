import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, Repository } from 'typeorm';
import { ExpenseCategory } from './entities/expense-category.entity';
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
import { QueryExpensesDto } from './dto/query-expenses.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import {
  ExpenseAggregate,
  ExpenseCategoryBreakdown,
  ExpenseSummary,
  MonthlyExpensePoint,
} from './interfaces/expense-summary.interface';

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(Expense)
    private readonly expensesRepository: Repository<Expense>,
    @InjectRepository(ExpenseCategory)
    private readonly categoriesRepository: Repository<ExpenseCategory>,
  ) {}

  /** Scoped: a category id from another shop is treated as invalid. */
  private async assertCategoryExists(
    categoryId: string,
    shopId: string,
  ): Promise<void> {
    const exists = await this.categoriesRepository.existsBy({
      id: categoryId,
      shopId,
    });
    if (!exists) {
      throw new BadRequestException(
        'Referenced expense category does not exist',
      );
    }
  }

  async create(
    dto: CreateExpenseDto,
    userId: string | null,
    shopId: string,
  ): Promise<Expense> {
    if (dto.categoryId) {
      await this.assertCategoryExists(dto.categoryId, shopId);
    }
    const expense = this.expensesRepository.create({
      shopId,
      title: dto.title,
      amount: dto.amount,
      expenseDate: dto.expenseDate ?? formatDay(new Date()),
      note: dto.note ?? null,
      categoryId: dto.categoryId ?? null,
      createdById: userId,
    });
    return this.expensesRepository.save(expense);
  }

  findAll(query: QueryExpensesDto, shopId: string): Promise<Expense[]> {
    const where: FindOptionsWhere<Expense> = { shopId };

    // Default to the current month when no month filter is provided.
    const { start, end } = parseMonthRange(query.month);
    where.expenseDate = Between(formatDay(start), formatDay(end));

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    return this.expensesRepository.find({
      where,
      relations: { category: true },
      order: { expenseDate: 'DESC', createdAt: 'DESC' },
    });
  }

  async findOne(id: string, shopId: string): Promise<Expense> {
    const expense = await this.expensesRepository.findOne({
      where: { id, shopId },
      relations: { category: true },
    });
    if (!expense) {
      throw new NotFoundException('Expense not found');
    }
    return expense;
  }

  async update(
    id: string,
    dto: UpdateExpenseDto,
    shopId: string,
  ): Promise<Expense> {
    /**
     * Loaded **without** the category relation, deliberately.
     *
     * `save()` lets a loaded relation take precedence over the FK column, and
     * the two disagreeing is silent data loss: with the stale `category`
     * object attached, a new `categoryId` was overwritten by the old one, and
     * nulling the relation to force the column through wiped the category of
     * any expense saved with its category unchanged. With no relation loaded,
     * `categoryId` is the single source of truth.
     */
    const expense = await this.expensesRepository.findOne({
      where: { id, shopId },
    });
    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    if (dto.categoryId) {
      await this.assertCategoryExists(dto.categoryId, shopId);
    }
    if (dto.title !== undefined) expense.title = dto.title;
    if (dto.amount !== undefined) expense.amount = dto.amount;
    if (dto.expenseDate !== undefined) expense.expenseDate = dto.expenseDate;
    if (dto.note !== undefined) expense.note = dto.note ?? null;
    if (dto.categoryId !== undefined) expense.categoryId = dto.categoryId;

    await this.expensesRepository.save(expense);
    // Re-read so the client gets the category it now belongs to.
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
    };
  }
}
