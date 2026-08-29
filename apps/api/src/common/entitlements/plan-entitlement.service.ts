import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FEATURE_UNAVAILABLE_MESSAGE } from './entitlement.constants';
import type { PlanFeatureFlags, PlanFeatureKey } from './entitlement.types';

@Injectable()
export class PlanEntitlementService {
  constructor(private readonly prisma: PrismaService) {}

  async assertFeatureEnabled(
    tenantId: string,
    feature: PlanFeatureKey,
  ): Promise<void> {
    const flags = await this.getFeatureFlags(tenantId);

    if (flags[feature] !== true) {
      throw new ForbiddenException(FEATURE_UNAVAILABLE_MESSAGE);
    }
  }

  async getFeatureFlags(tenantId: string): Promise<PlanFeatureFlags> {
    return this.loadFeatureFlags(tenantId);
  }

  private async loadFeatureFlags(tenantId: string): Promise<PlanFeatureFlags> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: {
        subscriptionPlan: {
          select: {
            featureFlags: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return this.parseFeatureFlags(tenant.subscriptionPlan.featureFlags);
  }

  private parseFeatureFlags(raw: unknown): PlanFeatureFlags {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {};
    }

    return raw;
  }
}
