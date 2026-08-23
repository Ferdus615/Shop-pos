import { Role } from '../../common/enums/role.enum';

/** Claims stored inside the signed JWT. */
export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: Role;
  /**
   * Carried for readability when debugging a token. The value actually used
   * for scoping is re-read from the database on every request by JwtStrategy,
   * so moving or deactivating a user takes effect without waiting for their
   * token to expire.
   */
  shopId: string | null;
}
