import { SetMetadata } from '@nestjs/common';
import type { Role } from '@poszee/shared';

export const ROLES_KEY = 'roles';
/** Minimum role(s) allowed. Rank-based: a higher role also passes. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
