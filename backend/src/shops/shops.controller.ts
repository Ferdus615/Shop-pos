import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { ShopsService } from './shops.service';

/** Platform administration. Shop users have no access to any of this. */
@ApiTags('shops')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN)
@Controller('shops')
export class ShopsController {
  constructor(private readonly shopsService: ShopsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a shop together with its first owner' })
  create(@Body() dto: CreateShopDto) {
    return this.shopsService.create(dto);
  }

  @Get()
  findAll() {
    return this.shopsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.shopsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateShopDto) {
    return this.shopsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Suspend a shop (blocks login, keeps its data)' })
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.shopsService.deactivate(id);
  }
}
