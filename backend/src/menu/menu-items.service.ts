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

  /** Scoped: a category id belonging to another shop is treated as invalid. */
  private async assertCategoryExists(
    categoryId: string,
    shopId: string,
  ): Promise<void> {
    const exists = await this.categoriesRepository.existsBy({
      id: categoryId,
      shopId,
    });
    if (!exists) {
      throw new BadRequestException('Referenced menu category does not exist');
    }
  }

  async create(dto: CreateMenuItemDto, shopId: string): Promise<MenuItem> {
    if (dto.categoryId) {
      await this.assertCategoryExists(dto.categoryId, shopId);
    }
    const item = this.itemsRepository.create({
      shopId,
      name: dto.name,
      description: dto.description ?? null,
      price: dto.price,
      categoryId: dto.categoryId ?? null,
      isAvailable: dto.isAvailable ?? true,
      imageUrl: dto.imageUrl ?? null,
    });
    return this.itemsRepository.save(item);
  }

  findAll(query: QueryMenuItemDto, shopId: string): Promise<MenuItem[]> {
    const where: FindOptionsWhere<MenuItem> = { shopId };
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.available !== undefined) where.isAvailable = query.available;

    return this.itemsRepository.find({
      where,
      relations: { category: true },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string, shopId: string): Promise<MenuItem> {
    const item = await this.itemsRepository.findOne({
      where: { id, shopId },
      relations: { category: true },
    });
    if (!item) {
      throw new NotFoundException('Menu item not found');
    }
    return item;
  }

  /** Load several items at once (used when creating an order). */
  findByIds(ids: string[], shopId: string): Promise<MenuItem[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.itemsRepository.findBy({ id: In(ids), shopId });
  }

  async update(
    id: string,
    dto: UpdateMenuItemDto,
    shopId: string,
  ): Promise<MenuItem> {
    const item = await this.findOne(id, shopId);
    if (dto.categoryId) {
      await this.assertCategoryExists(dto.categoryId, shopId);
    }
    Object.assign(item, {
      ...dto,
      categoryId: dto.categoryId ?? item.categoryId,
      // Never let a payload move an item to another shop.
      shopId: item.shopId,
    });
    return this.itemsRepository.save(item);
  }

  async remove(id: string, shopId: string): Promise<void> {
    const item = await this.findOne(id, shopId);
    await this.itemsRepository.remove(item);
  }
}
