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
import { CurrentShop } from '../common/decorators/current-shop.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

/** Staff of the caller's own shop. Owners never see users of another shop. */
@ApiTags('users')
@ApiBearerAuth()
@Roles(Role.OWNER)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Add a staff member (or co-owner) to your shop' })
  create(@Body() dto: CreateUserDto, @CurrentShop() shopId: string) {
    return this.usersService.create(dto, shopId);
  }

  @Get()
  findAll(@CurrentShop() shopId: string) {
    return this.usersService.findAll(shopId);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentShop() shopId: string,
  ) {
    return this.usersService.findById(id, shopId);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentShop() shopId: string,
    @CurrentUser('id') actingUserId: string,
  ) {
    return this.usersService.update(id, dto, shopId, actingUserId);
  }

  @Delete(':id')
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentShop() shopId: string,
    @CurrentUser('id') actingUserId: string,
  ) {
    return this.usersService.deactivate(id, shopId, actingUserId);
  }
}
