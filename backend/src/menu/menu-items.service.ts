import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { QueryMenuItemDto } from './dto/query-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { MenuCategory } from './entities/menu-category.entity';
import { MenuItem } from './entities/menu-item.entity';

@Injectable()
export class MenuItemsService {
  constructor(
    @InjectRepository(MenuItem)
    private readonly itemsRepository: Repository<MenuItem>,
    @InjectRepository(MenuCategory)
    private readonly categoriesRepository: Repository<MenuCategory>,
  ) {}

  private async assertCategoryExists(categoryId: string): Promise<void> {
    const exists = await this.categoriesRepository.existsBy({ id: categoryId });
    if (!exists) {
      throw new BadRequestException('Referenced menu category does not exist');
    }
  }

  async create(dto: CreateMenuItemDto): Promise<MenuItem> {
    if (dto.categoryId) {
      await this.assertCategoryExists(dto.categoryId);
    }
    const item = this.itemsRepository.create({
      name: dto.name,
      description: dto.description ?? null,
      price: dto.price,
      categoryId: dto.categoryId ?? null,
      isAvailable: dto.isAvailable ?? true,
      imageUrl: dto.imageUrl ?? null,
    });
    return this.itemsRepository.save(item);
  }

  findAll(query: QueryMenuItemDto): Promise<MenuItem[]> {
    const where: FindOptionsWhere<MenuItem> = {};
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.available !== undefined) where.isAvailable = query.available;

    return this.itemsRepository.find({
      where,
      relations: { category: true },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<MenuItem> {
    const item = await this.itemsRepository.findOne({
      where: { id },
      relations: { category: true },
    });
    if (!item) {
      throw new NotFoundException('Menu item not found');
    }
    return item;
  }

  /** Load several items at once (used when creating an order). */
  findByIds(ids: string[]): Promise<MenuItem[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.itemsRepository.findBy({ id: In(ids) });
  }

  async update(id: string, dto: UpdateMenuItemDto): Promise<MenuItem> {
    const item = await this.findOne(id);
    if (dto.categoryId) {
      await this.assertCategoryExists(dto.categoryId);
    }
    Object.assign(item, {
      ...dto,
      categoryId: dto.categoryId ?? item.categoryId,
    });
    return this.itemsRepository.save(item);
  }

  async remove(id: string): Promise<void> {
    const item = await this.findOne(id);
    await this.itemsRepository.remove(item);
  }
}
