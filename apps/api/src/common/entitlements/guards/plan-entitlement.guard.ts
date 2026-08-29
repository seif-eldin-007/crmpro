import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '../../../modules/auth/types/jwt-payload.type';
import { PLAN_FEATURE_METADATA_KEY } from '../entitlement.constants';
import { PlanEntitlementService } from '../plan-entitlement.service';
import type { PlanFeatureKey } from '../entitlement.types';

@Injectable()
export class PlanEntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly planEntitlementService: PlanEntitlementService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<
      PlanFeatureKey | undefined
    >(PLAN_FEATURE_METADATA_KEY, [context.getHandler(), context.getClass()]);

    if (!feature) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>();

    const user = request.user;
    if (!user) {
      return false;
    }

    await this.planEntitlementService.assertFeatureEnabled(
      user.tenantId,
      feature,
    );

    return true;
  }
}
