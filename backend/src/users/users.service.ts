import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

/**
 * Staff administration, always scoped to one shop.
 *
 * Every method that an owner can reach takes a `shopId` and filters by it, so
 * a user id from another tenant reads as "not found" rather than exposing or
 * mutating that tenant's row.
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  /** Emails identify an account platform-wide, so this check is not scoped. */
  private async assertEmailAvailable(email: string): Promise<void> {
    const existing = await this.usersRepository.existsBy({ email });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }
  }

  private assertAssignableRole(role: Role | undefined): void {
    if (role === Role.SUPER_ADMIN) {
      throw new BadRequestException(
        'Platform administrators cannot be created from a shop',
      );
    }
  }

  async create(dto: CreateUserDto, shopId: string): Promise<User> {
    this.assertAssignableRole(dto.role);
    await this.assertEmailAvailable(dto.email);

    const user = this.usersRepository.create({
      name: dto.name,
      email: dto.email,
      role: dto.role ?? Role.STAFF,
      shopId,
      passwordHash: await bcrypt.hash(dto.password, 10),
    });
    return this.usersRepository.save(user);
  }

  findAll(shopId: string): Promise<User[]> {
    return this.usersRepository.find({
      where: { shopId },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string, shopId: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id, shopId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  /**
   * Unscoped by design — used by JwtStrategy to resolve the caller before any
   * tenant is known. Never expose this through a controller.
   */
  async findByIdForAuth(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  /** Includes the password hash — used only for authentication. */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    shopId: string,
    actingUserId: string,
  ): Promise<User> {
    const user = await this.findById(id, shopId);
    this.assertAssignableRole(dto.role);

    if (dto.email && dto.email !== user.email) {
      await this.assertEmailAvailable(dto.email);
      user.email = dto.email;
    }

    if (dto.name !== undefined) user.name = dto.name;
    if (dto.role !== undefined) {
      if (id === actingUserId && dto.role !== user.role) {
        throw new BadRequestException('You cannot change your own role');
      }
      user.role = dto.role;
    }
    if (dto.isActive !== undefined) {
      if (id === actingUserId && !dto.isActive) {
        throw new BadRequestException('You cannot deactivate your own account');
      }
      user.isActive = dto.isActive;
    }
    if (dto.password) {
      user.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    return this.usersRepository.save(user);
  }

  /** Soft-delete: deactivate rather than remove, to preserve sales history. */
  async deactivate(
    id: string,
    shopId: string,
    actingUserId: string,
  ): Promise<User> {
    if (id === actingUserId) {
      throw new BadRequestException('You cannot deactivate your own account');
    }
    const user = await this.findById(id, shopId);
    user.isActive = false;
    return this.usersRepository.save(user);
  }

  /**
   * Used by the seeder to bootstrap accounts that no shop owner could create:
   * the platform administrator, and a shop's very first owner.
   */
  async createRaw(input: {
    name: string;
    email: string;
    password: string;
    role: Role;
    shopId: string | null;
  }): Promise<User> {
    return this.usersRepository.save(
      this.usersRepository.create({
        name: input.name,
        email: input.email,
        role: input.role,
        shopId: input.shopId,
        passwordHash: await bcrypt.hash(input.password, 10),
      }),
    );
  }
}
