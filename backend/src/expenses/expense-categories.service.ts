import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';
import { ExpenseCategory } from './entities/expense-category.entity';
import { ExpenseItem } from './entities/expense-item.entity';

@Injectable()
export class ExpenseCategoriesService {
  constructor(
    @InjectRepository(ExpenseCategory)
    private readonly categoriesRepository: Repository<ExpenseCategory>,
    @InjectRepository(ExpenseItem)
    private readonly itemsRepository: Repository<ExpenseItem>,
  ) {}

  async create(
    dto: CreateExpenseCategoryDto,
    shopId: string,
  ): Promise<ExpenseCategory> {
    // Names only have to be unique within the shop.
    const existing = await this.categoriesRepository.findOne({
      where: { name: dto.name, shopId },
    });
    if (existing) {
      throw new ConflictException('An expense category with this name exists');
    }
    return this.categoriesRepository.save(
      this.categoriesRepository.create({ name: dto.name, shopId }),
    );
  }

  findAll(shopId: string): Promise<ExpenseCategory[]> {
    return this.categoriesRepository.find({
      where: { shopId },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string, shopId: string): Promise<ExpenseCategory> {
    const category = await this.categoriesRepository.findOne({
      where: { id, shopId },
    });
    if (!category) {
      throw new NotFoundException('Expense category not found');
    }
    return category;
  }

  async update(
    id: string,
    dto: UpdateExpenseCategoryDto,
    shopId: string,
  ): Promise<ExpenseCategory> {
    const category = await this.findOne(id, shopId);
    if (dto.name && dto.name !== category.name) {
      const existing = await this.categoriesRepository.findOne({
        where: { name: dto.name, shopId },
      });
      if (existing) {
        throw new ConflictException(
          'An expense category with this name exists',
        );
      }
      category.name = dto.name;
    }
    return this.categoriesRepository.save(category);
  }

  /**
   * Refused while the category still holds items. Deleting it would cascade
   * the whole item list away — and with it the only place the shop's buying
   * history is organised — so emptying it is made an explicit decision.
   */
  async remove(id: string, shopId: string): Promise<void> {
    const category = await this.findOne(id, shopId);
    const itemCount = await this.itemsRepository.countBy({
      categoryId: id,
      shopId,
    });
    if (itemCount > 0) {
      throw new ConflictException(
        `"${category.name}" still has ${itemCount} item(s). Move or delete them first.`,
      );
    }
    await this.categoriesRepository.remove(category);
  }
}
