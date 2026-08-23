import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtPayloadUser } from '../common/interfaces/jwt-payload-user.interface';
import { Shop } from '../shops/entities/shop.entity';
import { UsersService } from '../users/users.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';

/** Shop details the frontend needs straight after login (receipt header, branding). */
type ShopSummary = Pick<Shop, 'id' | 'name' | 'slug' | 'address' | 'phone'>;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @InjectRepository(Shop)
    private readonly shopsRepository: Repository<Shop>,
  ) {}

  private async validateCredentials(
    email: string,
    password: string,
  ): Promise<{ user: JwtPayloadUser; shop: ShopSummary | null }> {
    const user = await this.usersService.findByEmailWithPassword(email);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    let shop: Shop | null = null;
    if (user.shopId) {
      shop = await this.shopsRepository.findOne({ where: { id: user.shopId } });
      // A suspended shop locks out everyone who works there.
      if (!shop || !shop.isActive) {
        throw new UnauthorizedException(
          'This shop is not active. Contact your administrator.',
        );
      }
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        shopId: user.shopId,
      },
      shop: shop && {
        id: shop.id,
        name: shop.name,
        slug: shop.slug,
        address: shop.address,
        phone: shop.phone,
      },
    };
  }

  async login(email: string, password: string) {
    const { user, shop } = await this.validateCredentials(email, password);
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      shopId: user.shopId,
    };
    return {
      accessToken: await this.jwtService.signAsync(payload),
      user,
      shop,
    };
  }

  /** Current user plus their shop — backs GET /auth/me on page reload. */
  async getProfile(user: JwtPayloadUser) {
    const shop = user.shopId
      ? await this.shopsRepository.findOne({ where: { id: user.shopId } })
      : null;
    return {
      ...user,
      shop: shop && {
        id: shop.id,
        name: shop.name,
        slug: shop.slug,
        address: shop.address,
        phone: shop.phone,
      },
    };
  }
}
