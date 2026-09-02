import { InternalServerErrorException, Injectable } from '@nestjs/common';
import { ContractStatus, Prisma } from '@crmpro/database';
import { PrismaService } from '../../../common/prisma/prisma.service';

type PrismaTx = Prisma.TransactionClient;

/**
 * Keeps tenant.subscriptionPlanId aligned with the active contract plan.
 *
 * This only syncs the plan pointer; runtime entitlement resolution on the
 * tenant API prefers the contract's frozen planSnapshot (captured at
 * signing) over the live SubscriptionPlan row, so later plan edits never
 * change what a signed tenant gets. The live plan row is only used as a
 * fallback for legacy contracts without a snapshot.
 *
 * Terminated or expired contracts do not clear tenant.subscriptionPlanId.
 * CRM access continues until contractEndAt + gracePeriodDays (see shared billing util).
 */
@Injectable()
export class ContractEntitlementSyncService {
  constructor(private readonly prisma: PrismaService) {}

  async syncTenantPlanFromContract(
    tx: PrismaTx,
    tenantId: string,
    planId: string,
  ): Promise<void> {
    await tx.tenant.update({
      where: { id: tenantId },
      data: { subscriptionPlanId: planId },
    });
  }

  async assertTenantContractPlanConsistency(
    tenantId: string,
    tx?: PrismaTx,
  ): Promise<void> {
    const client = tx ?? this.prisma;

    const activeContract = await client.tenantContract.findFirst({
      where: {
        tenantId,
        status: ContractStatus.ACTIVE,
        deletedAt: null,
      },
      select: { planId: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!activeContract) {
      return;
    }

    const tenant = await client.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { subscriptionPlanId: true },
    });

    if (!tenant) {
      throw new InternalServerErrorException(
        'Tenant not found for contract sync',
      );
    }

    if (tenant.subscriptionPlanId !== activeContract.planId) {
      throw new InternalServerErrorException(
        'Tenant subscription plan is out of sync with active contract',
      );
    }
  }
}
