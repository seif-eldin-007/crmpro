import { SetMetadata } from '@nestjs/common';
import { ADMIN_PUBLIC_ROUTE_METADATA_KEY } from '../constants';

/**
 * Explicitly marks an admin route as not requiring a permission decorator.
 *
 * The permissions guard fails closed: any route without a
 * `RequireAdminPermission`/`RequireAnyAdminPermission` decorator is rejected
 * unless it carries this marker (e.g. self-service auth endpoints that only
 * need a valid session).
 */
export const PublicAdminRoute = () =>
  SetMetadata(ADMIN_PUBLIC_ROUTE_METADATA_KEY, true);
