import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { CreateExpenseItemDto } from './dto/create-expense-item.dto';
import { QueryExpenseItemsDto } from './dto/query-expense-items.dto';
import { UpdateExpenseItemDto } from './dto/update-expense-item.dto';
import { ExpenseCategory } from './entities/expense-category.entity';
import { ExpenseItem } from './entities/expense-item.entity';
import { Expense } from './entities/expense.entity';

/**
 * The item catalogue: the list of things the shop buys, kept per category so
 * recording spend is "open the category, pick the item, enter what it cost".
 */
@Injectable()
export class ExpenseItemsService {
  constructor(
    @InjectRepository(ExpenseItem)
    private readonly itemsRepository: Repository<ExpenseItem>,
    @InjectRepository(ExpenseCategory)
    private readonly categoriesRepository: Repository<ExpenseCategory>,
    @InjectRepository(Expense)
    private readonly expensesRepository: Repository<Expense>,
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

  /** The row a name would collide with, if there is one. */
  private findByName(
    name: string,
    categoryId: string,
    shopId: string,
  ): Promise<ExpenseItem | null> {
    return this.itemsRepository.findOne({
      where: { name, categoryId, shopId },
    });
  }

  /** Item names collide only within the same category of the same shop. */
  private async assertNameFree(
    name: string,
    categoryId: string,
    shopId: string,
    exceptId?: string,
  ): Promise<void> {
    const clash = await this.findByName(name, categoryId, shopId);
    if (clash && clash.id !== exceptId) {
      throw new ConflictException(
        'An item with this name already exists in that category',
      );
    }
  }

  /**
   * Adding a name that a retired item already holds revives that item rather
   * than failing: the row is still there only to keep its past entries
   * labelled, so the owner re-adding "তেল" means the same item is back, with
   * whatever unit and price they just typed. A live item of that name is still
   * a conflict.
   */
  async create(
    dto: CreateExpenseItemDto,
    shopId: string,
  ): Promise<ExpenseItem> {
    const name = dto.name.trim();
    await this.assertCategoryExists(dto.categoryId, shopId);

    const existing = await this.findByName(name, dto.categoryId, shopId);
    if (existing?.isActive) {
      throw new ConflictException(
        'An item with this name already exists in that category',
      );
    }
    if (existing) {
      existing.unit = dto.unit?.trim() || existing.unit;
      if (dto.defaultUnitPrice !== undefined) {
        existing.defaultUnitPrice = dto.defaultUnitPrice ?? null;
      }
      existing.isActive = dto.isActive ?? true;
      return this.itemsRepository.save(existing);
    }

    return this.itemsRepository.save(
      this.itemsRepository.create({
        shopId,
        categoryId: dto.categoryId,
        name,
        unit: dto.unit?.trim() || 'pcs',
        defaultUnitPrice: dto.defaultUnitPrice ?? null,
        isActive: dto.isActive ?? true,
      }),
    );
  }

  findAll(query: QueryExpenseItemsDto, shopId: string): Promise<ExpenseItem[]> {
    const where: FindOptionsWhere<ExpenseItem> = { shopId };
    if (query.categoryId) where.categoryId = query.categoryId;
    // Retired items are hidden unless asked for, so pick lists stay short.
    if (!query.includeInactive) where.isActive = true;

    return this.itemsRepository.find({
      where,
      relations: { category: true },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string, shopId: string): Promise<ExpenseItem> {
    const item = await this.itemsRepository.findOne({
      where: { id, shopId },
      relations: { category: true },
    });
    if (!item) {
      throw new NotFoundException('Expense item not found');
    }
    return item;
  }

  async update(
    id: string,
    dto: UpdateExpenseItemDto,
    shopId: string,
  ): Promise<ExpenseItem> {
    /**
     * Loaded without the `category` relation: `save()` lets a loaded relation
     * override the FK column, so a stale `category` object would quietly undo
     * a `categoryId` change. The column is the only source of truth here.
     */
    const item = await this.itemsRepository.findOne({ where: { id, shopId } });
    if (!item) {
      throw new NotFoundException('Expense item not found');
    }

    const categoryId = dto.categoryId ?? item.categoryId;
    if (dto.categoryId && dto.categoryId !== item.categoryId) {
      await this.assertCategoryExists(dto.categoryId, shopId);
    }
    const name = dto.name === undefined ? item.name : dto.name.trim();
    if (name !== item.name || categoryId !== item.categoryId) {
      await this.assertNameFree(name, categoryId, shopId, id);
    }

    item.name = name;
    item.categoryId = categoryId;
    if (dto.unit !== undefined) item.unit = dto.unit?.trim() || item.unit;
    if (dto.defaultUnitPrice !== undefined) {
      item.defaultUnitPrice = dto.defaultUnitPrice ?? null;
    }
    if (dto.isActive !== undefined) item.isActive = dto.isActive;

    await this.itemsRepository.save(item);
    // Re-read so the client gets the category it now belongs to.
    return this.findOne(id, shopId);
  }

  /**
   * Deleting an item that has been bought would take its purchases with it, so
   * it is retired instead: hidden from the pick lists, history untouched. Only
   * an item never used is actually removed.
   *
   * Returns what happened so the client can say which one it was.
   */
  async remove(
    id: string,
    shopId: string,
  ): Promise<{ deleted: boolean; item?: ExpenseItem }> {
    const item = await this.findOne(id, shopId);
    const used = await this.expensesRepository.existsBy({ itemId: id, shopId });

    if (!used) {
      await this.itemsRepository.remove(item);
      return { deleted: true };
    }

    item.isActive = false;
    await this.itemsRepository.save(item);
    return { deleted: false, item };
  }
}
