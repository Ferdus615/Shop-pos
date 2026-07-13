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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { QueryMenuItemDto } from './dto/query-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { MenuItemsService } from './menu-items.service';

@ApiTags('menu-items')
@ApiBearerAuth()
@Controller('menu/items')
export class MenuItemsController {
  constructor(private readonly itemsService: MenuItemsService) {}

  // Reads: any authenticated user (owner + staff).
  @Get()
  findAll(@Query() query: QueryMenuItemDto) {
    return this.itemsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.itemsService.findOne(id);
  }

  // Mutations: owner only.
  @Post()
  @Roles(Role.OWNER)
  create(@Body() dto: CreateMenuItemDto) {
    return this.itemsService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.OWNER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMenuItemDto,
  ) {
    return this.itemsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.itemsService.remove(id);
  }
}
