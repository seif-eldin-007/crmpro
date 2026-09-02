import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContractStatus } from '@crmpro/database';
import { parsePlanSnapshot } from '@crmpro/shared';
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
    // Feature flags frozen in the active contract's planSnapshot win over the
    // live plan row; the live plan is only a fallback for legacy contracts
    // signed before snapshots existed.
    const contract = await this.prisma.tenantContract.findFirst({
      where: {
        tenantId,
        status: ContractStatus.ACTIVE,
        deletedAt: null,
      },
      select: { planSnapshot: true },
      orderBy: { createdAt: 'desc' },
    });

    const snapshot = contract ? parsePlanSnapshot(contract.planSnapshot) : null;

    if (snapshot) {
      return snapshot.featureFlags;
    }

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
