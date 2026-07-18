import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateMenuCategoryDto } from './dto/create-menu-category.dto';
import { UpdateMenuCategoryDto } from './dto/update-menu-category.dto';
import { MenuCategory } from './entities/menu-category.entity';

@Injectable()
export class MenuCategoriesService {
  constructor(
    @InjectRepository(MenuCategory)
    private readonly categoriesRepository: Repository<MenuCategory>,
  ) {}

  create(dto: CreateMenuCategoryDto): Promise<MenuCategory> {
    const category = this.categoriesRepository.create({
      name: dto.name,
      description: dto.description ?? null,
    });
    return this.categoriesRepository.save(category);
  }

  findAll(): Promise<MenuCategory[]> {
    return this.categoriesRepository.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<MenuCategory> {
    const category = await this.categoriesRepository.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException('Menu category not found');
    }
    return category;
  }

  async update(id: string, dto: UpdateMenuCategoryDto): Promise<MenuCategory> {
    const category = await this.findOne(id);
    Object.assign(category, dto);
    return this.categoriesRepository.save(category);
  }

  async remove(id: string): Promise<void> {
    const category = await this.findOne(id);
    // Items keep existing (category_id set to NULL via onDelete: SET NULL).
    await this.categoriesRepository.remove(category);
  }
}
