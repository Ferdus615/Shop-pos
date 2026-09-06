import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, Repository } from 'typeorm';
import { ExpenseCategory } from './entities/expense-category.entity';
import { Expense } from './entities/expense.entity';
import { formatDay, parseMonthRange, round2 } from '../common/utils/date.util';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { QueryExpensesDto } from './dto/query-expenses.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import {
  ExpenseCategoryBreakdown,
  ExpenseSummary,
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
    const expense = await this.findOne(id, shopId);
    if (dto.categoryId) {
      await this.assertCategoryExists(dto.categoryId, shopId);
    }
    if (dto.title !== undefined) expense.title = dto.title;
    if (dto.amount !== undefined) expense.amount = dto.amount;
    if (dto.expenseDate !== undefined) expense.expenseDate = dto.expenseDate;
    if (dto.note !== undefined) expense.note = dto.note ?? null;
    if (dto.categoryId !== undefined) {
      expense.categoryId = dto.categoryId;
      // findOne loaded the old `category`, and save lets a loaded relation win
      // over the FK column — leaving it set would write the old id straight
      // back, so recategorizing (and clearing) would silently do nothing.
      expense.category = null;
    }
    return this.expensesRepository.save(expense);
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
    const startDay = formatDay(start);
    const endDay = formatDay(end);

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
      month: resolvedMonth,
      expenseCount: Number(totals?.expenseCount ?? 0),
      totalExpenses: round2(Number(totals?.totalExpenses ?? 0)),
      byCategory,
    };
  }
}
