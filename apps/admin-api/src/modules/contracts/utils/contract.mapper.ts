import { Prisma } from '@crmpro/database';
import { parsePlanSnapshot } from '@crmpro/shared';
import type { ContractDetail, ContractListItem } from '../types/contract.types';

type ContractWithPlan = {
  id: string;
  contractName: string | null;
  status: ContractListItem['status'];
  agreedPrice: Prisma.Decimal;
  currency: string;
  paymentMethod: ContractListItem['paymentMethod'];
  paymentFrequency: ContractListItem['paymentFrequency'];
  contractStartAt: Date;
  contractEndAt: Date | null;
  gracePeriodDays: number | null;
  autoRenew: boolean;
  plan: { id: string; name: string; isActive: boolean };
};

type ContractWithRelations = ContractWithPlan & {
  tenantId: string | null;
  planSnapshot: Prisma.JsonValue;
  discountPercent: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByAdmin: { id: string; fullName: string; email: string };
};

function toPrice(value: Prisma.Decimal): number {
  return value.toNumber();
}

export function toContractListItem(
  contract: ContractWithPlan,
): ContractListItem {
  return {
    id: contract.id,
    contractName: contract.contractName,
    status: contract.status,
    planName: contract.plan.name,
    agreedPrice: toPrice(contract.agreedPrice),
    currency: contract.currency,
    paymentMethod: contract.paymentMethod,
    paymentFrequency: contract.paymentFrequency,
    contractStartAt: contract.contractStartAt,
    contractEndAt: contract.contractEndAt,
    gracePeriodDays: contract.gracePeriodDays,
    autoRenew: contract.autoRenew,
  };
}

export function toContractDetail(
  contract: ContractWithRelations,
): ContractDetail {
  return {
    id: contract.id,
    contractName: contract.contractName,
    status: contract.status,
    plan: {
      id: contract.plan.id,
      name: contract.plan.name,
      isActive: contract.plan.isActive,
    },
    planSnapshot: parsePlanSnapshot(contract.planSnapshot),
    tenantId: contract.tenantId,
    agreedPrice: toPrice(contract.agreedPrice),
    currency: contract.currency,
    paymentMethod: contract.paymentMethod,
    paymentFrequency: contract.paymentFrequency,
    discountPercent: contract.discountPercent,
    gracePeriodDays: contract.gracePeriodDays,
    autoRenew: contract.autoRenew,
    notes: contract.notes,
    contractStartAt: contract.contractStartAt,
    contractEndAt: contract.contractEndAt,
    createdByAdmin: {
      id: contract.createdByAdmin.id,
      fullName: contract.createdByAdmin.fullName,
      email: contract.createdByAdmin.email,
    },
    createdAt: contract.createdAt,
    updatedAt: contract.updatedAt,
  };
}
