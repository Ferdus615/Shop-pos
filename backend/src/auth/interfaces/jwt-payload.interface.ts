import { Role } from '../../common/enums/role.enum';

/** Claims stored inside the signed JWT. */
export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: Role;
}
