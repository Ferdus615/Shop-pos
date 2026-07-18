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

@Injectable()
export class ExpenseCategoriesService {
  constructor(
    @InjectRepository(ExpenseCategory)
    private readonly categoriesRepository: Repository<ExpenseCategory>,
  ) {}

  async create(dto: CreateExpenseCategoryDto): Promise<ExpenseCategory> {
    const existing = await this.categoriesRepository.findOne({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException('An expense category with this name exists');
    }
    return this.categoriesRepository.save(
      this.categoriesRepository.create({ name: dto.name }),
    );
  }

  findAll(): Promise<ExpenseCategory[]> {
    return this.categoriesRepository.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<ExpenseCategory> {
    const category = await this.categoriesRepository.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException('Expense category not found');
    }
    return category;
  }

  async update(
    id: string,
    dto: UpdateExpenseCategoryDto,
  ): Promise<ExpenseCategory> {
    const category = await this.findOne(id);
    if (dto.name && dto.name !== category.name) {
      const existing = await this.categoriesRepository.findOne({
        where: { name: dto.name },
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

  async remove(id: string): Promise<void> {
    const category = await this.findOne(id);
    await this.categoriesRepository.remove(category);
  }
}
