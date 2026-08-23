import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { DataSource, Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { User } from '../users/entities/user.entity';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { Shop } from './entities/shop.entity';

export interface ShopWithOwners extends Shop {
  owners: Pick<User, 'id' | 'name' | 'email' | 'isActive'>[];
  userCount: number;
}

@Injectable()
export class ShopsService {
  constructor(
    @InjectRepository(Shop)
    private readonly shopsRepository: Repository<Shop>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  /** Creates the shop and its first OWNER as one unit — never one without the other. */
  async create(dto: CreateShopDto): Promise<Shop> {
    return this.dataSource.transaction(async (manager) => {
      const slugTaken = await manager.existsBy(Shop, { slug: dto.slug });
      if (slugTaken) {
        throw new ConflictException('A shop with this slug already exists');
      }
      const emailTaken = await manager.existsBy(User, {
        email: dto.owner.email,
      });
      if (emailTaken) {
        throw new ConflictException('A user with this email already exists');
      }

      const shop = await manager.save(
        manager.create(Shop, {
          name: dto.name,
          slug: dto.slug,
          address: dto.address ?? null,
          phone: dto.phone ?? null,
        }),
      );

      await manager.save(
        manager.create(User, {
          name: dto.owner.name,
          email: dto.owner.email,
          passwordHash: await bcrypt.hash(dto.owner.password, 10),
          role: Role.OWNER,
          shopId: shop.id,
        }),
      );

      return shop;
    });
  }

  async findAll(): Promise<ShopWithOwners[]> {
    const shops = await this.shopsRepository.find({
      order: { createdAt: 'DESC' },
    });
    if (!shops.length) return [];

    // One extra query for every shop's users, rather than one per shop.
    const users = await this.usersRepository.find({
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        role: true,
        shopId: true,
      },
      order: { createdAt: 'ASC' },
    });

    return shops.map((shop) => {
      const shopUsers = users.filter((user) => user.shopId === shop.id);
      return {
        ...shop,
        owners: shopUsers
          .filter((user) => user.role === Role.OWNER)
          .map(({ id, name, email, isActive }) => ({
            id,
            name,
            email,
            isActive,
          })),
        userCount: shopUsers.length,
      };
    });
  }

  async findOne(id: string): Promise<Shop> {
    const shop = await this.shopsRepository.findOne({ where: { id } });
    if (!shop) {
      throw new NotFoundException('Shop not found');
    }
    return shop;
  }

  async update(id: string, dto: UpdateShopDto): Promise<Shop> {
    const shop = await this.findOne(id);
    if (dto.name !== undefined) shop.name = dto.name;
    if (dto.address !== undefined) shop.address = dto.address;
    if (dto.phone !== undefined) shop.phone = dto.phone;
    if (dto.isActive !== undefined) shop.isActive = dto.isActive;
    return this.shopsRepository.save(shop);
  }

  /**
   * Suspend rather than delete: the shop's sales history stays intact, but
   * none of its users can log in. Reverse it with PATCH isActive: true.
   */
  async deactivate(id: string): Promise<Shop> {
    const shop = await this.findOne(id);
    shop.isActive = false;
    return this.shopsRepository.save(shop);
  }
}
