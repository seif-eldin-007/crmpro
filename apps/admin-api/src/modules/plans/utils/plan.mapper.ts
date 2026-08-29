import { Prisma } from '@crmpro/database';
import type {
  PlanDetail,
  PlanFeatureFlags,
  PlanListItem,
} from '../types/plan.types';

type PlanRecord = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  currency: string | null;
  defaultPrice: Prisma.Decimal | null;
  maxUsers: number | null;
  maxLeads: number | null;
  maxProjects: number | null;
  maxStorageBytes: bigint | null;
  featureFlags: Prisma.JsonValue;
  createdAt: Date;
  updatedAt?: Date;
};

function toNumberOrNull(value: bigint | null): number | null {
  if (value === null) {
    return null;
  }
  return Number(value);
}

function toPriceOrNull(value: Prisma.Decimal | null): number | null {
  if (value === null) {
    return null;
  }
  return value.toNumber();
}

function toFeatureFlags(value: Prisma.JsonValue): PlanFeatureFlags {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as PlanFeatureFlags;
  }
  return {};
}

export function toPlanListItem(plan: PlanRecord): PlanListItem {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    isActive: plan.isActive,
    currency: plan.currency,
    defaultPrice: toPriceOrNull(plan.defaultPrice),
    maxUsers: plan.maxUsers,
    maxLeads: plan.maxLeads,
    maxProjects: plan.maxProjects,
    maxStorageBytes: toNumberOrNull(plan.maxStorageBytes),
    featureFlags: toFeatureFlags(plan.featureFlags),
    createdAt: plan.createdAt,
  };
}

export function toPlanDetail(
  plan: PlanRecord & { updatedAt: Date },
  tenantCount: number,
): PlanDetail {
  return {
    ...toPlanListItem(plan),
    updatedAt: plan.updatedAt,
    tenantCount,
  };
}
