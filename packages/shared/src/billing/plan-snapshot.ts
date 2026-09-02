/**
 * Plan snapshot captured at contract signing time.
 *
 * Signed contracts must not be affected by later edits to the live
 * SubscriptionPlan row. The snapshot freezes the commercial terms
 * (quotas + feature flags) the tenant agreed to.
 *
 * `maxStorageBytes` is serialized as a decimal string because JSON
 * cannot represent BigInt. `null` means unlimited.
 */
export type PlanSnapshotQuotas = {
  maxUsers: number | null;
  maxLeads: number | null;
  maxProjects: number | null;
  maxStorageBytes: string | null;
};

export type PlanSnapshot = {
  planId: string;
  name: string;
  price: number | null;
  currency: string | null;
  quotas: PlanSnapshotQuotas;
  featureFlags: Record<string, boolean>;
  capturedAt: string;
};

export type PlanSnapshotSource = {
  id: string;
  name: string;
  defaultPrice: { toNumber(): number } | null;
  currency: string | null;
  maxUsers: number | null;
  maxLeads: number | null;
  maxProjects: number | null;
  maxStorageBytes: bigint | null;
  featureFlags: unknown;
};

export function buildPlanSnapshot(plan: PlanSnapshotSource): PlanSnapshot {
  return {
    planId: plan.id,
    name: plan.name,
    price: plan.defaultPrice ? plan.defaultPrice.toNumber() : null,
    currency: plan.currency,
    quotas: {
      maxUsers: plan.maxUsers,
      maxLeads: plan.maxLeads,
      maxProjects: plan.maxProjects,
      maxStorageBytes:
        plan.maxStorageBytes !== null ? plan.maxStorageBytes.toString() : null,
    },
    featureFlags: parseSnapshotFeatureFlags(plan.featureFlags),
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Validates a persisted snapshot read back from the database.
 * Returns null when the value is missing or malformed (legacy rows).
 */
export function parsePlanSnapshot(raw: unknown): PlanSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const quotas = candidate.quotas as Record<string, unknown> | undefined;

  if (typeof candidate.planId !== 'string' || !quotas) {
    return null;
  }

  return {
    planId: candidate.planId,
    name: typeof candidate.name === 'string' ? candidate.name : '',
    price: typeof candidate.price === 'number' ? candidate.price : null,
    currency:
      typeof candidate.currency === 'string' ? candidate.currency : null,
    quotas: {
      maxUsers: toNullableNumber(quotas.maxUsers),
      maxLeads: toNullableNumber(quotas.maxLeads),
      maxProjects: toNullableNumber(quotas.maxProjects),
      maxStorageBytes:
        typeof quotas.maxStorageBytes === 'string'
          ? quotas.maxStorageBytes
          : null,
    },
    featureFlags: parseSnapshotFeatureFlags(candidate.featureFlags),
    capturedAt:
      typeof candidate.capturedAt === 'string' ? candidate.capturedAt : '',
  };
}

function parseSnapshotFeatureFlags(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const flags: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'boolean') {
      flags[key] = value;
    }
  }

  return flags;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}
