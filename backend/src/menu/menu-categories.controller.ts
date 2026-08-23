import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentShop } from '../common/decorators/current-shop.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CreateMenuCategoryDto } from './dto/create-menu-category.dto';
import { UpdateMenuCategoryDto } from './dto/update-menu-category.dto';
import { MenuCategoriesService } from './menu-categories.service';

@ApiTags('menu-categories')
@ApiBearerAuth()
@Controller('menu/categories')
export class MenuCategoriesController {
  constructor(private readonly categoriesService: MenuCategoriesService) {}

  // Reads: any authenticated user (owner + staff).
  @Get()
  findAll(@CurrentShop() shopId: string) {
    return this.categoriesService.findAll(shopId);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentShop() shopId: string,
  ) {
    return this.categoriesService.findOne(id, shopId);
  }

  // Mutations: owner only.
  @Post()
  @Roles(Role.OWNER)
  create(@Body() dto: CreateMenuCategoryDto, @CurrentShop() shopId: string) {
    return this.categoriesService.create(dto, shopId);
  }

  @Patch(':id')
  @Roles(Role.OWNER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMenuCategoryDto,
    @CurrentShop() shopId: string,
  ) {
    return this.categoriesService.update(id, dto, shopId);
  }

  @Delete(':id')
  @Roles(Role.OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentShop() shopId: string,
  ) {
    return this.categoriesService.remove(id, shopId);
  }
}
