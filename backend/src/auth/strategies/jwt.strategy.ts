import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayloadUser } from '../../common/interfaces/jwt-payload-user.interface';
import { UsersService } from '../../users/users.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') ?? 'change-me',
    });
  }

  /** Return value is attached to request.user. Re-checks the user still exists/active. */
  async validate(payload: JwtPayload): Promise<JwtPayloadUser> {
    const user = await this.usersService.findByIdForAuth(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User is no longer active');
    }
    // Read the tenant from the database rather than the token, so a user who
    // is moved between shops (or detached from one) is scoped correctly on
    // their very next request instead of when their token expires.
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      shopId: user.shopId,
    };
  }
}
